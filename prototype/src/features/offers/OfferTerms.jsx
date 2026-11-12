import { useImperativeHandle, useRef, useState } from 'react';
import { IconWallet, IconCalendarEvent, IconGift, IconShieldCheck, IconReceiptTax, IconCalendarStats } from '@tabler/icons-react';
import { Button } from '../../components/ui/index.jsx';
import { DateField } from '../../components/ui/DateField.jsx';
import { WorkspaceLink } from '../../components/ui/WorkspaceLink.jsx';
import { compensationText } from '../opportunities/opportunityClient.js';
import { emptyOffer, offerMonths, offerWindow } from './offerEngine.mjs';
import { Input, NumberField, Choice, Check, OptionStrip } from './OfferFields.jsx';
import { OfferTermsDeck } from './OfferTermsDeck.jsx';

function Quote({p,change}) {
  return <div className="offer-card-fields">
    <div className="offer-quote-amount"><NumberField data-offer-section="salary" label={'已确认税前报价（'+p.currency+'）'}
      value={p.salary} onChange={v=>change('salary',v)}/></div>
    <OptionStrip label="报价单位" value={p.unit} items={[[ 'month','月薪'],['day','日薪'],['hour','时薪'],['year','年薪']]} onChange={v=>change('unit',v)}/>
    {['hour','year'].includes(p.unit) && <p className="offer-card-wide">保留原报价。向单位确认月薪或日薪后，切换单位并填写对应金额。</p>}
    <OptionStrip label="地区与本币" value={p.region} items={[[ 'CN','内地 · CNY'],['HK','香港 · HKD']]} onChange={v=>{
      change('region',v);change('currency',v==='HK'?'HKD':'CNY');change('tax',emptyOffer().tax);
    }}/>
    <OptionStrip label="工作类型" value={p.kind} items={[[ 'employment','正式工作'],['internship','实习']]} onChange={v=>{
      change('kind',v);change('period',v==='internship'?'contract':'first12');
    }}/>
    {p.unit === "day" && (
      <NumberField
        data-offer-section="days"
        label="每月预计出勤天数"
        value={p.days}
        max={31}
        onChange={(v) => change("days", v)}
      />
    )}
    {(p.opportunity || p.publicQuote) && (
      <details className="offer-origin">
        <summary>公开岗位条款 · {compensationText(p.publicQuote)}</summary>
        <p>测算使用你填入的实际报价。
        {p.publicQuote && p.publicQuote.currency !== p.currency &&
          `公开报价使用 ${p.publicQuote.currency}。请向单位确认折合 ${p.currency} 的金额，再填写本地计薪报价。`}
        {["hour", "year"].includes(p.publicQuote?.unit) &&
          "原报价为时薪 / 年薪，请向单位确认计薪天数、小时或年薪组成，手工换算为月薪 / 日薪后再测算。"}
        </p>
        {p.opportunity && <p>已采用公开版本 {p.opportunity.version} ·{" "}
          <WorkspaceLink href={"/opportunities/" + encodeURIComponent(p.opportunity.id)}>重新查看公开条款</WorkspaceLink></p>}
      </details>
    )}
  </div>;
}

function Contract({p,change}) {
  return <div className="offer-card-fields">
    <div className="offer-card-wide"><OptionStrip label="测算期间" value={p.period} items={[[ 'first12','入职首 12 个月'],['contract','完整合同期']]} onChange={v=>change('period',v)}/></div>
    <div className="date-field-pair">
      <DateField label="入职日期" data-offer-section="start" value={p.start}
        initialDate={p.end} onChange={value => change('start', value)}/>
      <DateField label={p.period === 'contract' ? '合同结束日期' : '合同结束日期（正式岗可空）'}
        data-offer-section="end" value={p.end} initialDate={p.start} onChange={value => change('end', value)}/>
    </div>
    <details><summary>发薪日与试用期</summary><div className="offer-card-fields">
      <NumberField
        label="工资延后几个月发（当月为 0）"
        value={p.payOffset}
        step={1}
        max={12}
        onChange={(v) => change("payOffset", v ?? 0)}
      />
      <NumberField
        label="发薪日（短月自动取月底）"
        value={p.payDay}
        min={1}
        max={31}
        step={1}
        onChange={(v) => change("payDay", v ?? 28)}
      />
      <DateField
        label="试用期最后一天（含）"
        initialDate={p.start}
        value={p.trialEnd}
        onChange={(v) => change("trialEnd", v || "")}
      />
      <NumberField
        label="试用工资为正式工资的 %"
        value={p.trialPercent}
        max={100}
        onChange={(v) => change("trialPercent", v ?? 100)}
      />
    </div></details>
    <details><summary>公司与条款来源</summary><div className="offer-card-fields">
      <Input
        label="方案名称 / 公司（选填）"
        value={p.name}
        maxLength={160}
        onChange={(v) => change("name", v || "")}
      />
      <Choice
        label="条款来源"
        value={p.source}
        items={[
          ["个人假设", "个人假设"],
          ["录用通知", "录用通知"],
          ["HR 确认", "HR 确认"],
        ]}
        onChange={(v) => change("source", v)}
      />
      <Input
        label="报价原文（例如 14 薪，仅备忘不重复计入）"
        value={p.quote}
        onChange={(v) => change("quote", v || "")}
      />
    </div></details>
  </div>;
}

function Bonuses({p,change}) {
  function bonusChange(id, key, value) {
    change(
      "bonuses",
      p.bonuses.map((b) => (b.id === id ? { ...b, [key]: value } : b)),
    );
  }
  return <div className="offer-card-fields">
    <NumberField
      label="每月定额补贴（未填视为无）"
      value={p.allowance}
      onChange={(v) => change("allowance", v)}
    />
    <div className="offer-card-wide">
      <Check
        checked={p.allowanceTaxable}
        onChange={(v) => change("allowanceTaxable", v)}
      >
        补贴计入应税收入（香港现金补贴的强积金另按相关入息核实）
      </Check>
    </div>
    <div className="offer-card-wide offer-bonus-entries">
      {p.bonuses.map((b) => (
        <fieldset key={b.id}>
          <legend>{b.fixed ? "固定额外薪酬" : "目标奖金"}</legend>
          <Input
            label="条款名称"
            value={b.label}
            onChange={(v) => bonusChange(b.id, "label", v || "")}
          />
          <NumberField
            label="税前金额"
            value={b.amount}
            onChange={(v) => bonusChange(b.id, "amount", v)}
          />
          <Check
            checked={b.fixed}
            onChange={(v) => bonusChange(b.id, "fixed", v)}
          >
            已明确约定且满足条件的固定收入
          </Check>
          <DateField
            label="实际或约定支付日期"
            initialDate={p.end || p.start}
            value={b.payDate}
            onChange={(v) => bonusChange(b.id, "payDate", v || "")}
          />
          <details><summary>发放条件与来源</summary><div className="offer-card-fields">
            <Input
              label="条款编号（防止重复计算）"
              value={b.clauseKey}
              onChange={(v) => bonusChange(b.id, "clauseKey", v || "")}
            />
            {p.region === "HK" && (
              <DateField
                label="强积金相关入息所属月（可空，暂按发放月）"
                precision="month"
                initialDate={b.payDate || p.start}
                value={b.earnedMonth}
                onChange={(v) => bonusChange(b.id, "earnedMonth", v || "")}
              />
            )}
            {!b.payDate && offerWindow(p) && (
              <div className="offer-actions">
                <Button
                  variant="secondary"
                  onClick={() =>
                    bonusChange(b.id, "payDate", offerWindow(p).end)
                  }
                >
                  假设期内发放
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    bonusChange(
                      b.id,
                      "payDate",
                      String(+offerWindow(p).end.slice(0, 4) + 1) + "-03-28",
                    )
                  }
                >
                  假设期外发放
                </Button>
              </div>
            )}
            <Check
              checked={b.prorate}
              onChange={(v) => bonusChange(b.id, "prorate", v)}
            >
              按涉及的在岗月份 / 12 暂估折算
            </Check>
            <Check
              checked={b.requiresEmployed}
              onChange={(v) => bonusChange(b.id, "requiresEmployed", v)}
            >
              支付日须仍在职（以合同结束日判断）
            </Check>
            {p.region === "CN" && (
              <Check
                checked={b.separate}
                onChange={(v) => bonusChange(b.id, "separate", v)}
              >
                符合全年一次性奖金条件，单位预计单独计税
              </Check>
            )}
            <Choice
              label="此项来源"
              value={b.source || "个人假设"}
              items={[
                ["个人假设", "个人假设"],
                ["录用通知", "录用通知"],
                ["HR 确认", "HR 确认"],
              ]}
              onChange={(v) => bonusChange(b.id, "source", v)}
            />
          </div></details>
          <Button
            variant="ghost"
            onClick={() =>
              change(
                "bonuses",
                p.bonuses.filter((x) => x.id !== b.id),
              )
            }
          >
            移除此项
          </Button>
        </fieldset>
      ))}
      <Button
        variant="secondary"
        onClick={() => {
          const id = crypto.randomUUID();
          change("bonuses", [
            ...p.bonuses,
            {
              id,
              clauseKey: id,
              label: "额外薪酬",
              amount: null,
              fixed: false,
              payDate: "",
              source: "个人假设",
            },
          ]);
        }}
      >
        添加额外薪酬
      </Button>
    </div>
    <p>月薪只计一次。额外薪酬单列；凭票报销和股权不计入发薪现金。免税补贴需有单位依据。</p>
  </div>;
}

function Contributions({p,change,nested}) {
  const c=p.contributions,t=p.tax;
  function itemChange(key, field, value) {
    nested("contributions", "items", {
      ...c.items,
      [key]: { ...c.items?.[key], [field]: value },
    });
  }
  return <div className="offer-card-fields">
    <Input label={p.region==='HK'?'工作地点（选填）':'参保城市'} value={p.city} onChange={v=>change('city',v||'')}/>
    <div className="offer-card-flow" data-offer-section="contributions">
      {p.region === "HK" ? (
        <>
          <Choice
            label="强积金资格与供款方式"
            value={t.hkMpf}
            items={[
              ["unknown", "资格待确认 / 单位金额"],
              ["regular", "确认普通雇员：18–64 岁、按月、连续至少 60 天"],
              ["exempt", "已核实豁免（雇员与雇主均为 0）"],
            ]}
            onChange={(v) => nested("tax", "hkMpf", v)}
          />
          <p>
            学生身份不自动豁免。就业签证期限、海外退休计划及行业临时雇员须另行核实。自动规则含雇员首
            30 日及紧接的不完整工资期免供。
          </p>
        </>
      ) : (
        <Choice
          label="缴费资料"
          value={c.mode}
          items={[
            ["manual", "单位实扣合计"],
            ["itemized", "分险种填金额 / 深圳一档医保规则"],
          ]}
          onChange={(v) => nested("contributions", "mode", v)}
        />
      )}
      {p.region === "CN" && c.mode === "itemized" ? (
        [
          "pension",
          "medical",
          "unemployment",
          "injury",
          "maternity",
          "fund",
        ].map((key, i) => (
          <fieldset key={key}>
            <legend>
              {["养老", "医疗", "失业", "工伤", "生育", "公积金"][i]}
            </legend>
            {key === "medical" && (
              <Check
                checked={c.items?.[key]?.rule === "sz-medical-1"}
                onChange={(v) =>
                  itemChange(key, "rule", v ? "sz-medical-1" : "")
                }
              >
                采用深圳 2026 一档医保规则（须填深圳及申报基数）
              </Check>
            )}
            <NumberField
              label="该险种申报基数（可空）"
              value={c.items?.[key]?.base}
              onChange={(v) => itemChange(key, "base", v)}
            />
            <NumberField
              label="个人每月实扣（明确不缴填 0）"
              value={c.items?.[key]?.employee}
              onChange={(v) => itemChange(key, "employee", v)}
            />
            <NumberField
              label="单位每月承担"
              value={c.items?.[key]?.employer}
              onChange={(v) => itemChange(key, "employer", v)}
            />
          </fieldset>
        ))
      ) : (
        <>
          {p.region === "CN" && (
            <NumberField
              label="个人社保每月实扣"
              value={c.social}
              onChange={(v) => nested("contributions", "social", v)}
            />
          )}
          <NumberField
            label={
              p.region === "HK"
                ? "雇员每月强积金（单位金额）"
                : "个人每月公积金"
            }
            value={c.fundEmployee}
            onChange={(v) => nested("contributions", "fundEmployee", v)}
          />
          <NumberField
            label={
              p.region === "HK"
                ? "雇主每月强积金（单位金额）"
                : "单位每月公积金"
            }
            value={c.fundEmployer}
            onChange={(v) => nested("contributions", "fundEmployer", v)}
          />
        </>
      )}
      {p.region === "CN" && (
        <NumberField
          label="上述缴费中依法允许税前扣除的月金额"
          value={c.deductible}
          onChange={(v) => nested("contributions", "deductible", v)}
        />
      )}
      <NumberField
        label="每月其他工资扣款（无则 0）"
        value={c.other}
        onChange={(v) => nested("contributions", "other", v)}
      />
    </div>
    <p>{p.region==='HK'?'雇员实扣和雇主供款分开记录。明确豁免或零扣款时填写相应金额。':'缴费基数与工资分开记录；未核验的项目请填单位金额。单位独自承担的险种，个人金额填 0，合并收取的项目不要重复录入。'}</p>
  </div>;
}

function Tax({p,nested}) {
  const t=p.tax;
  return <div className="offer-card-fields" data-offer-section="tax">
    {p.region === "HK" ? (
      <>
        <Check
          checked={t.hkAnnualComplete}
          onChange={(v) => nested("tax", "hkAnnualComplete", v)}
        >
          确认每个涉及课税年度的全年资料完整（年度外收入也已纳入）
        </Check>
        <NumberField
          label="每个课税年度另有的应税收入"
          value={t.hkOtherIncome}
          onChange={(v) => nested("tax", "hkOtherIncome", v)}
        />
        <NumberField
          label="每年另有的雇员强制供款"
          value={t.hkOtherMpf}
          onChange={(v) => nested("tax", "hkOtherMpf", v)}
        />
        <NumberField
          label="每年其他可扣除额"
          value={t.hkOtherDeduction}
          onChange={(v) => nested("tax", "hkOtherDeduction", v)}
        />
        <NumberField
          label="每年基本免税额之外的免税额"
          value={t.hkExtraAllowance}
          onChange={(v) => nested("tax", "hkExtraAllowance", v)}
        />
        <p>
          课税年度为 4 月 1 日至次年 3 月 31
          日。不同年度其他收入有差异时请拆成两份测算，暂不确认全年资料。预留取累进税与标准税较低值，已公布的该年度宽减另计；不估计暂缴税账单。
        </p>
      </>
    ) : (
      <>
        <Choice
          label="单位预计预扣方式"
          value={t.mode}
          items={[
            ["unknown", "尚未确认"],
            ["resident", "居民个人 · 工资薪金累计预扣"],
            ["student", "已确认全日制学生实习劳务 · 累计预扣"],
            ["manual", "单位给出的预计扣税额"],
          ]}
          onChange={(v) => nested("tax", "mode", v)}
        />
        {t.mode === "manual" ? (
          <NumberField
            label="每月单位预计扣税（可逐月覆盖）"
            value={t.manual}
            onChange={(v) => nested("tax", "manual", v)}
          />
        ) : (
          <>
            <NumberField
              label="专项附加扣除 / 月"
              value={t.special}
              onChange={(v) => nested("tax", "special", v)}
            />
            <NumberField
              label="其他依法扣除 / 月"
              value={t.otherDeduction}
              onChange={(v) => nested("tax", "otherDeduction", v)}
            />
        <details><summary>此前的累计收入与扣除</summary><div className="offer-card-fields">
          <p>
            同一扣缴单位、首次发薪年度的已有累计资料（新入职一般为
            0，不填写原单位工资）：
          </p>
          {[
            ["priorIncome", "本单位已有累计应税收入"],
            ["priorDeductions", "本单位已有累计缴费扣除"],
            ["priorWithheld", "本单位已有累计预扣税"],
            ["priorMonths", "本单位已有任职月份数"],
          ].map(([k, label]) => (
            <NumberField
              key={k}
              label={label}
              value={t[k]}
              onChange={(v) => nested("tax", k, v)}
            />
          ))}
          <Input
            label="已在其他单位使用单独计税的年份（逗号隔开）"
            value={(t.bonusUsedYears || []).join(",")}
            onChange={(v) =>
              nested(
                "tax",
                "bonusUsedYears",
                String(v || "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
          />
        </div></details>
            <p>
              首次就业或上年低收入简化办法尚需单位确认，请采用单位扣税额。工资条预扣不等于年度最终税额，本页不据片段资料推算退税。
            </p>
          </>
        )}
      </>
    )}
  </div>;
}

function Monthly({p,change,months,month,setMonth,fillDates}) {
  const m=months.includes(month)?month:months[0],t=p.tax;
  function monthChange(m, key, value) {
    change("monthly", { ...p.monthly, [m]: { ...p.monthly[m], [key]: value } });
  }
  if(!m)return <div className="offer-empty-month" data-offer-section="monthly">
    <p>填好合同日期，就可以按月更正出勤天数、实际工资或发薪日。</p>
    <Button variant="secondary" onClick={fillDates}>填写合同日期</Button>
  </div>;
  return <div className="offer-card-fields" data-offer-section="monthly">
    <div className="offer-card-wide">
      <DateField label="选择计薪月份" precision="month" value={m} onChange={setMonth}
        min={months[0]} max={months.at(-1)} clearable={false}/>
    </div>
    {p.unit === "day" && (
      <NumberField
        label={`${m} 出勤天数`}
        value={p.monthly[m]?.days}
        onChange={(v) => monthChange(m, "days", v)}
      />
    )}
    <NumberField
      label={`${m} 工资税前金额覆盖（不含补贴）`}
      value={p.monthly[m]?.gross}
      onChange={(v) => {
        if (v === null) {
          const next = { ...p.monthly[m] };
          delete next.gross;
          change("monthly", { ...p.monthly, [m]: next });
        } else monthChange(m, "gross", v);
      }}
    />
    <DateField
      label={`${m} 工资支付日期覆盖`}
      initialDate={m}
      value={p.monthly[m]?.payDate}
      onChange={(v) => monthChange(m, "payDate", v || undefined)}
    />
    <NumberField
      label={`${m} 补贴覆盖`}
      value={p.monthly[m]?.allowance}
      onChange={(v) => monthChange(m, "allowance", v)}
    />
    <details><summary>当月缴费与扣税</summary><div className="offer-card-fields">
      {[
        ["social", "个人社保"],
        [
          "fundEmployee",
          p.region === "HK" ? "雇员强积金" : "个人公积金",
        ],
        [
          "fundEmployer",
          p.region === "HK" ? "雇主强积金" : "单位公积金",
        ],
        ["deductible", "税前可扣缴费"],
        ["other", "其他工资扣款"],
      ]
        .filter(
          ([k]) =>
            p.region === "CN" || !["social", "deductible"].includes(k),
        )
        .map(([k, label]) => (
          <NumberField
            key={k}
            label={`${m} ${label}覆盖`}
            value={p.monthly[m]?.contributions?.[k]}
            onChange={(v) =>
              monthChange(m, "contributions", {
                ...p.monthly[m]?.contributions,
                [k]: v,
              })
            }
          />
        ))}
      {t.mode === "manual" && (
        <NumberField
          label={`${m} 单位预计扣税覆盖`}
          value={p.monthly[m]?.tax}
          onChange={(v) => monthChange(m, "tax", v)}
        />
      )}
    </div></details>
    <Button
      variant="ghost"
      onClick={() => {
        const next = { ...p.monthly };
        delete next[m];
        change("monthly", next);
      }}
    >
      清除此月更正
    </Button>
  </div>;
}

export function OfferTerms({plan,change,nested,controls,initialId,onPosition,initialMonth,onMonthChange,name}) {
  const deck=useRef(null), [month,setLocalMonth]=useState(initialMonth);
  function setMonth(m){setLocalMonth(m);onMonthChange(m);}
  const p=plan, hk=p.region==='HK';
  const months = [
      ...new Set([
        ...offerMonths(p),
        ...(p.region === "HK"
          ? p.bonuses
              .map((b) => b.earnedMonth || b.payDate?.slice(0, 7))
              .filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m || ""))
          : []),
      ]),
    ].sort();
  useImperativeHandle(controls,()=>({
    reset:()=>{setMonth('');deck.current?.go('quote');},
    reveal:(section,period)=>{
      if(section==='monthly' && period)setMonth(period.slice(0,7));
      deck.current?.reveal(section);
    },
  }),[]);
  const cards=[
    {id:'quote',title:'薪资报价',hint:'填入税前月薪或日薪，先看基本收入。',icon:IconWallet,body:<Quote p={p} change={change}/>},
    {id:'contract',title:'合同与发薪',hint:'确定起止日期，查看合同期或入职首年的收入。',icon:IconCalendarEvent,body:<Contract p={p} change={change}/>},
    {id:'bonus',title:'奖金与补贴',hint:'把额外薪数、目标奖金和固定补贴单独计入。',icon:IconGift,body:<Bonuses p={p} change={change}/>},
    {id:'contributions',title:hk?'强积金与扣款':'五险一金与扣款',hint:'分别填写个人实扣与单位承担的金额。',icon:IconShieldCheck,body:<Contributions p={p} change={change} nested={nested}/>},
    {id:'tax',title:hk?'薪俸税预留':'个税与扣除',hint:hk?'按课税年度估算，和发薪现金分开查看。':'根据单位的预扣方式补充扣税资料。',icon:IconReceiptTax,body:<Tax p={p} nested={nested}/>},
    {id:'monthly',title:'逐月调整',hint:'只更正有差异的月份，其余月份沿用合同条款。',icon:IconCalendarStats,body:<Monthly p={p} change={change} months={months} month={month} setMonth={setMonth} fillDates={()=>deck.current?.reveal('start')}/>},
  ];
  return <OfferTermsDeck cards={cards} initialId={initialId} onPosition={onPosition} controls={deck} name={name}/>;
}
