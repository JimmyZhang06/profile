import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { IconPencil, IconSparkles, IconX, IconLink } from '@tabler/icons-react';
import { Button, IconButton } from './ui/index.jsx';
import { PreviewControls } from './PreviewControls.jsx';
import { ResumeDocument } from './ResumeDocument.jsx';
import { fieldLabel, setField } from '../lib/workspace.js';
import { getResumeDesign } from '../lib/resumeDesign.js';

const RichTextEditor = lazy(() => import('./RichTextEditor.jsx'));

export function Canvas({ doc, selected, edit, onSelect, onEdit, onEditChange, onSaveEdit, onCancelEdit, onAsk, onSource, onOpen, focus, onFocus, enabled, active = true, designOpen }) {
  const viewport = useRef(null), paper = useRef(null), [width, setWidth] = useState(800), [height, setHeight] = useState(1123), [zoom, setZoom] = useState('fit');
  const [view, setView] = useState('read'), [readingSize, setReadingSize] = useState(16);
  useEffect(() => { if (designOpen) { setView('read'); setReadingSize(size => Math.max(16, size)); } }, [designOpen]);
  useEffect(() => {
    const observer = new ResizeObserver(entries => entries.forEach(entry => entry.target === viewport.current ? setWidth(entry.contentRect.width) : setHeight(entry.target.offsetHeight)));
    observer.observe(viewport.current); observer.observe(paper.current); return () => observer.disconnect();
  }, []);
  useEffect(() => { if (active && selected) { const element = Array.from(paper.current.querySelectorAll('[data-resume-field]')).find(e => e.dataset.resumeField === selected); element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }, [selected, active]);
  const r = edit ? setField(doc.resume, edit.field, edit.value, edit.marks) : doc.resume;
  const design = getResumeDesign(r), scale = zoom === 'fit' ? Math.min(1.08, Math.max(.25, width / 794)) : Number(zoom) / 100;
  useEffect(() => { if (designOpen) viewport.current?.scrollTo({ top: 0, behavior: 'auto' }); }, [designOpen, design.template]);
  return <section id="resume-preview" className={'canvas-panel ' + (view === 'read' ? 'reading-mode' : 'page-mode')} aria-label="简历编辑画布" style={{ '--resume-reading-size': readingSize + 'px', '--resume-reading-scale': view === 'read' ? readingSize / 14 : 1 }}>
    <style media="print">{`@page { size: A4; margin: ${design.margin}mm; }`}</style>
    <div className="canvas-body">
      <div className="paper-scroll" ref={viewport}>
        <div className="paper-frame" style={view === 'page' ? { width: 794 * scale, height: height * scale } : undefined}>
          <ResumeDocument ref={paper} resume={r} selected={selected} onSelect={onSelect} onEdit={onEdit} onOpen={onOpen} style={view === 'page' ? { transform: 'scale(' + scale + ')' } : undefined} />
        </div>
      </div>
    </div>
    {edit ? <Suspense fallback={<div className="editor-loading" role="status">正在打开编辑器…</div>}><RichTextEditor key={doc.id + ':' + edit.field} label={fieldLabel(r, edit.field)} value={edit.value} marks={edit.marks} onChange={onEditChange} onSave={onSaveEdit} onCancel={onCancelEdit} /></Suspense> : selected ? <div className="selection-bar" role="toolbar" aria-label="段落操作"><Button variant="ghost" onClick={() => onEdit(selected)}><IconPencil size={16} />编辑文字</Button><Button variant="ghost" disabled={!enabled} onClick={() => onAsk(selected)}><IconSparkles size={16} />对话调整</Button><Button variant="ghost" onClick={() => onSource(selected)}><IconLink size={16} />原始依据</Button><IconButton label="取消段落选择" onClick={() => onSelect(null)}><IconX size={16} /></IconButton></div> : null}
    <PreviewControls view={view} onViewChange={setView} readingSize={readingSize} onReadingSizeChange={setReadingSize} zoom={zoom} scale={scale} onZoomChange={setZoom} focus={focus} onFocus={onFocus} showFocus={!designOpen} />
  </section>;
}
