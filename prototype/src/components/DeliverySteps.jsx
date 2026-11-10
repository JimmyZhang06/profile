import {IconChevronRight} from '@tabler/icons-react';

const labels = ['岗位与选材', '一页校稿', '核对与导出'];
export function DeliverySteps({current, onStep, busy = false}) {
  return <nav className="delivery-steps" aria-label="简历制作流程">
    <ol>{labels.map((label, i) => <li key={label}>
      {i > 0 && <IconChevronRight size={15} aria-hidden="true" />}
      <button type="button" aria-current={current === i + 1 ? 'step' : undefined}
        disabled={busy || !onStep || current === i + 1} onClick={() => onStep?.(i + 1)}>
        <span aria-hidden="true">{i + 1}</span>{label}
      </button>
    </li>)}</ol>
  </nav>;
}
