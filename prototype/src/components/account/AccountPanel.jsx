import { useEffect, useId, useRef } from 'react';
import { IconX } from '@tabler/icons-react';
import { IconButton } from '../ui/index.jsx';

export function AccountPanel({ title, children, onClose, notice, closeDisabled }) {
  const heading = useRef(null), id = useId();
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  return <aside id="account-panel" className="account-panel" aria-labelledby={id} onKeyDown={event => {
    if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); onClose(); }
  }}>
    <header className="account-panel-header"><h1 ref={heading} id={id} tabIndex={-1}>{title}</h1><IconButton label={closeDisabled ? '正在处理头像，请稍候' : '关闭账号面板'} disabled={closeDisabled} onClick={onClose}><IconX size={20} /></IconButton></header>
    {notice}
    <div className="account-panel-scroll"><div className="account-panel-content">{children}</div></div>
  </aside>;
}
