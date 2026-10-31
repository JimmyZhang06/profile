import { useEffect, useState } from "react";
import { IconMail, IconRefresh } from "@tabler/icons-react";
import { Button, Field } from "../ui/index.jsx";
import { SelectField } from "../ui/SelectField.jsx";

export function MailSettings({ api, onDirty }) {
  const [saved, setSaved] = useState(null),
    [draft, setDraft] = useState(null),
    [password, setPassword] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const dirty =
    !!saved &&
    (JSON.stringify(saved) !== JSON.stringify(draft) || !!password || !!reason);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty]);
  async function load() {
    setError("");
    try {
      const data = await api("mail");
      setSaved(data);
      setDraft(data);
      setPassword("");
      setReason("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  function change(key, value) {
    setDraft((s) => ({ ...s, [key]: value }));
    setNotice("");
  }
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api("mail", {
        method: "PUT",
        body: { ...draft, password, reason },
      });
      setSaved(data);
      setDraft(data);
      setPassword("");
      setReason("");
      onDirty(false);
      setNotice("邮件设置已保存，后续请求立即使用新配置。");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function test(kind) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api("mail/" + kind, { method: "POST", body: {} });
      setNotice(
        kind === "verify"
          ? "SMTP 连接与身份认证通过。可继续发送测试邮件确认投递。"
          : "测试邮件已交给邮件服务，收件邮箱：" +
              result.recipient +
              "。请检查收件箱或垃圾邮件。",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="admin-intro">
        <div>
          <p className="account-kicker">EMAIL DELIVERY</p>
          <h1>邮件服务</h1>
          <p>管理登录验证码的发件服务，保存后立即生效。</p>
        </div>
        <Button variant="secondary" disabled={busy || dirty} onClick={load}>
          <IconRefresh size={16} />
          刷新
        </Button>
      </div>
      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      ) : null}
      {draft ? (
        <form className="admin-mail-form" onSubmit={save}>
          <section className="admin-section">
            <div className="admin-section-title">
              <h2>发送状态</h2>
              <label className="mail-toggle">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  disabled={busy}
                  onChange={(e) => change("enabled", e.target.checked)}
                />
                启用邮件服务
              </label>
            </div>
            <p className="admin-quiet">
              {draft.enabled
                ? "保存后，受邀用户可以通过邮箱验证码登录。"
                : "邮箱验证码登录暂不开放，管理员仍可使用密码与验证器登录。"}
            </p>
          </section>
          <section className="admin-section">
            <h2>SMTP 连接</h2>
            <div className="field-grid">
              <Field label="SMTP 服务器">
                <input
                  required
                  disabled={busy}
                  placeholder="smtp.example.com"
                  value={draft.host}
                  onChange={(e) => change("host", e.target.value)}
                />
              </Field>
              <SelectField
                value={String(draft.port)}
                onChange={(v) => change("port", Number(v))}
                options={[
                  { value: "587", label: "STARTTLS · 587" },
                  { value: "465", label: "TLS · 465" },
                ]}
                label="连接加密"
                disabled={busy}
              />
              <Field label="SMTP 登录账号">
                <input
                  required
                  disabled={busy}
                  autoComplete="off"
                  value={draft.username}
                  onChange={(e) => change("username", e.target.value)}
                />
              </Field>
              <Field
                label="密码 / 授权码"
                hint={
                  saved.passwordConfigured
                    ? "已加密保存，留空保留；更换服务器或账号时需重新填写。"
                    : "使用邮件服务商提供的 SMTP 密码或授权码。"
                }
              >
                <input
                  type="password"
                  disabled={busy}
                  autoComplete="new-password"
                  value={password}
                  placeholder={
                    saved.passwordConfigured
                      ? "已设置，不显示原值"
                      : "填写 SMTP 密码或授权码"
                  }
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            </div>
            <p className="admin-quiet">
              支持 SMTP 账号与密码认证。需要 OAuth
              授权的服务请使用其提供的兼容发送通道。
            </p>
          </section>
          <section className="admin-section">
            <h2>发件身份</h2>
            <div className="field-grid">
              <Field label="发件人名称">
                <input
                  required
                  disabled={busy}
                  value={draft.fromName}
                  onChange={(e) => change("fromName", e.target.value)}
                />
              </Field>
              <Field label="发件邮箱">
                <input
                  type="email"
                  required
                  disabled={busy}
                  value={draft.fromAddress}
                  onChange={(e) => change("fromAddress", e.target.value)}
                />
              </Field>
            </div>
            <p className="admin-quiet">
              填写邮件服务商已授权的发件邮箱，它可以与管理员邮箱不同。
            </p>
            <Field label="修改说明">
              <input
                required
                disabled={busy}
                minLength={2}
                maxLength={500}
                placeholder="例如：启用新的验证码发件服务"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </section>
          <div className="admin-mail-actions">
            <Button
              type="submit"
              busy={busy}
              disabled={busy || !dirty || reason.trim().length < 2}
            >
              保存邮件设置
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || dirty || !saved.passwordConfigured}
              onClick={() => test("verify")}
            >
              验证连接
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || dirty || !saved.passwordConfigured}
              onClick={() => test("test")}
            >
              <IconMail size={16} />
              向我的邮箱发送测试邮件
            </Button>
          </div>
        </form>
      ) : (
        <p className="admin-quiet">正在读取邮件设置…</p>
      )}
    </>
  );
}
