import {useEffect, useMemo, useRef} from 'react';
import {IconChevronDown} from '@tabler/icons-react';
import {Button} from './ui/index.jsx';
import {SelectField} from './ui/SelectField.jsx';
import {deliveryDesign} from '../lib/delivery.js';
import {getResumeDesign} from '../lib/resumeDesign.js';
import {reviewExperiences, reviewFields, reviewValue, setReviewExperience, setReviewValue} from '../lib/deliveryReview.js';
import {assistantFieldIds} from '../lib/workspace.js';
import {getProjectBullets} from '../lib/projects.js';
import {DeliveryRewrite} from './DeliveryRewrite.jsx';

function numberOptions(values, current, unit) {
  return [...new Set([...values, current])].sort((a,b) => a - b).map((n) => ({value:String(n), label:n + unit}));
}

export function DeliveryProofread({doc, resume, field, jump, busy, settings, onField, onChange, onTailor, onError}) {
  const editor = useRef(null), layout = useRef(null), experiences = useRef(null);
  const options = useMemo(() => reviewFields(resume), [resume]);
  const selected = options.find((o) => o.value === field || o.paperField === field || (field === '@school' && o.value === 'school')) || options.find((o) => o.value === 'summary');
  const value = reviewValue(resume, selected.value);
  const proposal = doc.delivery?.changes.find((c) => c.field === selected.paperField);
  const entries = reviewExperiences(resume);
  const design = getResumeDesign(resume);
  const projectId = selected.paperField?.split(':')[0];
  const points = resume.projectIds.includes(projectId) ? getProjectBullets(resume,projectId) : null;
  useEffect(() => {
    if (!jump) return;
    if (jump.area === 'field') { editor.current?.focus(); return; }
    const section = jump.area === 'experiences' ? experiences.current : layout.current;
    if (section) { section.open = true; section.querySelector('summary')?.focus(); }
  }, [jump]);
  function write(text) {
    try { onChange(setReviewValue(resume, selected.value, text)); }
    catch (error) { onError(error.message); }
  }
  return <fieldset className="delivery-proofread" disabled={busy} aria-label="一页校稿工具">
    <SelectField label="编辑位置" value={selected.value} options={options} disabled={busy} onChange={onField} viewportMenu />
    <textarea ref={editor} className="delivery-field-editor" aria-label={'校稿正文 · ' + selected.label}
      rows={/description$|:\d+$|summary|skills|experience|major/.test(selected.value) ? 5 : 2}
      value={value} onChange={(e) => write(e.target.value)} placeholder={'填写' + selected.label} />
    <div className="delivery-field-meta">
      <span>{Array.from(value.trim()).length} 字</span>
      {proposal && !value.trim() && <Button variant="ghost" onClick={() => write(proposal.text)}>恢复生成原文</Button>}
      {proposal?.expanded && value !== proposal.expanded &&
        <Button variant="ghost" onClick={() => write(proposal.expanded)}>使用补充细节版</Button>}
      {proposal?.compact && proposal.compact.length < proposal.text.length &&
        <Button variant="ghost" onClick={() => write(value === proposal.compact ? proposal.text : proposal.compact)}>
          {value === proposal.compact ? '恢复生成时的长版' : '使用精简措辞'}
        </Button>}
    </div>
    {points && points.length > 0 && <Button variant="ghost" onClick={() => {
      const empty = points.findIndex((_,i) => !reviewValue(resume,projectId+':'+i).trim());
      if (empty < 0) onChange({...resume,projectBullets:{...resume.projectBullets,[projectId]:[...points,'']}});
      onField(projectId+':'+(empty < 0 ? points.length : empty));
      editor.current?.focus();
    }}>补充一个项目要点</Button>}
    {proposal?.evidence.length > 0 && <details className="delivery-field-evidence">
      <summary>对照这段的原文依据</summary>
      {proposal.evidence.map((e, i) => <blockquote key={i}><small>{e.label}</small>{e.quote}</blockquote>)}
    </details>}
    {settings && assistantFieldIds(resume).includes(selected.paperField) && <DeliveryRewrite key={selected.paperField}
      doc={doc} resume={resume} selected={selected.paperField} value={value} settings={settings} onApply={write} />}
    <details ref={experiences} className="delivery-control-group">
      <summary>本稿展示的经历 <span>{entries.filter((item) => item.included).length} 项 <IconChevronDown size={14} /></span></summary>
      {entries.map((item) => <label className="delivery-experience" key={item.section + ':' + item.id}>
        <input type="checkbox" checked={item.included} onChange={(e) => onChange(setReviewExperience(resume, item, e.target.checked))} />
        <span>{item.name}</span>
      </label>)}
      <Button variant="ghost" onClick={onTailor}>从全部资料重新选材</Button>
    </details>
    <details ref={layout} className="delivery-control-group">
      <summary>纸面排版 <span>{design.fontSize} pt <IconChevronDown size={14} /></span></summary>
      <div className="delivery-layout-options">
        <SelectField label="正文字号" value={String(design.fontSize)}
          options={numberOptions([10.5, 11, 11.5, 12], design.fontSize, ' pt')}
          onChange={(size) => onChange({...resume, design:{...design, fontSize:Number(size)}})} viewportMenu disabled={busy} />
        <SelectField label="行距" value={String(design.lineHeight)} options={numberOptions([1.35,1.4,1.5,1.65,1.8], design.lineHeight, ' 倍')}
          onChange={(height) => onChange({...resume, design:{...design, lineHeight:Number(height)}})} viewportMenu disabled={busy} />
        <SelectField label="页边距" value={String(design.margin)} options={numberOptions([12,14,15,18,20], design.margin, ' mm')}
          onChange={(margin) => onChange({...resume, design:{...design, margin:Number(margin)}})} viewportMenu disabled={busy} />
      </div>
      <Button variant="secondary" onClick={() => onChange({...resume, design:deliveryDesign(), font:'sans', sectionOrder:'application'})}>应用单栏标准版式</Button>
      <p className="quiet-note">标准版式使用 11 pt 正文、1.5 倍行距和 15 mm 页边距。</p>
    </details>
  </fieldset>;
}
