import { memo } from 'react';
import { BrandLogo } from './BrandLogo.jsx';
import './assistant-identity.css';

// Only the reply phase changes this component; individual text chunks do not
// restart the logo motion or repeatedly announce the status to screen readers.
export const AssistantIdentity = memo(function AssistantIdentity({ offline, status, hasText }) {
  const phase = status === 'streaming' ? (hasText ? 'responding' : 'thinking')
    : status === 'stopped' || status === 'error' ? status : 'idle';
  const label = phase === 'thinking' ? (offline ? '本地整理中' : '思考中')
    : phase === 'responding' ? (offline ? '本地输出中' : '正在回答')
    : phase === 'stopped' ? '已停止'
    : phase === 'error' ? '暂未完成'
    : offline ? '本地整理' : '简历助手';

  return <div className="assistant-identity" data-phase={phase}>
    <span className="assistant-mark" aria-hidden="true"><BrandLogo /></span>
    <span className="assistant-name">履历</span>
    <span className="assistant-phase" role="status" aria-live="polite" aria-atomic="true">{label}</span>
  </div>;
});
