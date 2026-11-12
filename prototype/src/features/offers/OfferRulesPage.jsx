import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/index.jsx";
import { RULESET } from "./offerRules.mjs";
import "./offers.css";

export default function OfferRulesPage({ api, onDirty = () => {} }) {
  const [items, setItems] = useState([]),
    [builtin, setBuiltin] = useState(RULESET),
    [text, setText] = useState(""),
    [baseline, setBaseline] = useState("");
  const [revision, setRevision] = useState(null),
    [reason, setReason] = useState(""),
    [checks, setChecks] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const mounted = useRef(true),
    dirty = text !== baseline || !!reason;
  const parsed = useMemo(() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }, [text]);
  useEffect(() => {
    onDirty(dirty || busy);
  }, [dirty, busy, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  useEffect(() => {
    mounted.current = true;
    const c = new AbortController();
    api("offer-rules", { signal: c.signal })
      .then((d) => {
        setItems(d.items);
        setBuiltin(d.builtin);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => {
      mounted.current = false;
      c.abort();
    };
  }, []);
  function open(set, rev = null, newVersion = false) {
    const next = structuredClone(set);
    if (newVersion) next.version = "rules-" + Date.now();
    const value = JSON.stringify(next, null, 2);
    setText(value);
    setBaseline(value);
    setRevision(rev);
    setChecks(null);
    setReason("");
    setError("");
    setNotice("");
  }
  async function action(state) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!parsed) throw new Error("规则 JSON 无法解析，请检查格式");
      const data = await api(
        "offer-rules" + (state === "check" ? "/check" : ""),
        { method: "POST", body: { ruleset: parsed, revision, state, reason } },
      );
      if (!mounted.current) return;
      setChecks(data.checks);
      if (data.item) {
        setItems((xs) => [
          data.item,
          ...xs.filter((x) => x.id !== data.item.id),
        ]);
        setBaseline(text);
        setRevision(data.item.revision);
        setReason("");
        setNotice(
          state === "published"
            ? "已发布不可变规则版本。已保存的私人方案不会自动更新。"
            : "草稿已保存，公共测算仍使用发布版本。",
        );
      }
    } catch (e) {
      if (mounted.current) setError(e.message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const selected = items.find((x) => x.id === parsed?.version),
    immutable =
      selected?.state === "published" || parsed?.version === builtin.version;
  return (
    <section className="offers-page offer-rules-editor">
      <header>
        <h1>薪酬规则</h1>
        <p>
          逐项维护地区、适用对象、日期与官方来源。参数金额为分、比例为万分比。先核对样例，再发布固定版本。
        </p>
      </header>
      {error && (
        <p role="alert" className="offer-notice">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="offer-notice">
          {notice}
        </p>
      )}
      <div className="offer-actions">
        <Button disabled={busy} onClick={() => open(builtin, null, true)}>
          基于内置规则新建版本
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => open(builtin)}
        >
          查看内置版本
        </Button>
      </div>
      <ul className="offer-saved">
        {items.map((x) => (
          <li key={x.id}>
            <div>
              <strong>{x.id}</strong>
              <small>
                {x.state === "published" ? "已发布 · 不可修改" : "草稿"} · 修订{" "}
                {x.revision}
              </small>
            </div>
            <Button
              variant="secondary"
              disabled={busy || dirty}
              onClick={() => open(x.data, x.revision)}
            >
              查看 / 编辑
            </Button>
            <Button
              variant="ghost"
              disabled={busy || dirty}
              onClick={() => open(x.data, null, true)}
            >
              复制为新版本
            </Button>
          </li>
        ))}
      </ul>
      {text && (
        <>
          <label className="offer-field">
            <span>
              规则版本 JSON {immutable ? "（只读，请复制为新版本）" : ""}
            </span>
            <textarea
              aria-label="规则版本 JSON"
              readOnly={immutable}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setChecks(null);
              }}
              spellCheck="false"
            />
          </label>
          {parsed?.rules && (
            <details>
              <summary>核对规则有效期与来源 · {parsed.rules.length} 项</summary>
              <ul>
                {parsed.rules.map((r, i) => (
                  <li key={i}>
                    {r.region} · {r.category} · {r.audience}
                    <br />
                    {r.from} — {r.to} · {r.rounding}
                    <br />
                    {/^https:\/\//.test(r.source) && (
                      <a href={r.source} target="_blank" rel="noreferrer">
                        官方文件
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {checks && (
            <div className="offer-notice">
              <strong>
                {checks.passed
                  ? "设计稿样例通过"
                  : "设计稿样例未通过，不能发布"}
              </strong>
              <p>
                A 目标 {checks.target / 100} / A 固定 {checks.fixed / 100} / B{" "}
                {checks.b / 100}
              </p>
            </div>
          )}
          {!immutable && (
            <label className="offer-field">
              <span>本次维护原因（写入管理审计）</span>
              <input
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          <div className="offer-actions">
            <Button
              variant="secondary"
              disabled={busy || !parsed}
              onClick={() => action("check")}
            >
              运行设计稿算例
            </Button>
            {!immutable && (
              <>
                <Button
                  variant="secondary"
                  disabled={busy || !parsed || reason.trim().length < 2}
                  onClick={() => action("draft")}
                >
                  保存草稿
                </Button>
                <Button
                  disabled={busy || !checks?.passed || reason.trim().length < 2}
                  onClick={() => action("published")}
                >
                  发布固定版本
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setText("");
                setBaseline("");
                setReason("");
                setChecks(null);
              }}
            >
              关闭当前编辑
            </Button>
          </div>
          <p>
            发布前校验同项规则的日期重叠、数值和官方 HTTPS 来源。新增城市 /
            险种如尚无算法支持，只可记录来源，不会自动套入工资单；单位金额始终可填。已发布版本保留历史规则，以便旧算例继续复现。
          </p>
        </>
      )}
    </section>
  );
}
