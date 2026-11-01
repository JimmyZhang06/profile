import { useLayoutEffect, useRef, useState } from 'react';

// The rail and the selected chapter share one tangent-continuous outline.
export function ChapterRail({ items, value, onChange, label = '项目资料章节' }) {
  const root = useRef(null), buttons = useRef(new Map()), [shape, setShape] = useState(null);
  const ids = items.map(item => item.id).join('|');
  useLayoutEffect(() => {
    const measure = () => {
      const bounds = root.current?.getBoundingClientRect(), active = buttons.current.get(value)?.getBoundingClientRect();
      if (!bounds?.width || !active) return;
      const x = 8, end = bounds.width - 8, center = active.top - bounds.top + active.height / 2;
      const radius = Math.max(21, active.height / 2 - 7), shoulder = 13;
      const top = center - radius, bottom = center + radius;
      const start = top - shoulder, finish = bottom + shoulder;
      const cap = radius * .55228475;
      // Broad shoulders ease out of the spine; both halves of the cap meet
      // with a vertical tangent, without a flat edge or pinched corners.
      const detour = `C ${x} ${start + 9}, ${x + 6} ${top}, ${x + 20} ${top} H ${end - radius} C ${end - radius + cap} ${top}, ${end} ${center - cap}, ${end} ${center} C ${end} ${center + cap}, ${end - radius + cap} ${bottom}, ${end - radius} ${bottom} H ${x + 20} C ${x + 6} ${bottom}, ${x} ${finish - 9}, ${x} ${finish}`;
      const line = `M ${x} 4 V ${start} ${detour} V ${bounds.height - 4}`;
      setShape(old => old?.line === line && old?.width === bounds.width ? old : { width: bounds.width, height: bounds.height, line });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root.current);
    buttons.current.forEach(button => observer.observe(button));
    return () => observer.disconnect();
  }, [value, ids]);
  function navigate(event, index) {
    const next = ({ ArrowDown: (index + 1) % items.length, ArrowUp: (index - 1 + items.length) % items.length, Home: 0, End: items.length - 1 })[event.key];
    if (next === undefined) return;
    event.preventDefault();
    buttons.current.get(items[next].id)?.focus();
  }
  return <nav className="chapter-rail" ref={root} aria-label={label}>
    {shape ? <svg className="chapter-rail-contour" viewBox={`0 0 ${shape.width} ${shape.height}`} aria-hidden="true" focusable="false"><path className="chapter-rail-line" d={shape.line} vectorEffect="non-scaling-stroke" /></svg> : null}
    {items.map((item, index) => <button type="button" key={item.id} ref={node => { if (node) buttons.current.set(item.id, node); else buttons.current.delete(item.id); }} aria-current={item.id === value ? 'location' : undefined} onClick={() => onChange(item)} onKeyDown={event => navigate(event, index)}><span>{String(index + 1).padStart(2, '0')}</span>{item.title}</button>)}
  </nav>;
}
