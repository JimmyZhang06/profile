import { useState, useEffect } from "react";
import { Button, Field } from "../../components/ui/index.jsx";
import { DateField } from "../../components/ui/DateField.jsx";
import { RecruitmentPoster } from './RecruitmentPoster.jsx';
import {
  evidencePng,
  opportunityStatus,
  opportunityFieldLabel,
  requestId,
} from "./opportunityClient.js";

export const blankOpportunity = {
  title: "",
  company: "",
  regionCode: "CN",
  city: "",
  remote: false,
  direction: "",
  jd: "",
  requirements: "",
  sourceType: "community",
  application: null,
  applicationNotes: "",
  compensation: null,
  deadlineDate: null,
};
export function OpportunityFields({ data, onChange, disabled = false }) {
  const change = (key, value) => onChange({ ...data, [key]: value });
  const number = (key, e) =>
    change(key, e.target.value === "" ? null : Number(e.target.value));
  return (
    <fieldset className="op-fields" disabled={disabled}>
      <div className="op-grid">
        {["company", "title", "city", "direction"].map((key) => (
          <Field
            key={key}
            label={
              {
                company: "公司",
                title: "岗位名称",
                city: "城市",
                direction: "方向",
              }[key]
            }
          >
            <input
              value={data[key] || ""}
              maxLength={150}
              onChange={(e) => change(key, e.target.value)}
            />
          </Field>
        ))}
        <Field label="招聘地区">
          <select
            value={data.regionCode || "CN"}
            onChange={(e) => change("regionCode", e.target.value)}
          >
            <option value="CN">中国内地</option>
            <option value="HK">中国香港</option>
          </select>
        </Field>
        <Field label="来源类型">
          <select
            value={data.sourceType || "community"}
            onChange={(e) => change("sourceType", e.target.value)}
          >
            <option value="official">官方招聘</option>
            <option value="community">社群内推</option>
            <option value="employee">员工推荐</option>
          </select>
        </Field>
      </div>
      <label className="op-check">
        <input
          type="checkbox"
          checked={data.remote || false}
          onChange={(e) => change("remote", e.target.checked)}
        />
        支持远程
      </label>
      <Field
        label="完整 JD"
        hint="核对职责和要求，移除未经同意公开的个人号码、群号及旧投递地址。"
      >
        <textarea
          rows={10}
          value={data.jd || ""}
          maxLength={16000}
          onChange={(e) => change("jd", e.target.value)}
        />
      </Field>
      <div className="op-grid">
        <Field label="毕业年份（未说明留空）">
          <input
            type="number"
            min="2000"
            max="2100"
            value={data.graduationYear ?? ""}
            onChange={(e) => number("graduationYear", e)}
          />
        </Field>
        <Field label="毕业要求">
          <select
            value={data.graduationCondition || "unspecified"}
            onChange={(e) => change("graduationCondition", e.target.value)}
          >
            <option value="unspecified">未说明</option>
            <option value="preferred">优先</option>
            <option value="required">必须</option>
          </select>
        </Field>
        <Field label="每周天数">
          <input
            type="number"
            min="1"
            max="7"
            value={data.daysPerWeek ?? ""}
            onChange={(e) => number("daysPerWeek", e)}
          />
        </Field>
        <Field label="实习月数">
          <input
            type="number"
            min="1"
            max="36"
            value={data.durationMonths ?? ""}
            onChange={(e) => number("durationMonths", e)}
          />
        </Field>
      </div>
      <Field label="到岗及其他要求">
        <textarea
          rows={2}
          value={data.requirements || ""}
          onChange={(e) => change("requirements", e.target.value)}
          maxLength={4000}
        />
      </Field>
      <Field label="公开投递方式">
        <div className="op-inline">
          <select
            aria-label="投递渠道类型"
            value={data.application?.type || "email"}
            onChange={(e) =>
              change("application", { type: e.target.value, value: "" })
            }
          >
            <option value="email">邮箱</option>
            <option value="url">HTTPS 招聘页</option>
          </select>
          <input
            aria-label="公开投递地址"
            value={data.application?.value || ""}
            maxLength={1000}
            onChange={(e) =>
              change("application", {
                type: data.application?.type || "email",
                value: e.target.value,
              })
            }
          />
        </div>
      </Field>
      <Field label="投递须知">
        <textarea
          rows={2}
          value={data.applicationNotes || ""}
          onChange={(e) => change("applicationNotes", e.target.value)}
          maxLength={2000}
        />
      </Field>
      <DateField
        label="截止日期（招聘地当地日期）"
        hint="未注明时留空；中国内地与香港按 UTC+08 处理。"
        value={data.deadlineDate}
        disabled={disabled}
        onChange={value => onChange({...data, deadlineDate: value || null, deadlineAt: null})}
      />
      <details>
        <summary>薪酬信息 · 保留来源的币种、周期和区间</summary>
        <label className="op-check">
          <input
            type="checkbox"
            checked={!!data.compensation}
            onChange={(e) =>
              change(
                "compensation",
                e.target.checked
                  ? {
                      currency: data.regionCode === "HK" ? "HKD" : "CNY",
                      unit: "day",
                      min: null,
                      max: null,
                    }
                  : null,
              )
            }
          />
          来源明确说明薪酬
        </label>
        {data.compensation && (
          <div className="op-grid">
            <Field label="币种">
              <select
                value={data.compensation.currency}
                onChange={(e) =>
                  change("compensation", {
                    ...data.compensation,
                    currency: e.target.value,
                  })
                }
              >
                <option value="CNY">人民币 CNY</option>
                <option value="HKD">港币 HKD</option>
              </select>
            </Field>
            <Field label="周期">
              <select
                value={data.compensation.unit}
                onChange={(e) =>
                  change("compensation", {
                    ...data.compensation,
                    unit: e.target.value,
                  })
                }
              >
                {[
                  ["hour", "小时"],
                  ["day", "天"],
                  ["month", "月"],
                  ["year", "年"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            {["min", "max"].map((k) => (
              <Field
                key={k}
                label={
                  k === "min" ? "下限（货币主单位）" : "上限（货币主单位）"
                }
              >
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={data.compensation[k] ?? ""}
                  onChange={(e) =>
                    change("compensation", {
                      ...data.compensation,
                      [k]:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </Field>
            ))}
          </div>
        )}
      </details>
    </fieldset>
  );
}

export function OpportunityForm({
  initial,
  api,
  onSaved,
  onBack,
  onDirty = () => {},
}) {
  const [item, setItem] = useState(initial.item),
    [data, setData] = useState(initial.item.data),
    [source, setSource] = useState(initial.item.source),
    [originalText, setOriginalText] = useState(initial.item.original_text),
    [evidence, setEvidence] = useState(initial.evidence || []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [image, setImage] = useState(null);
  const editable = item.status === "draft";
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image);
    },
    [image],
  );
  const dirty =
    JSON.stringify(data) !== JSON.stringify(item.data) ||
    JSON.stringify(source) !== JSON.stringify(item.source) ||
    originalText !== item.original_text;
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  // Keep navigation guards outside this component informed without replacing drafts.
  const changeData = (v) => {
    setData(v);
    onDirty(true);
  };
  async function action(kind) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let saved = item;
      if (editable && dirty) {
        saved = (
          await api("opportunity-submissions/" + item.id, {
            method: "PUT",
            body: { revision: item.revision, data, source, originalText },
          })
        ).item;
        setItem(saved);
        setData(saved.data);
        setSource(saved.source);
        setOriginalText(saved.original_text);
        onDirty(false);
      }
      if (kind !== "save") {
        const result = await api(
          "opportunity-submissions/" + saved.id + "/" + kind,
          {
            method: "POST",
            body: { revision: saved.revision, requestId: requestId() },
          },
        );
        if (kind === "revise") return onSaved(result.item.id);
        setItem(result.item);
      }
      setMessage(
        kind === "save"
          ? "草稿已保存"
          : kind === "submit"
            ? "已送审，审核前不会公开"
            : "状态已更新",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const result = await api(
        "opportunity-submissions/" + item.id + "/evidence",
        { method: "POST", body: { image: await evidencePng(file) } },
      );
      setEvidence(result.evidence);
      setItem((old) => ({ ...old, revision: result.item.revision }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function view(e) {
    try {
      const response = await fetch(
        "/api/cloud/opportunity-submissions/" + item.id + "/evidence/" + e.id,
        {
          credentials: "same-origin",
          headers: { "X-Luli-Client": "workspace" },
        },
      );
      if (!response.ok) throw Error("无法读取凭证，请重新登录");
      const blob = await response.blob();
      setImage((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <section className="op-form">
      <div className="op-inline">
        <Button variant="ghost" onClick={onBack}>
          返回我的投稿
        </Button>
        <span>
          {opportunityStatus[item.status]} · 稿件修订 {item.revision}
        </span>
      </div>
      <h1>{item.data.title || "录入实习机会"}</h1>
      {Object.keys(item.feedback || {}).length > 0 && (
        <div className="op-notice">
          <strong>审核意见</strong>
          {Object.entries(item.feedback).map(([k, v]) => (
            <p key={k}>
              {opportunityFieldLabel[k] || "审核说明"}：{v}
            </p>
          ))}
        </div>
      )}
      <OpportunityFields
        data={data}
        onChange={changeData}
        disabled={!editable || busy}
      />
      <fieldset className="op-fields" disabled={!editable || busy}>
        <h2>私有来源与凭证</h2>
        <p>以下内容仅本人和管理员可见。</p>
        {editable && <RecruitmentPoster data={data} original={originalText} onApply={(raw, fields) => {
          setOriginalText(raw);
          changeData({ ...data, ...fields });
          setMessage('已追加到原始招聘文字，可继续核对并保存草稿。');
        }} />}
        <Field label="原始招聘文字">
          <textarea
            rows={4}
            maxLength={20000}
            value={originalText}
            onChange={(e) => {
              setOriginalText(e.target.value);
              onDirty(true);
            }}
          />
        </Field>
        {[
          ["url", "来源链接"],
          ["description", "来源说明"],
          ["date", "来源日期"],
          ["permission", "投递渠道可公开的依据"],
        ].map(([k, l]) => k === "date" ? (
          <DateField key={k} label={l} value={source.date} disabled={!editable || busy} allowSourceText
            onChange={value => { setSource({...source, date: value}); onDirty(true); }}/>
        ) : (
          <Field key={k} label={l}>
            <input
              value={source[k] || ""}
              maxLength={2000}
              onChange={(e) => {
                setSource({ ...source, [k]: e.target.value });
                onDirty(true);
              }}
            />
          </Field>
        ))}
        <Field
          label="上传 JPEG / PNG 凭证"
          hint="每稿最多 3 张、单张 3 MB。图片会在本机去除元数据后上传。"
        >
          <input
            type="file"
            accept="image/jpeg,image/png"
            disabled={evidence.length >= 3}
            onChange={(e) => {
              upload(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </Field>
      </fieldset>
      <div className="op-actions">
        {evidence.map((e, i) => (
          <Button key={e.id} variant="secondary" onClick={() => view(e)}>
            查看凭证 {i + 1}
          </Button>
        ))}
      </div>
      {image && (
        <div>
          <Button
            variant="ghost"
            onClick={() => {
              URL.revokeObjectURL(image);
              setImage(null);
            }}
          >
            收起图片
          </Button>
          <img className="op-evidence" src={image} alt="私有来源凭证" />
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <footer className="op-actions">
        {editable ? (
          <>
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() => action("save")}
            >
              保存草稿
            </Button>
            <Button disabled={busy} onClick={() => action("submit")}>
              保存并送审
            </Button>
          </>
        ) : item.status === "pending" ? (
          <Button
            disabled={busy}
            variant="secondary"
            onClick={() => action("withdraw")}
          >
            撤回待审稿
          </Button>
        ) : (
          <Button disabled={busy} onClick={() => action("revise")}>
            复制为新草稿{item.status === "published" ? "并改稿" : "并重提"}
          </Button>
        )}
      </footer>
    </section>
  );
}
