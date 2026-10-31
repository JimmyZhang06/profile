import { useEffect, useState } from "react";
import {
  IconCloud,
  IconDeviceDesktop,
  IconArrowRight,
  IconShieldCheck,
  IconLogout,
  IconDownload,
  IconRefresh,
} from "@tabler/icons-react";
import { Button, Field, Page } from "../ui/index.jsx";
import { BrandLogo } from "../BrandLogo.jsx";
import { cloudRequest } from "../../lib/cloudClient.js";
import {
  selectImport,
  cloudCacheKey,
  isPlaceholderDocument,
} from "../../lib/cloudWorkspace.js";
import {
  STORAGE_KEY,
  validWorkspace,
  downloadFile,
} from "../../lib/workspace.js";

export function EmailLogin({
  onSuccess,
  initialEmail = "",
  health,
  admin = false,
}) {
  const [email, setEmail] = useState(initialEmail),
    [otp, setOtp] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!seconds) return;
    const timer = setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  if (health?.cloudEnabled === false || (!admin && health?.mailReady === false))
    return (
      <div className="email-login">
        <div className="account-brand" aria-label="履历">
          <BrandLogo expanded />
        </div>
        <div className="account-kicker">YOUR PERSONAL WORKSPACE</div>
        <h1>
          {admin
            ? "管理后台暂未开放"
            : health?.cloudEnabled
              ? "邮箱登录准备中"
              : "先把经历，写得更好。"}
        </h1>
        <p>
          邮箱登录尚未开放。目前可使用完整的简历编辑、项目素材、排版模板和内置整理，资料保存在当前浏览器中。
        </p>
        <p className="account-footnote">
          <IconDeviceDesktop size={16} />
          在「AI 与设置 → 本机数据」中可导出完整备份，换设备后再导入。
        </p>
        {health?.cloudEnabled ? <a href="/admin">管理员登录</a> : null}
      </div>
    );
  async function send() {
    setBusy(true);
    setError("");
    try {
      await cloudRequest("auth/email-otp/send-verification-otp", {
        method: "POST",
        body: { email: email.trim(), type: "sign-in" },
      });
      setSent(true);
      setSeconds(60);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(event) {
    event.preventDefault();
    if (!sent) return send();
    setBusy(true);
    setError("");
    try {
      await cloudRequest("auth/sign-in/email-otp", {
        method: "POST",
        body: { email: email.trim(), otp },
      });
      await onSuccess();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="email-login">
      <div className="account-brand" aria-label="履历">
        <BrandLogo expanded />
      </div>
      <div className="account-kicker">
        {admin ? "PLATFORM ACCESS" : "YOUR PERSONAL WORKSPACE"}
      </div>
      <h1>{admin ? "登录管理后台" : "让经历，随你继续。"}</h1>
      <p>
        {admin
          ? "使用管理员邮箱登录，随后完成验证器验证。"
          : "登录个人工作区，在不同设备继续编辑同一份简历。"}
      </p>
      <form onSubmit={verify}>
        <Field label="邮箱地址">
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            disabled={sent || busy}
            placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {sent ? (
          <>
            <Field label="6 位验证码" hint="验证码 5 分钟内有效。">
              <input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <div className="login-resend">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setSent(false);
                  setOtp("");
                }}
              >
                更换邮箱
              </button>
              <button
                type="button"
                disabled={busy || seconds > 0}
                onClick={send}
              >
                {seconds ? `${seconds} 秒后重新发送` : "重新发送验证码"}
              </button>
            </div>
          </>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          busy={busy}
          disabled={busy || !email.trim() || (sent && otp.length !== 6)}
        >
          {sent ? "验证并继续" : "发送验证码"}
          <IconArrowRight size={17} />
        </Button>
      </form>
      <p className="account-footnote">
        <IconShieldCheck size={15} />
        当前仅限受邀邮箱，本机资料不会自动上传。
      </p>
      {health?.mailMode === "local-mailbox" ? (
        <p className="development-note">
          本机开发环境：验证码写入本地开发邮箱文件，不会发送真实邮件。
        </p>
      ) : null}
    </div>
  );
}
function localState() {
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return validWorkspace(state) ? state : null;
  } catch {
    return null;
  }
}
function Migration({ user, local, onEnter }) {
  const [remote, setRemote] = useState(null),
    [selected, setSelected] = useState({
      documents: [],
      projects: [],
      profile: false,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    cloudRequest("cloud/workspace", { ownerId: user.id })
      .then((value) => {
        if (alive) setRemote(value);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [user.id]);
  function toggle(type, id) {
    setSelected((s) => ({
      ...s,
      [type]: s[type].includes(id)
        ? s[type].filter((value) => value !== id)
        : [...s[type], id],
    }));
  }
  async function migrate() {
    setBusy(true);
    setError("");
    try {
      await cloudRequest("cloud/import", {
        method: "POST",
        ownerId: user.id,
        body: {
          state: selectImport(local, selected),
          revision: remote.revision,
        },
      });
      onEnter();
    } catch (e) {
      setError(e.message);
      if (e.code === "IMPORT_CONFLICT")
        setRemote(await cloudRequest("cloud/workspace", { ownerId: user.id }));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="migration-content">
      <div className="account-badge">
        <IconCloud size={25} />
      </div>
      <h2>把这台设备上的资料带过去</h2>
      <p>
        目标账号 <strong>{user.email}</strong>
      </p>
      <div className="migration-summary">
        <span>
          <strong>{local?.documents.length || 0}</strong>份本机简历
        </span>
        <span>
          <strong>{local?.library.length || 0}</strong>个项目素材
        </span>
        <span>
          <strong>
            {remote?.state.documents.filter((d) => !isPlaceholderDocument(d))
              .length ?? "—"}
          </strong>
          份云端简历
        </span>
      </div>
      {local ? (
        <>
          <div className="migration-select-all">
            <strong>选择要导入的资料</strong>
            <button
              type="button"
              onClick={() =>
                setSelected({
                  documents: local.documents.map((d) => d.id),
                  projects: local.library.map((p) => p.id),
                  profile: true,
                })
              }
            >
              全选
            </button>
            <button
              type="button"
              onClick={() =>
                setSelected({ documents: [], projects: [], profile: false })
              }
            >
              清空
            </button>
          </div>
          <div className="migration-list">
            <h3>简历与版本</h3>
            {local.documents.map((d) => (
              <label key={d.id}>
                <input
                  type="checkbox"
                  checked={selected.documents.includes(d.id)}
                  onChange={() => toggle("documents", d.id)}
                />
                <span>
                  {d.title}
                  <small>
                    {d.versions.length} 个版本 · {d.messages.length} 条对话
                    {d.example ? " · 示例资料" : ""}
                  </small>
                </span>
              </label>
            ))}
            <h3>项目素材</h3>
            {local.library.map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={selected.projects.includes(p.id)}
                  onChange={() => toggle("projects", p.id)}
                />
                <span>
                  {p.name}
                  <small>
                    {p.role}
                    {p.example ? " · 示例资料" : ""}
                  </small>
                </span>
              </label>
            ))}
            <label>
              <input
                type="checkbox"
                checked={selected.profile}
                onChange={(e) =>
                  setSelected((s) => ({ ...s, profile: e.target.checked }))
                }
              />
              <span>
                个人基础资料<small>仅补充云端尚未填写的字段</small>
              </span>
            </label>
          </div>
        </>
      ) : null}
      <p className="quiet-note">
        导入会新增副本，不覆盖云端资料。本机原件会保留，重复提交同一批资料不会重复导入。模型密钥不随资料迁移。
      </p>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      <div className="account-actions">
        <Button
          variant="secondary"
          disabled={busy || !remote}
          onClick={onEnter}
        >
          直接进入云工作区
        </Button>
        {local ? (
          <Button
            busy={busy}
            disabled={
              busy ||
              !remote ||
              (!selected.documents.length &&
                !selected.projects.length &&
                !selected.profile)
            }
            onClick={migrate}
          >
            导入所选资料并进入
            <IconArrowRight size={16} />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
export function AccountPage({ account, workspace, onBack }) {
  const [migrating, setMigrating] = useState(false),
    [sessions, setSessions] = useState(null),
    [quota, setQuota] = useState(null),
    [backups, setBackups] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deleteOpen, setDeleteOpen] = useState(false),
    [deleteEmail, setDeleteEmail] = useState(""),
    [deleteOtp, setDeleteOtp] = useState(""),
    [deleteSent, setDeleteSent] = useState(false);
  const user = account.user,
    own = !!user && user.id === account.owner?.id;
  async function load() {
    if (!own) return;
    try {
      const [s, m, b] = await Promise.all([
        cloudRequest("cloud/sessions", { ownerId: user.id }),
        cloudRequest("cloud/me", { ownerId: user.id }),
        cloudRequest("cloud/backups", { ownerId: user.id }),
      ]);
      setSessions(s);
      setQuota(m.quota);
      setBackups(b.items);
    } catch (e) {
      setError(e.message);
      if (e.status === 401) await account.refresh();
    }
  }
  useEffect(() => {
    load();
  }, [user?.id, own]);
  async function action(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function loggedIn() {
    const current = await account.refresh();
    if (current?.id === account.owner?.id) workspace.retry?.();
    else setMigrating(true);
  }
  const local = workspace.cloud ? localState() : workspace.state;
  const recovery = [];
  if (own)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(cloudCacheKey(user.id) + ":recovery:"))
        try {
          const value = JSON.parse(localStorage.getItem(key));
          recovery.push({ key, ...value });
        } catch {
          /* Unreadable recovery files remain untouched. */
        }
    }
  return (
    <Page
      key={!user ? "login" : migrating || !own ? "migration" : "account"}
      title={user ? "账号与安全" : "登录账号"}
      description={
        user && !migrating ? "管理个人工作区、登录设备和资料。" : undefined
      }
      className={
        "account-page " +
        (!user
          ? "account-login-page"
          : migrating || !own
            ? "account-migration-page"
            : "")
      }
      onBack={onBack}
    >
      {!user ? (
        <EmailLogin
          health={account.health}
          initialEmail={account.owner?.email || ""}
          onSuccess={loggedIn}
        />
      ) : migrating || !own ? (
        <Migration
          user={user}
          local={local}
          onEnter={() => account.choose(user)}
        />
      ) : (
        <>
          <div className="account-profile">
            <div className="account-avatar">{user.email[0].toUpperCase()}</div>
            <div>
              <h2>{user.email}</h2>
              <p>
                <IconCloud size={15} />
                个人云工作区{user.role === "admin" ? " · 管理员" : ""}
              </p>
            </div>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => action(account.logout)}
            >
              <IconLogout size={16} />
              退出登录
            </Button>
          </div>
          <section className="account-section">
            <h2>工作区与同步</h2>
            <div className="account-detail-row">
              <div>
                <strong>
                  {workspace.saveState === "synced"
                    ? "资料已同步"
                    : workspace.saveState === "syncing"
                      ? "正在同步"
                      : "本机草稿已保留"}
                </strong>
                <p>
                  当前账号的缓存与其他账号分开保存。资料同步不代表同意发送给
                  AI。
                </p>
              </div>
              <Button variant="secondary" onClick={() => workspace.retry?.()}>
                <IconRefresh size={15} />
                重新同步
              </Button>
            </div>
            <div className="account-detail-row">
              <div>
                <strong>AI 调用额度</strong>
                <p>
                  本月已用 {quota?.used ?? "—"} / {quota?.limit ?? "—"}{" "}
                  次；本地整理不计入额度。
                </p>
              </div>
            </div>
            <div className="account-actions">
              <Button variant="secondary" onClick={() => setMigrating(true)}>
                从本机导入资料
              </Button>
              <Button variant="ghost" onClick={() => account.choose(null)}>
                <IconDeviceDesktop size={16} />
                切换到本机工作区
              </Button>
              {user.role === "admin" ? (
                <a className="account-text-link" href="/admin">
                  打开独立管理后台
                  <IconArrowRight size={15} />
                </a>
              ) : null}
            </div>
          </section>
          <section className="account-section">
            <div className="account-section-heading">
              <h2>登录设备</h2>
              <Button
                variant="ghost"
                disabled={
                  busy ||
                  !sessions?.items.some((s) => s.id !== sessions.currentId)
                }
                onClick={() =>
                  action(async () => {
                    await cloudRequest("cloud/sessions/revoke", {
                      method: "POST",
                      ownerId: user.id,
                      body: { others: true },
                    });
                    await load();
                  })
                }
              >
                退出其他设备
              </Button>
            </div>
            {sessions?.items.map((session) => (
              <div className="session-row" key={session.id}>
                <IconDeviceDesktop size={21} />
                <div>
                  <strong>
                    {session.id === sessions.currentId
                      ? "当前设备"
                      : "其他设备"}
                  </strong>
                  <p title={session.user_agent}>
                    {session.user_agent || "浏览器"} ·{" "}
                    {new Date(session.created_at).toLocaleDateString()}
                  </p>
                </div>
                {session.id === sessions.currentId ? (
                  <span className="subtle-badge">当前登录</span>
                ) : (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        await cloudRequest("cloud/sessions/revoke", {
                          method: "POST",
                          ownerId: user.id,
                          body: { id: session.id },
                        });
                        await load();
                      })
                    }
                  >
                    退出
                  </Button>
                )}
              </div>
            )) || <p>正在读取设备…</p>}
          </section>
          <section className="account-section">
            <h2>数据与恢复副本</h2>
            <p>完整备份包含当前简历、项目、对话和版本，不包含模型密钥。</p>
            <Button
              variant="secondary"
              onClick={() =>
                downloadFile(
                  "履历云工作区备份.json",
                  JSON.stringify(workspace.state, null, 2),
                  "application/json",
                )
              }
            >
              <IconDownload size={16} />
              导出当前工作区
            </Button>
            {backups.map((b) => (
              <div className="account-detail-row" key={b.id}>
                <span>
                  云端冲突前版本 · {new Date(b.created_at).toLocaleString()}
                </span>
                <Button
                  variant="ghost"
                  onClick={() =>
                    action(async () => {
                      const value = await cloudRequest(
                        "cloud/backups/" + b.id,
                        { ownerId: user.id },
                      );
                      downloadFile(
                        "履历冲突恢复副本.json",
                        JSON.stringify(value.data),
                        "application/json",
                      );
                    })
                  }
                >
                  下载副本
                </Button>
              </div>
            ))}
            {recovery.map((b) => (
              <div className="account-detail-row" key={b.key}>
                <span>本机冲突副本 · {new Date(b.time).toLocaleString()}</span>
                <Button
                  variant="ghost"
                  onClick={() =>
                    downloadFile(
                      "履历本机恢复副本.json",
                      JSON.stringify(b.state),
                      "application/json",
                    )
                  }
                >
                  下载副本
                </Button>
              </div>
            ))}
          </section>
          {user.role !== "admin" ? (
            <section className="account-section">
              <h2>注销账号</h2>
              <p>
                注销会删除当前账号的云端资料和登录会话。请先导出需要保留的内容。
              </p>
              {!deleteOpen ? (
                <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
                  申请注销账号
                </Button>
              ) : (
                <div className="account-delete">
                  <Field label="输入完整邮箱确认注销">
                    <input
                      value={deleteEmail}
                      onChange={(e) => setDeleteEmail(e.target.value)}
                      placeholder={user.email}
                    />
                  </Field>
                  {deleteSent ? (
                    <Field label="邮箱验证码">
                      <input
                        value={deleteOtp}
                        inputMode="numeric"
                        maxLength={6}
                        onChange={(e) => setDeleteOtp(e.target.value)}
                      />
                    </Field>
                  ) : null}
                  <div className="account-actions">
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setDeleteOpen(false)}
                    >
                      保留账号
                    </Button>
                    <Button
                      disabled={
                        busy ||
                        deleteEmail !== user.email ||
                        (deleteSent && deleteOtp.length !== 6)
                      }
                      onClick={() =>
                        action(async () => {
                          if (!deleteSent) {
                            await cloudRequest(
                              "auth/email-otp/send-verification-otp",
                              {
                                method: "POST",
                                body: {
                                  email: user.email,
                                  type: "email-verification",
                                },
                              },
                            );
                            setDeleteSent(true);
                          } else {
                            await cloudRequest("cloud/account/delete", {
                              method: "POST",
                              ownerId: user.id,
                              body: { email: deleteEmail, otp: deleteOtp },
                            });
                            workspace.forget?.();
                            account.choose(null);
                            await account.refresh();
                          }
                        })
                      }
                    >
                      {deleteSent ? "确认注销并删除云端资料" : "发送注销验证码"}
                    </Button>
                  </div>
                </div>
              )}
            </section>
          ) : null}
        </>
      )}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Page>
  );
}
