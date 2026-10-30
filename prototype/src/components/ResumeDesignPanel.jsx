import { useEffect, useRef, useState } from 'react';
import { IconArrowBackUp, IconCheck, IconLayout, IconTypography, IconSpacingVertical, IconX } from '@tabler/icons-react';
import { IconButton } from './ui/index.jsx';
import { SelectField } from './ui/SelectField.jsx';
import { ResumeDocument } from './ResumeDocument.jsx';
import { designLimits, fontOptions, getResumeDesign, resumeTemplates, templateDesign, releaseDesign, resetResumeDesign } from '../lib/resumeDesign.js';

function NumberSetting({ name, label, value, unit, step = 1, onChange }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function commit() {
    const number = Number(draft), [min, max] = designLimits[name];
    if (!draft.trim() || !Number.isFinite(number)) { setDraft(String(value)); return; }
    const next = Math.min(max, Math.max(min, Math.round(number / step) * step));
    setDraft(String(next)); if (next !== value) onChange({ [name]: next });
  }
  return <label className="design-number-setting"><span>{label}</span><span className="design-number-input"><input type="number" inputMode="decimal" aria-label={label} min={designLimits[name][0]} max={designLimits[name][1]} step={step} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} /><small>{unit}</small></span></label>;
}
function TemplateThumbnail({ resume, template }) {
  const element = useRef(null), [width, setWidth] = useState(108);
  useEffect(() => { const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); observer.observe(element.current); return () => observer.disconnect(); }, []);
  return <span className="template-thumbnail" ref={element} aria-hidden="true" inert>
    <ResumeDocument resume={{ ...resume, design: template.design || templateDesign(template.id) }} readOnly style={{ transform: `scale(${width / 794})` }} />
  </span>;
}
export function ResumeDesignPanel({ resume, disabled, onChange, onClose, catalog }) {
  const [tab, setTab] = useState('type'), design = getResumeDesign(resume);
  const templates = catalog || resumeTemplates;
  const current = design.catalogId ? { name: design.catalogName + ' · v' + design.catalogVersion } : resumeTemplates.find(template => template.id === design.template);
  const update = catalog?.find(template => template.id === design.catalogId && template.version !== design.catalogVersion);
  function change(patch) { if (!disabled) onChange({ ...design, ...patch }); }
  return <aside id="resume-design-panel" className={'resume-design-panel' + (disabled ? ' is-editing' : '') + (tab === 'templates' ? ' is-templates' : '')} aria-label="排版与模板">
    <header className="design-panel-header"><strong>排版与模板</strong><IconButton label="收起排版面板" onClick={onClose}><IconX size={16} /></IconButton></header>
    <div className="design-panel-tabs" role="group" aria-label="排版工具分类">
      <button type="button" aria-pressed={tab === 'type'} onClick={() => setTab('type')}><IconTypography size={16} />文字</button>
      <button type="button" aria-pressed={tab === 'space'} onClick={() => setTab('space')}><IconSpacingVertical size={16} />间距</button>
      <button type="button" aria-pressed={tab === 'templates'} onClick={() => setTab('templates')}><IconLayout size={16} />模板</button>
      <IconButton className="design-inline-reset" label="恢复模板默认排版" disabled={disabled} onClick={() => onChange(resetResumeDesign(resume))}><IconArrowBackUp size={16} /></IconButton>
    </div>
    <div className="design-panel-scroll">{update ? <div className="template-update-note"><span>当前模板有 v{update.version} 新版本，已有排版保持原样。</span><button disabled={disabled} onClick={() => onChange(releaseDesign(update))}>应用新版本</button></div> : null}
      {disabled ? <p className="design-note" role="status">保存当前文字后，可以继续调整排版。</p> : null}
      {tab !== 'templates' ? <fieldset className="design-settings" disabled={disabled}>
        <legend className="sr-only">{tab === 'type' ? '文字排版' : '间距与留白'}</legend>
        {tab === 'type' ? <section className="design-settings-section" aria-label="文字排版">
          <SelectField className="design-select" label="简历字体" value={design.font} options={fontOptions} disabled={disabled} onChange={font => change({ font })} />
          <NumberSetting name="fontSize" label="正文字号" unit="pt" step={.5} value={design.fontSize} onChange={change} />
          <NumberSetting name="headingSize" label="章节字号" unit="pt" step={.5} value={design.headingSize} onChange={change} />
          <NumberSetting name="nameSize" label="姓名字号" unit="pt" value={design.nameSize} onChange={change} />
        </section> : <section className="design-settings-section" aria-label="间距与留白">
          <SelectField className="design-select" label="行间距" value={design.lineHeight} options={[...new Set([1.2, 1.3, 1.4, 1.5, 1.6, 1.65, 1.7, 1.75, 1.8, 1.9, 2, 2.2, 2.4, design.lineHeight])].sort((a, b) => a - b).map(value => ({ value, label: value + ' 倍' }))} disabled={disabled} onChange={lineHeight => change({ lineHeight })} />
          <NumberSetting name="paragraphGap" label="段落间距" unit="px" value={design.paragraphGap} onChange={change} />
          <NumberSetting name="sectionGap" label="章节间距" unit="px" value={design.sectionGap} onChange={change} />
          <NumberSetting name="margin" label="页面留白" unit="mm" value={design.margin} onChange={change} />
        </section>}
        <p className="design-note design-edit-hint">{tab === 'type' ? '双击简历段落，可选中文字加粗。' : '调整后，直接在简历中查看变化。'}</p>
      </fieldset> : <div className="template-gallery">
        <p className="design-note">{templates.length} 款模板，点选后查看完整效果。</p>
        <div className="template-grid">{templates.map(template => <button type="button" key={template.id} className="template-card" disabled={disabled} aria-label={'使用' + template.name + '模板'} aria-pressed={(template.version ? design.catalogId === template.id && design.catalogVersion === template.version : design.template === template.id)} onClick={() => onChange(template.version ? releaseDesign(template) : templateDesign(template.id))}>
          <TemplateThumbnail resume={resume} template={template} />
          <span className="template-card-copy"><span className="template-card-title">{template.name}{(template.version ? design.catalogId === template.id && design.catalogVersion === template.version : design.template === template.id) ? <IconCheck size={16} /> : null}</span>
          <span className="template-description">{template.description}</span></span>
        </button>)}</div>
      </div>}
    </div>
    <footer className="design-panel-footer"><div className="design-current-template"><span>当前模板</span><button type="button" onClick={() => setTab('templates')}>{current.name}<IconLayout size={14} /></button></div><button type="button" className="design-reset" disabled={disabled} onClick={() => onChange(resetResumeDesign(resume))}><IconArrowBackUp size={15} />恢复模板默认排版</button></footer>
  </aside>;
}
