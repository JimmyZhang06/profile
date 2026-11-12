import { useEffect, useState } from "react";
import { Button, Field } from "../../components/ui/index.jsx";
import {
  OpportunityFields,
  OpportunityForm,
  blankOpportunity,
} from "./OpportunityForm.jsx";
import { OpportunityDetail } from "./OpportunitiesPage.jsx";
import {
  opportunityStatus,
  opportunityFieldLabel,
  requestId,
} from "./opportunityClient.js";
import "./opportunities.css";

export default function OpportunityAdminPage({
  api,
  navigate,
  leave,
  perform,
  onDirty,
  page,
}) {
  const [tab, setTab] = useState("pending"),
    [data, setData] = useState(null),
    [detail, setDetail] = useState(null),
    [draft, setDraft] = useState(null),
    [approved, setApproved] = useState(false),
    [channel, setChannel] = useState(false),
    [feedback, setFeedback] = useState(""),
    [feedbackField, setFeedbackField] = useState("general"),
    [reason, setReason] = useState(""),
    [internal, setInternal] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [image, setImage] = useState(null),
    [edit, setEdit] = useState(null),
    [version, setVersion] = useState(0),
    [due, setDue] = useState(false),
    [localDirty, setLocalDirty] = useState(false),
    [pending, setPending] = useState(null);
  const refresh = () => setVersion((v) => v + 1);
  useEffect(() => {
    let alive = true;
    setData(null);
    setError("");
    api(
      tab === "catalog"
        ? "opportunities" + (due ? "?due=true" : "")
        : tab === "reports"
          ? "opportunity-reports"
          : "opportunity-submissions" +
            (tab === "all" ? "" : "?status=pending"),
    )
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [tab, version, due]);
  useEffect(() => {
    onDirty(localDirty);
    return () => onDirty(false);
  }, [localDirty, onDirty]);
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image);
    },
    [image],
  );
  const change = (fn) => {
    fn();
    setLocalDirty(true);
  };
  function go(fn) {
    if (localDirty) setPending(() => fn);
    else fn();
  }
  async function open(id) {
    setBusy(true);
    setError("");
    try {
      const value = await api("opportunity-submissions/" + id);
      setDetail(value);
      setDraft(value.item.data);
      setApproved(false);
      setChannel(false);
      setFeedback("");
      setReason("");
      setInternal("");
      setLocalDirty(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    setBusy(true);
    setError("");
    try {
      const value = await api("opportunity-submissions", {
        method: "POST",
        body: { requestId: requestId(), data: blankOpportunity },
      });
      setEdit(await api("opportunity-submissions/" + value.item.id));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function decide(decision) {
    setBusy(true);
    setError("");
    try {
      await api("opportunity-submissions/" + detail.item.id + "/review", {
        method: "POST",
        body: {
          revision: detail.item.revision,
          opportunityRevision: detail.item.opportunity_revision,
          requestId: requestId(),
          decision,
          data: draft,
          sourceVerified: approved,
          channelApproved: channel,
          feedback: feedback ? { [feedbackField]: feedback } : {},
          internalNote: internal,
          reason,
        },
      });
      setLocalDirty(false);
      setDetail(null);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function state(row, status, releaseVersion) {
    setBusy(true);
    setError("");
    try {
      await api("opportunities/" + row.id, {
        method: "POST",
        body: {
          revision: row.revision,
          status,
          ...(releaseVersion ? { version: releaseVersion } : {}),
          reason,
          requestId: requestId(),
        },
      });
      setReason("");
      setLocalDirty(false);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function viewEvidence(e) {
    try {
      const response = await fetch(
        "/api/admin/opportunity-submissions/" +
          detail.item.id +
          "/evidence/" +
          e.id,
        {
          credentials: "same-origin",
          headers: { "X-Luli-Client": "workspace" },
        },
      );
      if (!response.ok) {
        await api("opportunity-submissions/" + detail.item.id);
        throw Error("凭证读取失败，请重新验证管理员身份");
      }
      const blob = await response.blob();
      setImage(URL.createObjectURL(blob));
    } catch (e) {
      setError(e.message);
    }
  }
  async function resolve(row, status) {
    setBusy(true);
    setError("");
    try {
      await api("opportunity-reports/" + row.id, {
        method: "POST",
        body: { status, resolution: feedback, reason, requestId: requestId() },
      });
      setLocalDirty(false);
      setFeedback("");
      setReason("");
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="op-admin">
      <div className="admin-intro">
        <div>
          <h1>机会管理</h1>
          <p>私有来源与拟公开内容分开核对，审核后生成固定版本。</p>
        </div>
        <Button variant="secondary" disabled={busy} onClick={() => go(create)}>
          代录机会
        </Button>
      </div>
      {pending && (
        <div className="op-notice" role="alert">
          尚有未保存内容。
          <Button onClick={() => setPending(null)}>继续编辑</Button>
          <Button
            variant="ghost"
            onClick={() => {
              setLocalDirty(false);
              pending();
              setPending(null);
            }}
          >
            放弃更改
          </Button>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {edit ? (
        <OpportunityForm
          key={edit.item.id}
          initial={edit}
          api={api}
          onDirty={setLocalDirty}
          onSaved={async (id) =>
            setEdit(await api("opportunity-submissions/" + id))
          }
          onBack={() =>
            go(() => {
              setEdit(null);
              refresh();
            })
          }
        />
      ) : detail ? (
        <>
          <Button
            variant="ghost"
            onClick={() =>
              go(() => {
                setDetail(null);
                setImage(null);
              })
            }
          >
            ← 返回队列
          </Button>
          <h2>
            {detail.item.data.company} · {detail.item.data.title}
          </h2>
          <p>
            {opportunityStatus[detail.item.status]} · 基于公开版本{" "}
            {detail.item.base_version || "首次发布"}
          </p>
          <div className="op-review-columns">
            <section>
              <h2>私有来源</h2>
              <dl className="op-private-source">
                {Object.entries(detail.item.source).map(([k, v]) => (
                  <div key={k}>
                    <dt>
                      {
                        {
                          url: "来源链接",
                          description: "来源说明",
                          date: "来源日期",
                          permission: "公开许可依据",
                        }[k]
                      }
                    </dt>
                    <dd>{v || "未提供"}</dd>
                  </div>
                ))}
              </dl>
              <h3>原始文字</h3>
              <div className="op-prose">
                {detail.item.original_text || "未提供原文"}
              </div>
              <div className="op-actions">
                {detail.evidence.map((e, i) => (
                  <Button
                    key={e.id}
                    variant="secondary"
                    onClick={() => viewEvidence(e)}
                  >
                    凭证 {i + 1}
                  </Button>
                ))}
              </div>
              {image && (
                <>
                  <Button variant="ghost" onClick={() => setImage(null)}>
                    收起图片
                  </Button>
                  <img
                    className="op-evidence"
                    src={image}
                    alt="仅管理员可见的招聘来源凭证"
                  />
                </>
              )}
            </section>
            <section>
              <h2>将要公开的版本</h2>
              <OpportunityDetail
                item={{
                  ...draft,
                  status: "open",
                  id: detail.item.opportunity_id,
                  version: (detail.item.published_version || 0) + 1,
                }}
                actions={false}
              />
              <details>
                <summary>修正公开字段</summary>
                <OpportunityFields
                  data={draft}
                  onChange={(v) => change(() => setDraft(v))}
                  disabled={detail.item.status !== "pending" || busy}
                />
              </details>
              {detail.published && (
                <details>
                  <summary>与当前公开版比较</summary>
                  {Object.keys(draft)
                    .filter(
                      (k) =>
                        JSON.stringify(draft[k]) !==
                        JSON.stringify(detail.published[k]),
                    )
                    .map((k) => (
                      <div className="op-diff" key={k}>
                        <strong>{opportunityFieldLabel[k] || k}</strong>
                        <p>
                          当前：
                          {typeof detail.published[k] === "object"
                            ? JSON.stringify(detail.published[k])
                            : String(detail.published[k] ?? "未说明")}
                        </p>
                        <p>
                          拟发布：
                          {typeof draft[k] === "object"
                            ? JSON.stringify(draft[k])
                            : String(draft[k] ?? "未说明")}
                        </p>
                      </div>
                    ))}
                </details>
              )}
            </section>
          </div>
          {detail.item.status === "pending" && (
            <fieldset disabled={busy} className="op-fields">
              <label className="op-check">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(e) => change(() => setApproved(e.target.checked))}
                />
                已核对来源真实性
              </label>
              <label className="op-check">
                <input
                  type="checkbox"
                  checked={channel}
                  onChange={(e) => change(() => setChannel(e.target.checked))}
                />
                投递渠道获准公开，JD 中无未经授权的私人联系方式
              </label>
              <Field label="退回需补充的字段">
                <select
                  value={feedbackField}
                  onChange={(e) => setFeedbackField(e.target.value)}
                >
                  {[
                    ["general", "整体说明"],
                    ["application", "投递渠道"],
                    ["permission", "公开许可依据"],
                    ["source", "来源"],
                    ["evidence", "截图凭证"],
                    ["jd", "JD 正文"],
                    ["compensation", "薪酬"],
                  ].map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="给投稿人的补充要求或拒绝原因">
                <textarea
                  maxLength={1000}
                  value={feedback}
                  onChange={(e) => change(() => setFeedback(e.target.value))}
                />
              </Field>
              <Field label="内部备注（不向投稿人公开）">
                <textarea
                  value={internal}
                  maxLength={2000}
                  onChange={(e) => change(() => setInternal(e.target.value))}
                />
              </Field>
              <Field label="操作原因（审计）">
                <input
                  value={reason}
                  maxLength={500}
                  onChange={(e) => change(() => setReason(e.target.value))}
                />
              </Field>
              <div className="op-actions">
                <Button
                  disabled={
                    busy || !approved || !channel || reason.trim().length < 2
                  }
                  onClick={() => decide("publish")}
                >
                  通过并发布固定版本
                </Button>
                <Button
                  variant="secondary"
                  disabled={
                    busy || !feedback.trim() || reason.trim().length < 2
                  }
                  onClick={() => decide("return")}
                >
                  退回补充
                </Button>
                <Button
                  variant="ghost"
                  disabled={
                    busy || !feedback.trim() || reason.trim().length < 2
                  }
                  onClick={() => decide("reject")}
                >
                  拒绝收录
                </Button>
              </div>
            </fieldset>
          )}
        </>
      ) : (
        <>
          <nav className="op-tabs" aria-label="机会管理分类">
            {[
              ["pending", "待审核"],
              ["all", "全部稿件"],
              ["catalog", "岗位与复核"],
              ["reports", "反馈"],
            ].map(([k, l]) => (
              <Button
                key={k}
                variant={tab === k ? "secondary" : "ghost"}
                onClick={() =>
                  go(() => {
                    setTab(k);
                    setDetail(null);
                    setFeedback("");
                    setReason("");
                  })
                }
              >
                {l}
              </Button>
            ))}
          </nav>
          {tab === "catalog" && (
            <>
              <label className="op-check">
                <input
                  type="checkbox"
                  checked={due}
                  onChange={(e) => setDue(e.target.checked)}
                />
                仅看已到复核日期
              </label>
              <Field label="状态操作原因">
                <input
                  value={reason}
                  maxLength={500}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            </>
          )}
          {tab === "reports" && (
            <div className="op-grid">
              <Field label="反馈处理说明">
                <input
                  value={feedback}
                  maxLength={2000}
                  onChange={(e) => setFeedback(e.target.value)}
                />
              </Field>
              <Field label="操作原因">
                <input
                  value={reason}
                  maxLength={500}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            </div>
          )}
          {!data ? (
            <p>正在读取…</p>
          ) : !data.items.length ? (
            <p className="op-empty">暂无记录</p>
          ) : (
            <div className="op-list">
              {data.items.map((row) => (
                <div key={row.id} className="op-admin-row">
                  {tab === "catalog" ? (
                    <>
                      <div>
                        <strong>{row.data?.title || "尚未发布"}</strong>
                        <p>
                          {row.data?.company} · {opportunityStatus[row.status]}{" "}
                          · 公开版本 {row.published_version || "—"}
                        </p>
                        <small>
                          下次复核：
                          {row.review_due_at
                            ? new Date(row.review_due_at).toLocaleDateString()
                            : "首次发布后安排"}
                        </small>
                      </div>
                      {row.published_version && (
                        <div className="op-actions">
                          <a href={"/opportunities/" + row.id}>公开页</a>
                          {(row.versions || []).length > 1 ? (
                            <details>
                              <summary>已审核版本</summary>
                              {row.versions.map((v) => (
                                <div className="op-actions" key={v.version}>
                                  <span>
                                    V{v.version}
                                    {v.version === row.published_version
                                      ? " · 当前公开"
                                      : ""}
                                  </span>
                                  <a
                                    href={
                                      "/api/public/opportunities/" +
                                      row.id +
                                      "?version=" +
                                      v.version
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    复查版本
                                  </a>
                                  {v.version !== row.published_version ? (
                                    <Button
                                      variant="secondary"
                                      disabled={
                                        busy || reason.trim().length < 2
                                      }
                                      onClick={() =>
                                        state(row, row.status, v.version)
                                      }
                                    >
                                      切换到 V{v.version}
                                    </Button>
                                  ) : null}
                                </div>
                              ))}
                            </details>
                          ) : null}
                          {["paused", "closed", "open"]
                            .filter((s) => s !== row.status)
                            .map((s) => (
                              <Button
                                key={s}
                                disabled={busy || reason.trim().length < 2}
                                variant="secondary"
                                onClick={() => state(row, s)}
                              >
                                {s === "paused"
                                  ? "暂停"
                                  : s === "closed"
                                    ? "结束招聘"
                                    : "明确恢复"}
                              </Button>
                            ))}
                        </div>
                      )}
                    </>
                  ) : tab === "reports" ? (
                    <>
                      <div>
                        <strong>
                          {
                            {
                              expired: "已结束招聘",
                              channel: "渠道失效",
                              incorrect: "信息有误",
                              privacy: "隐私问题",
                              other: "其他",
                            }[row.category]
                          }
                        </strong>
                        <p>{row.description}</p>
                        <small>
                          版本 {row.version} · {row.opportunity_id} ·{" "}
                          {
                            {
                              open: "待处理",
                              resolved: "已处理",
                              dismissed: "无须调整",
                            }[row.status]
                          }
                        </small>
                      </div>
                      {row.status === "open" && (
                        <div className="op-actions">
                          <Button
                            variant="secondary"
                            disabled={
                              busy ||
                              reason.trim().length < 2 ||
                              feedback.trim().length < 2
                            }
                            onClick={() => resolve(row, "resolved")}
                          >
                            已处理
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={
                              busy ||
                              reason.trim().length < 2 ||
                              feedback.trim().length < 2
                            }
                            onClick={() => resolve(row, "dismissed")}
                          >
                            无须调整
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <button
                      className="op-row"
                      disabled={busy}
                      onClick={() => open(row.id)}
                    >
                      <strong>{row.title || "未命名草稿"}</strong>
                      <span>
                        {row.company} · {opportunityStatus[row.status]} · 修订{" "}
                        {row.revision}
                      </span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
