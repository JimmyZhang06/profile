import { IconChevronDown } from '@tabler/icons-react';

export function AdminAuditRecord({ record, title, timestamp }) {
  return <details className="admin-audit-record">
    <summary>
      <span><strong>{title}</strong><time dateTime={record.created_at}>{timestamp}</time></span>
      <IconChevronDown size={18} aria-hidden="true" />
    </summary>
    <div className="admin-audit-body">
      <dl>
        <div><dt>操作人</dt><dd>{record.actor_email || '未记录'}</dd></div>
        <div><dt>操作类型</dt><dd><code>{record.action}</code></dd></div>
        <div><dt>操作对象</dt><dd>{record.target || '未记录'}</dd></div>
        <div><dt>操作原因</dt><dd>{record.reason || '未填写'}</dd></div>
      </dl>
      <details className="admin-audit-values">
        <summary>查看前后值</summary>
        <pre>{JSON.stringify({ before: record.before_value, after: record.after_value }, null, 2)}</pre>
      </details>
    </div>
  </details>;
}
