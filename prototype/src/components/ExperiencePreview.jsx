import { useEffect, useId, useRef } from 'react';
import { IconPencil } from '@tabler/icons-react';
import { Button, Page } from './ui/index.jsx';
import { selectionPreview } from '../lib/experiencePreview.js';

export function ExperiencePreview({ model, label = '资料库 · 完整经历', note, onEdit }) {
  const title = useRef(null), id = useId();
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, []);
  return <div className="experience-reading-view">
    <div className="experience-reading-toolbar">
      <span>{label}</span>
      {onEdit ? <Button variant="secondary" onClick={onEdit}><IconPencil size={16} />编辑资料</Button> : null}
    </div>
    <article className="experience-sheet" aria-labelledby={id}>
      <header className="experience-sheet-heading">
        <h2 id={id} ref={title} tabIndex={-1}>{model.title}</h2>
        {model.role || model.period ? <div className="experience-sheet-meta">{model.role ? <span>{model.role}</span> : null}{model.period ? <time>{model.period}</time> : null}</div> : null}
        {model.tags?.length ? <div className="experience-sheet-tags">{model.tags.map(tag => <span key={tag}>{tag}</span>)}</div> : null}
      </header>
      <div className="experience-sheet-body">{model.sections.length ? model.sections.map((section, index) => <section key={index}>
        {section.title ? <h3>{section.title}</h3> : null}
        {section.text ? <p>{section.text}</p> : null}
        {!section.text && !section.items?.length ? <p className="experience-empty">这段内容尚未填写。</p> : null}
        {section.items ? <ul>{section.items.map((text, i) => <li key={i} className={section.highlighted === i ? 'is-referenced' : ''}>{section.highlighted === i ? <span className="reference-caption">当前引用</span> : null}{text || <span className="experience-empty">此条尚未填写</span>}</li>)}</ul> : null}
      </section>) : <p className="experience-empty">这段经历还没有正文，可以返回编辑继续补充。</p>}</div>
    </article>
    {note ? <p className="experience-reading-note">{note}</p> : null}
  </div>;
}

export function SelectedExperiencePage({ doc, selected, onBack }) {
  const model = selectionPreview(doc.resume, selected);
  return <Page title={model.kind === 'experience' ? '完整经历预览' : '引用内容预览'} description="连贯查看当前简历中的内容。" className="experience-preview-page experience-previewing" onBack={onBack} backLabel="返回对话">
    <ExperiencePreview model={model} label="当前简历" note="预览不会扩大对话的调整范围；发送时仍只针对当前选中的段落。" />
  </Page>;
}
