import { useEffect, useMemo, useRef, useState } from "react";
import { IconArrowRight, IconFileText } from "@tabler/icons-react";
import { Page, Button, Field } from "./ui/index.jsx";
import { projectDetailFields, projectDetails } from "../lib/projects.js";
import { visibleRecords } from "../lib/profile.js";
import {
  assembleDelivery,
  deliveryDetailKeys,
  deliveryProfile,
  finalizeDelivery,
  nextDeliveryFit,
  prepareDelivery,
} from "../lib/delivery.js";
import { runDelivery } from "../lib/assistant.js";
import { DeliveryPreview } from "./DeliveryPreview.jsx";
import { AssistantIdentity } from "./AssistantIdentity.jsx";

export function TailorPage({
  job: initialJob,
  profile,
  library,
  settings,
  example = false,
  onBack,
  onReady,
  onConfigure,
  onLibrary,
}) {
  const [job, setJob] = useState(
    initialJob || { company: "", title: "", text: "" },
  );
  const personal = useMemo(() => deliveryProfile(profile), [profile]);
  const projects = useMemo(() => library.filter((p) => !p.archived), [library]);
  const [included, setIncluded] = useState(() => projects.map((p) => p.id));
  const [scopes, setScopes] = useState(() =>
    Object.fromEntries(
      projects.map((p) => [
        p.id,
        deliveryDetailKeys.filter((k) => projectDetails(p)[k]),
      ]),
    ),
  );
  const [phase, setPhase] = useState("idle"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [candidate, setCandidate] = useState(null);
  const controller = useRef(null),
    completed = useRef(false),
    currentCandidate = useRef(null);
  currentCandidate.current = candidate;
  const local = settings.bindings.rewrite === "offline";
  const connection = local
    ? { id: "offline", baseUrl: "http://localhost", name: "本地整理" }
    : settings.connections.find((c) => c.id === settings.bindings.rewrite);
  const [confirmed, setConfirmed] = useState(false);
  const chosen = useMemo(
    () => projects.filter((p) => included.includes(p.id)),
    [projects, included],
  );
  const prepared = useMemo(() => {
    if (!connection) return null;
    const approval = {
      connectionId: connection.id,
      baseUrl: connection.baseUrl,
      scopes: Object.fromEntries(chosen.map((p) => [p.id, scopes[p.id] || []])),
    };
    const prepared = prepareDelivery({
      job,
      profile: personal,
      projects: chosen,
      approval,
      connection,
    });
    prepared.seed.example = example || chosen.some((p) => p.example);
    return { ...prepared, approval };
  }, [
    job,
    personal,
    chosen,
    scopes,
    connection?.id,
    connection?.baseUrl,
    example,
  ]);
  const busy = phase !== "idle";
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    setConfirmed(false);
  }, [prepared, settings.enabled, settings.capabilities.rewrite]);
  const update = (patch) => setJob((old) => ({ ...old, ...patch }));
  function stop() {
    controller.current?.abort();
    controller.current = null;
    setPhase("idle");
    setCandidate(null);
    setMessage("已停止；原简历和素材均已保留。");
    setConfirmed(false);
  }
  async function generate() {
    if (busy || !prepared || (!local && !confirmed)) return;
    const task = new AbortController();
    controller.current = task;
    completed.current = false;
    setPhase("writing");
    setError("");
    setMessage(
      local
        ? "正在按关键词选材并排版原文…"
        : "正在分析岗位、筛选经历并撰写整份简历…",
    );
    try {
      const plan = await runDelivery({
        settings,
        prepared,
        materialApproval: local ? undefined : prepared.approval,
        signal: task.signal,
        onText: (text) => {
          if (controller.current === task && text) setMessage(text);
        },
      });
      if (task.signal.aborted || controller.current !== task) return;
      setCandidate(assembleDelivery(prepared, plan));
      setPhase("fitting");
      setMessage("正在检查 A4 纸面、字号和内容长度…");
    } catch (e) {
      if (controller.current !== task) return;
      setError(e.name === "AbortError" ? "生成已停止。" : e.message);
      setPhase("idle");
      setConfirmed(false);
      controller.current = null;
    }
  }
  function measured(result) {
    const draft = currentCandidate.current;
    if (
      !draft ||
      result.resume !== draft.resume ||
      phase !== "fitting" ||
      completed.current ||
      controller.current?.signal.aborted
    )
      return;
    const next = result.overflow ? nextDeliveryFit(draft) : null;
    if (next) {
      currentCandidate.current = next;
      setCandidate(next);
      return;
    }
    completed.current = true;
    controller.current = null;
    onReady(finalizeDelivery(draft));
  }
  const records =
    visibleRecords(personal, "workEntries").length +
    visibleRecords(personal, "researchEntries").length;
  const canGenerate =
    job.title.trim() &&
    job.text.trim().length >= 20 &&
    !!prepared &&
    (chosen.length || records) &&
    (local || (confirmed && settings.enabled && settings.capabilities.rewrite));
  return (
    <Page
      title="把经历，写成这次机会的答案。"
      description="贴入岗位 JD，生成一份独立的投递草稿。原始资料和已有简历都会保留。"
      onBack={onBack}
      className="page-wide tailor-page"
      dirty={
        busy ||
        job.text !== (initialJob?.text || "") ||
        job.title !== (initialJob?.title || "") ||
        job.company !== (initialJob?.company || "")
      }
      footer={
        <>
          <span className="footer-note">
            A4 一页优先 · 正文 11 pt · 最低 10.5 pt
          </span>
          {busy ? (
            <Button variant="secondary" onClick={stop}>
              停止生成
            </Button>
          ) : (
            <Button disabled={!canGenerate} onClick={generate}>
              {local ? "生成本地选材草稿" : "生成整份投递草稿"}
              <IconArrowRight size={16} />
            </Button>
          )}
        </>
      }
    >
      <div className="tailor-flow" aria-label="生成流程">
        <span>
          <b>01</b> 岗位与选材
        </span>
        <span>
          <b>02</b> 整份改写
        </span>
        <span>
          <b>03</b> A4 投递检查
        </span>
      </div>
      {prepared?.seed.example ? (
        <p className="info-banner">
          当前包含虚构示例资料，仅用于体验。正式投递前请替换为自己的真实经历。
        </p>
      ) : null}
      <fieldset disabled={busy} className="tailor-fields">
        <div className="field-grid">
          <Field label="岗位名称">
            <input
              value={job.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="例如：AI 产品实习生"
            />
          </Field>
          <Field label="目标公司（可选）">
            <input
              value={job.company}
              onChange={(e) => update({ company: e.target.value })}
              placeholder="公司名称"
            />
          </Field>
        </div>
        <Field
          label="职位描述（JD）"
          hint="保留职责、任职要求和加分项。系统会据此决定写什么、舍弃什么。"
        >
          <textarea
            rows={7}
            maxLength={16000}
            value={job.text}
            onChange={(e) => update({ text: e.target.value })}
            placeholder="粘贴完整 JD…"
          />
        </Field>
        <section className="tailor-materials">
          <header>
            <div>
              <h2>从真实经历出发</h2>
              <p>
                {chosen.length} 个候选项目 · {records} 段实习 / 研究 ·
                教育与联系方式沿用资料库
              </p>
            </div>
            <Button variant="ghost" onClick={() => onLibrary(job)}>
              完善资料
              <IconArrowRight size={16} />
            </Button>
          </header>
          <details>
            <summary>
              选择候选项目与资料范围<span>最多选出 2 个项目写入简历</span>
            </summary>
            <div className="tailor-source-list">
              {projects.map((p) => (
                <div key={p.id} className="tailor-source">
                  <label>
                    <input
                      type="checkbox"
                      checked={included.includes(p.id)}
                      onChange={(e) =>
                        setIncluded((old) =>
                          e.target.checked
                            ? [...old, p.id]
                            : old.filter((id) => id !== p.id),
                        )
                      }
                    />
                    <strong>{p.name}</strong>
                  </label>
                  {included.includes(p.id) ? (
                    <div className="tailor-scope">
                      {projectDetailFields
                        .filter((f) => projectDetails(p)[f.key])
                        .map((f) => (
                          <label key={f.key}>
                            <input
                              type="checkbox"
                              checked={scopes[p.id]?.includes(f.key) || false}
                              onChange={(e) =>
                                setScopes((old) => ({
                                  ...old,
                                  [p.id]: e.target.checked
                                    ? [...(old[p.id] || []), f.key]
                                    : old[p.id].filter((k) => k !== f.key),
                                }))
                              }
                            />
                            {f.label}
                          </label>
                        ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {!projects.length ? (
                <p>暂无项目素材，可使用已填写的实习或研究经历。</p>
              ) : null}
            </div>
          </details>
        </section>
        <section className="tailor-destination">
          <header>
            <IconFileText size={22} />
            <div>
              <strong>
                {local
                  ? "本地整理 · 无需发送资料"
                  : connection
                    ? connection.name + " · " + connection.model
                    : "尚未选择模型"}
              </strong>
              <p>
                {local
                  ? "按关键词选择已有原文，不进行 AI 语义改写。"
                  : connection?.baseUrl ||
                    "连接模型后，才能根据 JD 撰写整份简历。"}
              </p>
            </div>
            <Button variant="ghost" onClick={() => onConfigure(job)}>
              模型设置
            </Button>
          </header>
          {!local && connection?.maxOutputTokens < 8192 ? (
            <p className="quiet-note">
              当前模型的输出上限较低，整份简历及原文依据可能无法一次写完。可在模型设置中调整；平台模型由管理员配置。
            </p>
          ) : null}
          {prepared ? (
            <details>
              <summary>
                {local ? "查看本次使用的资料" : "核对本次发送内容"}
                <span>JD、候选要点与勾选的详细资料</span>
              </summary>
              <div className="tailor-context">
                <h3>目标岗位</h3>
                <p>
                  {job.title} {job.company}
                </p>
                <p>{job.text || "尚未填写 JD"}</p>
                {prepared.context.fields
                  .filter((f) => f.text)
                  .map((f) => (
                    <section key={f.id}>
                      <h3>{f.label}</h3>
                      <p>{f.text}</p>
                    </section>
                  ))}
                {prepared.context.sources.map((s) => (
                  <section key={s.id}>
                    <h3>{s.name}</h3>
                    <p>
                      {[s.role, s.date, ...s.tags].filter(Boolean).join(" · ")}
                    </p>
                    {s.facts.map((text, i) => (
                      <p key={i}>{text}</p>
                    ))}
                    {Object.entries(s.details || {}).map(([k, text]) => (
                      <div key={k}>
                        <h4>
                          {projectDetailFields.find((f) => f.key === k)?.label}
                        </h4>
                        <p>{text}</p>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            </details>
          ) : null}
          {!local && connection ? (
            <label className="tailor-consent">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                我确认将上方资料发送到此模型，仅用于这次生成。姓名和联系方式不单独发送；正文中自行填写的信息请在展开内容中核对。
              </span>
            </label>
          ) : null}
        </section>
      </fieldset>
      {busy ? (
        <div className="tailor-progress">
          <AssistantIdentity
            offline={local || phase === "fitting"}
            status="streaming"
            hasText={false}
          />
          <div>
            <strong>
              {phase === "fitting"
                ? "检查整份简历的纸面效果"
                : "正在制作投递草稿"}
            </strong>
            <p>{message}</p>
          </div>
        </div>
      ) : message && !error ? (
        <p className="quiet-note" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {!chosen.length && !records ? (
        <p className="quiet-note">
          请先在资料库补充至少一份项目、实习或研究经历。
        </p>
      ) : null}
      {candidate ? (
        <DeliveryPreview
          hidden
          resume={candidate.resume}
          onMeasure={measured}
        />
      ) : null}
    </Page>
  );
}
