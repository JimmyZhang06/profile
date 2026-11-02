import { IconChevronRight } from '@tabler/icons-react';

export function AdminRecord({ title, metadata, description, onOpen, actionLabel, action, className = '' }) {
  const content = <>
    <span className="admin-record-copy">
      <span className="admin-record-heading">
        <strong>{title}</strong>
        {metadata ? <span className="admin-record-metadata">{metadata}</span> : null}
      </span>
      {description ? <span className="admin-record-description">{description}</span> : null}
    </span>
    {onOpen
      ? <span className="admin-record-open"><span>{actionLabel}</span><IconChevronRight size={16} /></span>
      : action ? <span className="admin-record-action">{action}</span> : null}
  </>;
  return onOpen
    ? <button type="button" className={`admin-record ${className}`} onClick={onOpen}>{content}</button>
    : <div className={`admin-record ${className}`}>{content}</div>;
}
