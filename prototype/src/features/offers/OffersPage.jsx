import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Page } from "../../components/ui/index.jsx";
import { CurvedTabs } from "../../components/ui/CurvedTabs.jsx";
import { WorkspaceLink } from "../../components/ui/WorkspaceLink.jsx";
import { DateField } from "../../components/ui/DateField.jsx";
import { Check } from "./OfferFields.jsx";
import { OfferTerms } from "./OfferTerms.jsx";
import { LivingBudget } from "./LivingBudget.jsx";
import { cloudRequest } from "../../lib/cloudClient.js";
import { readOpportunityRef } from "../../../shared/opportunityOffer.mjs";
import { compensationText } from "../opportunities/opportunityClient.js";
import { salaryReferenceLink } from "../market/marketLinks.js";
import { baseMonthIllustration, offerQuestions, employerQuestions } from "./offerQuestions.mjs";
import {
  calculateOffer,
  compareOffers,
  emptyOffer,
  offerWindow,
  RULESET,
  snapshotOffer,
} from "./offerEngine.mjs";
import "./offers.css";
import {
  privateDraftFromOpportunity,
  draftHasInput,
  offerDraftKey,
  readOfferDrafts,
} from "./offerDrafts.mjs";

const fmt = (n, currency = "CNY") =>
  n === null || n === undefined
    ? "待确认"
    : new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(n / 100);
const storageKey = (owner) => "luli:offers:v1:" + owner;
function loadLocal(owner) {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey(owner)));
    return Array.isArray(data)
      ? data.filter((x) => x?.data?.schema === 1 && x.snapshot).slice(0, 50)
      : [];
  } catch {
    return [];
  }
}

const planTabs = [{ value: "a", label: "方案 A" }, { value: "b", label: "方案 B" }, { value: "compare", label: "比较方案" }];

function ScenarioSwitch({ value, onChange }) {
  return <div className="offer-segment" role="group" aria-label="奖金情景">
    {[["fixed", "仅固定收入"], ["target", "奖金按目标"]].map(([key, label]) =>
      <button type="button" key={key} aria-pressed={value === key} onClick={() => onChange(key)}>{label}</button>)}
  </div>;
}

export default function OffersPage({ account, route, onBack }) {
  const owner = account?.user?.id || account?.owner?.id || "guest";
  if (account.loading) return <Page title="Offer 收入测算" className="career-page" onBack={onBack}><p role="status">正在打开私人草稿…</p></Page>;
  return <OfferWorkspace key={owner} owner={owner} account={account} search={route.search} onBack={onBack} />;
}
function OfferWorkspace({ owner, account, search, onBack }) {
  const isLiving = new URLSearchParams(search).get("view") === "living";
  const sourceRef = readOpportunityRef(search);
  const opportunityId = sourceRef?.id, opportunityVersion = sourceRef?.version;
  const viewParams = new URLSearchParams();
  if (sourceRef) {
    viewParams.set("opportunity", opportunityId);
    viewParams.set("version", String(opportunityVersion));
  }
  if (!isLiving) viewParams.set("view", "living");
  const alternateHref = "/offers" + (viewParams.size ? "?" + viewParams : "");
  const termsRef=useRef(null), cardPositions=useRef(['quote','quote']), editMonths=useRef(['','']);
  const revealTerm=(section,period)=>termsRef.current?.reveal(section,period);
  function resetCards(index) {
    cardPositions.current[index]='quote';
    editMonths.current[index]='';
    if(index===active)termsRef.current?.reset();
  }
  const authenticated = account?.user?.id === owner;
  const [initial] = useState(() => readOfferDrafts(localStorage, owner));
  const [plans, setPlans] = useState(
    () => initial?.plans || [emptyOffer("方案 A"), emptyOffer("方案 B")],
  );
  const [active, setActive] = useState(initial?.active === 1 ? 1 : 0),
    [scenario, setScenario] = useState(initial?.scenario === "fixed" ? "fixed" : "target"),
    [compare, setCompare] = useState(initial?.compare === true);
  const tab = compare && !isLiving ? "compare" : active ? "b" : "a";
  const [ruleSets, setRuleSets] = useState(
      () => initial?.ruleSets || [RULESET, RULESET],
    ),
    [latestRules, setLatestRules] = useState(RULESET),
    [ruleNotice, setRuleNotice] = useState("");
  const [saved, setSaved] = useState(() => loadLocal(owner)),
    [cloud, setCloud] = useState([]),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [source, setSource] = useState(null),
    [sourceNotice, setSourceNotice] = useState(""),
    [sourceAccepted, setSourceAccepted] = useState(false),
    [importTarget, setImportTarget] = useState(null);
  const [deleteId, setDeleteId] = useState(""),
    [restoreTarget, setRestoreTarget] = useState(""),
    [commonWindow, setCommonWindow] = useState(initial?.commonWindow === true),
    [sharedDeductions, setSharedDeductions] = useState(initial?.sharedDeductions !== false),
    [from, setFrom] = useState(typeof initial?.from === "string" ? initial.from : ""),
    [to, setTo] = useState(typeof initial?.to === "string" ? initial.to : "");
  const alive = useRef(true),
    draft = plans[active],
    rules = ruleSets[active];
  function setRules(value) {
    setRuleSets((xs) => xs.map((r, i) => (i === active ? value : r)));
  }
  useEffect(() => {
    try {
      localStorage.setItem(
        offerDraftKey(owner),
        JSON.stringify({ plans, ruleSets, active, scenario, compare, commonWindow, sharedDeductions, from, to }),
      );
    } catch {
      setError("本机空间不足，编辑区仍保留，请另存私人云端或整理本机快照。");
    }
  }, [owner, plans, ruleSets, active, scenario, compare, commonWindow, sharedDeductions, from, to]);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    cloudRequest("public/offer-rules", { signal: controller.signal })
      .then((d) => {
        if (d.ruleset) setLatestRules(d.ruleset);
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setRuleNotice(
            "公共规则服务暂不可用，使用内置核验版本；手填金额仍可测算。",
          );
      });
    if (authenticated)
      cloudRequest("cloud/offers", {
        ownerId: owner,
        signal: controller.signal,
      })
        .then((d) => setCloud(d.items || []))
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        });
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [owner, authenticated]);
  useEffect(() => {
    const controller = new AbortController();
    setSource(null); setSourceNotice(""); setSourceAccepted(false); setImportTarget(null);
    if (opportunityId)
      cloudRequest("public/opportunities/" + encodeURIComponent(opportunityId), {
        signal: controller.signal,
      })
        .then(({ item }) => {
          if (!item || item.status !== "open") {
            setSourceNotice("这条公开机会已过期或不可用，可继续手动录入。");
            return;
          }
          setSource(item);
          if (item.version !== opportunityVersion)
            setSourceNotice(
              item.version > opportunityVersion
                ? "公开机会已有新版本。请核对当前条款后再复制；原链接的版本不会自动采用。"
                : "公开版本与链接引用不一致，请核对当前条款后再复制。",
            );
        })
        .catch((e) => {
          if (e.name !== "AbortError")
            setSourceNotice("公开机会暂不可用，可直接手动录入。");
        });
    return () => controller.abort();
  }, [opportunityId, opportunityVersion]);
  function change(key, value) {
    setPlans((ps) =>
      ps.map((p, i) => (i === active ? { ...p, [key]: value } : p)),
    );
    setNotice("");
    setRestoreTarget("");
  }
  function nested(group, key, value) {
    change(group, { ...draft[group], [key]: value });
  }
  const result = useMemo(
    () => calculateOffer(draft, { scenario, ruleset: rules }),
    [draft, scenario, rules],
  );
  const comparison = useMemo(() => {
    const b =
      sharedDeductions && plans[0].region === plans[1].region
        ? {
            ...plans[1],
            tax: {
              ...plans[1].tax,
              special: plans[0].tax.special,
              otherDeduction: plans[0].tax.otherDeduction,
            },
          }
        : plans[1];
    return compareOffers(plans[0], b, {
      scenario,
      rulesets: ruleSets,
      ...(commonWindow && from && to && from <= to
        ? { window: { start: from, end: to } }
        : {}),
    });
  }, [plans, scenario, ruleSets, commonWindow, from, to, sharedDeductions]);
  async function save(where) {
    setError("");
    setBusy(true);
    try {
      if (where === "local") {
        if (saved.length >= 50)
          throw new Error(
            "本机已保存 50 份方案，请先整理记录。当前草稿仍保留。",
          );
        const item = {
          id: crypto.randomUUID(),
          data: structuredClone(draft),
          snapshot: snapshotOffer(draft, rules),
          updated_at: new Date().toISOString(),
        };
        const next = [item, ...saved];
        localStorage.setItem(storageKey(owner), JSON.stringify(next));
        setSaved(next);
        setNotice("已保存独立的本机方案与规则快照。");
      } else {
        const { item } = await cloudRequest("cloud/offers", {
          method: "POST",
          ownerId: owner,
          body: { plan: draft },
        });
        if (!alive.current) return;
        setCloud((items) => [item, ...items]);
        setRules(item.snapshot.ruleset);
        setNotice("已存入当前账号私人空间，结果以保存时的规则为准。");
      }
    } catch (e) {
      if (alive.current) setError(e.message || "保存失败，请保留当前草稿");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function restore(item) {
    resetCards(active);
    setPlans((ps) =>
      ps.map((p, i) => (i === active ? structuredClone(item.data) : p)),
    );
    setRules(item.snapshot.ruleset);
    setRestoreTarget(item.id);
    setNotice(
      "已恢复保存时的条款与规则。编辑或切换情景可复算，采用新规则需主动更新。",
    );
  }
  async function remove(item, where) {
    setBusy(true);
    setError("");
    try {
      if (where === "local") {
        const next = saved.filter((x) => x.id !== item.id);
        localStorage.setItem(storageKey(owner), JSON.stringify(next));
        setSaved(next);
      } else {
        await cloudRequest(
          "cloud/offers/" + item.id + "?revision=" + item.revision,
          { method: "DELETE", ownerId: owner },
        );
        if (!alive.current) return;
        setCloud((xs) => xs.filter((x) => x.id !== item.id));
      }
      setDeleteId("");
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function importSource(target, protect = false) {
    if (draftHasInput(plans[target], target) && !protect) {
      setImportTarget(target);
      return;
    }
    try {
      if (protect) {
        const old = {
          id: crypto.randomUUID(),
          data: structuredClone(plans[target]),
          snapshot: snapshotOffer(plans[target], ruleSets[target]),
          updated_at: new Date().toISOString(),
        };
        const next = [old, ...saved];
        if (next.length > 50)
          throw new Error("本机快照已满，请先整理保存记录，当前录入未替换。");
        localStorage.setItem(storageKey(owner), JSON.stringify(next));
        setSaved(next);
      }
      const clean = privateDraftFromOpportunity(source);
      resetCards(target);
      setPlans((ps) => ps.map((p, i) => (i === target ? clean : p)));
      setActive(target);
      setRuleSets((xs) => xs.map((r, i) => (i === target ? latestRules : r)));
      setCompare(false);
      setImportTarget(null);
    } catch (e) {
      setError(e.message);
      return;
    }
    setSourceAccepted(true);
    setNotice(
      "公开条款已复制到私人草稿。请单独填入确认后的报价，不会回写公开机会。",
    );
  }
  return (
    <Page title={isLiving ? "城市生活预算" : "Offer 收入测算"} className="career-page offers-page" onBack={onBack}
      description={isLiving ? "看看一份收入，在想去的城市能怎样安排生活。" : "按录用条款估算到手收入，或比较两份报价。"}
      actions={<><WorkspaceLink className="button button-secondary" href={alternateHref}>{isLiving ? "返回收入测算" : "城市生活预算"}</WorkspaceLink>
        {!isLiving && <WorkspaceLink className="button button-secondary" href={salaryReferenceLink({region:draft.region,kind:draft.kind,origin:'offer'})}>薪酬参考</WorkspaceLink>}</>}
      navigation={<CurvedTabs id="offer-plan" label="私人方案" items={isLiving ? planTabs.slice(0, 2) : planTabs} value={tab} onChange={next => {
        setCompare(next === "compare");
        if (next !== "compare") setActive(next === "b" ? 1 : 0);
      }} />}>
      <div role="tabpanel" id={"offer-plan-" + tab + "-panel"} aria-labelledby={"offer-plan-" + tab + "-tab"}>
      {sourceNotice && <p className="offer-notice">{sourceNotice}</p>}
      {source && !sourceAccepted && (
        <section className="offer-import">
          <h2>核对公开条款</h2>
          <p>
            {source.company} · {source.title} · {source.city} · 版本{" "}
            {source.version}
          </p>
          <p>
            {compensationText(source.compensation)}
          </p>
          <p>
            来源：已审核公开机会。确认后建立独立的实习合同期草稿，报价范围不等于你的实际报价。
          </p>
          {importTarget === null ? (
            <div className="offer-actions">
              <Button onClick={() => importSource(0)}>确认并放入方案 A</Button>
              <Button variant="secondary" onClick={() => importSource(1)}>
                确认并放入方案 B
              </Button>
            </div>
          ) : (
            <div className="offer-notice">
              <p>
                方案 {importTarget === 0 ? "A" : "B"}{" "}
                已有录入。导入前先把它保存为独立本机快照，原输入可恢复。
              </p>
              <Button onClick={() => importSource(importTarget, true)}>
                保存原方案并导入公开条款
              </Button>
              <Button variant="ghost" onClick={() => setImportTarget(null)}>
                取消导入，继续原方案
              </Button>
            </div>
          )}
        </section>
      )}
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
      {isLiving ? <LivingBudget plan={draft} result={result} onChange={v => change("livingBudget", v)} /> : compare ? (
        <section className="offer-comparison">
          <header className="offer-section-head"><h2>比较两份方案</h2><ScenarioSwitch value={scenario} onChange={setScenario} /></header>
          <Check
            checked={commonWindow}
            onChange={(v) => {
              setCommonWindow(v);
              const w = offerWindow(plans[0]);
              setFrom(w?.start || "");
              setTo(w?.end || "");
            }}
          >
            使用共同到账窗口
          </Check>
          {commonWindow && (
            <div className="date-field-pair">
              <DateField
                label="共同开始日期"
                value={from}
                initialDate={to}
                onChange={setFrom}
              />
              <DateField
                label="共同结束日期"
                value={to}
                initialDate={from}
                onChange={setTo}
              />
            </div>
          )}
          <Check checked={sharedDeductions} onChange={setSharedDeductions}>
            同地区时沿用 A 的专项附加与其他月度个税扣除
          </Check>
          <Comparison value={comparison} plans={plans} />
          <p>
            雇佣及发薪日期各自保留；原单位收入仅供年度资料核对，不并入新单位累计预扣。本版不估算内地年度汇算补退税。
          </p>
        </section>
      ) : (
        <div className="offer-layout">
          <OfferTerms key={active} plan={draft} change={change} nested={nested} controls={termsRef}
            initialId={cardPositions.current[active]} onPosition={id=>{cardPositions.current[active]=id;}}
            initialMonth={editMonths.current[active]} onMonthChange={m=>{editMonths.current[active]=m;}}
            name={draft.name !== (active ? "方案 B" : "方案 A") ? draft.name : ''}/>
          <section className="offer-estimate" aria-label="收入测算结果">
            <header className="offer-section-head"><h2>测算结果</h2>{draft.bonuses.length>0 && <ScenarioSwitch value={scenario} onChange={setScenario} />}</header>
            <IncomeHeadline result={result} plan={draft} revealTerm={revealTerm}/>
          </section>
          <section className="offer-results" aria-label="收入明细">
            <Result result={result} plan={draft} revealTerm={revealTerm}/>
          </section>
        </div>
      )}
      <section className="offer-save" aria-label="保存与回访">
        <div className="offer-save-intro"><h2>保存方案</h2><p>{owner === "guest" ? "草稿自动保存在此浏览器。" : "草稿按账号保存在本机，另存后可在云端查看。"}</p></div>
        <div className="offer-actions">
          <Button disabled={busy} onClick={() => save("local")}>
            保存本机方案
          </Button>
          {authenticated && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => save("cloud")}
            >
              另存私人云端方案
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              resetCards(active);
              setPlans((ps) =>
                ps.map((p, i) =>
                  i === active ? emptyOffer(i === 0 ? "方案 A" : "方案 B") : p,
                ),
              );
              setNotice("当前编辑区已清空，已保存方案仍保留。");
            }}
          >
            清空当前录入
          </Button>
        </div>
        {[
          ["local", "本机保存", saved],
          ["cloud", "当前账号云端", cloud],
        ].map(
          ([where, label, items]) =>
            items.length > 0 && (
              <details key={where}>
                <summary>
                  {label} · {items.length} 份
                </summary>
                <ul className="offer-saved">
                  {items.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.data.name || "未命名方案"}</strong>
                        <small>
                          {item.snapshot.ruleVersion ||
                            item.snapshot.ruleset.version}{" "}
                          · {item.updated_at?.slice(0, 10)}
                        </small>
                      </div>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => restore(item)}
                      >
                        恢复到 {active === 0 ? "A" : "B"}
                      </Button>
                      {deleteId === item.id ? (
                        <>
                          <span>删除这份保存？</span>
                          <Button
                            disabled={busy}
                            onClick={() => remove(item, where)}
                          >
                            确认删除
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => setDeleteId("")}
                          >
                            取消
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          onClick={() => setDeleteId(item.id)}
                        >
                          删除
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            ),
        )}
      </section>
      {!isLiving && <details className="offer-rules">
        <summary>规则来源与适用范围 · {rules.version}</summary>
        <p>
          {ruleNotice ||
            "金额以分计算；单位金额是个人假设或 HR 确认值。规则空白月份保留手填路径。内地覆盖居民工资及已确认的全日制学生累计预扣，其他劳务请填单位预计税额。"}
        </p>
        <p>
          当前算法：offers-1.0.0。香港自动强积金仅覆盖已确认资格的普通按月供款雇员；非完整供款期请按单位金额更正，年龄、签证或海外退休计划豁免须自行核实。雇主供款为计提额，首
          60 天可能稍后汇入。
        </p>
        {rules.version !== latestRules.version && (
          <Button
            onClick={() => {
              setRules(latestRules);
              setNotice("已主动采用新规则重算，原保存快照保留。");
            }}
          >
            采用最新规则重新计算
          </Button>
        )}
        <ul>
          {rules.rules.map((r) => (
            <li key={r.key + "-" + r.from}>
              <a href={r.source} target="_blank" rel="noreferrer">
                {r.audience} · {r.category}
              </a>
              ：{r.from} 至 {r.to} · {r.rounding}
            </li>
          ))}
        </ul>
      </details>}
      </div>
    </Page>
  );
}
function IncomeHeadline({ result: r, plan: p, revealTerm }) {
  if (!r.window || !r.months.length) {
    const base=baseMonthIllustration(p);
    return <div className="offer-money offer-first-estimate"><p>{base!=null?'一个完整计薪月 · 固定税前工资':'先看固定税前工资'}</p>
      <strong>{base!=null?fmt(base,p.currency):'—'}</strong>
      {base!=null && <p>{p.unit==='day'?p.salary+' × '+p.days+' 个计薪日':'按约定基本月薪'}，未计入奖金、津贴或扣缴。</p>}
      <p>{!p.salary?'先填写确认的报价。':p.unit==='day'&&base===null?'填入预计计薪天数，即可看到单月收入。':''}
      {p.period==='contract'?'填写有效的起止日期后，计算整段合同的收入。':'填写有效的入职日期后，计算首年收入。'}</p>
      {base!=null && <button type="button" className="offer-issue-link" onClick={()=>revealTerm(p.start && p.period==='contract'?'end':'start')}>填写合同日期</button>}</div>;
  }
  const hasCash = r.cash != null;
  const hasGross = r.knownGross > 0 || r.gross === 0;
  const cashLabel = p.region === "HK" ? "预计发薪现金" : "预计到手现金";
  return (
    <div className="offer-money">
      <p>{p.period === "contract" ? "合同期" : "首 12 个月"} · {hasCash || !hasGross ? cashLabel : "已知税前到账"}</p>
      <strong>{hasCash ? fmt(r.cash, p.currency) : hasGross ? fmt(r.knownGross, p.currency) : "待确认"}</strong>
      {r.window && <p>{r.window.start} — {r.window.end}（含首尾日）</p>}
      {!hasCash && <p>{r.window ? "到手金额待核对，可展开下方计算假设。" : "填写报价和入职日期后开始估算。"}</p>}
    </div>
  );
}
function Result({ result: r, plan: p, revealTerm }) {
  const questions=offerQuestions(r.issues);
  const hrQuestions=employerQuestions(questions);
  const hrText="请帮我确认以下录用条款：\n"+hrQuestions.map(text=>"• "+text).join("\n");
  const [copy,setCopy]=useState('');
  useEffect(()=>setCopy(''),[r]);
  if(!r.window || !r.months.length)return null;
  return (
    <>
      <dl className="offer-totals">
        {r.grossRange && (
          <div>
            <dt>公开区间下的税前假设</dt>
            <dd>
              {fmt(r.grossRange.min, p.currency)} —{" "}
              {fmt(r.grossRange.max, p.currency)}
            </dd>
          </div>
        )}
        <div>
          <dt>期内税前到账</dt>
          <dd>{fmt(r.gross, p.currency)}</dd>
        </div>
        <div>
          <dt>{p.region === "HK" ? "强积金双边计提" : "公积金双边入账"}</dt>
          <dd>{fmt(r.fund, p.currency)}</dd>
        </div>
        <div className="offer-fund-part">
          <dt>{p.region === "HK" ? "雇员部分" : "个人部分"}</dt>
          <dd>{fmt(r.employeeFund, p.currency)}</dd>
        </div>
        <div className="offer-fund-part">
          <dt>{p.region === "HK" ? "雇主部分" : "单位部分"}</dt>
          <dd>{fmt(r.employerFund, p.currency)}</dd>
        </div>
        <div>
          <dt>期后待收 / 日期未定（税前）</dt>
          <dd>{fmt(r.pendingGross, p.currency)}</dd>
        </div>
      </dl>
      {p.region === "HK" && (
        <section className="offer-tax-reserve">
          <h2>另行准备薪俸税</h2>
          {r.taxYears.map((y) => (
            <p key={y.year}>
              {y.year} 课税年度预留 <strong>{fmt(y.reserve, "HKD")}</strong>
            </p>
          ))}
          <p>
            以上年度税额单列，未从发薪现金中扣除。可能含本窗口之外的年度收入；税单与暂缴税以税务局通知为准。
          </p>
        </section>
      )}
      {r.issues.length > 0 && (
        <details className="offer-questions">
          <summary>待确认与计算假设 · {questions.length}</summary>
          <ul>
            {questions.map(({text,period,section}) => (
              <li key={text}>{text}{period && <small>适用月份：{period}</small>}
                {section && <button type="button" className="offer-issue-link" onClick={()=>revealTerm(section,period)}>去填写</button>}</li>
            ))}
          </ul>
          {hrQuestions.length>0 && <Button
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(hrText);
                setCopy("已复制");
              } catch {
                setCopy("可在下方选取并复制");
              }
            }}
          >
            {copy || "复制给 HR 的问题"}
          </Button>}
          {copy==="可在下方选取并复制" && <textarea className="offer-copy-text" aria-label="给 HR 的问题" value={hrText} readOnly rows={Math.min(7,hrQuestions.length+1)} onFocus={e=>e.target.select()}/>}
        </details>
      )}
      {r.months.length > 0 && <details className="offer-months">
        <summary>逐月现金与扣款 <span>{r.months.length} 个月</span></summary>
        <p>按实际支付月份核对收入、扣款和来源。</p>
      <div className="offer-payroll">
        {r.months.map((row) => (
          <details key={row.month}>
            <summary>
              <span>{row.month}</span>
              <strong>{fmt(row.cash, p.currency)}</strong>
            </summary>
            <div className="offer-month-content">
              <dl className="offer-totals">
                {[
                  ["gross", "税前现金"],
                  ["social", "个人社保"],
                  [
                    "fundEmployee",
                    p.region === "HK" ? "雇员强积金" : "个人公积金",
                  ],
                  ["other", "其他扣款"],
                  [
                    "tax",
                    p.region === "HK"
                      ? "工资代扣税（本工具不代扣薪俸税）"
                      : "当月预扣个税",
                  ],
                ].map(([k, label]) => (
                  <div key={k}>
                    <dt>{label}</dt>
                    <dd>{fmt(row[k], p.currency)}</dd>
                  </div>
                ))}
              </dl>
              {row.items.map((f) => (
                <p key={f.id}>
                  <strong>{f.label}</strong> · {fmt(f.gross, p.currency)}
                  <br />
                  归属 {f.earnedStart} 至 {f.earnedEnd} · 支付 {f.payDate}{" "}
                  {r.window &&
                  (f.payDate > r.window.end || f.payDate < r.window.start)
                    ? "（窗口外）"
                    : ""}
                  <br />
                  {f.source || "个人假设"} · 条款 {f.clauseId}
                </p>
              ))}
              {row.breakdown.map((b, i) => (
                <details key={i}>
                  <summary>
                    {b.name} · 个人 {fmt(b.employee, p.currency)} / 单位{" "}
                    {fmt(b.employer, p.currency)}
                  </summary>
                  <p>
                    基数 {fmt(b.base, p.currency)} ·{" "}
                    {b.source?.startsWith("https://") ? (
                      <a href={b.source} target="_blank" rel="noreferrer">
                        官方依据
                      </a>
                    ) : (
                      b.source
                    )}
                  </p>
                </details>
              ))}
            </div>
          </details>
        ))}
      </div>
      </details>}
    </>
  );
}
function Comparison({ value: v, plans }) {
  const values = [v.left, v.right];
  return (
    <>
      <div
        className="offer-compare-table"
        role="table"
        aria-label="两份报价比较"
      >
        <div className="offer-compare-row offer-compare-head" role="row">
          <span role="columnheader">指标</span>
          {plans.map((p, i) => (
            <strong role="columnheader" key={i}>
              {i ? "B" : "A"} · {p.name}
            </strong>
          ))}
        </div>
        {[
          ["cash", "期内发薪现金"],
          ["gross", "期内税前现金"],
          ["social", "个人社保扣款"],
          ["tax", "工资预扣税"],
          ["employeeFund", "个人公积金 / 强积金"],
          ["employerFund", "单位公积金 / 强积金"],
          ["fund", "双边账户计提"],
          ["pendingGross", "期后或未定税前"],
        ].map(([key, label]) => (
          <div className="offer-compare-row" role="row" key={key}>
            <span role="rowheader">{label}</span>
            {values.map((r, i) => (
              <strong role="cell" key={i}>
                {fmt(r[key], r.currency)}
              </strong>
            ))}
          </div>
        ))}
      </div>
      {v.comparable ? (
        <p className="offer-difference">
          B 的发薪现金{v.cashDifference >= 0 ? "多" : "少"}{" "}
          <strong>{fmt(Math.abs(v.cashDifference), v.left.currency)}</strong>
          。差额可由税前、个人社保、公积金、税款与其他扣款逐项核对。
        </p>
      ) : (
        <p className="offer-notice">{v.reason}</p>
      )}
      <div className="offer-compare-notes">
        {values.map((r, i) => (
          <div key={i}>
            <strong>
              {i ? "B" : "A"} · {r.window?.start} — {r.window?.end}
            </strong>
            <p>{offerQuestions(r.issues).length} 项待确认 / 假设</p>
            {r.currency === "HKD" && (
              <p>薪俸税预留：{fmt(r.reserve, "HKD")}（另计，不作为到手差额）</p>
            )}
          </div>
        ))}
      </div>
      <details>
        <summary>逐月并排核对</summary>
        {[...new Set(values.flatMap((r) => r.months.map((m) => m.month)))]
          .sort()
          .map((m) => (
            <div className="offer-compare-row" key={m}>
              <span>{m}</span>
              {values.map((r, i) => (
                <strong key={i}>
                  {fmt(
                    r.months.find((x) => x.month === m)?.cash ?? 0,
                    r.currency,
                  )}
                </strong>
              ))}
            </div>
          ))}
      </details>
    </>
  );
}
