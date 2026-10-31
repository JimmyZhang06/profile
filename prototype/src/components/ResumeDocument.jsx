import { forwardRef } from 'react';
import { IconPlus } from '@tabler/icons-react';
import { fieldLabel, fieldValue } from '../lib/workspace.js';
import { getProjectBullets } from '../lib/projects.js';
import { getResumeDesign, resumeDesignStyle } from '../lib/resumeDesign.js';
import { marksForField, textSegments } from '../lib/richText.js';
import { contactLabel, visibleContacts, visibleRecords } from '../lib/profile.js';

function FormattedText({ text, marks }) {
  let offset = 0;
  return text.split('\n').map((line, lineIndex) => {
    const start = offset; offset += line.length + 1;
    const lineMarks = marks.filter(mark => mark.to > start && mark.from < start + line.length).map(mark => ({ ...mark, from: Math.max(0, mark.from - start), to: Math.min(line.length, mark.to - start) }));
    return <span className="resume-text-line" key={lineIndex}>{line ? textSegments(line, lineMarks).map((part, index) => {
      let content = part.text;
      if (part.underline) content = <u>{content}</u>;
      if (part.italic) content = <em>{content}</em>;
      if (part.bold) content = <strong>{content}</strong>;
      return <span key={index}>{content}</span>;
    }) : <br />}</span>;
  });
}
function Editable({ field, label, resume, selected, onSelect, onEdit, as = 'p', className = '', placeholder = '点击填写', readOnly }) {
  const Tag = as, value = fieldValue(resume, field);
  const content = value ? <FormattedText text={value} marks={marksForField(resume, field, value)} /> : placeholder;
  return <Tag className={'resume-editable ' + className + (selected === field && !readOnly ? ' selected' : '')} data-resume-field={field}>
    {readOnly ? <span className={'resume-field-text' + (!value ? ' field-placeholder' : '')}>{content}</span>
      : <button type="button" aria-label={'编辑' + (label || fieldLabel(resume, field))} className={!value ? 'field-placeholder' : ''} onClick={() => onSelect(field)} onDoubleClick={() => onEdit(field)}>{content}</button>}
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
    {entry.description ? <Editable {...props} field={entry.id + ':description'} /> : null}
  </div>)}</Section>;
}
export const ResumeDocument = forwardRef(function ResumeDocument({ resume: r, selected, onSelect, onEdit, onOpen, readOnly = false, style, className = '' }, ref) {
  const design = getResumeDesign(r), props = { resume: r, selected, onSelect, onEdit, readOnly };
  return <article ref={ref} className={`resume-page resume-document template-${design.template} font-${design.font} ${className}`} style={{ ...resumeDesignStyle(r), ...style }} aria-label={readOnly ? undefined : '简历预览'}>
    <header className="resume-intro">
      <Editable {...props} field="name" as="h1" placeholder="你的姓名" />
      <Editable {...props} field="target" className="resume-target" placeholder="求职方向" />
      {Array.isArray(r.contactItems) ? <div className="resume-contact resume-contacts">{visibleContacts(r).map(item => <span className="resume-contact-item" key={item.id}>{item.label ? <span>{item.label}：</span> : null}<Editable {...props} field={item.id + ':value'} label={contactLabel(item)} as="span" /></span>)}</div> : <Editable {...props} field="contact" className="resume-contact" placeholder="联系方式 / 城市" />}
    </header>
    <div className="resume-columns">
      <div className="resume-main">
        <Section title="个人简介" className="resume-summary-section"><Editable {...props} field="summary" placeholder="写下你的工作背景与核心优势" /></Section>
        <Section title="项目经历" className="resume-projects-section">
          {r.projectIds.map(id => { const p = r.sources.find(source => source.id === id); return p ? <div className="resume-project" key={id}>
            <div className="resume-line"><h3>{p.name}<span>{p.role ? ' / ' + p.role : ''}</span></h3><time>{p.date}</time></div>
            <ul>{getProjectBullets(r, id).map((_, index) => <li key={index}><Editable {...props} field={id + ':' + index} placeholder="补充你的职责与成果" /></li>)}</ul>
          </div> : null; })}
          {!r.projectIds.length && !readOnly ? <button className="empty-projects" onClick={() => onOpen('projects')}><IconPlus size={18} />从素材库添加经历</button> : null}
        </Section>
        <Records section="researchEntries" title="研究经历" className="resume-research-section" props={props} />
        {Array.isArray(r.workEntries) ? <Records section="workEntries" title="实习与工作经历" className="resume-experience-section" props={props} /> : <Section title="工作经历" className="resume-experience-section">
          <div className="resume-line"><Editable {...props} field="company" as="h3" placeholder="公司 / 职位" /><Editable {...props} field="period" className="resume-date" placeholder="起止时间" /></div>
          <Editable {...props} field="experience" placeholder="概述你的职责范围与工作成果" />
        </Section>}
      </div>
      <div className="resume-aside">
        {Array.isArray(r.educationEntries) ? <Records section="educationEntries" title="教育背景" className="resume-education-section" props={props} /> : <Section title="教育背景" className="resume-education-section">
          <div className="resume-line"><Editable {...props} field="school" as="h3" placeholder="学校名称" /><Editable {...props} field="educationPeriod" className="resume-date" placeholder="起止时间" /></div>
          <Editable {...props} field="major" placeholder="专业与学历" />
        </Section>}
        <Section title="专业能力" className="resume-skills-section"><Editable {...props} field="skills" placeholder="写下与岗位相关的能力、工具或证书" /></Section>
      </div>
    </div>
  </article>;
});
