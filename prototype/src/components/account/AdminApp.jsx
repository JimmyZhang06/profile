import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  IconLayoutDashboard,
  IconUsers,
  IconPlug,
  IconLayout,
  IconActivity,
  IconHistory,
  IconArrowLeft,
  IconPlus,
  IconSearch,
  IconArrowRight,
  IconShieldCheck,
  IconRefresh,
  IconMail,
  IconLogout,
} from "@tabler/icons-react";
import { BrandLogo } from "../BrandLogo.jsx";
import { ThemeMenu } from "../ThemeMenu.jsx";
import { useTheme } from "../../hooks/useTheme.js";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { Button, Field } from "../ui/index.jsx";
import { CurvedTabs } from "../ui/CurvedTabs.jsx";
import { SelectField } from "../ui/SelectField.jsx";
import { AdminLogin } from "./AdminLogin.jsx";
import { MailSettings } from "./MailSettings.jsx";
import { AdminHeader } from "./AdminHeader.jsx";
import { AdminRecord } from "./AdminRecord.jsx";
import { AdminAuditRecord } from "./AdminAuditRecord.jsx";
import { ModelServices } from "./ModelServices.jsx";
import { cloudRequest } from "../../lib/cloudClient.js";
import { ResumeDocument } from "../ResumeDocument.jsx";
import { initialWorkspace } from "../../lib/workspace.js";
import {
  designLimits,
  fontOptions,
  resumeTemplates,
  templateDesign,
} from "../../lib/resumeDesign.js";

const sections = [
  ["overview", "运行概览", IconLayoutDashboard],
  ["users", "用户与邀请", IconUsers],
  ["models", "AI 服务", IconPlug],
  ["mail", "邮件服务", IconMail],
  ["templates", "简历模板", IconLayout],
  ["usage", "使用记录", IconActivity],
  ["audit", "操作记录", IconHistory],
];
const time = (value) => (value ? new Date(value).toLocaleString() : "—");
const auditLabels = {
  "user.update": "调整账号与额度",
  "user.revoke-sessions": "撤销登录会话",
  "invitation.pending": "登记邀请",
  "invitation.revoked": "撤销邀请",
  "model.save": "保存平台模型",
  "model.domains.save": "更新模型允许域名",
  "model.test": "测试平台模型",
  "template.draft": "保存模板草稿",
  "template.publish": "发布模板版本",
  "template.retire": "下架模板",
  "account.delete": "注销账号",
  "admin.initialize": "初始化管理员",
  "workspace.import.maintenance": "导入个人资料",
  "mail.save": "保存邮件服务",
  "mail.verify": "验证邮件连接",
  "mail.test": "发送测试邮件",
};
function Badge({ children }) {
  return <span className="admin-badge">{children}</span>;
}
function Empty({ children }) {
  return <div className="admin-empty">{children}</div>;
}
function AdminEmail({ value = "" }) {
  const at = value.indexOf("@");
  return <span className="admin-email" dir="ltr">{at < 0 ? value : <>{value.slice(0, at)}<wbr />@{value.slice(at + 1)}</>}</span>;
}
function templateStatus(row) {
  return !row.enabled && row.published_version === row.version ? "已下架"
    : row.published_version === row.version ? "当前发布"
      : row.state === "draft" ? "草稿" : "历史版本";
}
function invitationStatus(row) {
  return { pending: new Date(row.expires_at) < new Date() ? "已过期" : "待接受", accepted: "已接受", revoked: "已撤销" }[row.status];
}
function Pager({ offset, count, onChange }) {
  return (
    <div className="admin-pager">
      <span>
        第 {offset / 50 + 1} 页 · {count} 条
      </span>
      <Button
        variant="ghost"
        disabled={!offset}
        onClick={() => onChange(offset - 50)}
      >
        上一页
      </Button>
      <Button
        variant="ghost"
        disabled={count < 50}
        onClick={() => onChange(offset + 50)}
      >
        下一页
      </Button>
    </div>
  );
}
function Table({ columns, items, rowKey = "id", mobileRow, label = "管理记录" }) {
  const compact = useMediaQuery('(max-width: 760px)');
  return !items.length ? <Empty>暂无记录</Empty> : compact && mobileRow ? (
    <ul className="admin-record-list" aria-label={label}>
      {items.map((row, index) => <li key={row[rowKey] || index}>{mobileRow(row)}</li>)}
    </ul>
  ) : (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th className={c.className || ""} key={c.label}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row, index) => (
            <tr key={row[rowKey] || index}>
              {columns.map((c, columnIndex) => (
                <td
                  className={c.className || ""}
                  key={c.label}
                  data-label={c.label}
                  data-kind={c.kind || (columnIndex === 0 ? "primary" : "detail")}
                  data-wide={c.wide || undefined}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function useResource(path, api) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setError("");
    setData(null);
    api(path, { signal: controller.signal })
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((e) => {
        if (alive && e.name !== "AbortError") setError(e.message);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [path, version]);
  return { data, error, reload: () => setVersion((v) => v + 1) };
}
function Load({ resource, children }) {
  return resource.error ? (
    <p className="form-error" role="alert">
      {resource.error}
    </p>
  ) : resource.data ? (
    children(resource.data)
  ) : (
    <p className="admin-loading">正在读取…</p>
  );
}
function AdminGate({ api, onVerified }) {
  const [setup, setSetup] = useState(null),
    [qr, setQr] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [gate, setGate] = useState(null),
    [recovery, setRecovery] = useState(false);
  const [password, setPassword] = useState("");
  useEffect(() => {
    api("gate")
      .then((value) => {
        setGate(value);
        if (value.verified) onVerified();
      })
      .catch((e) => setError(e.message));
  }, []);
  async function begin() {
    setBusy(true);
    setError("");
    try {
      const result = await api("setup", { method: "POST", body: { password } });
      setPassword("");
      setSetup(result);
      const QR = await import("qrcode");
      setQr(await QR.toDataURL(result.totpURI, { margin: 1, width: 192 }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("verify", {
        method: "POST",
        body: recovery ? { backupCode: code } : { code },
      });
      onVerified();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-verification">
      <div className="account-badge">
        <IconShieldCheck size={27} />
      </div>
      <h1>验证管理员身份</h1>
      <p>管理权限仅在验证后开放，每次授权持续 30 分钟。</p>
      {gate && !gate.enabled && !setup ? (
        <>
          <p>首次使用请绑定验证器。用验证器扫描二维码后，输入当前六位代码。</p>
          {gate.passwordRequired ? (
            <Field label="确认管理员密码">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          ) : null}
          <Button
            busy={busy}
            disabled={busy || (gate.passwordRequired && !password)}
            onClick={begin}
          >
            绑定验证器
          </Button>
        </>
      ) : null}
      {setup ? (
        <div className="totp-setup">
          {qr ? (
            <img
              src={qr}
              alt="管理员验证器绑定二维码"
              width="192"
              height="192"
            />
          ) : null}
          <details>
            <summary>无法扫码？显示手动设置密钥</summary>
            <code>{new URL(setup.totpURI).searchParams.get("secret")}</code>
          </details>
          <p>请保存恢复代码，之后不会再次显示。</p>
          <pre>{setup.backupCodes?.join("\n")}</pre>
        </div>
      ) : null}
      {gate?.enabled || setup ? (
        <form onSubmit={verify}>
          <Field label={recovery ? "恢复代码" : "验证器代码"}>
            <input
              autoFocus
              className={recovery ? "recovery-code" : ""}
              inputMode={recovery ? "text" : "numeric"}
              maxLength={recovery ? 64 : 6}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) =>
                setCode(
                  recovery ? e.target.value : e.target.value.replace(/\D/g, ""),
                )
              }
            />
          </Field>
          <Button
            type="submit"
            busy={busy}
            disabled={
              busy || (recovery ? code.trim().length < 6 : code.length !== 6)
            }
          >
            验证并进入
          </Button>
          {gate?.enabled ? (
            <button
              className="recovery-code-toggle"
              type="button"
              disabled={busy}
              onClick={() => {
                setRecovery((value) => !value);
                setCode("");
                setError("");
              }}
            >
              {recovery ? "使用验证器代码" : "无法使用验证器？使用恢复代码"}
            </button>
          ) : null}
        </form>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <a href="/">返回个人工作区</a>
    </div>
  );
}
function Overview({ api, navigate }) {
  const resource = useResource("overview", api);
  return (
    <Load resource={resource}>
      {(data) => (
        <>
          <div className="admin-intro">
            <div>
              <p className="account-kicker">PLATFORM OVERVIEW</p>
              <h1>运行概览</h1>
              <p>关注需要处理的问题，保持工作区稳定运行。</p>
            </div>
            <Button variant="secondary" onClick={resource.reload}>
              <IconRefresh size={16} />
              刷新
            </Button>
          </div>
          <div className="admin-metrics">
            {[
              [
                "近 7 天活跃用户",
                data.counts.active_users,
                `${data.counts.users} 个账号`,
              ],
              ["本月 AI 调用", data.counts.calls, "包含平台与自带模型"],
              [
                "AI 成功率",
                data.counts.calls
                  ? Math.round(
                      (data.counts.succeeded / data.counts.calls) * 100,
                    ) + "%"
                  : "—",
                `${data.counts.failed} 次失败`,
              ],
              ["待接受邀请", data.counts.invitations, "有效期内的邀请"],
            ].map(([label, value, note]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{note}</small>
              </div>
            ))}
          </div>
          <section className="admin-section">
            <div className="admin-section-title">
              <h2>需要关注</h2>
              <Button variant="ghost" onClick={() => navigate("usage")}>
                查看使用记录
                <IconArrowRight size={15} />
              </Button>
            </div>
            {!data.mailConfigured ? (
              <div className="admin-notice">
                <IconShieldCheck size={20} />
                <div>
                  <strong>
                    {data.mailMode === "local-mailbox"
                      ? "当前使用本机开发邮箱"
                      : "邮件服务尚未启用"}
                  </strong>
                  <p>
                    在邮件服务页面保存发件配置并完成测试后，再邀请用户登录。管理员密码与验证器登录不受影响。
                  </p>
                </div>
              </div>
            ) : null}
            {!data.allowedModelHosts.length ? (
              <div className="admin-notice">
                <IconPlug size={20} />
                <div>
                  <strong>尚未开放云端模型地址</strong>
                  <p>
                    配置允许访问的服务域名后，可以添加平台模型。内置本地整理仍可使用。
                  </p>
                  <Button variant="ghost" onClick={() => navigate("models/domains")}>配置允许域名<IconArrowRight size={15} /></Button>
                </div>
              </div>
            ) : null}
            {data.issues.length ? (
              <Table
                items={data.issues}
                columns={[
                  { label: "模型", render: (r) => r.model_name },
                  {
                    label: "错误类型",
                    render: (r) => <Badge>{r.error_type}</Badge>,
                  },
                  { label: "时间", render: (r) => time(r.started_at) },
                ]}
              />
            ) : (
              <p className="admin-quiet">暂无失败请求。</p>
            )}
          </section>
          <section className="admin-section">
            <h2>工作区边界</h2>
            <p className="admin-quiet">
              后台管理账号、服务与模板。用户私人简历、项目原始资料和聊天正文不在后台展示。
            </p>
            <div className="admin-overview-links">
              <button onClick={() => navigate("users")}>
                管理用户与邀请
                <IconArrowRight size={17} />
              </button>
              <button onClick={() => navigate("templates")}>
                管理简历模板
                <IconArrowRight size={17} />
              </button>
            </div>
          </section>
        </>
      )}
    </Load>
  );
}
function Users({ api, navigate, perform, onDirty, leave }) {
  const id = useId();
  const [tab, setTab] = useState("users"),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [offset, setOffset] = useState(0),
    [invite, setInvite] = useState(false),
    [email, setEmail] = useState(""),
    [reason, setReason] = useState("邀请参与体验");
  const dirty = invite && (!!email.trim() || reason !== "邀请参与体验");
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty]);
  const resource = useResource(
    tab === "users"
      ? `users?q=${encodeURIComponent(q)}&status=${status}&offset=${offset}`
      : `invitations?offset=${offset}`,
    api,
  );
  function revokeInvitation(row) {
    perform(async () => {
      await api("invitations", {
        method: "POST",
        body: { email: row.email, action: "revoke", reason: "管理员撤销未接受的邀请" },
      });
      resource.reload();
    }, "邀请已撤销");
  }
  return (
    <>
      <div className="admin-intro">
        <div>
          <h1>用户与邀请</h1>
          <p>管理访问资格与额度，不接触用户私人资料。</p>
        </div>
        <Button
          onClick={() => {
            setTab("invitations");
            setInvite(true);
          }}
        >
          <IconPlus size={16} />
          邀请用户
        </Button>
      </div>
      <CurvedTabs
        id={id}
        label="用户管理分类"
        value={tab}
        onChange={(value) => {
          setTab(value);
          setOffset(0);
        }}
        items={[
          { value: "users", label: "用户" },
          { value: "invitations", label: "邀请" },
        ]}
      />
      {invite ? (
        <form
          className="admin-inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            perform(async () => {
              await api("invitations", {
                method: "POST",
                body: { email, reason },
              });
              setInvite(false);
              setEmail("");
              setReason("邀请参与体验");
              onDirty(false);
              resource.reload();
            }, "邀请已登记，可以将登录地址分享给对方");
          }}
        >
          <Field label="受邀邮箱">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="邀请原因">
            <input
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="account-actions">
            <Button
              variant="secondary"
              onClick={() =>
                leave(() => {
                  setInvite(false);
                  setEmail("");
                  setReason("邀请参与体验");
                })
              }
            >
              取消
            </Button>
            <Button type="submit">登记邀请</Button>
          </div>
          <p className="quiet-note">
            邀请 7 天内有效。受邀者通过登录页获取邮箱验证码。
          </p>
        </form>
      ) : null}
      {tab === "users" ? (
        <div className="admin-filters">
          <label className="admin-search">
            <IconSearch size={17} />
            <input
              placeholder="搜索邮箱"
              aria-label="搜索用户邮箱"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOffset(0);
              }}
            />
          </label>
          <SelectField
            label="用户状态"
            value={status}
            onChange={(value) => {
              setStatus(value);
              setOffset(0);
            }}
            options={[
              { value: "", label: "全部状态" },
              { value: "active", label: "正常" },
              { value: "disabled", label: "已停用" },
            ]}
          />
        </div>
      ) : null}
      <Load resource={resource}>
        {(data) => (
          <>
            <Table
              items={data.items}
              rowKey={tab === "users" ? "id" : "email"}
              label={tab === "users" ? "用户列表" : "邀请列表"}
              mobileRow={tab === "users" ? row => (
                <AdminRecord className="admin-user-record" title={<AdminEmail value={row.email} />}
                  description={`${row.role === "admin" ? "管理员" : "普通用户"} · ${row.status === "active" ? "正常" : "已停用"} · 本月 ${row.used} / ${row.monthly_limit}`}
                  actionLabel="详情" onOpen={() => navigate("users/" + row.id)} />
              ) : row => (
                <AdminRecord className="admin-user-record" title={<AdminEmail value={row.email} />}
                  description={`${invitationStatus(row)} · 到期 ${time(row.expires_at)}`}
                  action={row.status === "pending" ? <Button variant="ghost" aria-label={`撤销 ${row.email} 的邀请`} onClick={() => revokeInvitation(row)}>撤销</Button> : null} />
              )}
              columns={
                tab === "users"
                  ? [
                      {
                        label: "用户",
                        render: (r) => (
                          <button
                            className="admin-row-link"
                            onClick={() => navigate("users/" + r.id)}
                          >
                            <AdminEmail value={r.email} />
                            <small>
                              {r.role === "admin" ? "管理员" : "普通用户"}
                            </small>
                          </button>
                        ),
                      },
                      {
                        label: "状态",
                        render: (r) => (
                          <Badge>
                            {r.status === "active" ? "正常" : "已停用"}
                          </Badge>
                        ),
                      },
                      {
                        label: "本月额度",
                        render: (r) => `${r.used} / ${r.monthly_limit}`,
                      },
                      {
                        label: "最近活跃",
                        className: "optional-column",
                        render: (r) => time(r.last_active),
                      },
                      {
                        label: "操作",
                        kind: "action",
                        render: (r) => (
                          <Button
                            variant="ghost"
                            onClick={() => navigate("users/" + r.id)}
                          >
                            查看详情
                          </Button>
                        ),
                      },
                    ]
                  : [
                      { label: "邮箱", render: (r) => <AdminEmail value={r.email} /> },
                      {
                        label: "状态",
                        render: (r) => (
                          <Badge>{invitationStatus(r)}</Badge>
                        ),
                      },
                      {
                        label: "到期时间",
                        className: "optional-column",
                        render: (r) => time(r.expires_at),
                      },
                      {
                        label: "操作",
                        kind: "action",
                        render: (r) =>
                          r.status === "pending" ? (
                            <Button
                              variant="ghost"
                              onClick={() => revokeInvitation(r)}
                            >
                              撤销邀请
                            </Button>
                          ) : (
                            "—"
                          ),
                      },
                    ]
              }
            />
            <Pager
              offset={offset}
              count={data.items.length}
              onChange={setOffset}
            />
          </>
        )}
      </Load>
    </>
  );
}
function UserDetail({ id, api, navigate, perform, onDirty }) {
  const resource = useResource("users/" + id, api);
  return (
    <Load resource={resource}>
      {(data) => (
        <UserForm
          data={data}
          api={api}
          navigate={navigate}
          perform={perform}
          reload={resource.reload}
          onDirty={onDirty}
        />
      )}
    </Load>
  );
}
function UserForm({ data, api, navigate, perform, reload, onDirty }) {
  const [status, setStatus] = useState(data.user.status),
    [quota, setQuota] = useState(data.user.monthly_limit),
    [reason, setReason] = useState("");
  const dirty =
    status !== data.user.status || Number(quota) !== data.user.monthly_limit;
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty]);
  return (
    <>
      <button className="admin-back" onClick={() => navigate("users")}>
        <IconArrowLeft size={16} />
        用户列表
      </button>
      <div className="admin-intro">
        <div>
          <h1><AdminEmail value={data.user.email} /></h1>
          <p>
            {data.user.role === "admin" ? "管理员" : "普通用户"} ·{" "}
            {data.sessionCount} 个有效登录会话
          </p>
        </div>
      </div>
      <div className="admin-detail-form">
        <SelectField
          label="账号状态"
          value={status}
          onChange={setStatus}
          options={[
            { value: "active", label: "正常使用" },
            { value: "disabled", label: "停用账号" },
          ]}
        />
        <Field
          label="每月 AI 调用额度"
          hint="本地整理不消耗额度，平台模型和自带连接均受此上限约束。"
        >
          <input
            type="number"
            min="0"
            max="1000000"
            value={quota}
            onChange={(e) => setQuota(e.target.value)}
          />
        </Field>
        <Field label="操作原因">
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="说明调整原因，写入操作记录"
          />
        </Field>
        <div className="account-actions">
          <Button
            disabled={!dirty || reason.trim().length < 2}
            onClick={() =>
              perform(async () => {
                await api("users/" + data.user.id, {
                  method: "POST",
                  body: { status, monthlyLimit: Number(quota), reason },
                });
                onDirty(false);
                reload();
              }, "用户设置已保存")
            }
          >
            保存变更
          </Button>
          <Button
            variant="secondary"
            disabled={reason.trim().length < 2}
            onClick={() =>
              perform(async () => {
                await api("users/" + data.user.id, {
                  method: "POST",
                  body: { action: "revoke-sessions", reason },
                });
                reload();
              }, "该用户的登录会话已撤销")
            }
          >
            撤销全部会话
          </Button>
        </div>
      </div>
    </>
  );
}
function Templates({ api, perform, onDirty, leave }) {
  const heading = useRef(null);
  const resource = useResource("templates", api),
    [editing, setEditing] = useState(null);
  useLayoutEffect(() => {
    heading.current?.closest(".admin-scroll")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [editing]);
  return (
    <>
      <div className="admin-intro" ref={heading}>
        <div>
          <h1>简历模板</h1>
          <p>发布固定版本。已有简历保留原版式，由用户主动更新。</p>
        </div>
        <Button
          onClick={() =>
            leave(() =>
              setEditing({
                name: "新模板",
                description: "",
                design: templateDesign("modern"),
              }),
            )
          }
        >
          <IconPlus size={16} />
          新建模板
        </Button>
      </div>
      {editing ? (
        <TemplateEditor
          key={(editing.id || "new") + ":" + (editing.version || "draft")}
          release={editing}
          api={api}
          perform={perform}
          onDirty={onDirty}
          onBack={() =>
            leave(() => {
              setEditing(null);
              onDirty(false);
            })
          }
          onSaved={() => {
            setEditing(null);
            onDirty(false);
            resource.reload();
          }}
        />
      ) : (
        <Load resource={resource}>
          {(data) => (
            <Table
              items={data.items.map((r) => ({
                ...r,
                key: r.id + ":" + r.version,
              }))}
              rowKey="key"
              label="简历模板列表"
              mobileRow={row => (
                <AdminRecord title={row.name}
                  metadata={<><span>v{row.version}</span><span>{templateStatus(row)}</span></>}
                  description={row.description} actionLabel="预览"
                  onOpen={() => setEditing(row)} />
              )}
              columns={[
                {
                  label: "模板",
                  render: (r) => (
                    <strong>
                      {r.name}
                      <small>{r.description}</small>
                    </strong>
                  ),
                },
                { label: "版本", render: (r) => "v" + r.version },
                {
                  label: "状态",
                  render: (r) => (
                    <Badge>{templateStatus(r)}</Badge>
                  ),
                },
                {
                  label: "创建时间",
                  className: "optional-column",
                  render: (r) => time(r.created_at),
                },
                {
                  label: "操作",
                  kind: "action",
                  render: (r) => (
                    <Button variant="ghost" onClick={() => setEditing(r)}>
                      预览与管理
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </Load>
      )}
    </>
  );
}
function TemplateEditor({ release, api, perform, onBack, onSaved, onDirty }) {
  const [draft, setDraft] = useState({ ...release, reason: "" }),
    [sample] = useState(() => initialWorkspace().documents[0].resume);
  const dirty =
    JSON.stringify({ ...draft, reason: undefined }) !==
    JSON.stringify({ ...release, reason: undefined });
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty]);
  function design(patch) {
    setDraft((s) => ({ ...s, design: { ...s.design, ...patch } }));
  }
  return (
    <div className="admin-template-editor">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          perform(async () => {
            await api("templates", { method: "POST", body: draft });
            onSaved();
          }, "新版本草稿已保存，发布后才会出现在模板库");
        }}
      >
        <button type="button" className="admin-back" onClick={onBack}>
          <IconArrowLeft size={16} />
          模板列表
        </button>
        <Field label="模板名称">
          <input
            required
            value={draft.name}
            maxLength={80}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field label="说明">
          <input
            value={draft.description}
            maxLength={200}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
        </Field>
        <SelectField
          label="布局结构"
          value={draft.design.template}
          onChange={(value) =>
            setDraft((s) => ({ ...s, design: templateDesign(value) }))
          }
          options={resumeTemplates.map((t) => ({ value: t.id, label: t.name }))}
        />
        <SelectField
          label="字体"
          value={draft.design.font}
          onChange={(font) => design({ font })}
          options={fontOptions}
        />
        <div className="admin-template-numbers">
          {[
            ["fontSize", "正文字号"],
            ["headingSize", "章节字号"],
            ["nameSize", "姓名字号"],
            ["lineHeight", "行间距"],
            ["paragraphGap", "段落间距"],
            ["sectionGap", "章节间距"],
            ["margin", "页面留白"],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                type="number"
                min={designLimits[key][0]}
                max={designLimits[key][1]}
                step={
                  key === "lineHeight" ? 0.05 : key.includes("Size") ? 0.5 : 1
                }
                value={draft.design[key]}
                onChange={(e) => design({ [key]: Number(e.target.value) })}
              />
            </Field>
          ))}
        </div>
        <Field label="操作原因">
          <textarea
            required
            minLength={2}
            value={draft.reason}
            rows={2}
            onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
          />
        </Field>
        <Button type="submit" disabled={draft.reason.trim().length < 2}>
          保存为新草稿版本
        </Button>
        {release.version ? (
          <div className="template-release-actions">
            <Button
              variant="secondary"
              disabled={dirty || draft.reason.trim().length < 2}
              onClick={() =>
                perform(async () => {
                  await api("templates", {
                    method: "POST",
                    body: {
                      id: release.id,
                      version: release.version,
                      action: "publish",
                      reason: draft.reason,
                    },
                  });
                  onSaved();
                }, "模板发布版本已更新")
              }
            >
              {release.published_version &&
              release.version < release.published_version
                ? "回滚到此版本"
                : "发布此版本"}
            </Button>
            <Button
              variant="ghost"
              disabled={
                dirty || !release.enabled || draft.reason.trim().length < 2
              }
              onClick={() =>
                perform(async () => {
                  await api("templates", {
                    method: "POST",
                    body: {
                      id: release.id,
                      action: "retire",
                      reason: draft.reason,
                    },
                  });
                  onSaved();
                }, "模板已下架，现有简历不受影响")
              }
            >
              下架模板
            </Button>
          </div>
        ) : null}
      </form>
      <div className="admin-template-preview">
        <div>
          实际版式预览 · 虚构示例资料
          {release.version ? " · v" + release.version : ""}
        </div>
        <ResumeDocument resume={{ ...sample, design: draft.design }} readOnly />
      </div>
    </div>
  );
}
function Records({ type, api }) {
  const [offset, setOffset] = useState(0),
    [status, setStatus] = useState("");
  const resource = useResource(
    type + `?offset=${offset}&status=${status}`,
    api,
  );
  return (
    <>
      <div className="admin-intro">
        <div>
          <h1>{type === "audit" ? "操作记录" : "使用记录"}</h1>
          <p>
            {type === "audit"
              ? "追溯平台变更、前后值与操作原因。凭据不进入记录。"
              : "记录模型、耗时和用量，不记录简历、项目正文或对话内容。"}
          </p>
        </div>
        <Button variant="secondary" onClick={resource.reload}>
          <IconRefresh size={16} />
          刷新
        </Button>
      </div>
      {type === "usage" ? (
        <div className="admin-filters">
          <SelectField
            label="请求状态"
            value={status}
            onChange={(value) => {
              setStatus(value);
              setOffset(0);
            }}
            options={[
              { value: "", label: "全部请求" },
              { value: "succeeded", label: "成功" },
              { value: "failed", label: "失败" },
              { value: "cancelled", label: "已取消" },
              { value: "started", label: "处理中" },
            ]}
          />
        </div>
      ) : null}
      <Load resource={resource}>
        {(data) => (
          <>
            <Table
              items={data.items}
              columns={
                type === "usage"
                  ? [
                      {
                        label: "时间 / 用户",
                        render: (r) => (
                          <span>
                            {time(r.started_at)}
                            <small>{r.email || "已注销账号"}</small>
                          </span>
                        ),
                      },
                      {
                        label: "模型",
                        render: (r) => (
                          <span>
                            {r.model_name}
                            <small>
                              {r.source === "platform"
                                ? "平台提供"
                                : "用户自带"}
                            </small>
                          </span>
                        ),
                      },
                      {
                        label: "状态",
                        render: (r) => (
                          <span>
                            <Badge>
                              {
                                {
                                  succeeded: "成功",
                                  failed: "失败",
                                  cancelled: "已取消",
                                  started: "处理中",
                                }[r.status]
                              }
                            </Badge>
                            <small>{r.error_type}</small>
                          </span>
                        ),
                      },
                      {
                        label: "耗时",
                        render: (r) => (r.duration_ms / 1000).toFixed(1) + "s",
                      },
                      {
                        label: "输入 / 输出 token",
                        className: "optional-column",
                        render: (r) =>
                          `${r.input_tokens ?? "—"} / ${r.output_tokens ?? "—"}`,
                      },
                    ]
                  : [
                      {
                        label: "操作人 / 时间",
                        render: (r) => (
                          <span>
                            {r.actor_email}
                            <small>{time(r.created_at)}</small>
                          </span>
                        ),
                      },
                      {
                        label: "操作",
                        render: (r) => (
                          <span>
                            {auditLabels[r.action] || r.action}
                            <small>{r.target}</small>
                          </span>
                        ),
                      },
                      {
                        label: "原因与变更",
                        wide: true,
                        render: (r) => (
                          <div>
                            {r.reason}
                            <details>
                              <summary>查看前后值</summary>
                              <pre>
                                {JSON.stringify(
                                  {
                                    before: r.before_value,
                                    after: r.after_value,
                                  },
                                  null,
                                  2,
                                )}
                              </pre>
                            </details>
                          </div>
                        ),
                      },
                    ]
              }
              label={type === "audit" ? "操作记录列表" : "使用记录列表"}
              mobileRow={type === "audit" ? row => (
                <AdminAuditRecord record={row} title={auditLabels[row.action] || row.action} timestamp={time(row.created_at)} />
              ) : undefined}
            />
            <Pager
              offset={offset}
              count={data.items.length}
              onChange={setOffset}
            />
          </>
        )}
      </Load>
    </>
  );
}
export default function AdminApp({ account }) {
  const scroll = useRef(null);
  const theme = useTheme(),
    [page, setPage] = useState(location.hash.slice(1) || "overview"),
    [verified, setVerified] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [pending, setPending] = useState(null);
  useLayoutEffect(() => {
    scroll.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [page, verified]);
  useEffect(() => {
    document.title = "管理后台 · 履历";
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  function commit(next) {
    setDirty(false);
    setPending(null);
    setError("");
    scroll.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    if (typeof next === "function") {
      next();
      return;
    }
    if (next === "/") {
      location.assign("/");
      return;
    }
    setPage(next);
    history.replaceState(null, "", "#" + next);
  }
  function navigate(next) {
    if (dirty) setPending(() => next);
    else commit(next);
  }
  async function api(path, options) {
    try {
      return await cloudRequest("admin/" + path, {
        ...options,
        ownerId: account.user?.id,
      });
    } catch (e) {
      if (e.code === "STEP_UP_REQUIRED") setVerified(false);
      if (e.code === "SESSION_EXPIRED") await account.refresh();
      throw e;
    }
  }
  async function perform(fn, message) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      setToast(message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (account.loading)
    return <div className="account-loading">正在检查账号…</div>;
  if (!account.user)
    return (
      <main className="admin-auth-page">
        <a href="/" className="admin-back">
          <IconArrowLeft size={16} />
          返回个人工作区
        </a>
        <AdminLogin health={account.health} onSuccess={account.refresh} />
      </main>
    );
  if (account.user.role !== "admin")
    return (
      <main className="admin-auth-page">
        <div className="admin-verification">
          <IconShieldCheck size={32} />
          <h1>此账号没有管理权限</h1>
          <p>你可以继续使用个人工作区。</p>
          <a href="/">返回个人工作区</a>
        </div>
      </main>
    );
  if (!verified)
    return (
      <main className="admin-auth-page">
        <AdminGate api={api} onVerified={() => setVerified(true)} />
      </main>
    );
  const section = page.split("/")[0],
    shared = { api, navigate, leave: navigate, perform, onDirty: setDirty };
  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <button
          aria-label="履历管理后台首页"
          className="admin-brand"
          onClick={() => navigate("overview")}
        >
          <BrandLogo expanded />
          <small>管理后台</small>
        </button>
        <nav aria-label="管理后台导航">
          {sections.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-label={label}
              className={section === id ? "active" : ""}
              aria-current={section === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <ThemeMenu theme={theme} expanded />
          <button aria-label="返回个人工作区" onClick={() => navigate("/")}>
            <IconArrowLeft size={17} />
            <span>个人工作区</span>
          </button>
          <small title={account.user.email}>{account.user.email}</small>
          <button
            onClick={() =>
              navigate(() => perform(() => account.logout(), "已退出登录"))
            }
          >
            <IconLogout size={17} />
            <span>退出登录</span>
          </button>
        </div>
      </aside>
      <section className="admin-main">
        <AdminHeader sections={sections} section={section} navigate={navigate} theme={theme}
          onLogout={() => navigate(() => perform(() => account.logout(), "已退出登录"))} />
        {pending ? (
          <div className="page-leave-notice">
            <span>当前表单还有未保存内容。</span>
            <Button variant="secondary" onClick={() => setPending(null)}>
              继续编辑
            </Button>
            <Button variant="ghost" onClick={() => commit(pending)}>
              放弃更改并离开
            </Button>
          </div>
        ) : null}
        <div className="admin-scroll" ref={scroll} aria-busy={busy}>
          <div className="admin-content">
            {error ? (
              <p className="admin-error" role="alert">
                {error}
              </p>
            ) : null}
            <div inert={busy || undefined} key={page}>
              {section === "overview" ? (
                <Overview {...shared} />
              ) : section === "users" ? (
                page.includes("/") ? (
                  <UserDetail id={page.split("/")[1]} {...shared} />
                ) : (
                  <Users {...shared} />
                )
              ) : section === "models" ? (
                <ModelServices {...shared} initialView={page.endsWith("/domains") ? "domains" : "connections"} />
              ) : section === "mail" ? (
                <MailSettings {...shared} />
              ) : section === "templates" ? (
                <Templates {...shared} />
              ) : ["usage", "audit"].includes(section) ? (
                <Records type={section} api={api} />
              ) : (
                <Overview {...shared} />
              )}
            </div>
          </div>
        </div>
      </section>
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </main>
  );
}
