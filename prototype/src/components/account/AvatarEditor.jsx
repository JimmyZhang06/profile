import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconCamera, IconRefresh, IconUpload } from '@tabler/icons-react';
import { Button } from '../ui/index.jsx';
import { Avatar } from './Avatar.jsx';
import { AVATAR_SIZE, avatarCrop, drawAvatar, readAvatarFile } from '../../lib/avatar.js';

export function AvatarEditor({ account, name, onDirtyChange, onBusyChange }) {
  const fileInput = useRef(null), upload = useRef(null), canvas = useRef(null), bitmapRef = useRef(null), sequence = useRef(0), drag = useRef(null);
  const [bitmap, setBitmap] = useState(null), [zoom, setZoom] = useState(1), [position, setPosition] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false), [reading, setReading] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  useEffect(() => { onDirtyChange(!!bitmap); return () => onDirtyChange(false); }, [!!bitmap, onDirtyChange]);
  useEffect(() => { onBusyChange(busy || reading); return () => onBusyChange(false); }, [busy, reading, onBusyChange]);
  useEffect(() => () => { sequence.current++; bitmapRef.current?.close(); }, []);
  useLayoutEffect(() => { if (bitmap && canvas.current) drawAvatar(canvas.current, bitmap, zoom, position); }, [bitmap, zoom, position]);
  function discard() {
    sequence.current++; bitmapRef.current?.close(); bitmapRef.current = null; setBitmap(null); setError(''); setReading(false);
    requestAnimationFrame(() => upload.current?.focus());
  }
  async function choose(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    const current = ++sequence.current; setReading(true); setError(''); setStatus('');
    try {
      const image = await readAvatarFile(file);
      if (current !== sequence.current) { image.close(); return; }
      bitmapRef.current?.close(); bitmapRef.current = image; setBitmap(image); setZoom(1); setPosition({ x: 0, y: 0 });
    } catch (e) { if (current === sequence.current) setError(e.message); }
    finally { if (current === sequence.current) setReading(false); }
  }
  async function save(remove = false) {
    setBusy(true); setError(''); setStatus('');
    try {
      let image = null;
      if (!remove) {
        const output = document.createElement('canvas'); output.width = output.height = AVATAR_SIZE;
        drawAvatar(output, bitmap, zoom, position); image = output.toDataURL('image/png');
      }
      await account.updateAvatar(image);
      discard(); setStatus(remove ? '已恢复默认头像' : '头像已保存，将随账号同步');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function move(next, nextZoom = zoom) {
    const crop = avatarCrop(bitmap.width, bitmap.height, nextZoom, next);
    setPosition({ x: crop.x, y: crop.y });
  }
  function pointerMove(event) {
    if (!drag.current || busy) return;
    const bounds = event.currentTarget.getBoundingClientRect(), factor = 240 / bounds.width;
    move({ x: drag.current.x + (event.clientX - drag.current.clientX) * factor, y: drag.current.y + (event.clientY - drag.current.clientY) * factor });
  }
  return <div className="avatar-editor">
    <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="选择头像图片" hidden onChange={choose} />
    <div className="avatar-editor-summary">
      <button ref={upload} type="button" className="avatar-upload" aria-label={account.user?.avatar ? '更换头像' : '上传头像'} onClick={() => fileInput.current?.click()} disabled={busy || reading}>
        <Avatar image={account.user?.avatar} name={name} /><span className="avatar-camera"><IconCamera size={15} /></span>
      </button>
      <div><strong>个人头像</strong><p>显示在个人工作区，支持 JPG、PNG、WebP。</p><div className="avatar-text-actions"><button type="button" disabled={busy || reading} onClick={() => fileInput.current?.click()}>{reading ? '正在读取…' : account.user?.avatar ? '更换图片' : '上传图片'}</button>{account.user?.avatar && !bitmap ? <button type="button" disabled={busy || reading} onClick={() => save(true)}>移除头像</button> : null}</div></div>
    </div>
    {bitmap ? <div className="avatar-crop-editor">
      <div className="avatar-crop-heading"><strong>调整头像</strong><span>拖动图片调整位置</span></div>
      <canvas ref={canvas} className="avatar-crop" width={240} height={240} tabIndex={busy ? -1 : 0} role="img" aria-label="头像裁剪预览，可拖动或使用方向键调整位置" aria-describedby="avatar-crop-hint"
        onPointerDown={event => { if (busy) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { clientX: event.clientX, clientY: event.clientY, ...position }; }} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        onKeyDown={event => { const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]; if (direction && !busy) { event.preventDefault(); const step = event.shiftKey ? 20 : 5; move({ x: position.x + direction[0] * step, y: position.y + direction[1] * step }); } }} />
      <p id="avatar-crop-hint" className="avatar-crop-hint">圆形范围内为头像显示区域，也可用方向键微调。</p>
      <label className="avatar-zoom"><span>缩放</span><input type="range" min="1" max="3" step=".01" value={zoom} disabled={busy} onChange={event => { const value = Number(event.target.value); setZoom(value); move(position, value); }} /><output>{Math.round(zoom * 100)}%</output></label>
      <div className="avatar-crop-actions"><button type="button" disabled={busy} onClick={() => { setZoom(1); setPosition({ x: 0, y: 0 }); }}><IconRefresh size={15} />重置</button><Button variant="secondary" disabled={busy} onClick={discard}>取消</Button><Button busy={busy} disabled={busy} onClick={() => save()}><IconUpload size={15} />保存头像</Button></div>
    </div> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {status ? <p className="avatar-status" role="status">{status}</p> : null}
  </div>;
}
