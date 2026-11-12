import { useEffect, useRef, useState } from 'react';
import { Button, Field } from '../../components/ui/index.jsx';
import { createLocalOcrWorker } from '../../lib/localOcr.js';
import { evidencePng } from './opportunityClient.js';
import { suggestedPosterFields } from './posterFields.js';

const labels = { company: '公司', title: '岗位', city: '城市' };

export function RecruitmentPoster({ data, original, onApply }) {
  const task = useRef(null);
  const [text, setText] = useState('');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [copyFields, setCopyFields] = useState(false);
  const fields = suggestedPosterFields(text, data);
  useEffect(() => () => task.current?.abort(), []);

  async function read(file) {
    if (!file) return;
    task.current?.abort();
    const controller = new AbortController();
    task.current = controller;
    const { signal } = controller;
    setError('');
    setProgress('正在准备中英文识别…');
    let worker;
    let cancel;
    try {
      const image = await evidencePng(file);
      signal.throwIfAborted();
      worker = await createLocalOcrWorker(percent => {
        if (!signal.aborted) setProgress(`正在本机识别 ${percent}%`);
      });
      signal.throwIfAborted();
      const interrupted = new Promise((_, reject) => { cancel = () => reject(signal.reason); });
      signal.addEventListener('abort', cancel, { once: true });
      const result = await Promise.race([worker.recognize(image), interrupted]);
      const value = result.data.text.replace(/(?<=[\u3400-\u9fff]) +(?=[\u3400-\u9fff])/gu, '').trim();
      if (!value) throw Error('没有识别到文字，可以选择更清晰的图片或粘贴原文。');
      setText(value);
      setCopyFields(false);
    } catch (e) {
      if (!signal.aborted) setError(e?.message || '识别失败，可以重新选图或粘贴原文。');
    } finally {
      if (cancel) signal.removeEventListener('abort', cancel);
      await worker?.terminate().catch(() => {});
      if (task.current === controller && !signal.aborted) {
        task.current = null;
        setProgress('');
      }
    }
  }

  function append() {
    const combined = [original, text.trim()].filter(Boolean).join('\n\n');
    if (combined.length > 20000) {
      setError('合并后超过原始招聘文字的 20,000 字上限，请在识别结果中删减后再添加。');
      return;
    }
    onApply(combined, copyFields ? fields : {});
    setText('');
    setError('');
  }

  return <details className="op-poster">
    <summary>从招聘海报提取文字</summary>
    <p>图片在本机识别。核对后可把文字追加到私有原文，上传审核凭证有单独的入口。</p>
    <Field label="选择识别图片（JPEG 或 PNG）"><input type="file" accept="image/jpeg,image/png" disabled={!!progress}
      onChange={e => { read(e.target.files?.[0]); e.target.value = ''; }} /></Field>
    {progress && <div className="op-actions"><span role="status">{progress}</span><Button variant="ghost" onClick={() => {
      task.current?.abort(); task.current = null; setProgress('');
    }}>取消识别</Button></div>}
    {text && <>
      <Field label="核对识别文字"><textarea rows={5} value={text} onChange={e => setText(e.target.value)} /></Field>
      {Object.keys(fields).length > 0 && <label className="op-check"><input type="checkbox" checked={copyFields} onChange={e => setCopyFields(e.target.checked)} />
        同时补入空白字段（{Object.entries(fields).map(([k, v]) => labels[k] + ' ' + v).join('、')}）</label>}
      <Button variant="secondary" disabled={!text.trim() || !!progress} onClick={append}>追加到私有原文</Button>
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </details>;
}
