import { Fragment, forwardRef } from 'react';
import { IconPlus } from '@tabler/icons-react';
import { fieldLabel, fieldValue } from '../lib/workspace.js';
import { projectPointIndices } from '../lib/projects.js';
import { getResumeDesign, resumeDesignStyle, singleColumnSections } from '../lib/resumeDesign.js';
import { marksForField, textSegments } from '../lib/richText.js';
import { contactLabel, visibleContacts, visibleRecords } from '../lib/profile.js';

function FormattedText({ text, marks, points }) {
  let offset = 0;
  return text.split('\n').map((line, lineIndex) => {
    const start = offset; offset += line.length + 1;
    const lineMarks = marks.filter(mark => mark.to > start && mark.from < start + line.length).map(mark => ({ ...mark, from: Math.max(0, mark.from - start), to: Math.min(line.length, mark.to - start) }));
    return <span className="resume-text-line" role={points ? 'listitem' : undefined} key={lineIndex}>{line ? textSegments(line, lineMarks).map((part, index) => {
      let content = part.text;
      if (part.underline) content = <u>{content}</u>;
      if (part.italic) content = <em>{content}</em>;
      if (part.bold) content = <strong>{content}</strong>;
      return <span key={index}>{content}</span>;
    }) : <br />}</span>;
  });
}
function Editable({ field, label, resume, selected, writingField, editing, onSelect, onEdit, onPick, as = 'p', className = '', placeholder = '点击填写', readOnly, points = false }) {
  const Tag = as, value = fieldValue(resume, field);
  const active = editing?.field === field;
  if (readOnly && !value?.trim() && !active) return null;
  const lines = points && value.includes('\n');
  const content = value ? <FormattedText text={value} marks={marksForField(resume, field, value)} points={lines} /> : placeholder;
  return <Tag className={'resume-editable ' + className + (lines ? ' resume-point-lines' : '') + (selected === field && !readOnly ? ' selected' : '')} data-resume-field={field} data-writing={writingField === field || undefined}>
    {active ? <span className="paper-editor-host" ref={editing.mount} /> : readOnly ? <span className={'resume-field-text' + (!value ? ' field-placeholder' : '')} role={lines ? 'list' : undefined}
      {...(onPick ? {role: 'button', tabIndex: 0, 'aria-label': '校改' + (label || fieldLabel(resume, field)),
        onClick: () => onPick(field), onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPick(field); }
        }} : {})}>{content}</span>
      : <button type="button" aria-label={'编辑' + (label || fieldLabel(resume, field))} className={!value ? 'field-placeholder' : ''} onClick={() => (onEdit || onSelect)(field)}>{content}</button>}
  </Tag>;
}
function Section({ title, className = '', children }) {
  return <section className={'resume-section ' + className}><h2>{title}</h2><div className="resume-section-body">{children}</div></section>;
}
function Records({ section, title, className, props }) {
  const entries = visibleRecords(props.resume, section);
  if (!entries.length) return null;
  return <Section title={title} className={className}>{entries.map(entry => <div className="resume-record" key={entry.id}>
    <div className="resume-line"><div className="resume-record-heading"><Editable {...props} field={entry.id + ':organization'} as="h3" placeholder="补充名称" />{entry.title ? <Editable {...props} field={entry.id + ':title'} className="resume-record-role" /> : null}</div>{entry.period ? <Editable {...props} field={entry.id + ':period'} className="resume-date" /> : null}</div>
    {entry.description || props.editing?.field === entry.id + ':description' ? <Editable {...props} field={entry.id + ':description'} points={section !== 'educationEntries'} /> : null}
  </div>)}</Section>;
}
export const ResumeDocument = forwardRef(function ResumeDocument({ resume: r, selected, editing, writingField, onSelect, onEdit, onOpen, onPick, readOnly = false, style, className = '' }, ref) {
  const design = getResumeDesign(r), props = { resume: r, selected, editing, writingField, onSelect, onEdit, onPick, readOnly };
  const summary = (!readOnly || r.summary?.trim()) && <Section title="个人简介" className="resume-summary-section"><Editable {...props} field="summary" placeholder="写下你的工作背景与核心优势" /></Section>;
  const projects = (!readOnly || r.projectIds.length > 0) && <Section title="项目经历" className="resume-projects-section">
    {r.projectIds.map(id => { const p = r.sources.find(source => source.id === id); return p ? <div className="resume-project" key={id}>
      <div className="resume-line"><div className="resume-record-heading"><Editable {...props} field={id+':name'} as="h3" /><Editable {...props} field={id+':role'} className="resume-record-role" placeholder="项目角色" /></div><Editable {...props} field={id+':date'} as="time" className="resume-date" placeholder="起止时间" /></div>
      <ul>{projectPointIndices(r,id).map((index) => !readOnly || fieldValue(r, id + ':' + index).trim() || editing?.field === id + ':' + index ? <li key={index}><Editable {...props} field={id + ':' + index} placeholder="补充你的职责与成果" /></li> : null)}</ul>
    </div> : null; })}
    {!r.projectIds.length && !readOnly ? <button className="empty-projects" onClick={() => onOpen('projects')}><IconPlus size={18} />从素材库添加经历</button> : null}
  </Section>;
  const research = <Records section="researchEntries" title="研究经历" className="resume-research-section" props={props} />;
  const work = Array.isArray(r.workEntries) ? <Records section="workEntries" title="实习与工作经历" className="resume-experience-section" props={props} /> : (!readOnly || r.company || r.experience) && <Section title="工作经历" className="resume-experience-section">
    <div className="resume-line"><Editable {...props} field="company" as="h3" placeholder="公司 / 职位" /><Editable {...props} field="period" className="resume-date" placeholder="起止时间" /></div><Editable {...props} field="experience" placeholder="概述你的职责范围与工作成果" />
  </Section>;
  const education = Array.isArray(r.educationEntries) ? <Records section="educationEntries" title="教育背景" className="resume-education-section" props={props} /> : (!readOnly || r.school || r.major) && <Section title="教育背景" className="resume-education-section">
    <div className="resume-line"><Editable {...props} field="school" as="h3" placeholder="学校名称" /><Editable {...props} field="educationPeriod" className="resume-date" placeholder="起止时间" /></div><Editable {...props} field="major" placeholder="专业与学历" />
  </Section>;
  const skills = (!readOnly || r.skills?.trim()) && <Section title="专业能力" className="resume-skills-section"><Editable {...props} field="skills" placeholder="写下与岗位相关的能力、工具或证书" /></Section>;
  const order = singleColumnSections(r), sections = {summary, education, work, projects, research, skills};
  return <article ref={ref} className={`resume-page resume-document template-${design.template} font-${design.font} ${className}`} style={{ ...resumeDesignStyle(r), ...style }} aria-label={readOnly ? undefined : '简历预览'}>
    <header className="resume-intro">
      <Editable {...props} field="name" as="h1" placeholder="你的姓名" />
      <Editable {...props} field="target" className="resume-target" placeholder="求职方向" />
      {Array.isArray(r.contactItems) ? <div className="resume-contact resume-contacts">{visibleContacts(r).map(item => <span className="resume-contact-item" key={item.id}>{item.label ? <span>{item.label}：</span> : null}<Editable {...props} field={item.id + ':value'} label={contactLabel(item)} as="span" /></span>)}</div> : <Editable {...props} field="contact" className="resume-contact" placeholder="联系方式 / 城市" />}
    </header>
    {order ? <div className="resume-columns application-order"><div className="resume-main">{order.map(key => <Fragment key={key}>{sections[key]}</Fragment>)}</div></div>
      : <div className="resume-columns"><div className="resume-main">{summary}{projects}{research}{work}</div><div className="resume-aside">{education}{skills}</div></div>}
    {(r.additional || editing?.field === 'additional') && <Section title="补充信息"><Editable {...props} field="additional" /></Section>}
  </article>;
});
