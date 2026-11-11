import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { IconArrowRight, IconFileText } from "@tabler/icons-react";
import { Page, Button, Field } from "./ui/index.jsx";
import { SelectField } from "./ui/SelectField.jsx";
import { deliveryCallPlan, jobFromListing } from "../lib/deliverySelection.js";
import { projectDetailFields, projectDetails } from "../lib/projects.js";
import {
  buildDeliveryContext,
  deliveryMaterials,
  deliveryProfile,
  prepareDelivery,
  withApplicationAvailability,
} from "../lib/delivery.js";
import { DeliverySteps } from "./DeliverySteps.jsx";
const DeliveryGeneration = lazy(() => import('./DeliveryGeneration.jsx').then((m) => ({default:m.DeliveryGeneration})));

export function TailorPage({
  job: initialJob,
  profile,
  library,
  settings,
  savedOptions,
  defaultAvailability = "",
  onRememberAvailability,
  sessionExpired = false,
  example = false,
  onBack,
  onReady,
  onConfigure,
  onLibrary,
  onManual,
}) {
  const [job, setJob] = useState(
    initialJob || { company: "", title: "", text: "" },
  );
  const personal = useMemo(() => deliveryProfile(profile), [profile]);
  const storedAvailability = personal.contactItems.find((item) => item.type === "availability")?.value || "";
  const [availabilityOverride, setAvailabilityOverride] = useState(savedOptions?.availabilityOverride ?? null);
  const availability = availabilityOverride ?? storedAvailability;
  const projects = library;
  const [projectChoices, setProjectChoices] = useState(savedOptions?.projectChoices ?? {});
  const [scopeChoices, setScopeChoices] = useState(savedOptions?.scopeChoices ?? {});
  const [excludedRecords, setExcludedRecords] = useState(() => savedOptions?.excludedRecords ?? []);
  const experiences = useMemo(() => [...personal.workEntries, ...personal.researchEntries], [personal]);
  const { chosen, scopes } = useMemo(
    () => deliveryMaterials(projects, example, projectChoices, scopeChoices),
    [projects, example, projectChoices, scopeChoices],
  );
  const [run, setRun] = useState(null), [error, setError] = useState(""), [message, setMessage] = useState("");
  const models = settings.connections.filter((item) => item.enabled !== false);
  const [preferred, setPreferred] = useState(savedOptions?.modelId ?? null);
  const bound = models.find((item) => item.id === settings.bindings.rewrite);
  const defaultId = bound?.id ?? (models.length === 1 ? models[0].id : models.length ? "" : "offline");
  const modelId = preferred === "offline" || models.some((item) => item.id === preferred) ? preferred : defaultId;
  const local = modelId === "offline";
  const connection = local
    ? { id: "offline", baseUrl: "http://localhost", name: "本地整理" }
    : models.find((c) => c.id === modelId);
  const [approvedScope, setApprovedScope] = useState(null);
  const prepared = useMemo(() => {
    if (!connection) return null;
    const approval = {
      connectionId: connection.id,
      baseUrl: connection.baseUrl,
      scopes,
    };
    const context = buildDeliveryContext({
      job,
      personal: deliveryProfile(personal, excludedRecords),
      projects: chosen,
      approval,
      connection,
    });
    return { context, approval };
  }, [
    job,
    personal,
    chosen,
    excludedRecords,
    scopes,
    connection?.id,
    connection?.baseUrl,
    connection?.model,
    connection?.name,
    connection?.maxOutputTokens,
    example,
  ]);
  const busy = !!run;
  const confirmed = !!prepared && approvedScope === prepared;
  const hasExamples = example || chosen.some((p) => p.example);
  useEffect(() => {
    setApprovedScope(null);
  }, [settings.enabled, settings.capabilities.rewrite, sessionExpired]);
  const update = (patch) => setJob((old) => ({ ...old, ...patch }));
  function stop() {
    setRun(null);
    setMessage("已返回选材，本次填写的岗位与资料范围已保留。");
    setApprovedScope(null);
  }
  function generate() {
    if (busy || !canGenerate) return;
    setError("");
    setMessage("");
    try {
      const generation = prepareDelivery({ job, profile: withApplicationAvailability(personal, availability), projects: chosen, excludedRecords, approval: prepared.approval, connection, profileExample: example });
      setRun({settings, connectionId:modelId, modelName:connection.name, prepared:generation,
        materialApproval:local ? undefined : prepared.approval});
    } catch (e) {
      setError(e.message);
      setApprovedScope(null);
    }
  }
  const records = experiences.filter((entry) => !excludedRecords.includes(entry.id)).length;
  const calls = useMemo(() => !local && prepared ? deliveryCallPlan(prepared.context,connection?.maxOutputTokens) : null,
    [local, prepared, connection?.maxOutputTokens]);
  const options = { projectChoices, excludedRecords, scopeChoices, modelId: preferred, availabilityOverride };
  const canGenerate =
    job.title.trim() &&
    job.text.trim().length >= 20 &&
    !!prepared &&
    (chosen.length || records) &&
    (local || (!sessionExpired && confirmed && settings.enabled && settings.capabilities.rewrite));
  if (run) return <Suspense fallback={<Page title="正在打开写作纸面" onBack={stop} dirty />}>
    <DeliveryGeneration run={run} onReady={onReady} onCancel={stop}
      onError={(text) => {setRun(null); setError(text); setApprovedScope(null);}} />
  </Suspense>;
  return (
    <Page
      title="按 JD 生成简历"
      description="粘贴 JD，选择参与写作的资料。简历会按一页 A4 的空间逐段生成。"
      onBack={onBack}
      className="page-wide tailor-page"
      actions={onManual && <Button variant="ghost" disabled={busy} onClick={() => onManual(job, options)}>手动创建简历</Button>}
      navigation={<DeliverySteps current={1} />}
      dirty={
        busy ||
        job.text !== (initialJob?.text || "") ||
        job.title !== (initialJob?.title || "") ||
        job.company !== (initialJob?.company || "")
      }
      footer={
        <>
          <span className="footer-note">
            A4 一页 · 正文 11 pt
          </span>
            <Button disabled={!canGenerate} onClick={generate}>
              {local ? "生成本地选材草稿" : "生成整份投递草稿"}
              <IconArrowRight size={16} />
            </Button>
        </>
      }
    >
      {hasExamples ? (
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
            onChange={(e) => setJob(jobFromListing(e.target.value, job))}
            placeholder="粘贴完整 JD…"
          />
        </Field>
        {/到岗|毕业年份|毕业时间|实习时长|每周|周出勤/.test(job.text) ? <>
          <Field label="本次投递的到岗安排" hint="原样写入本份简历页首。可在这里补充毕业年份、到岗时间和可持续时长。">
            <input maxLength={180} value={availability} onChange={(e) => setAvailabilityOverride(e.target.value)}
              placeholder="按自己的实际情况填写" />
          </Field>
          {onRememberAvailability && availability.trim() && availability.trim() !== defaultAvailability &&
            <Button variant="ghost" onClick={() => onRememberAvailability(availability.trim())}>存为下次投递的默认安排</Button>}
        </> : null}
        <section className="tailor-materials">
          <header>
            <div>
              <h2>本次候选经历</h2>
              <p>
                {chosen.length} 个候选项目 · {records} 段实习 / 研究 ·
                教育与联系方式沿用资料库
              </p>
            </div>
            <Button variant="ghost" onClick={() => onLibrary(job, options)}>
              完善资料
              <IconArrowRight size={16} />
            </Button>
          </header>
          <details>
            <summary>
              调整候选经历与资料范围<span>默认比较全部实习、研究和未归档项目</span>
            </summary>
            <div className="tailor-source-list">
              {experiences.map((entry) => (
                <div className="tailor-source" key={entry.id}>
                  <label>
                    <input type="checkbox" checked={!excludedRecords.includes(entry.id)}
                      onChange={(e) => setExcludedRecords((old) => e.target.checked ? old.filter((id) => id !== entry.id) : [...old, entry.id])} />
                    <strong>{[entry.organization, entry.title, entry.period].filter(Boolean).join(" · ") || "个人经历"}</strong>
                  </label>
                </div>
              ))}
              {projects.map((p) => (
                <div key={p.id} className="tailor-source">
                  <label>
                    <input
                      type="checkbox"
                      checked={Object.hasOwn(scopes, p.id)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setProjectChoices((old) => ({ ...old, [p.id]: checked }));
                      }}
                    />
                    <strong>{p.name}{p.archived ? "（已归档）" : p.example ? "（示例）" : ""}</strong>
                  </label>
                  {Object.hasOwn(scopes, p.id) ? (
                    <div className="tailor-scope">
                      {projectDetailFields
                        .filter((f) => projectDetails(p)[f.key])
                        .map((f) => (
                          <label key={f.key}>
                            <input
                              type="checkbox"
                              checked={scopes[p.id]?.includes(f.key) || false}
                              onChange={(e) => {
                                const keys = e.target.checked
                                  ? [...scopes[p.id], f.key]
                                  : scopes[p.id].filter((k) => k !== f.key);
                                setScopeChoices((old) => ({ ...old, [p.id]: keys }));
                              }}
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
            <Button variant="ghost" onClick={() => onConfigure(job, options)}>
              模型设置
            </Button>
          </header>
          <SelectField label="本次生成使用的模型" value={modelId} onChange={setPreferred}
            options={[
              ...(!modelId ? [{value: "", label: "选择一个模型"}] : []),
              ...models.map((c) => ({value: c.id, label: c.name, description: c.model})),
              {value: "offline", label: "本地选材", description: "按关键词挑选原文"},
            ]} disabled={busy} />
          {!local && sessionExpired ? <p className="form-error" role="alert">云端登录已过期。请从页面上方重新登录后生成。</p> : null}
          {!local && (!settings.enabled || !settings.capabilities.rewrite) ? <p className="form-error">请在模型设置中开启 AI 辅助及对话与改写。</p> : null}
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
                      <h3>{[f.label, f.period].filter(Boolean).join(" · ")}</h3>
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
          {!local && connection && calls ? (
            <label className="tailor-consent">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setApprovedScope(e.target.checked ? prepared : null)}
              />
              <span>
                我同意将所选资料发送给「{connection.name}」。{calls.bySection
                  ? '将按经历分段成稿，按入选数量预计不超过 ' + calls.usual + ' 次调用。'
                  : '预计 ' + calls.usual + ' 次调用，整篇回复过长时会自动分段。'}
                纸面有余量时可再调用一次，用入选资料补写亮点。含重试与超页精简，最多 {calls.maximum} 次。姓名与联系方式在本机排版。
              </span>
            </label>
          ) : null}
        </section>
      </fieldset>
      {message && !error ? (
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
    </Page>
  );
}
