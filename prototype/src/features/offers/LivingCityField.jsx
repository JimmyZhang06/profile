import { useEffect, useId, useRef, useState } from 'react';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { livingCities, namedLivingCity } from './livingReferences.mjs';

export function LivingCityField({ city, places, onChoose }) {
  const id = useId(), list = useRef(null), input = useRef(null);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(0);
  const search = query.trim().toLowerCase().replace(/市$/, '');
  const named = [...new Set([city.id, ...Object.keys(places || {})])].map(namedLivingCity).filter(Boolean);
  const cities = [...named, ...livingCities];
  const options = cities.filter(c => c.label.toLowerCase().includes(search) || c.id.toLowerCase().includes(search));
  const entered = query.trim();
  const custom = entered && !/香港/.test(entered) && !options.some(c =>
    c.label.split('（')[0].toLowerCase().replace(/市$/, '') === search || c.id === search)
    ? namedLivingCity('custom:' + entered) : null;
  if (custom) options.push(custom);
  const current = options[active];
  useEffect(() => {
    const menu = list.current, option = menu?.children[active];
    if (!option) return;
    if (option.offsetTop < menu.scrollTop) menu.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > menu.scrollTop + menu.clientHeight)
      menu.scrollTop = option.offsetTop + option.offsetHeight - menu.clientHeight;
  }, [active, open, query]);
  function show() {
    if (open) return;
    setQuery(''); setActive(Math.max(0, cities.findIndex(c => c.id === city.id))); setOpen(true);
  }
  function choose(c) {
    if (!c) return;
    onChoose(c.id);
    setOpen(false);
    if (window.matchMedia('(pointer: coarse)').matches) input.current?.blur();
  }
  function keyDown(e) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'Enter' && open) { e.preventDefault(); choose(current); return; }
    if (!['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    if (!open) show();
    else if (options.length) setActive(a => (a + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
  }
  return <div className="living-city-field">
    <label className="offer-field">
      <span>生活城市</span>
      <input ref={input} type="text" role="combobox" enterKeyHint="done" autoComplete="off" spellCheck={false} maxLength={60}
        aria-expanded={open} aria-autocomplete="list" aria-controls={id}
        aria-activedescendant={open && current ? id + '-option-' + active : undefined}
        value={open ? query : city.label} placeholder="搜索或填写城市"
        onFocus={show} onClick={show} onBlur={() => setOpen(false)} onKeyDown={keyDown}
        onChange={e => {setQuery(e.target.value); setActive(0); setOpen(true);}} />
      <IconChevronDown size={16} aria-hidden="true" />
    </label>
    <div id={id} ref={list} role="listbox" aria-label="生活城市" hidden={!open}>
      {open && options.map((c, i) => <div key={c.id} id={id + '-option-' + i} role="option"
        aria-selected={city.id === c.id} className={i === active ? 'is-current' : ''}
        onMouseDown={e => e.preventDefault()} onClick={() => choose(c)}>
        <span>{c === custom ? '自填内地城市「' + c.label + '」' : c.label}</span>
        {c.id === city.id && <IconCheck size={15} aria-hidden="true"/>}
      </div>)}
    </div>
  </div>;
}
