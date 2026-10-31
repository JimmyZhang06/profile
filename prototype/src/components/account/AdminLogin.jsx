import { useEffect, useState } from "react";
import { IconArrowRight, IconShieldCheck } from "@tabler/icons-react";
import { BrandLogo } from "../BrandLogo.jsx";
import { Button, Field } from "../ui/index.jsx";
import { EmailLogin } from "./AccountPage.jsx";
import { cloudRequest } from "../../lib/cloudClient.js";

export function AdminLogin({ health, onSuccess }) {
  const [setup, setSetup] = useState(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [token, setToken] = useState(""),
    [challenge, setChallenge] = useState(false),
    [code, setCode] = useState(""),
    [recovery, setRecovery] = useState(false),
    [emailMode, setEmailMode] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    try {
      setSetup(await cloudRequest("setup/status"));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    if (health?.cloudEnabled !== false) load();
  }, [health?.cloudEnabled]);
  async function submit(event) {
    event.preventDefault();
    setError("");
    if (setup?.required && password !== confirmation)
      return setError("两次输入的密码不一致。");
    setBusy(true);
    try {
      if (challenge) {
        await cloudRequest(
          "auth/two-factor/" +
            (recovery ? "verify-backup-code" : "verify-totp"),
          { method: "POST", body: { code } },
        );
        setCode("");
        await onSuccess();
      } else if (setup.required) {
        await cloudRequest("setup/complete", {
          method: "POST",
          body: { email: email.trim(), password, token: token.trim() },
        });
        setPassword("");
        setConfirmation("");
        setToken("");
        await onSuccess();
      } else {
        const result = await cloudRequest("auth/sign-in/email", {
          method: "POST",
          body: { email: email.trim(), password },
        });
        setPassword("");
        if (result.twoFactorRedirect) setChallenge(true);
        else await onSuccess();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (health?.cloudEnabled === false)
    return <EmailLogin admin health={health} onSuccess={onSuccess} />;
  if (emailMode)
    return (
      <>
        <EmailLogin
          admin
          health={health}
          initialEmail={email}
          onSuccess={onSuccess}
        />
        <button
          className="admin-login-switch"
          onClick={() => setEmailMode(false)}
        >
          返回密码登录
        </button>
      </>
    );
  return (
    <div className="email-login">
      <div className="account-brand" aria-label="履历">
        <BrandLogo expanded />
      </div>
      <div className="account-kicker">PLATFORM ACCESS</div>
      <h1>
        {challenge
          ? "验证管理员身份"
          : setup?.required
            ? "开启你的管理后台"
            : "登录管理后台"}
      </h1>
      <p>
        {challenge
          ? "输入验证器代码，完成本次安全验证。"
          : setup?.required
            ? "使用部署时提供的一次性初始化码，设置管理员密码。随后绑定验证器，即可配置邮件和平台服务。"
            : "使用管理员邮箱与密码登录，随后完成验证器验证。"}
      </p>
      {!setup ? (
        <Button variant="secondary" onClick={load}>
          重新检查初始化状态
        </Button>
      ) : (
        <form onSubmit={submit}>
          {challenge ? (
            <Field label={recovery ? "恢复代码" : "验证器代码"}>
              <input
                autoComplete="one-time-code"
                autoFocus
                required
                inputMode={recovery ? "text" : "numeric"}
                value={code}
                maxLength={recovery ? 64 : 6}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
          ) : (
            <>
              <Field label="管理员邮箱">
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  disabled={busy}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              {setup.required ? (
                <Field
                  label="一次性初始化码"
                  hint="有效期 24 小时，仅能使用一次。"
                >
                  <input
                    type="password"
                    autoComplete="off"
                    required
                    value={token}
                    disabled={busy}
                    onChange={(e) => setToken(e.target.value)}
                  />
                </Field>
              ) : null}
              <Field
                label={setup.required ? "设置管理员密码" : "管理员密码"}
                hint={
                  setup.required ? "使用至少 12 个字符的独立密码。" : undefined
                }
              >
                <input
                  type="password"
                  autoComplete={
                    setup.required ? "new-password" : "current-password"
                  }
                  minLength={12}
                  maxLength={128}
                  required
                  value={password}
                  disabled={busy}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              {setup.required ? (
                <Field label="确认密码">
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    required
                    value={confirmation}
                    disabled={busy}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </Field>
              ) : null}
            </>
          )}
          <Button
            type="submit"
            busy={busy}
            disabled={busy || (setup.required && !setup.available)}
          >
            {challenge
              ? "验证并进入"
              : setup.required
                ? "创建管理员并继续"
                : "登录"}
            <IconArrowRight size={17} />
          </Button>
          {setup.required && !setup.available ? (
            <p className="form-error">
              初始化码尚未生成或已过期，请联系部署维护者重新签发。
            </p>
          ) : null}
        </form>
      )}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {challenge ? (
        <button
          className="recovery-code-toggle"
          onClick={() => {
            setRecovery((v) => !v);
            setCode("");
          }}
        >
          {recovery ? "使用验证器代码" : "使用恢复代码"}
        </button>
      ) : !setup?.required && health?.mailReady ? (
        <button
          className="recovery-code-toggle"
          onClick={() => setEmailMode(true)}
        >
          使用邮箱验证码登录
        </button>
      ) : null}
      <p className="account-footnote">
        <IconShieldCheck size={15} />
        邮件服务可在登录后台后配置，管理员密码登录不依赖邮件。
      </p>
    </div>
  );
}
