import { useLayoutEffect, useRef, useState } from 'react';
import './curved-tabs.css';

export function CurvedTabs({ id, label, items, value, onChange }) {
  const root = useRef(null), buttons = useRef(new Map());
  const [contour, setContour] = useState(null);
  const itemIds = items.map(item => item.value).join('|');

  useLayoutEffect(() => {
    const measure = () => {
      const bounds = root.current?.getBoundingClientRect();
      const selected = buttons.current.get(value)?.getBoundingClientRect();
      if (!bounds?.width || !selected) return;
      const width = Math.round(bounds.width * 100) / 100;
      const bottom = bounds.height - .5, top = 5.5;
      const left = Math.max(0, selected.left - bounds.left - 10);
      const right = Math.min(width, selected.right - bounds.left + 10);
      // Both shoulders return tangentially to the page divider, like a folder tab.
      const arch = `C ${left + 13} ${bottom}, ${left + 15} ${bottom - 4}, ${left + 19} ${bottom - 18} C ${left + 23} ${top + 7}, ${left + 26} ${top}, ${left + 41} ${top} H ${right - 41} C ${right - 26} ${top}, ${right - 23} ${top + 7}, ${right - 19} ${bottom - 18} C ${right - 15} ${bottom - 4}, ${right - 13} ${bottom}, ${right} ${bottom}`;
      const line = `M 0 ${bottom} H ${left} ${arch} H ${width}`;
      const fill = `M ${left} ${bottom} ${arch} Z`;
      setContour(previous => previous?.line === line ? previous : { width, height: bounds.height, line, fill });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root.current);
    buttons.current.forEach(button => observer.observe(button));
    return () => observer.disconnect();
  }, [value, itemIds]);

  function navigate(event, index) {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % items.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = items.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    buttons.current.get(items[next].value)?.focus({ preventScroll: true });
    onChange(items[next].value);
  }

  return <div className="curved-tabs" ref={root} role="tablist" aria-label={label}>
    {contour ? <svg className="curved-tabs-outline" viewBox={`0 0 ${contour.width} ${contour.height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path className="curved-tabs-fill" d={contour.fill} />
      <path className="curved-tabs-line" d={contour.line} vectorEffect="non-scaling-stroke" />
    </svg> : null}
    {items.map((item, index) => <button type="button" key={item.value} ref={node => { if (node) buttons.current.set(item.value, node); else buttons.current.delete(item.value); }}
      role="tab" id={`${id}-${item.value}-tab`} aria-controls={`${id}-${item.value}-panel`} aria-selected={item.value === value}
      tabIndex={item.value === value ? 0 : -1} onClick={() => onChange(item.value)} onKeyDown={event => navigate(event, index)}>
      {item.label}
    </button>)}
  </div>;
}
