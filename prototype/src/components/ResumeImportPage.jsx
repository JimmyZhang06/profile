import { useEffect, useRef, useState } from "react";
import {
  IconFileImport,
  IconUpload,
  IconPlus,
  IconArrowRight,
} from "@tabler/icons-react";
import { Button, Field, Menu, Page } from "./ui/index.jsx";
import { SelectField } from "./ui/SelectField.jsx";
import { AssistantIdentity } from "./AssistantIdentity.jsx";
import { ImportExperienceCard } from "./ImportExperienceCard.jsx";
import { ImportSourceText } from "./ImportSourceText.jsx";
import { contactTypes, newContact, newRecord } from "../lib/profile.js";
import {
  appendImportedResume,
  importedResume,
  parseResumeText,
} from "../lib/resumeImport.js";
import {
  attachImportSource,
  importIssues,
  organizeResume,
} from "../lib/resumeImportAI.js";
import {
  editImportRecords,
  importArchiveMatches,
  importRecords,
  importSections,
  mergeImportRecord,
  moveImportRecord,
  recordBody,
  recordName,
  splitImportRecord,
} from "../lib/resumeImportReview.js";
import { writingConnectionId } from "../lib/writingService.js";
import {
  importLimit,
  importModelBlocks,
  importSource,
} from "../../shared/resumeImport.mjs";
import "./resume-import.css";

export default function ResumeImportPage({
  onBack,
  onImport,
  archiveDefault,
  destination,
  settings,
  existingProfile,
  library,
}) {
  const input = useRef(null),
    request = useRef(null),
    submit = useRef(false),
    baseline = useRef(null);
  const [text, setText] = useState(""),
    [title, setTitle] = useState(""),
    [parsed, setParsed] = useState(null);
  const [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [manual, setManual] = useState(false);
  const [drag, setDrag] = useState(false),
    [archive, setArchive] = useState(archiveDefault),
    [archiveChoices, setArchiveChoices] = useState({});
  const [organizing, setOrganizing] = useState(false),
    [edited, setEdited] = useState(false),
    [replaceReview, setReplaceReview] = useState(false);
  useEffect(() => () => request.current?.abort(), []);
  const busy = !!status,
    modelId = settings
      ? writingConnectionId(settings, { tailoring: true })
      : "offline";
  const connection = settings?.connections.find(
    (c) => c.id === modelId && c.enabled !== false,
  );
  const source = parsed?.importSource;
  const issues = parsed ? importIssues(parsed) : [];
  const matches =
    parsed && existingProfile
      ? importArchiveMatches(parsed, existingProfile, library || [])
      : [];
  const similar = matches.filter((m) => !m.exact);
  const records = parsed ? importRecords(parsed) : [];
  const change = (fn) => {
    setParsed(fn);
    setArchiveChoices({});
    setEdited(true);
    setReplaceReview(false);
  };
  const profile = (key, value) =>
    change((p) => ({ ...p, profile: { ...p.profile, [key]: value } }));
  function review(result, name) {
    const source = importSource(result, name),
      next = attachImportSource(parseResumeText(result.text), source);
    baseline.current = next;
    setParsed(next);
    setManual(false);
    setText(result.text);
    setEdited(false);
    setArchiveChoices({});
    setReplaceReview(false);
    setTitle(
      name?.replace(/\.[^.]+$/, "") ||
        [next.profile.name, next.target].filter(Boolean).join(" · ") ||
        "导入的简历",
    );
  }
  function cancelRead() {
    request.current?.abort();
    request.current = null;
    setStatus("");
    setOrganizing(false);
  }
  async function load(file) {
    if (!file) return;
    cancelRead();
    setError("");
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["doc", "docx", "pdf"].includes(ext)) {
      setError("请选择 Word（.doc、.docx）或 PDF 文件。");
      return;
    }
    if (!file.size || file.size > 20 * 1024 * 1024) {
      setError("请选择有内容且不超过 20 MB 的简历文件。");
      return;
    }
    const ctrl = new AbortController();
    request.current = ctrl;
    setStatus("正在读取 " + file.name);
    try {
      const buffer = await file.arrayBuffer();
      ctrl.signal.throwIfAborted();
      const result =
        ext === "pdf"
          ? await (
              await import("../lib/readPdf.js")
            ).readPdf(buffer, ctrl.signal, setStatus)
          : await (
              await import("../lib/readWord.js")
            ).readWord(buffer, ctrl.signal);
      if (request.current === ctrl) review(result, file.name);
    } catch (e) {
      if (request.current === ctrl)
        setError(
          /[\u3400-\u9fff]/u.test(e.message)
            ? e.message
            : "未能完成文件解析，可以重试或粘贴简历文字。",
        );
    } finally {
      if (request.current === ctrl) {
        request.current = null;
        setStatus("");
      }
    }
  }
  async function organize(confirmed = false) {
    if (!connection || !source || busy) return;
    if (edited && !confirmed) {
      setReplaceReview(true);
      return;
    }
    const ctrl = new AbortController();
    request.current = ctrl;
    setOrganizing(true);
    setStatus("正在整理经历…");
    setError("");
    setReplaceReview(false);
    try {
      const result = await organizeResume({
        source,
        local: baseline.current,
        settings,
        connection,
        signal: ctrl.signal,
        onProgress: setStatus,
      });
      if (request.current === ctrl) {
        setParsed(result);
        setEdited(false);
        setArchiveChoices({});
      }
    } catch (e) {
      if (request.current === ctrl) setError(e.message);
    } finally {
      if (request.current === ctrl) {
        request.current = null;
        setStatus("");
        setOrganizing(false);
      }
    }
  }
  function confirm(tailor) {
    if (!parsed || !title.trim() || submit.current || busy) return;
    try {
      submit.current = true;
      const doc = importedResume(parsed, title);
      const result = onImport(
        (state) => appendImportedResume(state, doc, archive, archiveChoices),
        archive,
        tailor,
      );
      if (result === false) submit.current = false;
    } catch (e) {
      submit.current = false;
      setError(e.message);
    }
  }
  function addRecord(kind) {
    const id = crypto.randomUUID(),
      record =
        kind === "projects"
          ? { id, name: "", role: "", date: "", tags: [], facts: [] }
          : newRecord(() => id);
    change((p) => editImportRecords(p, kind, (list) => [...list, record]));
  }
  return (
    <Page
      title="导入已有简历"
      description={
        parsed && !manual
          ? "确认经历和原文对应，再将完整资料用于每次投递。"
          : "选择 Word 或 PDF，自动读取文字并整理经历。"
      }
      className="page-wide resume-import-page"
      onBack={onBack}
      dirty={!!parsed || !!text.trim() || busy}
      footer={
        parsed && !manual ? (
          <>
            <span className="footer-note">保存到{destination}</span>
            <div className="page-action-group">
              <Button
                variant="secondary"
                onClick={() => confirm(false)}
                disabled={!title.trim() || busy}
              >
                保存简历
              </Button>
              <Button
                onClick={() => confirm(true)}
                disabled={!title.trim() || busy}
              >
                保存并按 JD 生成
                <IconArrowRight size={16} />
              </Button>
            </div>
          </>
        ) : undefined
      }
    >
      {error && (
        <p role="alert" className="info-banner">
          {error}
        </p>
      )}
      {!parsed && !manual ? (
        <>
          <div
            className={"resume-file-drop" + (drag ? " is-dragging" : "")}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              load(e.dataTransfer.files[0]);
            }}
          >
            <IconFileImport size={32} stroke={1.4} />
            <h2>{status ? "正在解析简历" : "选择或拖入一份简历"}</h2>
            <p role="status">{status || "DOC、DOCX、PDF · 最大 20 MB"}</p>
            {status ? (
              <Button variant="secondary" onClick={cancelRead}>
                取消解析
              </Button>
            ) : (
              <Button onClick={() => input.current?.click()}>
                <IconUpload size={16} />
                选择文件
              </Button>
            )}
            <input
              hidden
              aria-label="选择简历文件"
              ref={input}
              type="file"
              accept=".doc,.docx,.pdf"
              onChange={(e) => {
                load(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </div>
          {!status && (
            <Button
              variant="ghost"
              onClick={() => {
                setError("");
                setManual(true);
              }}
            >
              粘贴简历文字
            </Button>
          )}
        </>
      ) : manual ? (
        <div className="resume-import-source">
          <Field
            label="简历原文"
            hint="保留章节和换行。重新识别会更新本页校对结果。"
          >
            <textarea
              rows={15}
              value={text}
              maxLength={170000}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
          <div>
            <Button variant="secondary" onClick={() => setManual(false)}>
              返回
            </Button>
            <Button
              disabled={!text.trim()}
              onClick={() => {
                setError("");
                try {
                  review({ text }, source?.filename || title);
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              识别章节
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="import-source-line">
            <span>
              {source.filename || "粘贴的简历文字"} · {source.blocks.length}{" "}
              段原文
            </span>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setManual(true)}
            >
              查看与校正原文
            </Button>
          </div>
          <div className="import-assist">
            <div>
              {organizing ? (
                <AssistantIdentity status="streaming" phaseLabel="整理经历中" />
              ) : (
                <strong>
                  {source.method === "ai"
                    ? "已按原文整理经历"
                    : "把不同版式整理成完整经历"}
                </strong>
              )}
              <p role="status">
                {status ||
                  (source.method === "ai"
                    ? "可以直接改字、调整分类，或对照原文核对。"
                    : "AI 可帮助识别非标准标题、经历边界和跨页内容。")}
              </p>
            </div>
            {organizing ? (
              <Button variant="secondary" onClick={cancelRead}>
                停止整理
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => organize()}
                disabled={!connection || busy}
              >
                用 AI 整理
              </Button>
            )}
          </div>
          {connection ? (
            <details className="import-privacy">
              <summary>本次解析的资料范围</summary>
              <p>
                点击「用 AI 整理」会把下方文字发送给
                {connection.source === "platform"
                  ? "平台解析服务"
                  : connection.name}
                ，用于归类和摘录。已识别的姓名、电话、邮箱和链接会隐藏，正文仍可能包含个人信息。最多{" "}
                {importLimit.calls} 次分段请求。
              </p>
              <pre>
                {importModelBlocks(source, baseline.current.profile)
                  .map((b) => b.text)
                  .join("\n")}
              </pre>
            </details>
          ) : (
            <p className="quiet-note">
              AI 整理暂未启用，可以继续校对并保存这些资料。
            </p>
          )}
          {replaceReview && (
            <div className="info-banner">
              <p>重新整理将根据原文更新本页的字段和分类。</p>
              <div className="page-action-group">
                <Button onClick={() => organize(true)}>重新整理这份原文</Button>
                <Button
                  variant="secondary"
                  onClick={() => setReplaceReview(false)}
                >
                  保留当前校对
                </Button>
              </div>
            </div>
          )}
          <fieldset disabled={busy} className="import-review-fields">
            <div className="import-review-summary">
              <strong>{records.length} 段经历</strong>
              <span>
                {issues.length
                  ? issues.length + " 段有待补充项"
                  : "逐段展开即可修改"}
                {source.ocrPages.length ? " · 含扫描识别文字" : ""}
              </span>
              <Menu
                label="补充经历"
                icon={<IconPlus size={16} />}
                items={importSections.map((section) => ({
                  label: section.label,
                  onClick: () => addRecord(section.value),
                }))}
              />
            </div>
            <details className="import-group">
              <summary>
                基本信息与联系方式
                <small>{parsed.profile.name || "待补充"}</small>
              </summary>
              <div>
                <div className="field-grid">
                  <Field label="简历名称">
                    <input
                      value={title}
                      maxLength={160}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </Field>
                  <Field label="求职意向">
                    <input
                      value={parsed.target}
                      onChange={(e) =>
                        change((p) => ({ ...p, target: e.target.value }))
                      }
                    />
                  </Field>
                </div>
                <Field label="姓名">
                  <input
                    value={parsed.profile.name}
                    onChange={(e) => profile("name", e.target.value)}
                  />
                </Field>
                {parsed.profile.contactItems.map((c, i) => (
                  <div key={c.id} className="import-contact">
                    <Field label={"联系方式 " + (i + 1)}>
                      <input
                        value={c.value}
                        onChange={(e) =>
                          profile(
                            "contactItems",
                            parsed.profile.contactItems.map((v) =>
                              v.id === c.id
                                ? { ...v, value: e.target.value }
                                : v,
                            ),
                          )
                        }
                      />
                    </Field>
                    <SelectField
                      label={"联系方式 " + (i + 1) + " 类型"}
                      value={c.type}
                      options={contactTypes}
                      onChange={(type) =>
                        profile(
                          "contactItems",
                          parsed.profile.contactItems.map((v) =>
                            v.id === c.id ? { ...v, type } : v,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
                <Button
                  variant="ghost"
                  disabled={parsed.profile.contactItems.length >= 30}
                  onClick={() =>
                    profile("contactItems", [
                      ...parsed.profile.contactItems,
                      newContact("email"),
                    ])
                  }
                >
                  添加联系方式
                </Button>
              </div>
            </details>
            {importSections.map((section) => {
              const list =
                section.value === "projects"
                  ? parsed.projects
                  : parsed.profile[section.value];
              if (!list.length) return null;
              return (
                <section key={section.value} className="import-record-section">
                  <div className="import-section-heading">
                    <h2>
                      {section.label}
                      <small>{list.length}</small>
                    </h2>
                    <Button
                      variant="ghost"
                      onClick={() => addRecord(section.value)}
                    >
                      <IconPlus size={15} />
                      补充经历
                    </Button>
                  </div>
                  {list.map((r, i) => (
                    <ImportExperienceCard
                      key={r.id}
                      kind={section.value}
                      record={r}
                      index={i}
                      source={source}
                      issues={issues.find((item) => item.id === r.id)?.messages}
                      onChange={(next) =>
                        change((p) =>
                          editImportRecords(p, section.value, (items) =>
                            items.map((v) => (v.id === r.id ? next : v)),
                          ),
                        )
                      }
                      onMove={(kind) =>
                        change((p) => moveImportRecord(p, r.id, kind))
                      }
                      onSplit={(line) =>
                        change((p) =>
                          splitImportRecord(p, section.value, r.id, line),
                        )
                      }
                      onMerge={() =>
                        change((p) => mergeImportRecord(p, section.value, r.id))
                      }
                    />
                  ))}
                </section>
              );
            })}
            <details className="import-group">
              <summary>个人简介与专业能力</summary>
              <div>
                <Field label="个人简介">
                  <textarea
                    rows={3}
                    value={parsed.profile.summary}
                    onChange={(e) => profile("summary", e.target.value)}
                  />
                </Field>
                <Field label="专业能力">
                  <textarea
                    rows={3}
                    value={parsed.profile.skills}
                    onChange={(e) => profile("skills", e.target.value)}
                  />
                </Field>
              </div>
            </details>
            <details
              className="import-group"
              open={!!parsed.additional || undefined}
            >
              <summary>
                补充信息{parsed.additional && <small>有原文待归类</small>}
              </summary>
              <div>
                <Field
                  label="补充信息"
                  hint="尚未归类的原文会随简历保存。可复制到相应经历中，再移除这里的重复内容。"
                >
                  <textarea
                    rows={4}
                    value={parsed.additional}
                    onChange={(e) =>
                      change((p) => ({ ...p, additional: e.target.value }))
                    }
                  />
                </Field>
              </div>
            </details>
            <label className="import-to-library">
              <input
                type="checkbox"
                checked={archive}
                onChange={(e) => setArchive(e.target.checked)}
              />
              <span>
                同时补充到资料库
                <small>完整经历可用于后续不同岗位的选材和写作。</small>
              </span>
            </label>
            {archive && matches.some((m) => m.exact) && (
              <p className="quiet-note">
                {matches.filter((m) => m.exact).length}{" "}
                段相同经历会复用资料库记录。
              </p>
            )}
            {archive && similar.length > 0 && (
              <details className="import-group" open>
                <summary>
                  核对相似经历<small>{similar.length} 段</small>
                </summary>
                <div>
                  {similar.map((m) => (
                    <div className="import-duplicate" key={m.id}>
                      <strong>{recordName(m.incoming, m.kind)}</strong>
                      <div>
                        <section>
                          <small>资料库已有内容</small>
                          <p>{recordBody(m.existing, m.kind)}</p>
                        </section>
                        <section>
                          <small>本次导入内容</small>
                          <p>{recordBody(m.incoming, m.kind)}</p>
                        </section>
                      </div>
                      <SelectField
                        label="入库方式"
                        value={archiveChoices[m.id]?.action || "new"}
                        options={[
                          { value: "new", label: "作为独立经历" },
                          { value: "merge", label: "补充到已有经历" },
                          { value: "skip", label: "本次不入库" },
                        ]}
                        onChange={(value) =>
                          setArchiveChoices((v) => ({
                            ...v,
                            [m.id]: {
                              action: value,
                              targetId: m.existing.id,
                              expected: JSON.stringify(m.existing),
                            },
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </details>
            )}
            <details className="import-group">
              <summary>完整原文</summary>
              <ImportSourceText source={source} />
            </details>
          </fieldset>
        </>
      )}
    </Page>
  );
}
