import { useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconCheck, IconChevronDown, IconLoader2 } from '@tabler/icons-react';
import { PageNavigationContext } from '../../hooks/usePageNavigation.js';

export function IconButton({ label, children, className = '', ...props }) {
  return <button type="button" aria-label={label} data-tooltip={label} className={'icon-button ' + className} {...props}>{children}</button>;
}
export function Button({ children, variant = 'primary', className = '', busy, ...props }) {
  return <button type="button" className={'button button-' + variant + ' ' + className} {...props}>{busy ? <IconLoader2 size={16} className="spin" /> : null}{children}</button>;
}
export function Page({ title, description, children, onBack, backLabel = '返回简历', className = '', footer, actions, dirty = false }) {
  const id = useId(), heading = useRef(null);
  const navigation = useContext(PageNavigationContext);
  const registerDirty = navigation?.registerDirty;
  useLayoutEffect(() => {
    registerDirty?.(dirty);
    return () => registerDirty?.(false);
  }, [dirty, registerDirty]);
  useEffect(() => {
    if (!heading.current?.closest('.workspace-page')?.contains(document.activeElement)) heading.current?.focus({ preventScroll: true });
  }, []);
  return <section className={'workspace-page ' + className} aria-labelledby={id}>
    <header className="page-topbar">
      <button type="button" className="page-back" onClick={onBack}><IconArrowLeft size={17} />{backLabel}</button>
      <div className="page-location"><span>{title}</span></div>
      <span className="page-document-title" title={navigation?.documentTitle}>{navigation?.documentTitle}</span>
    </header>
    <div className="page-scroll"><div className="page-content">
      <header className="page-heading"><div><h1 ref={heading} id={id} tabIndex={-1}>{title}</h1>{description ? <p>{description}</p> : null}</div>{actions ? <div className="page-heading-actions">{actions}</div> : null}</header>
      {children}
    </div></div>
    {footer ? <footer className="page-footer"><div className="page-footer-content">{footer}</div></footer> : null}
  </section>;
}
export function Menu({ label, icon, value, items, className = '', children }) {
  const [open, setOpen] = useState(false), ref = useRef(null), trigger = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = e => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); };
  }, [open]);
  function navigate(e) {
    const buttons = Array.from(ref.current.querySelectorAll('[role="menuitem"]:not(:disabled)'));
    const index = buttons.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
    if (e.key === 'Home') { e.preventDefault(); buttons[0]?.focus(); }
    if (e.key === 'End') { e.preventDefault(); buttons.at(-1)?.focus(); }
  }
  return <div className={'menu ' + className} ref={ref} onKeyDown={navigate}>
    <button ref={trigger} type="button" className="menu-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); requestAnimationFrame(() => ref.current.querySelector('[role="menuitem"]')?.focus()); } }}>{icon}{children || value}<IconChevronDown size={14} /></button>
    {open ? <div className="menu-popover" id={id} role="menu" aria-label={label}>{items.map((item, i) => item.separator ? <hr key={i} /> : <button type="button" role="menuitem" key={item.value || item.label} disabled={item.disabled} className={item.danger ? 'danger-text' : ''} onClick={() => { setOpen(false); trigger.current?.focus(); item.onClick?.(); }}>{item.icon}<span>{item.label}{item.description ? <small>{item.description}</small> : null}</span>{item.selected ? <IconCheck size={16} /> : null}{item.shortcut ? <kbd>{item.shortcut}</kbd> : null}</button>)}</div> : null}
  </div>;
}
export function Toggle({ checked, onChange, label, disabled }) {
  return <button type="button" className={'toggle ' + (checked ? 'on' : '')} role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}><span /></button>;
}
export function Field({ label, hint, children, className = '' }) { return <label className={'field ' + className}><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>; }
export function EmptyState({ icon, title, children, action }) { return <div className="empty-state">{icon}<h3>{title}</h3><p>{children}</p>{action}</div>; }
