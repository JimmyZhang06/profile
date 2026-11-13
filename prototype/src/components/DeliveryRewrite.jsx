import {useEffect, useRef, useState} from 'react';
import {IconArrowRight} from '@tabler/icons-react';
import {Button} from './ui/index.jsx';
import {SelectField} from './ui/SelectField.jsx';
import {rewriteField} from '../lib/assistant.js';
import {changedSpan, rewriteDirections} from '../lib/revisionText.js';

function Difference({label, part}) {
  return <div><small>{label}</small><p>{part.lead}<mark>{part.edit}</mark>{part.end}</p></div>;
}

export function DeliveryRewrite({doc, resume, selected, value, settings, onApply}) {
  const [direction,setDirection] = useState('shorter');
  const [instruction,setInstruction] = useState(''), [proposal,setProposal] = useState(null);
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const task = useRef(null);
  const model = settings.connections.find(c => c.enabled !== false && c.id === settings.bindings.rewrite);
  const enabled = model && settings.enabled && settings.capabilities.rewrite;
  useEffect(() => {
    setProposal(null); setBusy(false); setError('');
    return () => { task.current?.abort(); task.current = null; };
  }, [selected,value,doc.job.text,model?.id,model?.model,model?.baseUrl,enabled,direction,instruction]);
  async function generate() {
    if (!enabled || task.current) return;
    const controller = new AbortController();
    task.current = controller; setBusy(true); setError(''); setProposal(null);
    try {
      const result = await rewriteField({doc:{...doc,resume},selected,direction,instruction,settings,connectionId:model.id,signal:controller.signal});
      if (!controller.signal.aborted) setProposal(result);
    } catch (e) { if (!controller.signal.aborted) setError(e.message); }
    finally { if (task.current === controller) { task.current = null; setBusy(false); } }
  }
  const comparison = proposal && proposal.before === value ? changedSpan(value,proposal.after) : null;
  return <details className="delivery-field-rewrite" onToggle={(e) => {
    if (!e.currentTarget.open && task.current) {task.current.abort(); task.current = null; setBusy(false);}
  }}>
    <summary>AI 改写这段</summary>
    {enabled ? <>
      <div className="delivery-rewrite-pickers">
        <SelectField label="改写方向" value={direction} onChange={setDirection}
          options={Object.entries(rewriteDirections).map(([value,label]) => ({value,label}))} disabled={busy} viewportMenu />
      </div>
      <label className="delivery-rewrite-instruction">{direction === 'custom' ? '修改要求' : '补充要求（可选）'}
        <textarea rows={2} maxLength={600} value={instruction} disabled={busy}
          placeholder="例如：把我负责的验收工作放在第一句" onChange={(e) => setInstruction(e.target.value)} />
      </label>
      <details className="rewrite-privacy"><summary>查看发送范围</summary><p>本次将当前段落、岗位 JD 和修改要求发给 {model.name}（{model.baseUrl}）。</p></details>
      {busy ? <Button variant="ghost" onClick={() => {task.current?.abort();task.current = null;setBusy(false);}}>停止改写</Button> :
        <Button variant="secondary" disabled={!value.trim() || (direction === 'custom' && !instruction.trim())} onClick={generate}>
          {comparison ? '重新改写' : '生成对照稿'}<IconArrowRight size={15} />
        </Button>}
      {busy && <p role="status" className="quiet-note">正在改写当前段落…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {comparison && <div className="delivery-rewrite-diff">
        <Difference label="当前文字" part={comparison.before} /><Difference label="建议替换" part={comparison.after} />
        <p className="quiet-note">{proposal.reason}</p>
        <Button onClick={() => {onApply(proposal.after);setProposal(null);}}>采用到纸面</Button>
        <Button variant="ghost" onClick={() => setProposal(null)}>放弃建议</Button>
      </div>}
    </> : <p className="quiet-note">当前可直接编辑上方正文。在线写作可用时，可在这里生成对照稿。</p>}
  </details>;
}
