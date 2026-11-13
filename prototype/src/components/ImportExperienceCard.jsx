import { useState } from "react";
import {
  IconChevronDown,
  IconPlus,
  IconArrowsSplit,
  IconArrowMerge,
} from "@tabler/icons-react";
import { Button, Field } from "./ui/index.jsx";
import { SelectField } from "./ui/SelectField.jsx";
import { ImportSourceText } from "./ImportSourceText.jsx";
import {
  importSections,
  recordBody,
  recordDate,
  recordName,
  recordRole,
} from "../lib/resumeImportReview.js";
import { projectDetailFields } from "../lib/projects.js";

export function ImportExperienceCard({
  kind,
  record,
  source,
  issues,
  index,
  onChange,
  onMove,
  onSplit,
  onMerge,
}) {
  const [expanded, setExpanded] = useState(false),
    [split, setSplit] = useState(false);
  const project = kind === "projects",
    name = recordName(record, kind),
    body = recordBody(record, kind);
  const lines = body.split("\n").filter((s) => s.trim());
  const patch = (key, value) => onChange({ ...record, [key]: value });
  return (
    <article className={"import-experience" + (expanded ? " is-open" : "")}>
      <button
        type="button"
        className="import-experience-heading"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span>
          <strong>{name || "补充经历名称"}</strong>
          <small>
            {[recordRole(record, kind), recordDate(record, kind)]
              .filter(Boolean)
              .join(" · ") || "补充角色和时间"}
          </small>
        </span>
        <span className="import-experience-indicator">
          {issues?.length ? <small>{issues.join(" · ")}</small> : null}
          <IconChevronDown size={18} />
        </span>
      </button>
      {!expanded && (
        <p className="import-experience-excerpt">
          {body || "补充具体职责、行动和成果"}
        </p>
      )}
      {expanded && (
        <div className="import-experience-fields">
          <SelectField
            label="经历分类"
            value={kind}
            options={importSections}
            onChange={onMove}
          />
          <div className="field-grid">
            <Field
              label={
                project
                  ? "项目名称"
                  : kind === "educationEntries"
                    ? "学校"
                    : kind === "researchEntries"
                      ? "课题名称"
                      : "公司 / 机构"
              }
            >
              <input
                value={name}
                onChange={(e) =>
                  patch(project ? "name" : "organization", e.target.value)
                }
              />
            </Field>
            <Field
              label={kind === "educationEntries" ? "专业与学历" : "职位 / 角色"}
            >
              <input
                value={recordRole(record, kind)}
                onChange={(e) =>
                  patch(project ? "role" : "title", e.target.value)
                }
              />
            </Field>
          </div>
          <Field label="起止时间" hint="保留原文日期，可以留待确认。">
            <input
              value={recordDate(record, kind)}
              placeholder="例如 2025.06—2025.08"
              onChange={(e) =>
                patch(project ? "date" : "period", e.target.value)
              }
            />
          </Field>
          <Field
            label={
              kind === "educationEntries"
                ? "课程、荣誉与补充说明"
                : "职责、行动与成果"
            }
            hint="每行一条，保留原有事实和限定说明。"
          >
            <textarea
              rows={Math.max(3, Math.min(10, lines.length + 1))}
              value={body}
              onChange={(e) =>
                patch(
                  project ? "facts" : "description",
                  project ? e.target.value.split("\n") : e.target.value,
                )
              }
            />
          </Field>
          {project && Object.values(record.details || {}).some(Boolean) && (
            <details className="import-inline-details">
              <summary>查看已整理的项目资料</summary>
              {projectDetailFields
                .filter((f) => record.details[f.key])
                .map((f) => (
                  <Field key={f.key} label={f.label}>
                    <textarea
                      rows={3}
                      value={record.details[f.key]}
                      onChange={(e) =>
                        patch("details", {
                          ...record.details,
                          [f.key]: e.target.value,
                        })
                      }
                    />
                  </Field>
                ))}
            </details>
          )}
          <div className="import-record-actions">
            <Button
              variant="ghost"
              disabled={lines.length < 2}
              onClick={() => setSplit((v) => !v)}
            >
              <IconArrowsSplit size={16} />
              拆分经历
            </Button>
            <Button variant="ghost" disabled={index === 0} onClick={onMerge}>
              <IconArrowMerge size={16} />
              合并到上一段
            </Button>
          </div>
          {split && (
            <div className="import-split">
              <p>
                选择新一段经历从哪里开始。拆分后可填写它的名称、角色和时间。
              </p>
              {lines.slice(1).map((text, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onSplit(i + 1);
                    setSplit(false);
                  }}
                >
                  <IconPlus size={15} />
                  <span>{text}</span>
                </button>
              ))}
            </div>
          )}
          <details className="import-inline-details">
            <summary>查看对应原文</summary>
            <ImportSourceText
              source={source}
              ids={source?.evidence?.[record.id] || []}
            />
          </details>
        </div>
      )}
    </article>
  );
}
