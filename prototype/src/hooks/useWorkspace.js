import { useEffect, useRef, useState } from 'react';
import { initialWorkspace, normalizeLayout, STORAGE_KEY, validWorkspace } from '../lib/workspace.js';

export function useWorkspace() {
  const [loaded] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { value: initialWorkspace() };
      const value = JSON.parse(raw);
      if (!validWorkspace(value)) throw new Error('资料格式无法读取，请先下载备份');
      return { value: normalizeLayout(value) };
    } catch (error) { return { value: initialWorkspace(), error: error.message }; }
  });
  const [state, setState] = useState(loaded.value);
  const [saveState, setSaveState] = useState(loaded.error ? 'error' : 'saved');
  const [error, setError] = useState(loaded.error || '');
  const [conflict, setConflict] = useState(false);
  const latest = useRef(state), external = useRef(false);
  latest.current = state;
  // Adopt the new panel defaults once, including an already-open editor after HMR.
  useEffect(() => setState(normalizeLayout), []);
  useEffect(() => {
    if (loaded.error || conflict) return;
    setSaveState('saving');
    const timer = setTimeout(() => {
      if (external.current) return;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(latest.current)); setSaveState('saved'); setError(''); }
      catch { setSaveState('error'); setError('本机保存失败，请导出备份后再继续。'); }
    }, 350);
    return () => clearTimeout(timer);
  }, [state, conflict, loaded.error]);
  useEffect(() => {
    function changed(event) { if (event.key === STORAGE_KEY && event.newValue) { external.current = true; setConflict(true); } }
    function flush() { if (!external.current && !loaded.error) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(latest.current)); } catch { /* The visible save indicator reports failures during editing. */ } } }
    window.addEventListener('storage', changed); window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('storage', changed); window.removeEventListener('pagehide', flush); };
  }, [loaded.error]);
  return { state, setState, saveState, error, conflict };
}
