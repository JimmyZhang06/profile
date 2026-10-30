import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import './select-field.css';

const scrollContainers = '.page-scroll, .design-panel-scroll, .admin-scroll';

export function SelectField({ label, value, options, onChange, disabled = false, className = '' }) {
  const id = useId(), root = useRef(null), trigger = useRef(null), list = useRef(null);
  const typeahead = useRef({ query: '', time: 0 });
  const [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const [position, setPosition] = useState({ side: 'down', height: 280 });
  const unavailable = disabled || !options.length;
  const expanded = open && !unavailable;
  const selectedIndex = options.findIndex(option => option.value === value);
  const selected = options[selectedIndex];
  const activeIndex = Math.max(0, Math.min(active, options.length - 1));

  const place = useCallback(() => {
    const bounds = trigger.current.getBoundingClientRect();
    const scroll = trigger.current.closest(scrollContainers)?.getBoundingClientRect();
    const below = Math.min(window.innerHeight - 12, scroll?.bottom ?? Infinity) - bounds.bottom - 9;
    const above = bounds.top - Math.max(12, scroll?.top ?? 0) - 9;
    const desired = Math.min(280, options.length * 64 + 12);
    const side = below < desired && above > below ? 'up' : 'down';
    const height = Math.max(56, Math.min(desired, side === 'up' ? above : below));
    setPosition(previous => previous.side === side && previous.height === height ? previous : { side, height });
  }, [options.length]);

  useEffect(() => { if (unavailable) setOpen(false); }, [unavailable]);
  useLayoutEffect(() => {
    if (!expanded) return;
    place();
    const closeOutside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('resize', place);
    const scroll = trigger.current.closest(scrollContainers);
    scroll?.addEventListener('scroll', place, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('resize', place);
      scroll?.removeEventListener('scroll', place);
    };
  }, [expanded, place]);
  useEffect(() => {
    if (!expanded) return;
    const option = list.current?.children[activeIndex];
    if (!option) return;
    // Scroll just the option list; keep the surrounding settings page in place.
    if (option.offsetTop < list.current.scrollTop) list.current.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.current.scrollTop + list.current.clientHeight) list.current.scrollTop = option.offsetTop + option.offsetHeight - list.current.clientHeight;
  }, [activeIndex, expanded]);

  function show(index = Math.max(0, selectedIndex)) {
    if (unavailable) return;
    place(); setActive(index); setOpen(true); typeahead.current = { query: '', time: 0 };
  }
  function choose(index) {
    const option = options[index];
    if (!option || unavailable) return;
    setOpen(false); onChange(option.value); trigger.current?.focus({ preventScroll: true });
  }
  function navigate(event) {
    if (event.key === 'Escape') { if (expanded) { event.preventDefault(); event.stopPropagation(); setOpen(false); } return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (expanded) choose(activeIndex); else show(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Home') show(0);
      else if (event.key === 'End') show(options.length - 1);
      else if (!expanded) show();
      else setActive((activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
      event.preventDefault();
      const time = Date.now(), key = event.key.toLocaleLowerCase();
      const query = time - typeahead.current.time < 650 ? typeahead.current.query + key : key;
      const search = Array.from(query).every(character => character === key) ? key : query;
      const from = expanded ? activeIndex : Math.max(0, selectedIndex);
      const found = options.map((_, index) => (from + index + 1) % options.length).find(index => options[index].label.toLocaleLowerCase().startsWith(search));
      if (!expanded) show(found ?? Math.max(0, selectedIndex)); else if (found !== undefined) setActive(found);
      typeahead.current = { query, time };
    }
  }

  return <div className={'select-field ' + className} ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label id={`${id}-label`} htmlFor={`${id}-trigger`}>{label}</label>
    <div className="select-field-control">
      <button ref={trigger} id={`${id}-trigger`} type="button" className="select-field-trigger" role="combobox" disabled={unavailable}
        aria-labelledby={`${id}-label`} aria-expanded={expanded} aria-controls={`${id}-options`} aria-haspopup="listbox"
        aria-activedescendant={expanded ? `${id}-option-${activeIndex}` : undefined}
        onClick={() => expanded ? setOpen(false) : show()} onKeyDown={navigate}>
        <span title={selected?.label}>{selected?.label || '选择模型'}</span><IconChevronDown size={17} aria-hidden="true" />
      </button>
      {expanded ? <div ref={list} id={`${id}-options`} role="listbox" aria-labelledby={`${id}-label`} className={'select-field-options opens-' + position.side} style={{ maxHeight: position.height }}>
        {options.map((option, index) => <div key={option.value} id={`${id}-option-${index}`} role="option" aria-selected={option.value === value}
          className={'select-field-option' + (index === activeIndex ? ' is-active' : '')}
          onMouseMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>
          <span><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span>
          {option.value === value ? <IconCheck size={17} aria-hidden="true" /> : null}
        </div>)}
      </div> : null}
    </div>
  </div>;
}
