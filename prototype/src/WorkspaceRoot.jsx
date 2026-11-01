import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { App } from "./App.jsx";
import { useWorkspace } from "./hooks/useWorkspace.js";
import { useCloudWorkspace } from "./hooks/useCloudWorkspace.js";
import { cloudRequest } from "./lib/cloudClient.js";
import { safeAvatar } from "./lib/avatar.js";
import { Button } from "./components/ui/index.jsx";

const AdminApp = lazy(() => import("./components/account/AdminApp.jsx"));
const ACCOUNT_KEY = "luli:active-account";
function LocalEditor({ account }) {
  const workspace = useWorkspace();
  return <App workspace={workspace} account={account} />;
}
function CloudEditor({ account }) {
  const workspace = useCloudWorkspace(account.owner.id);
  return <App workspace={workspace} account={account} />;
}
export function WorkspaceRoot() {
  const refreshSequence = useRef(0);
  const [owner, setOwner] = useState(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "null");
        return saved &&
          typeof saved.id === "string" &&
          typeof saved.email === "string"
          ? { id: saved.id, email: saved.email, avatar: safeAvatar(saved.avatar) }
          : null;
      } catch {
        return null;
      }
    }),
    [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [health, setHealth] = useState(null);
  async function refresh() {
    const sequence = ++refreshSequence.current;
    try {
      const data = await cloudRequest("cloud/me");
      if (sequence === refreshSequence.current) {
        setUser(data.user);
        if (data.user) rememberAvatar(data.user.id, data.user.avatar);
      }
      return data.user;
    } catch {
      if (sequence === refreshSequence.current) setUser(null);
      return null;
    } finally {
      if (sequence === refreshSequence.current) setLoading(false);
    }
  }
  function choose(next) {
    const value = next ? { id: next.id, email: next.email, avatar: safeAvatar(next.avatar) } : null;
    setOwner(value);
    if (value) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(value));
    else localStorage.removeItem(ACCOUNT_KEY);
  }
  async function logout() {
    await cloudRequest("auth/sign-out", { method: "POST", body: {} });
    refreshSequence.current++;
    setUser(null);
    choose(null);
  }
  function rememberAvatar(id, image) {
    const avatar = safeAvatar(image);
    setOwner(current => {
      if (!current || current.id !== id || current.avatar === avatar) return current;
      const next = { ...current, avatar };
      try { localStorage.setItem(ACCOUNT_KEY, JSON.stringify(next)); } catch { /* The cloud copy remains available if browser storage is full. */ }
      return next;
    });
  }
  async function updateAvatar(image) {
    if (!user?.id) throw new Error('请重新登录后修改头像。');
    const id = user.id;
    const result = await cloudRequest('cloud/account/avatar', { method: 'PUT', ownerId: id, body: { image } });
    refreshSequence.current++;
    setUser(current => current?.id === id ? { ...current, avatar: result.avatar } : current);
    rememberAvatar(id, result.avatar);
  }
  useEffect(() => {
    refresh();
    cloudRequest("cloud/health")
      .then(setHealth)
      .catch(() => setHealth({ ok: false }));
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const account = { owner, user, loading, health, refresh, choose, logout, updateAvatar };
  if (window.location.pathname.startsWith("/admin"))
    return (
      <Suspense
        fallback={<div className="account-loading">正在打开管理后台…</div>}
      >
        <AdminApp key={user?.id || "anonymous"} account={account} />
      </Suspense>
    );
  if (owner && loading)
    return <div className="account-loading">正在检查个人工作区账号…</div>;
  if (owner && user && owner.id !== user.id)
    return (
      <main className="admin-auth-page">
        <div className="email-login">
          <h1>登录账号已切换</h1>
          <p>
            当前登录的是 {user.email}
            。上一账号的未同步草稿留在它自己的缓存中，不会进入这个账号。
          </p>
          <Button onClick={() => choose(user)}>进入当前账号的工作区</Button>
        </div>
      </main>
    );
  return owner ? (
    <CloudEditor key={owner.id} account={account} />
  ) : (
    <LocalEditor key="local" account={account} />
  );
}
