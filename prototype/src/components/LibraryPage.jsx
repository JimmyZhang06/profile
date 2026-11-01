import { useContext, useEffect, useId, useRef, useState } from 'react';
import { IconArrowDown, IconArrowRight, IconArrowUp, IconCheck, IconChevronDown, IconDots, IconEye, IconPlus, IconTrash } from '@tabler/icons-react';
import { PageNavigationContext } from '../hooks/usePageNavigation.js';
import { contactLabel, contactText, contactTypes, newContact, newRecord, normalizeProfile, profileSelections, recordHasContent, recordSections, syncLegacyFields } from '../lib/profile.js';
import { Button, EmptyState, Field, IconButton, Menu, Page } from './ui/index.jsx';
import { SelectField } from './ui/SelectField.jsx';
import { CurvedTabs } from './ui/CurvedTabs.jsx';
import { MaterialTextArea } from './ProjectEditor.jsx';
import { ProjectsPage } from './ProjectsPage.jsx';
import { ExperiencePreview } from './ExperiencePreview.jsx';
import { recordPreview } from '../lib/experiencePreview.js';
import { useReadingView } from '../hooks/useReadingView.js';

const tabs = [
  {key: 'basics', label: '基础资料'},
  {key: 'workEntries', label: '实习与工作', compact: '工作'},
  {key: 'educationEntries', label: '教育背景'},
  {key: 'researchEntries', label: '研究经历'},
  {key: 'projects', label: '项目素材'},
];
const move = (items, id, offset) => {
  const next = [...items], from = next.findIndex(item => item.id === id), to = from + offset;
  if (from >= 0 && to >= 0 && to < next.length) [next[from], next[to]] = [next[to], next[from]];
  return next;
};
function LibraryNav({id, value, onChange, draft, library, autoFocus}) {
  return <CurvedTabs id={id} label="资料分类" className="library-navigation" value={value} onChange={onChange} autoFocus={autoFocus} items={tabs.map(({key, label, compact = label}) => {
    const count = key === 'basics' ? null : key === 'projects' ? library.filter(p => !p.archived).length : draft[key].length;
    return {value: key, ariaLabel: label + (count === null ? '' : ' ' + count), label: <span className="library-tab-label"><span className="library-tab-full">{label}</span><span className="library-tab-compact">{compact.slice(0, 2)}</span>{count === null ? null : <small>{count}</small>}</span>};
  })} />;
}
function ContactEditor({items, onChange}) {
  return <section className="profile-form-section"><header className="contact-section-heading"><div><h2>联系方式</h2><p>每项单独维护。仅默认选入的内容会带入新简历。</p></div><Button variant="secondary" aria-label="添加联系方式" onClick={() => onChange([...items, newContact('link')])}><IconPlus size={15} /><span className="contact-add-label">添加联系方式</span><span className="mobile-short-label">添加</span></Button></header>
    {!items.length ? <div className="contact-start"><Button variant="secondary" onClick={() => onChange([newContact('phone'), newContact('email')])}>添加电话和邮箱</Button><p>也可以填写城市、作品集和实习安排。</p></div> : <div className="contact-list">{items.map((item, index) => {
      const update = patch => onChange(items.map(other => other.id === item.id ? {...other, ...patch} : other));
      return <div className="contact-row" key={item.id}>
        <SelectField label={'第 ' + (index + 1) + ' 项类型'} value={item.type} onChange={type => update({type})} options={contactTypes} />
        <Field label={contactLabel(item)} className="contact-value"><input aria-label={'第 ' + (index + 1) + ' 项联系方式'} type={item.type === 'email' ? 'email' : item.type === 'phone' ? 'tel' : 'text'} autoComplete="off" value={item.value} placeholder={item.type === 'link' ? '例如 github.com/你的用户名' : '填写' + contactLabel(item)} onChange={event => update({value: event.target.value})} /></Field>
        <div className="contact-options"><label className="profile-checkbox"><input type="checkbox" checked={item.visible} onChange={event => update({visible: event.target.checked})} /><span>默认选入</span></label><Menu label={'联系方式 ' + (index + 1) + ' 的操作'} icon={<IconDots size={17} />} items={[
          {label: '上移', disabled: index === 0, icon: <IconArrowUp size={15} />, onClick: () => onChange(move(items, item.id, -1))},
          {label: '下移', disabled: index === items.length - 1, icon: <IconArrowDown size={15} />, onClick: () => onChange(move(items, item.id, 1))},
          {label: '移除这一项', icon: <IconTrash size={15} />, onClick: () => onChange(items.filter(other => other.id !== item.id))},
        ]} /></div>
        {['link', 'other'].includes(item.type) ? <Field label="显示名称（选填）" className="contact-custom-label"><input aria-label={'第 ' + (index + 1) + ' 项显示名称'} value={item.label} placeholder="例如 GitHub、作品集" onChange={event => update({label: event.target.value})} /></Field> : null}
      </div>;
    })}</div>}
    {items.some(item => item.visible && item.value.trim()) ? <div className="contact-live-preview"><span>简历中的显示</span><p>{items.filter(item => item.visible && item.value.trim()).map(contactText).join('  ·  ')}</p></div> : null}
  </section>;
}
function RecordEditor({section, entries, library, onChange, onPreview}) {
  const [expanded, setExpanded] = useState(entries[0]?.id || null), [removing, setRemoving] = useState(null), [removed, setRemoved] = useState(null);
  const id = useId();
  const candidates = library.filter(project => !project.archived && (section.key === 'researchEntries' ? /研究/.test(project.tags.join(' ')) : section.key === 'workEntries' ? /实习经历|工作经历/.test(project.tags.join(' ')) : false));
  function add() { const entry = newRecord(); onChange([...entries, entry]); setExpanded(entry.id); }
  function copyProject(project) {
    const entry = {...newRecord(), organization: project.name, title: project.role, period: project.date, description: project.facts.join('\n'), sourceProjectId: project.id};
    onChange([...entries, entry]); setExpanded(entry.id);
  }
  return <section className="profile-form-section"><header><div><h2>{section.label}</h2><p>一段经历一条记录，可调整顺序，并选择是否默认带入新简历。</p></div><div className="profile-section-actions">{candidates.length ? <Menu label="从已有项目素材复制" className="source-copy-menu" value="从素材复制" items={candidates.map(project => ({label: project.name, disabled: entries.some(entry => entry.sourceProjectId === project.id), onClick: () => copyProject(project)}))} /> : null}{entries.length ? <Button variant="secondary" onClick={add}><IconPlus size={16} />添加{section.singular}</Button> : null}</div></header>
    {removed ? <div className="profile-inline-notice" role="status"><span>已从本次编辑中移除，保存后生效。</span><Button variant="ghost" onClick={() => { const next = [...entries]; next.splice(Math.min(removed.index, next.length), 0, removed.entry); onChange(next); setRemoved(null); }}>撤销移除</Button></div> : null}
    <div className="profile-record-list">{entries.map((entry, index) => {
      const open = expanded === entry.id, update = patch => onChange(entries.map(item => item.id === entry.id ? {...item, ...patch} : item));
      return <article className={'profile-record-card ' + (open ? 'is-open' : '')} key={entry.id}>
        <header className="profile-record-summary"><span className="profile-record-number">{String(index + 1).padStart(2, '0')}</span><button type="button" aria-expanded={open} aria-controls={id + entry.id} onClick={() => setExpanded(open ? null : entry.id)}><span><strong>{entry.organization || '未命名' + section.singular}</strong><small>{[entry.title, entry.period].filter(Boolean).join(' · ') || '填写名称、时间与经历细节'}</small></span><IconChevronDown size={17} /></button><div className="record-order-actions"><IconButton label={'上移第 ' + (index + 1) + ' 条经历'} disabled={!index} onClick={() => onChange(move(entries, entry.id, -1))}><IconArrowUp size={16} /></IconButton><IconButton label={'下移第 ' + (index + 1) + ' 条经历'} disabled={index === entries.length - 1} onClick={() => onChange(move(entries, entry.id, 1))}><IconArrowDown size={16} /></IconButton></div></header>
        <div className="record-preview-row"><span>{entry.visible ? '默认选入新简历' : '仅保留在资料库'}</span><button type="button" aria-label={'完整预览：' + (entry.organization || '未命名经历')} onClick={event => onPreview(entry.id, event)}><IconEye size={16} />完整预览</button></div>
        {open ? <div className="profile-record-fields" id={id + entry.id}>
          <div className="field-grid"><Field label={section.organization}><input value={entry.organization} onChange={event => update({organization: event.target.value})} /></Field><Field label={section.title}><input value={entry.title} onChange={event => update({title: event.target.value})} /></Field></div>
          <Field label="起止时间" hint="支持月份或自由填写，例如 2025.07—2025.09、2026.07—至今。"><input className="profile-period" value={entry.period} placeholder="开始时间—结束时间" onChange={event => update({period: event.target.value})} /></Field>
          <Field label={section.description} hint={section.key === 'researchEntries' ? '把已完成的分析、已有结果和计划验证分开描述。' : section.key === 'workEntries' ? '写清你负责什么、采取了什么行动、有什么可确认的产出。支持分段，不必先压缩成简历。' : '可填写课程、奖学金、竞赛与相关学习经历。'}><MaterialTextArea rows={4} value={entry.description} onChange={event => update({description: event.target.value})} /></Field>
          {entry.sourceProjectId ? <p className="quiet-note">已从项目素材复制；原素材仍保留，两处内容独立编辑。</p> : null}
          <div className="record-bottom-actions"><label className="profile-checkbox"><input type="checkbox" checked={entry.visible} onChange={event => update({visible: event.target.checked})} /><span>新建简历时默认选入</span></label><Button variant="ghost" onClick={() => setRemoving(entry.id)}><IconTrash size={15} />移除经历</Button></div>
          {removing === entry.id ? <div className="profile-inline-notice" role="alert"><span>从资料库移除这段经历？已创建的简历会保留原内容。</span><Button variant="ghost" onClick={() => setRemoving(null)}>取消</Button><Button variant="secondary" onClick={() => {setRemoved({entry, index}); onChange(entries.filter(item => item.id !== entry.id)); setRemoving(null);}}>移除</Button></div> : null}
        </div> : null}
      </article>;
    })}</div>
    {!entries.length ? <EmptyState icon={<IconPlus size={24} />} title={'记录第一段' + section.singular} action={<Button variant="secondary" onClick={add}>添加{section.singular}</Button>}>每段经历独立保存，之后可以为不同岗位挑选。</EmptyState> : null}
  </section>;
}

const groupLabels = {name: '姓名', contactItems: '联系方式', workEntries: '实习与工作经历', educationEntries: '教育背景', researchEntries: '研究经历', summary: '个人简介', skills: '专业能力'};
function ApplyProfilePage({profile, doc, tab, onBack, onApply}) {
  const [selection, setSelection] = useState(() => profileSelections(profile));
  const [groups, setGroups] = useState(() => tab === 'basics' ? ['name', 'contactItems'] : [tab]);
  const current = normalizeProfile(doc.resume);
  return <Page title="选择要更新到简历的资料" description={'目标简历：' + doc.title + '。只替换勾选的部分，应用后可以撤销。'} className="page-wide profile-apply-page" onBack={onBack} backLabel="返回资料库" dirty footer={<><span className="footer-note">项目文案、排版与其他简历保持独立</span><Button disabled={!groups.length} onClick={() => onApply(profile, selection, groups)}>应用所选内容<IconCheck size={16} /></Button></>}>
    <div className="profile-apply-list">{Object.entries(groupLabels).map(([key, label]) => {
      const list = Array.isArray(profile[key]), active = groups.includes(key);
      return <section key={key} className={'profile-apply-group ' + (active ? 'chosen' : '')}><label className="profile-apply-toggle"><input type="checkbox" checked={active} onChange={event => setGroups(old => event.target.checked ? [...old, key] : old.filter(item => item !== key))} /><span><strong>{label}</strong><small>{list ? '当前简历 ' + current[key].length + ' 项 · 资料库 ' + profile[key].length + ' 项' : '当前：' + (current[key] || '未填写')}</small></span></label>
        {active ? <div className="profile-apply-content">{list ? <>{profile[key].map(item => <label className="profile-apply-entry" key={item.id}><input type="checkbox" checked={selection[key].includes(item.id)} onChange={event => setSelection(old => ({...old, [key]: event.target.checked ? [...old[key], item.id] : old[key].filter(id => id !== item.id)}))} /><span><strong>{key === 'contactItems' ? contactLabel(item) + '：' + item.value : item.organization || '未命名经历'}</strong>{key !== 'contactItems' ? <small>{[item.title, item.period, item.description].filter(Boolean).join('\n')}</small> : null}</span></label>)}{!selection[key].length ? <p className="profile-clear-note">应用后会清空当前简历的这一部分，资料库原件仍保留。</p> : null}</> : <><span className="profile-replacement-label">替换为</span><p>{profile[key] || '留空'}</p></>}<details className="profile-current-copy"><summary>查看当前简历中的内容</summary><p>{list ? current[key].map(item => key === 'contactItems' ? contactText(item) : [item.organization, item.title, item.period, item.description].filter(Boolean).join('\n')).join('\n\n') || '尚未填写' : current[key] || '尚未填写'}</p></details></div> : null}
      </section>;
    })}</div>
  </Page>;
}

export function LibraryPage({profile, library, doc, initialTab = 'basics', onBack, onSaveProfile, onApplyProfile, projectProps, saveState, hasActiveDocument = true}) {
  const navigation = useContext(PageNavigationContext);
  const { reading, openReading, closeReading } = useReadingView();
  const tabsId = useId(), focusTabs = useRef(false);
  const [baseline, setBaseline] = useState(() => ({source: JSON.stringify(profile), draft: normalizeProfile(profile)}));
  const [draft, setDraft] = useState(() => baseline.draft), [tab, setTab] = useState(initialTab), [review, setReview] = useState(false), [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline.draft), externalChanged = JSON.stringify(profile) !== baseline.source;
  const reset = () => {const value = normalizeProfile(profile); setBaseline({source: JSON.stringify(profile), draft: value}); setDraft(value);};
  useEffect(() => { if (externalChanged && !dirty) reset(); }, [externalChanged, dirty, profile]);
  function changeTab(next) {
    if (next === tab) return;
    const activate = () => {focusTabs.current = true; setTab(next);};
    if (next === 'projects' || tab === 'projects') navigation?.request(() => {if (dirty) reset(); activate();});
    else activate();
  }
  function save() {
    if (externalChanged) return false;
    const value = syncLegacyFields(draft);
    if (onSaveProfile(value, baseline.source) === false) return false;
    setDraft(value); setBaseline({source: JSON.stringify(value), draft: value}); setSaved(true); navigation?.stay(); return true;
  }
  const nav = <LibraryNav id={tabsId} value={tab} onChange={changeTab} draft={draft} library={library} autoFocus={focusTabs.current} />;
  if (review) return <ApplyProfilePage profile={draft} doc={doc} tab={tab} onBack={() => {navigation?.stay(); setReview(false);}} onApply={onApplyProfile} />;
  if (tab === 'projects') return <ProjectsPage {...projectProps} library={library} doc={doc} onBack={onBack} libraryNavigation={nav} libraryTabsId={tabsId} />;
  const section = recordSections.find(item => item.key === tab);
  const stateLabel = ({syncing: '正在同步', synced: '已同步到云端', saved: '已保存到本机', saving: '正在保存', offline: '本机草稿已保留', expired: '等待重新登录', error: '保存失败，请查看提示'})[saveState] || '资料保存在当前工作区';
  return <Page title={reading ? '完整经历预览' : '资料库'} description="把经历完整记下来，再为每次投递选择合适的内容。" className={'page-wide profile-library-page' + (reading ? ' experience-previewing' : '')} onBack={reading ? closeReading : onBack} backLabel={reading ? '返回编辑' : '返回简历'} dirty={dirty} navigation={<div className="experience-hidden" hidden={!!reading}>{nav}</div>} footer={<><span className="footer-note" role="status">{dirty ? '有未保存的资料' : saved ? stateLabel : hasActiveDocument ? '保存资料不会自动改动已有简历' : '资料可独立保存，新建简历后再应用'}</span><div className="profile-footer-actions">{reading ? <Button variant="secondary" onClick={closeReading}>继续编辑</Button> : <Button variant="secondary" disabled={externalChanged || !hasActiveDocument} title={!hasActiveDocument ? "先新建简历，再应用资料" : undefined} onClick={() => {if (save()) setReview(true);}}>更新到简历<IconArrowRight size={16} /></Button>}<Button disabled={!dirty || externalChanged} onClick={save}>保存资料</Button></div></>}>
    {externalChanged && dirty ? <div className="profile-inline-notice" role="alert"><span>资料已在其他位置更新，当前编辑仍保留。请先核对最新资料。</span><Button variant="secondary" onClick={() => navigation?.request(reset)}>放弃本次编辑并载入最新资料</Button></div> : null}
    {reading ? <ExperiencePreview model={recordPreview(draft[tab].find(entry => entry.id === reading), section)} label={dirty ? '当前编辑草稿 · 尚未保存' : '资料库 · 完整经历'} /> : null}
    <div className="library-tab-panel experience-hidden" hidden={!!reading} role="tabpanel" id={`${tabsId}-${tab}-panel`} aria-labelledby={`${tabsId}-${tab}-tab`}>
    {tab === 'basics' ? <><section className="profile-form-section"><Field label="简历姓名" hint="登录邮箱和账号安全请在“账号与安全”中管理。"><input className="profile-name-input" autoComplete="name" value={draft.name} onChange={event => setDraft(old => ({...old, name: event.target.value}))} placeholder="你希望在简历中使用的姓名" /></Field></section><ContactEditor items={draft.contactItems} onChange={contactItems => setDraft(old => ({...old, contactItems}))} /><section className="profile-form-section"><header><div><h2>简介与能力</h2><p>作为新简历的基础表达，之后可以针对岗位单独修改。</p></div></header><Field label="个人简介"><MaterialTextArea rows={3} value={draft.summary} onChange={event => setDraft(old => ({...old, summary: event.target.value}))} /></Field><Field label="专业能力"><MaterialTextArea rows={3} value={draft.skills} onChange={event => setDraft(old => ({...old, skills: event.target.value}))} /></Field></section></> : <RecordEditor key={tab} section={section} entries={draft[tab]} library={library} onPreview={openReading} onChange={entries => setDraft(old => ({...old, [tab]: entries}))} />}
    </div>
  </Page>;
}
