import { useId, useLayoutEffect, useRef, useState } from 'react';
import { IconArrowUpRight, IconPencil, IconCheck, IconChevronDown, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { Button, IconButton } from './ui/index.jsx';
import { fieldLabel, proposalState } from '../lib/workspace.js';
import { createRevisionScroller } from '../lib/revisionScroll.js';
import {changedSpan} from '../lib/revisionText.js';

function RevisionCard({ proposal, doc, dismissed, onApply, onDismiss, onSource, onLocate }) {
  const [showBefore, setShowBefore] = useState(false);
  const status = dismissed ? 'dismissed' : proposalState(doc, proposal);
  const differences = showBefore ? changedSpan(proposal.before,proposal.after) : null;
  return <div className={'revision-card revision-' + status}>
    <div className="revision-heading"><button type="button" onClick={() => onLocate(proposal.field)}><IconPencil size={15} />{fieldLabel(doc.resume, proposal.field)}</button><span className="revision-status">{status === 'applied' ? <><IconCheck size={14} />已采用</> : status === 'stale' ? '原文已更新' : status === 'dismissed' ? '已保留原文' : '待审核'}</span></div>
    <p className="revision-new">{differences ? <>{differences.after.lead}<ins>{differences.after.edit}</ins>{differences.after.end}</> : proposal.after}</p>
    <button type="button" className="revision-compare" aria-expanded={showBefore} onClick={() => setShowBefore(!showBefore)}>{showBefore ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}对照原文</button>
    {showBefore ? <div className="revision-old"><p>{proposal.before ? <>{differences.before.lead}<del>{differences.before.edit}</del>{differences.before.end}</> : '尚未填写'}</p><small>{proposal.reason}</small></div> : null}
    <div className="revision-footer"><button type="button" className="text-button muted" onClick={() => onSource(proposal.field)}>查看依据<IconArrowUpRight size={13} /></button>{status === 'pending' ? <div><Button variant="ghost" size="small" onClick={onDismiss}>保留原文</Button><Button className="small" onClick={() => onApply(proposal)}>采用<IconCheck size={14} /></Button></div> : status === 'stale' ? <span className="muted small-text">重新生成后再采用</span> : null}</div>
  </div>;
}

// Keep each card mounted: returning to a suggestion preserves its comparison.
// Only the active card can receive focus or be read by assistive technology.
function StackedRevisions({ proposals, renderCard, onReview }) {
  const id = useId();
  const viewport = useRef(null), slides = useRef(new Map()), scroller = useRef(null);
  const [activeId, setActiveId] = useState(proposals[0].id);
  const [targetId, setTargetId] = useState(proposals[0].id);
  const [height, setHeight] = useState(null);
  const index = Math.max(0, proposals.findIndex(proposal => proposal.id === activeId));
  const current = proposals[index];
  const position = Math.max(0, proposals.findIndex(proposal => proposal.id === targetId));
  const currentId = useRef(current.id);
  currentId.current = current.id;
  const itemIds = proposals.map(proposal => proposal.id).join('|');

  function measure(id) {
    const next = slides.current.get(id)?.getBoundingClientRect().height;
    if (next > 0) setHeight(Math.ceil(next));
  }

  useLayoutEffect(() => {
    const slide = slides.current.get(current.id);
    const update = () => { if (!scroller.current?.moving) measure(current.id); };
    update();
    const observer = new ResizeObserver(update);
    if (slide) observer.observe(slide);
    return () => observer.disconnect();
  }, [current.id]);

  useLayoutEffect(() => {
    const element = viewport.current;
    const controller = createRevisionScroller({
      element,
      getSlides: () => [...slides.current].map(([id, node]) => ({ id, node })),
      initialId: currentId.current,
      reducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      onTarget: setTargetId,
      onSettle: nextId => {
        if (nextId !== currentId.current && slides.current.get(currentId.current)?.contains(document.activeElement)) element.focus({ preventScroll: true });
        currentId.current = nextId;
        setActiveId(nextId);
        measure(nextId);
      },
    });
    scroller.current = controller;
    const observer = new ResizeObserver(() => controller.resize());
    observer.observe(element);
    return () => { observer.disconnect(); controller.destroy(); scroller.current = null; };
  }, [itemIds]);

  function change(value, relative = false) {
    onReview?.();
    scroller.current?.go(value, relative);
  }

  function onKeyDown(event) {
    if (event.target.closest('.revision-card') || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const next = { ArrowLeft: -1, ArrowRight: 1, Home: 0, End: proposals.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    change(next, event.key.startsWith('Arrow'));
  }

  return <section className="revision-deck" aria-label="本轮修改建议" aria-roledescription="轮播" onKeyDown={onKeyDown} onKeyDownCapture={onReview} onPointerDownCapture={onReview}>
    <div className="revision-deck-toolbar">
      <span className="revision-deck-label">修改建议<span className="revision-deck-hint">左右滑动查看</span></span>
      <div className="revision-deck-navigation">
        <IconButton label="上一条建议" aria-controls={id} aria-disabled={position === 0} onClick={() => change(-1, true)}><IconChevronLeft size={17} /></IconButton>
        <span className="revision-deck-position" role="status" aria-live="polite" aria-atomic="true" aria-label={`第 ${position + 1} 条，共 ${proposals.length} 条建议`}><strong>{String(position + 1).padStart(2, '0')}</strong><span aria-hidden="true">/</span>{String(proposals.length).padStart(2, '0')}</span>
        <IconButton label="下一条建议" aria-controls={id} aria-disabled={position === proposals.length - 1} onClick={() => change(1, true)}><IconChevronRight size={17} /></IconButton>
      </div>
    </div>
    <div className={'revision-deck-stack' + (proposals.length > 2 ? ' has-depth' : '')}>
      <div ref={viewport} id={id} className="revision-deck-viewport" tabIndex={0} role="group" aria-label="滑动切换建议，也可使用左右方向键" onWheel={onReview} style={height ? { height } : undefined}>
        {proposals.map((proposal, slideIndex) => <div key={proposal.id} ref={node => { if (node) slides.current.set(proposal.id, node); else slides.current.delete(proposal.id); }} className="revision-deck-slide" role="group" aria-roledescription="卡片" aria-label={`${slideIndex + 1} / ${proposals.length}`} aria-hidden={proposal.id !== current.id} inert={proposal.id !== current.id}>
          {renderCard(proposal)}
        </div>)}
      </div>
    </div>
  </section>;
}

export function RevisionDeck({ message, doc, onApply, onDismiss, onSource, onLocate, onReview }) {
  const proposals = message.proposals || [];
  const renderCard = proposal => <RevisionCard key={proposal.id} proposal={proposal} doc={doc} dismissed={message.dismissed?.includes(proposal.id)} onApply={onApply} onDismiss={() => onDismiss(message.id, proposal.id)} onSource={onSource} onLocate={onLocate} />;
  if (!proposals.length) return null;
  if (proposals.length === 1) return <div onPointerDownCapture={onReview} onKeyDownCapture={onReview}>{renderCard(proposals[0])}</div>;
  return <StackedRevisions proposals={proposals} renderCard={renderCard} onReview={onReview} />;
}
