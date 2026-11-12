import { IconArrowUpRight } from '@tabler/icons-react';
import { Choice, NumberField, OptionStrip } from './OfferFields.jsx';
import { LivingCityField } from './LivingCityField.jsx';
import { calculateLiving, housingModes } from './livingBudget.mjs';
import './living-budget.css';

const money = (cents, currency) => new Intl.NumberFormat('zh-CN', {
  style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2,
}).format(cents / 100);

function Amount({ onChange, ...props }) {
  return <NumberField inputMode="decimal" max={1e9} {...props} onChange={n => {
    if (n === null || (Number.isFinite(n) && n >= 0 && n <= 1e9)) onChange(n);
  }} />;
}

function BudgetResult({ model: m, cityName, format, onHousing }) {
  const { income, rent, daily, fixed, balance, afterGoal, rentLimit } = m;
  const provisional = income.beforeDeductions;
  let title = '每月可留', note;
  let headlineAmount = balance;
  if (income.amount === null) {
    title = '预计每月开销';
    headlineAmount = m.costs;
    note = m.costs === null ? '填入当地月租和收入，就能看看每月余量。' : '填好每月收入，就能看到付完这些开销还剩多少。';
  } else if (rent === null) {
    note = '填入在当地看到的月租，或选择免租。';
  } else if (balance < 0) {
    title = provisional ? '扣缴前至少还差' : '每月还差';
    note = '按这份预算，月支出合计 ' + format(m.costs) + '。';
  } else if (provisional) {
    title = '扣缴前最多可留';
    note = '实际可用金额还要扣除' + (income.offsetField === 'reserve' ? '预留的薪俸税。' : '个人缴费与税款。');
  } else if (balance === 0) {
    title = '每月收支持平';
    note = '这份预算刚好用完当月收入。';
  } else {
    note = '扣除住房、日常和固定支出后，可用于储蓄或自由安排。';
  }
  const rentSource = m.housing === 'free' ? '免租' : m.place[m.housing] != null ? '你的月租'
    : m.city.rentPeriod ? m.city.rentPeriod + (m.housing === 'shared' ? ' 两人均摊' : ' 整租参考') : '';
  const lines = [
    ['rent', '房租', rent, [rentSource, m.rentShare === null ? '' : '占' + (provisional ? '扣缴前' : '可用') + '收入 ' + m.rentShare + '%'].filter(Boolean).join(' · ')],
    ['daily', '日常开销', daily, m.place.daily != null ? '你的预算' : m.city.daily.label],
    ['fixed', '其他固定支出', fixed, m.place.fixed != null ? '你的预算' : m.city.utilities ? '含水电参考' : '水电等可补入'],
  ];
  const scale = Math.max(m.costs ?? 0, income.amount ?? 0);
  return <section className="living-result" aria-label="月度收支">
    <p className="living-place">{cityName} · {housingModes.find(([key]) => key === m.housing)[1]} · {m.city.currency}</p>
    <header aria-live="polite" aria-atomic="true">
      <h2>{title}</h2>
      <strong className="living-balance">{headlineAmount === null ? '—' : format(Math.abs(headlineAmount))}</strong>
      <p>{note}</p>
    </header>
    {scale > 0 && m.costs !== null && income.amount !== null && <div className="living-bar" aria-hidden="true">
      {lines.map(([key,, amount]) => <i key={key} data-part={key} style={{ width: (100 * amount / scale) + '%' }} />)}
      {balance > 0 && <i data-part="left" style={{ width: (100 * balance / scale) + '%' }} />}
    </div>}
    <dl className="living-breakdown">{lines.map(([key, label, amount, detail]) => <div key={key}>
      <dt><i data-part={key} aria-hidden="true" />{label}<small>{detail}</small></dt><dd>{amount === null ? '待填写' : format(amount)}</dd>
    </div>)}</dl>
    {m.rentChange !== null && <p className="living-insight">
      <button type="button" onClick={() => onHousing(m.alternative)}>换成{m.alternative === 'solo' ? '独居' : '合租'}</button>，每月房租{m.rentChange === 0 ? '相同' : (m.rentChange > 0 ? '多 ' : '少 ') + format(Math.abs(m.rentChange))}。</p>}
    {afterGoal !== null && !provisional && <div className="living-goal-result">
      <strong>{afterGoal >= 0 ? '能达到储蓄目标' : '离储蓄目标还差 ' + format(-afterGoal)}</strong>
      <p>{afterGoal >= 0 ? '每月存下 ' + format(m.goal) + ' 后，还可安排 ' + format(afterGoal) + '。' : '每月计划存下 ' + format(m.goal) + '。'}
        {rentLimit >= 0 ? '按当前开销，月租可控制在 ' + format(rentLimit) + ' 以内。' : '即使免租，每月仍差 ' + format(-rentLimit) + '。'}</p>
    </div>}
  </section>;
}

function Sources({ city }) {
  return <details className="living-sources"><summary>参考数据与估算方式</summary>
    {city.rent && <p><strong>房租</strong> · {city.rentPeriod}。{city.rent.note}
      <a href={city.rent.url} target="_blank" rel="noreferrer">{city.rent.title}<IconArrowUpRight size={14} /></a></p>}
    <p><strong>日常开销</strong> · {city.daily.label}。{city.daily.note}
      <a href={city.daily.url} target="_blank" rel="noreferrer">{city.daily.title}<IconArrowUpRight size={14} /></a></p>
    <p>按一人、一个月估算。租房押金、搬家等一次性支出可另作安排。</p>
  </details>;
}

export function LivingBudget({ plan, result, onChange }) {
  const b = plan.livingBudget || {}, m = calculateLiving(plan, result);
  const { city, wallet, place, housing, income } = m;
  const format = n => money(n, city.currency);
  function update(group, id, key, value) {
    const record = { ...b[group]?.[id] };
    if (value === null || value === '') delete record[key];
    else record[key] = value;
    onChange({ ...b, city: city.id, [group]: { ...b[group], [id]: record } });
  }
  const editWallet = (key, value) => update('wallets', city.region, key, value);
  const editPlace = (key, value) => update('places', city.id, key, value);
  const incomeOptions = [['net', '到手月薪'], ['gross', '税前月薪']];
  if (income.sameCurrency && (income.hasOffer || wallet.mode === 'offer')) incomeOptions.push(['offer', '沿用 Offer']);
  const rentRef = city[housing];
  const cityNeedsRent = !city.rent && housing !== 'free';
  const rentField = <Amount label="我的月租" value={place[housing]} placeholder={rentRef == null ? '填写每月实付房租' : '参考 ' + format(rentRef * 100)}
    onChange={n => editPlace(housing, n)} />;
  return <div className="living-layout">
    <section className="living-inputs" aria-label="城市与预算条件">
      <LivingCityField city={city} places={b.places} onChoose={id => onChange({ ...b, city: id })} />
      <OptionStrip label="收入口径" items={incomeOptions} value={income.mode} onChange={v => editWallet('mode', v)} />
      <div className="living-income-fields">
        {income.mode !== 'offer' ? <Amount label={(income.mode === 'net' ? '每月到手' : '税前月薪') + '（' + city.currency + '）'}
          placeholder="填写每月工资" value={wallet[income.mode]} onChange={n => editWallet(income.mode, n)} />
          : income.rows.length > 0 ? <Choice label="采用发薪月份" value={income.rows.some(r => r.month === income.month) ? income.month : ''}
            items={[...(!income.rows.some(r => r.month === income.month) ? [['', '选择发薪月份']] : []), ...income.rows.map(r => [r.month, r.month + ' · ' + format(r.cash)])]}
            onChange={v => editWallet('month', v)} />
          : income.base !== null && <p className="living-pay-reference">固定税前月薪 <strong>{format(income.base)}</strong></p>}
        {income.offsetField && <Amount label={income.offsetField === 'reserve' ? '每月预留薪俸税' : city.region === 'HK' ? '个人强积金及每月预留税款' : '每月个人缴费及税款'}
          placeholder="按实际金额填写，可填 0" value={wallet[income.offsetField]} onChange={n => editWallet(income.offsetField, n)} />}
        {(income.mode !== 'net' || city.region === 'HK') && <p className="living-hint">{income.note}</p>}
      </div>
      <OptionStrip label="居住方式" items={housingModes} value={housing} onChange={v => editPlace('housing', v)} />
      {cityNeedsRent && rentField}
      <details className="living-edit"><summary>调整开销与储蓄目标</summary>
        <div className="living-edit-grid">
          {housing !== 'free' && !cityNeedsRent && rentField}
          <Amount label="每月日常开销" value={place.daily} placeholder={'参考 ' + format(city.daily.amount * 100)} onChange={n => editPlace('daily', n)} />
          <Amount label="其他固定支出" value={place.fixed} placeholder={city.utilities ? '含水电参考 ' + format(city.utilities * 100) : '水电、还款或家庭支出'}
            onChange={n => editPlace('fixed', n)} />
          <Amount label="每月想存" value={wallet.goal} placeholder="选填" onChange={n => editWallet('goal', n)} />
        </div>
        <p className="living-hint">固定支出填每月合计，可包含水电物业、还款和家庭支出。</p>
      </details>
    </section>
    <BudgetResult model={m} cityName={city.label} format={format} onHousing={v => editPlace('housing', v)} />
    <Sources city={city}/>
  </div>;
}
