import { useId, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { IconButton } from '../../components/ui/index.jsx';
import { createCardScroller } from '../../lib/cardScroller.js';
import './offer-cards.css';

// All fields remain mounted. The scroll container owns the gesture and changes
// height and focus only after the browser has finished snapping to the new card.
export function OfferTermsDeck({cards, initialId, onPosition, controls, name}) {
  const id=useId(), viewport=useRef(null), scroller=useRef(null), focusAfter=useRef(null);
  const mouseDrag=useRef(null);
  const [active,setActive]=useState(initialId), [target,setTarget]=useState(initialId), [height,setHeight]=useState(null);
  const [focusRequest,setFocusRequest]=useState(null);
  const settled=useRef(initialId), remember=useRef(onPosition);
  remember.current=onPosition;
  const ids=cards.map(c=>c.id).join('|');
  const position=Math.max(0,cards.findIndex(c=>c.id===target)), total=cards.length;
  const slides=()=>Array.from(viewport.current?.children||[],node=>({id:node.dataset.card,node}));
  const slide=key=>slides().find(s=>s.id===key)?.node;
  function measure(key) {
    const h=slide(key)?.getBoundingClientRect().height;
    if(h>0)setHeight(Math.ceil(h));
  }
  function go(key, field) {
    const i=slides().findIndex(s=>s.id===key);
    if(i<0)return;
    focusAfter.current=field?{key,field}:null;
    scroller.current?.go(i);
  }
  useImperativeHandle(controls,()=>({
    go,
    reveal(field) {
      const target=viewport.current?.querySelector('[data-offer-section="'+field+'"]');
      const key=target?.closest('[data-card]')?.dataset.card;
      if(key)go(key,field);
    },
  }),[]);
  useLayoutEffect(()=>{
    const el=viewport.current, first=slide(settled.current);
    if(first)el.scrollTo({left:first.offsetLeft,behavior:'instant'});
    const controller=createCardScroller({
      element:el, getSlides:slides, initialId:settled.current, onTarget:setTarget,
      reducedMotion:()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      onSettle:key=>{
        if(key!==settled.current && slide(settled.current)?.contains(document.activeElement))el.focus({preventScroll:true});
        settled.current=key;setActive(key);measure(key);remember.current?.(key);
        const request=focusAfter.current;
        if(!request)return;
        focusAfter.current=null;
        if(request.key===key)setFocusRequest(request);
      },
    });
    scroller.current=controller;
    const observer=new ResizeObserver(()=>controller.resize());
    observer.observe(el);
    return ()=>{observer.disconnect();controller.destroy();scroller.current=null;};
  },[ids]);
  // Only move focus after React has actually removed inert from the destination.
  // A frame scheduled by a native scrollend can precede that commit on mobile.
  useLayoutEffect(()=>{
    if(!focusRequest || active!==focusRequest.key)return;
    const node=slide(active)?.querySelector('[data-offer-section="'+focusRequest.field+'"]');
    if(!node)return;
    for(let parent=node;parent && parent!==viewport.current;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
    const selector='input:not([disabled]),button:not([disabled]),select,textarea,summary';
    const control=node.matches(selector)?node:node.querySelector(selector);
    control?.focus({preventScroll:true});
    control?.scrollIntoView({block:'nearest',inline:'nearest'});
    setFocusRequest(null);
  },[active,focusRequest]);
  useLayoutEffect(()=>{
    const node=slide(active);
    if(!node)return;
    const update=()=>{if(!scroller.current?.moving)measure(active);};
    update();
    const observer=new ResizeObserver(update);observer.observe(node);
    return ()=>observer.disconnect();
  },[active]);
  function arrow(event, indexButtons=false) {
    if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
    const indices={ArrowLeft:position-1,ArrowRight:position+1,Home:0,End:total-1};
    if(!Object.hasOwn(indices,event.key))return;
    event.preventDefault();const i=Math.max(0,Math.min(total-1,indices[event.key]));
    if(indexButtons)event.currentTarget.parentElement.children[i]?.focus({preventScroll:true});
    go(cards[i].id);
  }
  function startMouseDrag(e) {
    if(e.pointerType!=='mouse' || e.button!==0 || !e.target.closest('.offer-card-head'))return;
    const el=e.currentTarget;
    mouseDrag.current={pointer:e.pointerId,x:e.clientX,left:el.scrollLeft,index:position};
    el.setPointerCapture(e.pointerId);
  }
  function moveMouseDrag(e) {
    const d=mouseDrag.current;
    if(!d || d.pointer!==e.pointerId)return;
    const delta=d.x-e.clientX;
    if(!d.dragging && Math.abs(delta)<5)return;
    d.dragging=true;
    e.currentTarget.classList.add('is-dragging');
    e.currentTarget.scrollLeft=d.left+delta;
  }
  function endMouseDrag(e) {
    const d=mouseDrag.current;
    if(!d || d.pointer!==e.pointerId)return;
    mouseDrag.current=null;
    const el=e.currentTarget, delta=d.x-e.clientX;
    el.classList.remove('is-dragging');
    if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);
    if(d.dragging) {
      const step=e.type==='pointerup' && Math.abs(delta)>Math.min(44,el.clientWidth*.15)?Math.sign(delta):0;
      go(cards[Math.max(0,Math.min(total-1,d.index+step))].id);
    }
  }
  return <section className="offer-terms" aria-labelledby={id+'-title'}>
    <div className="offer-deck-bar"><div><h2 id={id+'-title'}>录用条款</h2>{name && <p className="offer-plan-name">{name}</p>}</div>
      <div className="offer-deck-arrows">
        <IconButton label="上一张录入卡片" aria-controls={id} aria-disabled={!position} onClick={()=>{if(position>0){focusAfter.current=null;scroller.current?.go(-1,true);}}}><IconChevronLeft size={17}/></IconButton>
        <span className="offer-deck-count" aria-hidden="true"><b>{position+1}</b> / {total}</span>
        <IconButton label="下一张录入卡片" aria-controls={id} aria-disabled={position===total-1} onClick={()=>{if(position<total-1){focusAfter.current=null;scroller.current?.go(1,true);}}}><IconChevronRight size={17}/></IconButton>
      </div>
    </div>
    <div ref={viewport} id={id} className="offer-deck-viewport" data-horizontal-deck="" tabIndex={0}
      role="group" aria-roledescription="轮播" aria-label="录用条款卡片，可左右滑动或按左右方向键切换"
      onPointerDown={startMouseDrag} onPointerMove={moveMouseDrag} onPointerUp={endMouseDrag} onPointerCancel={endMouseDrag} onLostPointerCapture={endMouseDrag}
      onKeyDown={e=>{if(e.target===e.currentTarget)arrow(e);}} style={height?{height}:undefined}>
      {cards.map(({id:key,title,hint,icon:Icon,body},i)=><section key={key} data-card={key} className="offer-deck-card"
        role="group" aria-roledescription="卡片" aria-label={title+'，第 '+(i+1)+' 张，共 '+total+' 张'} aria-hidden={key!==active} inert={key!==active}>
        <header className="offer-card-head"><span className="offer-card-icon"><Icon size={19} stroke={1.7}/></span>
          <div><h3>{title}</h3><p>{hint}</p></div></header>
        {body}
      </section>)}
    </div>
    <div className="offer-deck-footer">
      <div role="group" aria-label="直接选择录入卡片" className="offer-deck-index">{cards.map((c,i)=>
        <button type="button" key={c.id} aria-label={'跳到'+c.title} title={c.title} aria-pressed={target===c.id} aria-controls={id}
          tabIndex={position===i?0:-1} onKeyDown={e=>arrow(e,true)} onClick={()=>go(c.id)}><i/></button>)}</div>
      <span>左右滑动切换</span>
      <span className="offer-deck-announcement" role="status" aria-atomic="true">{cards.find(c=>c.id===active)?.title}，第 {cards.findIndex(c=>c.id===active)+1} 张，共 {total} 张</span>
    </div>
  </section>;
}
