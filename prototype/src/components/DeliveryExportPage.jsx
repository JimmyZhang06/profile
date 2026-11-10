import { useEffect, useMemo, useState } from "react";
import {
  IconArrowRight,
  IconCheck,
  IconDownload,
  IconPrinter,
  IconAlertCircle,
} from "@tabler/icons-react";
import { Page, Button } from "./ui/index.jsx";
import { deliveryIssues } from "../lib/delivery.js";
import { getResumeDesign } from "../lib/resumeDesign.js";
import {
  downloadFile,
  fieldLabel,
  fieldValue,
  proposalState,
  toMarkdown,
} from "../lib/workspace.js";
import { DeliveryPreview, DeliveryPrint } from "./DeliveryPreview.jsx";

export function DeliveryExportPage({ doc, onBack, onTailor, notify }) {
  const [measurement, setMeasurement] = useState(null),
    [verified, setVerified] = useState(false),
    [mobileView, setMobileView] = useState("preview");
  const design = getResumeDesign(doc.resume);
  const current = measurement?.resume === doc.resume ? measurement : null;
  const issues = useMemo(
    () => [
      ...(doc.example ? ["当前含虚构示例，请替换为自己的真实资料后投递"] : []),
      ...deliveryIssues(doc.resume, current, doc.job),
    ],
    [doc.resume, doc.job, doc.example, current],
  );
  const pending = doc.messages.flatMap((m) =>
    (m.proposals || []).filter(
      (p) =>
        !m.dismissed?.includes(p.id) && proposalState(doc, p) === "pending",
    ),
  ).length;
  useEffect(() => {
    setVerified(false);
  }, [doc.resume]);
  function print() {
    const previous = document.title;
    document.title =
      [doc.resume.name, doc.job.title, doc.job.company]
        .filter(Boolean)
        .join("_") || doc.title;
    const restore = () => {
      document.title = previous;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore, { once: true });
    window.print();
  }
  return (
    <Page
      title="投递预览"
      description="这里按实际 A4 尺寸检查当前文稿。核对事实后，保存 PDF 即可投递。"
      className={"page-wide delivery-export-page delivery-view-" + mobileView}
      onBack={onBack}
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            继续编辑
          </Button>
          <Button
            className="delivery-desktop-print"
            disabled={!current || !verified}
            onClick={print}
          >
            <IconPrinter size={17} />
            {issues.length ? "保存草稿 PDF" : "保存为 PDF"}
          </Button>
          <Button
            className="delivery-mobile-print"
            disabled={!current || (mobileView === "checks" && !verified)}
            onClick={() => (verified ? print() : setMobileView("checks"))}
          >
            {verified ? (
              <>
                <IconPrinter size={17} />
                {issues.length ? "保存草稿 PDF" : "保存为 PDF"}
              </>
            ) : (
              <>
                核对并导出
                <IconArrowRight size={17} />
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="delivery-mobile-tabs" role="group" aria-label="投递视图">
        <button
          type="button"
          aria-pressed={mobileView === "preview"}
          onClick={() => setMobileView("preview")}
        >
          简历预览
        </button>
        <button
          type="button"
          aria-pressed={mobileView === "checks"}
          onClick={() => setMobileView("checks")}
        >
          投递检查{issues.length ? " · " + issues.length : ""}
        </button>
      </div>
      <div className="delivery-review-layout">
        <aside className="delivery-checks">
          <section className="delivery-status" role="status">
            {current && !issues.length ? (
              <IconCheck size={22} />
            ) : (
              <IconAlertCircle size={22} />
            )}
            <div>
              <strong>
                {!current
                  ? "正在测量 A4 排版…"
                  : issues.length
                    ? "还有几项需要调整"
                    : "一页排版预检通过"}
              </strong>
              <p>
                A4 · {design.fontSize} pt · {design.margin} mm 页边距
              </p>
            </div>
          </section>
          {issues.length ? (
            <ul className="delivery-issues">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : (
            <p className="quiet-note">
              正文处于一页范围内。不同设备字体可能略有差异，打印预览中请保持
              A4、100% 缩放并关闭页眉页脚。
            </p>
          )}
          {pending ? (
            <p className="quiet-note">
              还有 {pending} 条聊天建议未采用，PDF 使用当前文稿。
            </p>
          ) : null}
          {doc.delivery ? (
            <section className="delivery-reasoning">
              <h2>
                {doc.delivery.mode === "model"
                  ? "这份简历如何回应 JD"
                  : "本地选材结果"}
              </h2>
              {doc.delivery.modelLabel ? <p className="quiet-note">生成来源 · {doc.delivery.modelLabel}</p> : null}
              {doc.delivery.considered ? (
                <p className="quiet-note">本次比较了 {doc.delivery.considered.projects} 个项目和 {doc.delivery.considered.work + doc.delivery.considered.research} 段实习或研究。正文收录{[
                  ...doc.resume.workEntries.map((e) => e.organization || e.title),
                  ...doc.resume.sources.map((p) => p.name),
                  ...doc.resume.researchEntries.map((e) => e.organization || e.title),
                ].filter(Boolean).join("、") || "的经历已移除"}。</p>
              ) : null}
              {doc.revision > 0 ? (
                <p className="quiet-note">
                  正文已编辑；以下是生成时的选材依据，请以当前内容为准。
                </p>
              ) : null}
              {doc.delivery.requirements.map((item, i) => (
                <details key={i}>
                  <summary>{item.requirement}</summary>
                  {item.evidence.map((e, j) => (
                    <blockquote key={j}>
                      <small>{e.label}</small>
                      {e.quote}
                    </blockquote>
                  ))}
                </details>
              ))}
              {doc.delivery.gaps.length ? (
                <div className="delivery-gaps">
                  <h3>投递前核对</h3>
                  <ul>
                    {doc.delivery.gaps.map((gap, i) => (
                      <li key={i}>{gap}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <details>
                <summary>逐条核对改写与原文依据</summary>
                {doc.delivery.changes.map((c) => (
                  <section className="delivery-change" key={c.field}>
                    <h3>{fieldLabel(doc.resume, c.field)}</h3>
                    <p>
                      {fieldValue(doc.resume, c.field) || "当前文稿已移除此条"}
                    </p>
                    {c.evidence.map((e, i) => (
                      <blockquote key={i}>
                        <small>{e.label}</small>
                        {e.quote}
                      </blockquote>
                    ))}
                  </section>
                ))}
              </details>
            </section>
          ) : (
            <Button variant="secondary" onClick={onTailor}>
              根据 JD 生成投递版
              <IconArrowRight size={16} />
            </Button>
          )}
          <label className="delivery-confirm">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
            />
            <span>我已核对当前文稿中的经历、数字、个人贡献和联系方式。</span>
          </label>
          <p className="quiet-note">
            “保存为 PDF”会打开系统打印预览，选择“另存为 PDF”。文字保持可选中。
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              downloadFile(
                doc.title + ".md",
                toMarkdown(doc),
                "text/markdown;charset=utf-8",
              );
              notify("已发起文字版下载");
            }}
          >
            <IconDownload size={16} />
            下载文字版
          </Button>
        </aside>
        <section className="delivery-preview-column" aria-label="A4 投递预览">
          <div className="delivery-preview-label">
            <span>
              {current
                ? current.overflow
                  ? "超出一页 · 请精简内容"
                  : "A4 一页范围内"
                : "正在测量…"}
            </span>
            <span>{design.fontSize} pt · 210 × 297 mm</span>
          </div>
          <DeliveryPreview resume={doc.resume} onMeasure={setMeasurement} />
        </section>
      </div>
      <DeliveryPrint resume={doc.resume} />
    </Page>
  );
}
