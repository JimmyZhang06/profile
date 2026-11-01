import { Children, useEffect, useRef, useState } from 'react';
import { DEFAULT_CHAT_RATIO } from '../lib/workspace.js';
import { clampPanelRatio, panelBounds } from '../lib/panels.js';

export function SplitWorkspace({ ratio, onRatioChange, children, inert, tools, mobileDesignPreview }) {
  const area = useRef(null), drag = useRef(null), frame = useRef(null);
  const [width, setWidth] = useState(0), [draft, setDraft] = useState(null);
  const [chat, preview] = Children.toArray(children);
  const current = clampPanelRatio(draft ?? ratio, width), bounds = panelBounds(width);
  const previewPercent = Math.round((1 - current) * 100);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(area.current);
    return () => { observer.disconnect(); cancelAnimationFrame(frame.current); };
  }, []);
  function pointerRatio(clientX) {
    const rect = area.current.getBoundingClientRect();
    return clampPanelRatio((clientX - rect.left) / Math.max(1, rect.width - 1), rect.width);
  }
  function endDrag(event, commit) {
    if (!drag.current) return;
    const pointerId = drag.current.pointerId;
    cancelAnimationFrame(frame.current); frame.current = null; drag.current = null;
    if (commit) onRatioChange(pointerRatio(event.clientX));
    setDraft(null);
    if (event.currentTarget.hasPointerCapture(pointerId)) event.currentTarget.releasePointerCapture(pointerId);
  }
  function reset() { onRatioChange(DEFAULT_CHAT_RATIO); }
  return <div ref={area} className={'work-panels' + (tools ? ' design-layout' : '') + (mobileDesignPreview ? ' mobile-design-preview' : '') + (draft !== null ? ' is-resizing' : '')} inert={inert} style={{ '--chat-share': current * 100 + '%' }}>
    {tools}
    {chat}
    <div className="split-handle" role="separator" tabIndex={0}
      aria-label="调整预览宽度" aria-orientation="vertical" aria-controls="resume-conversation resume-preview"
      aria-valuenow={Math.round(current * 100)} aria-valuemin={Math.round(bounds.min * 100)} aria-valuemax={Math.round(bounds.max * 100)}
      aria-valuetext={'对话 ' + Math.round(current * 100) + '%，预览 ' + previewPercent + '%'}
      title="拖动调整预览宽度，双击还原；方向键微调"
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { clientX: event.clientX, pointerId: event.pointerId }; setDraft(current);
      }}
      onPointerMove={event => {
        if (!drag.current) return;
        drag.current.clientX = event.clientX;
        if (frame.current !== null) return;
        frame.current = requestAnimationFrame(() => { frame.current = null; if (drag.current) setDraft(pointerRatio(drag.current.clientX)); });
      }}
      onPointerUp={event => endDrag(event, true)} onPointerCancel={event => endDrag(event, false)}
      onLostPointerCapture={event => endDrag(event, false)} onDoubleClick={reset}
      onKeyDown={event => {
        const step = event.shiftKey ? .05 : .02;
        const choices = { ArrowLeft: current - step, ArrowRight: current + step, Home: bounds.min, End: bounds.max, Enter: DEFAULT_CHAT_RATIO };
        if (event.key === 'Escape' && drag.current) { event.preventDefault(); endDrag(event, false); return; }
        if (choices[event.key] === undefined || drag.current) return;
        event.preventDefault(); onRatioChange(clampPanelRatio(choices[event.key], width));
      }}>
      <span className="split-size-hint" aria-hidden="true">预览 {previewPercent}%</span>
    </div>
    {preview}
  </div>;
}
