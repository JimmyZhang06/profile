import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, Field, Page } from "../../components/ui/index.jsx";
import { WorkspaceLink } from "../../components/ui/WorkspaceLink.jsx";
import { PageNavigationContext } from "../../hooks/usePageNavigation.js";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { EmailLogin } from "../../components/account/AccountPage.jsx";
import { cloudRequest } from "../../lib/cloudClient.js";
import { offerLinkForOpportunity } from "../../../shared/opportunityOffer.mjs";
import { salaryReferenceLink } from "../market/marketLinks.js";
import { OpportunityForm, blankOpportunity } from "./OpportunityForm.jsx";
import {
  compensationText,
  opportunityStatus,
  opportunityApi,
  requestId,
} from "./opportunityClient.js";
import "./opportunities.css";

export function OpportunityDetail({ item, actions = true, channel, resume, onResume }) {
  return (
    <article className="op-detail">
      <div className="op-meta">
        {opportunityStatus[item.status]} · 公开版本 {item.version} ·{" "}
        {item.sourceType === "community"
          ? "社群内推"
          : item.sourceType === "employee"
            ? "员工推荐"
            : "官方招聘"}
      </div>
      <h2 className="op-title">{item.title}</h2>
      <p className="op-company">
        {item.company} · {item.city || "远程"}
        {item.remote ? " · 支持远程" : ""}
      </p>
      {actions && item.status === "open" && (
        <div className="op-actions">
          {resume && <Button onClick={()=>onResume(resume.id)}>继续打磨我的简历</Button>}
          <WorkspaceLink
            className={resume ? "op-link-button" : "op-primary"}
            href={
              "/?opportunity=" +
              encodeURIComponent(item.id) +
              "&version=" +
              item.version
            }
          >
            {resume ? "另做一份简历" : "用这个岗位做简历"}
          </WorkspaceLink>
          {channel}
        </div>
      )}
      {item.status === "open" ? (
        <>
          <div className="op-pay-line"><div><span>公开薪酬</span><strong>{compensationText(item.compensation)}</strong></div>
            {actions && <div className="op-pay-links">
              <WorkspaceLink href={salaryReferenceLink({region:item.regionCode,kind:'internship',origin:'job',posting:item.id})}>看实习薪酬参考</WorkspaceLink>
              <WorkspaceLink href={offerLinkForOpportunity(item)}>测算这份 Offer</WorkspaceLink>
            </div>}
          </div>
          <dl className="op-facts">
            {[
              [item.direction, "方向"],
              [
                item.graduationYear
                  ? `${item.graduationYear} 届 · ${item.graduationCondition === "required" ? "必须" : item.graduationCondition === "preferred" ? "优先" : "原文未限定"}`
                  : "",
                "毕业要求",
              ],
              [item.daysPerWeek ? `每周 ${item.daysPerWeek} 天` : "", "出勤"],
              [
                item.durationMonths ? `${item.durationMonths} 个月` : "",
                "实习时长",
              ],
            ]
              .filter(([v]) => v)
              .map(([v, k]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
          <h2>职位描述</h2>
          <div className="op-prose">{item.jd}</div>
          {item.requirements && (
            <>
              <h2>到岗与要求</h2>
              <div className="op-prose">{item.requirements}</div>
            </>
          )}
          {item.applicationNotes && (
            <>
              <h2>投递须知</h2>
              <div className="op-prose">{item.applicationNotes}</div>
            </>
          )}
        </>
      ) : (
        <p className="op-notice">
          该岗位已{item.status === "paused" ? "暂停投递" : "结束招聘"}
          。投递渠道与岗位薪酬当前不可用。
        </p>
      )}
      <p className="op-meta">
        {item.deadlineDate
          ? "截止 " + item.deadlineDate
          : item.deadlineAt
            ? "截止 " + new Date(item.deadlineAt).toLocaleString()
            : "截止未注明"}
        {item.verifiedAt
          ? " · 最近核对 " + new Date(item.verifiedAt).toLocaleDateString()
          : ""}
      </p>
    </article>
  );
}
function PublicOpportunities({ route, account, onDirty, onNewResume, findResume, onResume }) {
  const { openLink } = useContext(PageNavigationContext);
  const mobile = useMediaQuery("(max-width: 760px)");
  const id = route.pathname.split("/").filter(Boolean)[1] || "";
  const search = route.searchParams;
  const q = search.get("q") || "", city = search.get("city") || "", direction = search.get("direction") || "";
  const offset = Math.max(0, Number.parseInt(search.get("offset"), 10) || 0);
  const [query, setQuery] = useState({ q, city, direction });
  const [filterOpen,setFilterOpen]=useState(false);
  const [list, setList] = useState(null), [error, setError] = useState(""), [reload, setReload] = useState(0);
  const browse = useRef(null), listPosition = useRef(null);
  useLayoutEffect(() => {
    const scroller = browse.current?.closest(".page-scroll");
    if (!mobile || !scroller) return;
    if (id) {
      scroller.scrollTop = 0;
      browse.current.querySelector(".op-detail-panel")?.focus({ preventScroll: true });
      return;
    }
    scroller.scrollTop = listPosition.current?.search === route.search ? listPosition.current.top : 0;
    const remember = () => { listPosition.current = { search: route.search, top: scroller.scrollTop }; };
    scroller.addEventListener("scroll", remember, { passive: true });
    return () => scroller.removeEventListener("scroll", remember);
  }, [id, mobile, route.search]);
  useEffect(() => { setQuery({ q, city, direction }); }, [q, city, direction]);
  useEffect(() => {
    const controller = new AbortController();
    setError(""); setList(null);
    const params = new URLSearchParams({ q, city, direction, offset });
    cloudRequest("public/opportunities?" + params, { signal: controller.signal })
      .then(setList).catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [q, city, direction, offset, reload]);
  function show(filters, skip = 0) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value.trim()) params.set(key, value.trim());
    if (skip) params.set("offset", skip);
    openLink("/opportunities" + (params.size ? "?" + params : ""));
  }
  const detailId = id || (!mobile && list?.items[0]?.id);
  return <div className={"op-browse" + (id ? " reading" : "")} ref={browse}>
    <form className="op-filters op-search" onSubmit={e => { e.preventDefault(); show(query); }}>
      <Field label="搜索岗位或公司"><input value={query.q} maxLength={100} placeholder="输入岗位或公司关键词" onChange={e=>setQuery({...query,q:e.target.value})}/></Field>
      <div className="op-search-actions"><Button type="submit">搜索</Button><Button type="button" variant="secondary" aria-expanded={Boolean(filterOpen || city || direction)}
        aria-controls="op-filter-more" onClick={()=>{if(city||direction){setQuery({...query,city:'',direction:''});setFilterOpen(false);show({q:query.q});}else setFilterOpen(v=>!v);}}>
        {city||direction?'清除筛选':filterOpen?'收起筛选':'更多筛选'}</Button></div>
      <div id="op-filter-more" className="op-add-filters" hidden={!(filterOpen||city||direction)}>{Object.entries({ city: ["城市", "全部城市"], direction: ["方向", "全部方向"] })
        .map(([key, [label, placeholder]]) => <Field key={key} label={label}><input value={query[key]} maxLength={100} placeholder={placeholder}
          onChange={e => setQuery({ ...query, [key]: e.target.value })} /></Field>)}</div>
    </form>
    <div className="op-browser">
      <section className="op-list" aria-label="在招岗位">
        {error ? <p role="alert">{error} <Button variant="ghost" onClick={() => setReload(v => v + 1)}>重新读取</Button></p>
          : !list ? <p className="op-empty" role="status">正在读取机会…</p>
          : !list.items.length ? <div className="op-empty-state"><h2>{q||city||direction?'没有匹配的岗位':'暂无已发布的实习机会'}</h2>
            <p>{q||city||direction?'试试更短的关键词，或清除城市和方向。':'已有心仪岗位？直接粘贴招聘 JD，就能开始准备简历。'}</p>
            {q||city||direction?<Button variant="secondary" onClick={()=>{setFilterOpen(false);show({});}}>清除条件，查看全部</Button>:
            <Button variant="secondary" onClick={onNewResume}>用自己的 JD 做简历</Button>}</div>
          : list.items.map(row => <WorkspaceLink key={row.id} className={"op-row op-list-entry" + (detailId === row.id ? " selected" : "")}
            href={"/opportunities/" + row.id + route.search} aria-current={detailId === row.id ? "true" : undefined}>
            <strong>{row.title}</strong><span>{row.company} · {row.city || "远程"}{row.remote && " · 可远程"}</span>
            <small>{compensationText(row.compensation)}{row.deadlineDate && " · " + row.deadlineDate + " 截止"}</small>
          </WorkspaceLink>)}
        {(offset > 0 || list?.hasMore) && <div className="op-actions op-pagination">
          <Button variant="ghost" disabled={!offset} onClick={() => show({ q, city, direction }, Math.max(0, offset - 20))}>上一页</Button>
          <span>第 {Math.floor(offset / 20) + 1} 页</span><Button variant="ghost" disabled={!list?.hasMore} onClick={() => show({ q, city, direction }, offset + 20)}>下一页</Button>
        </div>}
      </section>
      {detailId && <OpportunityReading key={detailId} id={detailId} account={account} onDirty={onDirty} resume={findResume?.(detailId)} onResume={onResume}/>}
    </div>
  </div>;
}

function OpportunityReading({ id, account, onDirty, resume, onResume }) {
  const [item, setItem] = useState(null), [apply, setApply] = useState(null), [error, setError] = useState("");
  const [report, setReport] = useState(false), [category, setCategory] = useState("channel"), [description, setDescription] = useState("");
  const [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  const api = opportunityApi(account);
  useEffect(() => {
    onDirty(Boolean(account.user && description.trim()));
    return () => onDirty(false);
  }, [description, onDirty, account.user?.id]);
  useEffect(() => {
    const controller = new AbortController();
    setItem(null); setApply(null); setError("");
    cloudRequest("public/opportunities/" + id, { signal: controller.signal }).then(result => setItem(result.item))
      .catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [id, reload]);
  async function goApply() {
    setBusy(true); setError(""); setApply(null);
    try {
      const result = await cloudRequest("public/opportunities/" + id + "/apply?version=" + item.version);
      setApply(result.application);
    } catch(e) {
      if (e.status === 409 || e.status === 410) {
        setNotice("岗位信息已有更新，请核对当前投递状态。"); setReload(v => v + 1);
      } else setError(e.message);
    } finally { setBusy(false); }
  }
  async function sendReport() {
    setBusy(true); setError("");
    try {
      await api("opportunities/" + id + "/reports", { method: "POST", body: { version: item.version, category, description } });
      setNotice("反馈已提交，管理员会按你看到的版本复核。"); setDescription(""); setReport(false);
    } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="op-detail-panel" aria-label="岗位详情" tabIndex={-1}>
    {error && <p role="alert" className="form-error">{error} <Button variant="ghost" onClick={() => setReload(v => v + 1)}>重新读取</Button></p>}
    {notice && <p className="op-notice" role="status">{notice}</p>}
    {!item && !error && <p role="status">正在读取岗位详情…</p>}
    {item && <>
      <OpportunityDetail item={item} resume={resume} onResume={onResume} channel={<div className="op-channel">
        <Button variant="secondary" disabled={busy} onClick={goApply}>查看当前投递渠道</Button>
        {apply && <p role="status">已核对 V{item.version} · <a href={apply.type==="email"?"mailto:"+apply.value:apply.value} target={apply.type==="url"?"_blank":undefined} rel="noopener noreferrer">{apply.value}</a></p>}
      </div>} />
      <div className="op-actions">
        <Button variant="ghost" aria-expanded={report} onClick={() => { setReport(!report); setError(""); }}>反馈岗位问题</Button>
      </div>
      {report && <div className="op-report">{!account.user ? <EmailLogin health={account.health} onSuccess={account.refresh} /> : <>
        <Field label="问题类型"><select value={category} onChange={e => setCategory(e.target.value)}>
          {Object.entries({ channel: "渠道失效", expired: "已结束招聘", incorrect: "信息有误", privacy: "隐私问题", other: "其他" }).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></Field>
        <Field label="具体说明"><textarea value={description} maxLength={2000} onChange={e => setDescription(e.target.value)} /></Field>
        <Button disabled={busy || description.trim().length < 5} onClick={sendReport}>提交反馈</Button>
      </>}</div>}
    </>}
  </section>;
}
export default function OpportunitiesPage({ account, route, onBack, onNewResume, findResume, onResume }) {
  const { request, openLink } = useContext(PageNavigationContext);
  const view = route.searchParams.get("view") === "mine" ? "mine" : "public";
  const [mine, setMine] = useState(null), [form, setForm] = useState(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [reload, setReload] = useState(0);
  const api = opportunityApi(account);
  const id = route.pathname.split("/").filter(Boolean)[1];
  useEffect(() => { setForm(null); setMine(null); setDirty(false); setError(""); }, [account.user?.id, view]);
  useEffect(() => {
    if (view !== "mine" || !account.user) return;
    let alive = true;
    setMine(null);
    api("opportunity-submissions")
      .then((v) => {
        if (alive) setMine(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [view, account.user?.id, reload]);
  useEffect(() => {
    const leave = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  async function openForm(id) {
    setBusy(true);
    setError("");
    try {
      setForm(await api("opportunity-submissions/" + id));
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
      await openForm(value.item.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const reading = view === "public" && !!id;
  const toggle = () => openLink(view === "mine" ? "/opportunities" : "/opportunities?view=mine");
  return <Page title="实习机会" description={view === "mine" ? "管理草稿、送审和查看审核结果。" : "浏览已审核的岗位，为合适的机会准备简历。"}
      className={"career-page op-page" + (view === "public" ? " op-public" : "")}
      onBack={reading ? () => openLink("/opportunities" + route.search) : onBack} backLabel={reading ? "返回全部机会" : "返回简历"}
      dirty={dirty} actions={<Button variant="secondary" disabled={busy} onClick={toggle}>{view === "mine" ? "浏览机会" : "我的投稿"}</Button>}>

      {error && (
        <p role="alert" className="form-error">
          {error}
          <Button variant="ghost" onClick={() => setReload((v) => v + 1)}>
            重新读取
          </Button>
        </p>
      )}
      {view === "mine" ? (
        !account.user ? (
          <>
            <p>使用受邀邮箱登录后录入机会；只会显示你自己的投稿。</p>
            <EmailLogin health={account.health} onSuccess={account.refresh} />
          </>
        ) : form ? (
          <OpportunityForm
            key={form.item.id}
            initial={form}
            api={api}
            onDirty={setDirty}
            onSaved={(id) => {
              setDirty(false);
              openForm(id);
            }}
            onBack={() =>
              request(() => {
                setForm(null);
                setReload((v) => v + 1);
              })
            }
          />
        ) : (
          <>
            <div className="op-actions">
              <Button disabled={busy} onClick={create}>
                录入实习机会
              </Button>
            </div>
            <div className="op-list">
              {mine ? (
                mine.items.length ? (
                  mine.items.map((row) => (
                    <button
                      className="op-row"
                      key={row.id}
                      onClick={() => openForm(row.id)}
                    >
                      <strong>{row.title || "未命名草稿"}</strong>
                      <span>{row.company || "尚未填写公司"}</span>
                      <small>
                        {opportunityStatus[row.status]} · 修订 {row.revision}
                      </small>
                    </button>
                  ))
                ) : (
                  <p className="op-empty">
                    还没有投稿。先录入文字与来源，再送审。
                  </p>
                )
              ) : (
                <p>正在读取投稿…</p>
              )}
            </div>
          </>
        )
      ) : <PublicOpportunities route={route} account={account} onDirty={setDirty} onNewResume={onNewResume} findResume={findResume} onResume={onResume}/>}
    </Page>;
}
