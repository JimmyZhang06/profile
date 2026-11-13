import { useCallback, useEffect, useRef, useState } from 'react';
import { cloudRequest } from '../../lib/cloudClient.js';
import { offerPendingPrefix } from './offerStorage.mjs';

function pendingRecords(owner) {
  const records = new Map();
  if (owner === 'guest') return records;
  const prefix = offerPendingPrefix(owner);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      try {
        const request = JSON.parse(localStorage.getItem(key));
        if (request?.plan?.schema === 1 && key === prefix + request.requestId)
          records.set(request.requestId, request);
      } catch { /* Leave unreadable recovery data untouched. */ }
    }
  } catch { /* Online saving is available even with device storage disabled. */ }
  return records;
}

export function useOfferRecords(owner, authenticated) {
  const [pending] = useState(() => pendingRecords(owner));
  const [records, setRecords] = useState([]), [pendingCount, setPendingCount] = useState(pending.size);
  const [saving, setSaving] = useState(false), [feedback, setFeedback] = useState('');
  const running = useRef(null), listVersion = useRef(0);
  const session = useRef(null);

  const sync = useCallback(async () => {
    const current = session.current;
    if (!current || current.signal.aborted || running.current) return running.current;
    setSaving(true);
    running.current = (async () => {
      for (const [id, request] of pending) {
        if (current.signal.aborted) break;
        try {
          const { item } = await cloudRequest('cloud/offers', {
            method: 'POST', ownerId: owner, body: request, signal: current.signal,
          });
          if (current.signal.aborted) break;
          pending.delete(id);
          listVersion.current++;
          try { localStorage.removeItem(offerPendingPrefix(owner) + id); } catch { /* Replays use the same request ID. */ }
          setPendingCount(pending.size);
          setRecords(items => [item, ...items.filter(i => i.id !== id)]);
          setFeedback('已保存到云端');
        } catch (error) {
          if (current.signal.aborted) break;
          setFeedback(error.status === 401 || error.status === 403 ? '请重新登录原账号，继续保存。'
            : error.status && error.status < 500 ? error.message : '暂时无法连接云端，恢复网络后会继续保存。');
          if (!error.status || error.status >= 500 || error.status === 401 || error.status === 403) break;
        }
      }
    })().finally(() => {
      if (session.current === current) { running.current = null; setSaving(false); }
    });
    return running.current;
  }, [owner, pending]);

  useEffect(() => {
    if (!authenticated) return;
    const current = new AbortController();
    session.current = current;
    async function load() {
      try {
        let version, items;
        do {
          version = listVersion.current;
          ({ items } = await cloudRequest('cloud/offers', { ownerId: owner, signal: current.signal }));
        } while (!current.signal.aborted && version !== listVersion.current);
        if (!current.signal.aborted) setRecords(items);
      } catch { if (!current.signal.aborted) setFeedback('暂时无法读取云端记录，可继续编辑。'); }
      if (!current.signal.aborted && pending.size) await sync();
    }
    load();
    window.addEventListener('online', load);
    return () => {
      current.abort(); session.current = null; running.current = null;
      setSaving(false);
      window.removeEventListener('online', load);
    };
  }, [owner, authenticated, pending, sync]);

  function save(plan, ruleVersion, preferredId) {
    if (owner === 'guest') return;
    const previous = [...pending.values()].find(item => item.ruleVersion === ruleVersion && JSON.stringify(item.plan) === JSON.stringify(plan));
    const request = previous ?? { requestId: preferredId ?? crypto.randomUUID(), plan: structuredClone(plan), ruleVersion };
    if (!previous) {
      try { localStorage.setItem(offerPendingPrefix(owner) + request.requestId, JSON.stringify(request)); }
      catch {
        if (!authenticated || !navigator.onLine) {
          setFeedback('无法暂存未同步记录，请保持此页打开，恢复连接后再保存。'); return;
        }
      }
      pending.set(request.requestId, request);
      setPendingCount(pending.size);
    }
    setFeedback(authenticated ? '正在保存到云端…' : '已暂存在这台设备。重新登录原账号后会继续保存。');
    sync();
    return request.requestId;
  }
  function discard(id) {
    if (running.current) return;
    try { localStorage.removeItem(offerPendingPrefix(owner) + id); }
    catch { setFeedback('此设备的待同步记录暂时无法移除。'); return; }
    pending.delete(id); setPendingCount(pending.size); setFeedback('');
  }
  async function remove(item) {
    await cloudRequest('cloud/offers/' + item.id + '?revision=' + item.revision, { method: 'DELETE', ownerId: owner });
    listVersion.current++;
    setRecords(items => items.filter(i => i.id !== item.id));
  }
  return { records, pendingCount, pending, saving, feedback, save, retry: sync, remove, discard };
}
