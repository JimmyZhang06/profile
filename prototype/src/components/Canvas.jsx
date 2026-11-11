import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconPencil, IconSparkles, IconX, IconLink } from '@tabler/icons-react';
import { Button, IconButton } from './ui/index.jsx';
import { PreviewControls } from './PreviewControls.jsx';
import { ResumeDocument } from './ResumeDocument.jsx';
import { DeliveryPreview } from './DeliveryPreview.jsx';
import { projectPointIndices } from '../lib/projects.js';
import { assistantFieldIds, fieldLabel, setField } from '../lib/workspace.js';
import { getResumeDesign } from '../lib/resumeDesign.js';
import { opensOnPaper } from '../lib/documents.js';

const RichTextEditor = lazy(() => import('./RichTextEditor.jsx'));

export function Canvas({ doc, selected, edit, onSelect, onEdit, onEditChange, onMovePoint, onSaveEdit, onCancelEdit, onAsk, onSource, onOpen, focus, onFocus, enabled, active = true, designOpen }) {
  const viewport = useRef(null), paper = useRef(null), [width, setWidth] = useState(800), [height, setHeight] = useState(1123), [zoom, setZoom] = useState('fit');
  const paperDraft = opensOnPaper(doc);
  const [view, setView] = useState(() => paperDraft && !matchMedia('(max-width: 760px)').matches ? 'page' : 'read'), [readingSize, setReadingSize] = useState(16);
  const [editorHost,setEditorHost] = useState(null), [room,setRoom] = useState(null);
  useEffect(() => { if (designOpen) { setView('read'); setReadingSize(size => Math.max(16, size)); } }, [designOpen]);
  useEffect(() => {
    const observer = new ResizeObserver(entries => entries.forEach(entry => entry.target === viewport.current ? setWidth(entry.contentRect.width) : setHeight(entry.target.offsetHeight)));
    observer.observe(viewport.current); observer.observe(paper.current); return () => observer.disconnect();
  }, []);
  useEffect(() => { if (active && selected) { const element = Array.from(paper.current.querySelectorAll('[data-resume-field]')).find(e => e.dataset.resumeField === selected); element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }, [selected, active]);
  const r = doc.resume;
  // Keep the editing mount in place while the user clears an otherwise
  // optional field. Only the real current value is measured and exported.
  const visible = edit && !edit.value ? setField(r,edit.field,'\u200b') : r;
  const canAsk = enabled && selected && assistantFieldIds(r).includes(selected);
  const [projectId,index] = (selected || '').split(':');
  const project = r.projectIds.includes(projectId) && /^\d+$/.test(index);
  const order = project ? projectPointIndices(r,projectId) : [];
  const position = order.indexOf(Number(index));
  const isRecord = [...(r.workEntries || []),...(r.researchEntries || [])].some((e) => selected === e.id+':description');
  const design = getResumeDesign(r), scale = zoom === 'fit' ? Math.min(1.08, Math.max(.25, width / 794)) : Number(zoom) / 100;
  useEffect(() => { if (designOpen) viewport.current?.scrollTo({ top: 0, behavior: 'auto' }); }, [designOpen, design.template]);
  return <section id="resume-preview" className={'canvas-panel ' + (view === 'read' ? 'reading-mode' : 'page-mode')} aria-label="简历编辑画布" style={{ '--resume-reading-size': readingSize + 'px', '--resume-reading-scale': view === 'read' ? readingSize / 14 : 1 }}>
    <style media="print">{`@page { size: A4; margin: ${design.margin}mm; }`}</style>
    <div className="canvas-body">
      <div className="paper-scroll" ref={viewport}>
        <div className="paper-frame" style={view === 'page' ? { width: 794 * scale, height: Math.max(1123,height) * scale } : undefined}>
          <ResumeDocument ref={paper} resume={visible} selected={selected} editing={edit && {field:edit.field,mount:setEditorHost}}
            readOnly={paperDraft} onPick={onEdit} onSelect={onSelect} onEdit={onEdit} onOpen={onOpen}
            className={view === 'page' && paperDraft ? 'delivery-paper editor-paper' : ''} style={view === 'page' ? { transform: 'scale(' + scale + ')' } : undefined} />
        </div>
      </div>
    </div>
    {edit && editorHost?.parentElement?.dataset.resumeField === edit.field ? <Suspense fallback={<div className="editor-loading" role="status">正在打开编辑器…</div>}><RichTextEditor key={doc.id + ':' + edit.field} host={editorHost} points={project || isRecord} onMove={onMovePoint} projectOrder={project && {up:position > 0,down:position < order.length-1}} label={fieldLabel(r, edit.field)} value={edit.value} marks={edit.marks} onChange={onEditChange} onSave={onSaveEdit} onCancel={onCancelEdit} onAsk={canAsk ? () => onAsk(selected) : null} /></Suspense> : selected && !edit ? <div className="selection-bar" role="toolbar" aria-label="段落操作"><Button variant="ghost" onClick={() => onEdit(selected)}><IconPencil size={16} />编辑文字</Button>{canAsk && <Button variant="ghost" onClick={() => onAsk(selected)}><IconSparkles size={16} />对话调整</Button>}<Button variant="ghost" onClick={() => onSource(selected)}><IconLink size={16} />原始依据</Button><IconButton label="取消段落选择" onClick={() => onSelect(null)}><IconX size={16} /></IconButton></div> : null}
    <PreviewControls view={view} onViewChange={setView} readingSize={readingSize} onReadingSizeChange={setReadingSize} zoom={zoom} scale={scale} onZoomChange={setZoom} focus={focus} onFocus={onFocus} showFocus={!designOpen}
      room={active && paperDraft && room?.resume === r ? room : null} onCheck={() => onOpen('export')} />
    {active && paperDraft && createPortal(<DeliveryPreview hidden resume={r} onMeasure={setRoom} />,document.body)}
  </section>;
}
