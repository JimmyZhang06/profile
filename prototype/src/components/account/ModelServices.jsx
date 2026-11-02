import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconArrowRight, IconCheck, IconGlobe, IconPlug, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import { Button, Field } from '../ui/index.jsx';
import { CurvedTabs } from '../ui/CurvedTabs.jsx';
import { SelectField } from '../ui/SelectField.jsx';
import { checkModelAddress, normalizeModelHost, modelTestFailure } from '../../lib/modelDestination.js';
import './model-services.css';

const blankConnection = () => ({ name: '', model: '', baseUrl: '', apiKey: '', enabled: false, monthlyLimit: 1000, maxOutputTokens: 4096, reason: '' });
const serialize = value => JSON.stringify(value);

export function ModelServices({ api, onDirty, initialView = 'connections' }) {
  const id = useId();
  const root = useRef(null);
  const [view, setView] = useState(initialView), [connections, setConnections] = useState(null);
  const [settings, setSettings] = useState(null), [hosts, setHosts] = useState([]);
  const [candidate, setCandidate] = useState(''), [reason, setReason] = useState('');
  const [draft, setDraft] = useState(null), [baseline, setBaseline] = useState('');
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [domainError, setDomainError] = useState(''), [confirm, setConfirm] = useState(''), [testResult, setTestResult] = useState(null);
  const modelDirty = !!draft && serialize(draft) !== baseline;
  const domainsChanged = !!settings && serialize(hosts) !== serialize(settings.hosts);
  const domainDirty = domainsChanged || !!candidate || !!reason;
  const address = checkModelAddress(draft?.baseUrl || '', settings?.hosts || []);
  const removed = settings?.hosts.filter(host => !hosts.includes(host)) || [];
  const affected = removed.reduce((total, host) => total + (settings.usage[host]?.platform || 0) + (settings.usage[host]?.personal || 0), 0);
  const candidateHost = normalizeModelHost(candidate) || checkModelAddress(candidate).host;
  const editing = !!draft;

  useLayoutEffect(() => {
    root.current?.closest('.admin-scroll')?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [view, editing]);
  useEffect(() => { onDirty(modelDirty || domainDirty || !!busy); }, [modelDirty, domainDirty, busy, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, []);

  function acceptDomains(data) {
    setSettings(data); setHosts(data.hosts); setReason(''); setCandidate(''); setDomainError(''); setConfirm('');
  }
  async function load(signal) {
    setError('');
    try {
      const [models, domains] = await Promise.all([api('models', { signal }), api('model-domains', { signal })]);
      if (signal?.aborted) return;
      setConnections(models.items); acceptDomains(domains);
    } catch (e) { if (e.name !== 'AbortError') setError(e.message); }
  }
  function openView(next) {
    setView(next); setNotice(''); setConfirm('');
    history.replaceState(null, '', next === 'domains' ? '#models/domains' : '#models');
  }
  function begin(value) {
    const next = { ...value, apiKey: '', reason: '' };
    setDraft(next); setBaseline(serialize(next)); setTestResult(null); setNotice(''); setError(''); setConfirm('');
  }
  function change(key, value) { setDraft(current => ({ ...current, [key]: value })); setTestResult(null); setNotice(''); }
  function backToList() {
    if (modelDirty) { setConfirm('discard-model'); return; }
    setDraft(null); setNotice(''); setError(''); setTestResult(null);
  }
  function addDomain() {
    if (!candidateHost) { setDomainError('请输入完整公网域名，也可以粘贴 HTTPS API 地址。'); return; }
    if (hosts.includes(candidateHost)) { setDomainError('这个域名已在列表中。'); return; }
    if (hosts.length >= 100) { setDomainError('最多允许 100 个域名。'); return; }
    setHosts(current => [...current, candidateHost]); setCandidate(''); setDomainError(''); setNotice('');
  }
  async function saveDomains(event) {
    event.preventDefault(); setBusy('domains'); setError(''); setNotice('');
    try {
      const result = await api('model-domains', { method: 'PUT', body: { hosts, reason, revision: settings.revision } });
      acceptDomains(result); setNotice('允许域名已保存，后续模型请求立即使用新配置。');
      setTestResult(null);
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }
  async function reloadDomains() {
    setBusy('reload'); setError(''); setNotice('');
    try { acceptDomains(await api('model-domains')); }
    catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }
  async function saveModel(event) {
    event.preventDefault(); setBusy('save'); setError(''); setNotice('');
    try {
      const result = await api('models', { method: 'POST', body: draft });
      setConnections(current => [...current.filter(item => item.id !== result.id), result]);
      begin(result); setNotice('平台连接已保存，可以测试地址、凭据和模型响应。');
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }
  async function testModel() {
    setBusy('test'); setError(''); setNotice(''); setTestResult(null);
    try {
      const result = await api('models/test', { method: 'POST', body: { connectionId: draft.id } });
      setTestResult(result);
    } catch (e) { setError(modelTestFailure(e)); }
    finally { setBusy(''); }
  }

  return <div className="model-services" ref={root}>
    <div className="admin-intro">
      <div><h1>AI 服务</h1><p>管理平台模型及允许访问的服务域名。</p></div>
      {view === 'connections' && !draft && settings ? <Button onClick={() => begin(blankConnection())}><IconPlus size={16} />添加平台模型</Button> : null}
    </div>
    <CurvedTabs id={id} label="AI 服务设置" className="model-service-tabs" value={view}
      items={[{ value: 'connections', label: <>模型连接{modelDirty ? <span className="model-draft-dot" aria-label="有未保存内容" /> : null}</> }, { value: 'domains', label: <>允许域名{domainDirty ? <span className="model-draft-dot" aria-label="有未保存内容" /> : null}</> }]}
      onChange={next => { if (!busy) openView(next); }} />
    {error ? <p className="admin-error" role="alert">{error}</p> : null}
    {notice ? <p className="admin-notice" role="status"><IconCheck size={18} /><span>{notice}</span></p> : null}
    {!settings || !connections ? <div className="model-loading"><p>{error ? '读取失败，尚未加载配置。' : '正在读取 AI 服务配置…'}</p>{error ? <Button variant="secondary" onClick={() => load()}>重新读取</Button> : null}</div> : <>
      <section id={`${id}-connections-panel`} role="tabpanel" aria-labelledby={`${id}-connections-tab`} hidden={view !== 'connections'}>
        {draft ? <>
          <div className="model-section-heading"><h2>{draft.id ? '编辑平台连接' : '添加平台连接'}</h2><Button variant="ghost" disabled={!!busy} onClick={backToList}><IconArrowLeft size={16} />返回列表</Button></div>
          {confirm === 'discard-model' ? <div className="model-inline-confirm" role="status"><p>连接有未保存的修改。返回列表会放弃这些修改。</p><div><Button variant="secondary" onClick={() => setConfirm('')}>继续编辑</Button><Button variant="ghost" onClick={() => { setDraft(null); setConfirm(''); }}>放弃修改并返回</Button></div></div> : null}
          <form className="model-connection-form" onSubmit={saveModel}>
            <fieldset disabled={!!busy}>
              <div className="model-form-grid">
                <Field label="连接名称"><input required maxLength={100} value={draft.name} placeholder="例如：团队写作助手" onChange={e => change('name', e.target.value)} /></Field>
                <Field label="模型 ID" hint="填写服务商提供的完整模型名称。"><input required maxLength={150} value={draft.model} placeholder="服务商的模型 ID" onChange={e => change('model', e.target.value)} /></Field>
              </div>
              <Field label="API 地址"><input type="url" required value={draft.baseUrl} placeholder="https://api.example.com/v1" spellCheck={false} autoCapitalize="none" aria-describedby={`${id}-address-status`} onChange={e => change('baseUrl', e.target.value)} /></Field>
              <div id={`${id}-address-status`} className={'model-address-status ' + address.state} aria-live="polite">
                <span>{address.state === 'allowed' ? <IconCheck size={16} /> : <IconGlobe size={16} />}{address.message}</span>
                <button type="button" onClick={() => { openView('domains'); if (address.state === 'blocked' && !candidate) setCandidate(address.host); }}>管理允许域名<IconArrowRight size={15} /></button>
              </div>
              <Field label="API Key" hint="加密保存；更换 API 地址时需重新填写密钥。"><input type="password" autoComplete="off" value={draft.apiKey} placeholder={draft.keyMask || '输入模型服务的 API Key'} onChange={e => change('apiKey', e.target.value)} /></Field>
              <div className="model-form-grid">
                <Field label="每月调用上限"><input type="number" min="0" max="1000000" required value={draft.monthlyLimit} onChange={e => change('monthlyLimit', Number(e.target.value))} /></Field>
                <Field label="单次最大输出 token"><input type="number" min="256" max="16384" required value={draft.maxOutputTokens} onChange={e => change('maxOutputTokens', Number(e.target.value))} /></Field>
              </div>
              <SelectField label="服务状态" value={draft.enabled ? 'on' : 'off'} disabled={!!busy} onChange={value => change('enabled', value === 'on')}
                options={[{ value: 'off', label: '停用 · 仅管理员可测试' }, { value: 'on', label: '启用 · 提供给用户' }]} />
              <Field label="操作原因"><input required minLength={2} maxLength={500} value={draft.reason} placeholder="例如：添加新的平台模型" onChange={e => change('reason', e.target.value)} /></Field>
              <div className="model-form-actions"><Button type="submit" busy={busy === 'save'} disabled={!modelDirty || address.state !== 'allowed'}>保存平台连接</Button><span>{address.state === 'blocked' ? '先添加允许域名，再保存连接。' : '新连接默认停用，测试通过后可启用。'}</span></div>
            </fieldset>
          </form>
          <section className="model-connection-test" aria-labelledby={`${id}-test-title`}>
            <div><h3 id={`${id}-test-title`}>测试连接</h3><p>发送一条固定测试消息，不包含简历或项目资料。测试会计入调用额度，服务商可能收取少量费用。</p></div>
            <Button variant="secondary" busy={busy === 'test'} disabled={!!busy || !draft.id || modelDirty || address.state !== 'allowed'} onClick={testModel}>{busy === 'test' ? '正在测试…' : '测试已保存连接'}</Button>
            {(!draft.id || modelDirty) ? <p className="model-test-hint">保存当前配置后即可测试。</p> : null}
            {testResult ? <p className="model-test-result" role="status"><IconCheck size={17} />本次测试通过 · {testResult.model} · {(testResult.durationMs / 1000).toFixed(1)} 秒</p> : null}
          </section>
        </> : <>
          {!settings.hosts.length ? <div className="model-setup-notice"><IconGlobe size={22} /><div><strong>先允许一个模型服务域名</strong><p>添加服务商的 API 域名后，就可以配置平台连接。本地整理仍可正常使用。</p></div><Button variant="secondary" onClick={() => openView('domains')}>配置允许域名<IconArrowRight size={16} /></Button></div> : null}
          {connections.length ? <div className="model-connection-list">{connections.map(item => {
            const allowed = checkModelAddress(item.baseUrl, settings.hosts).state === 'allowed';
            return <article className="model-connection-row" key={item.id}><IconPlug size={22} /><div><h2>{item.name}</h2><p>{item.model}</p><span>{item.baseUrl}</span></div><span className="admin-badge">{!allowed ? '域名未允许' : item.enabled ? '已启用' : '已停用'}</span><Button variant="ghost" onClick={() => begin(item)}>编辑连接<IconArrowRight size={16} /></Button></article>;
          })}</div> : <div className="model-empty"><IconPlug size={28} /><h2>还没有平台模型</h2><p>连接名称、模型 ID、API 地址和密钥，统一在这里管理。</p><Button variant="secondary" onClick={() => begin(blankConnection())}>添加第一个连接</Button></div>}
        </>}
      </section>
      <section id={`${id}-domains-panel`} role="tabpanel" aria-labelledby={`${id}-domains-tab`} hidden={view !== 'domains'}>
        <div className="model-section-heading"><div><h2>允许访问的域名</h2><p>适用于平台模型和用户自带模型。每个子域名单独添加。</p></div><Button variant="ghost" disabled={!!busy} onClick={() => domainDirty ? setConfirm('reload-domains') : reloadDomains()}><IconRefresh size={16} />刷新</Button></div>
        {draft ? <button className="model-return-draft" disabled={!!busy} onClick={() => openView('connections')}><IconArrowLeft size={16} />返回{modelDirty ? '未保存的' : ''}连接配置<span>表单内容已保留</span></button> : null}
        {confirm === 'reload-domains' ? <div className="model-inline-confirm" role="status"><p>载入服务器最新配置将替换此页尚未保存的域名修改。</p><div><Button variant="secondary" onClick={() => setConfirm('')}>保留修改</Button><Button variant="ghost" onClick={reloadDomains}>载入最新配置</Button></div></div> : null}
        <form className="model-domains-form" onSubmit={saveDomains}>
          <fieldset disabled={!!busy}>
            <div className="model-add-domain"><Field label="添加域名"><input value={candidate} placeholder="api.example.com" autoCapitalize="none" autoComplete="off" spellCheck={false} aria-describedby={`${id}-domain-help`} onChange={e => { setCandidate(e.target.value); setDomainError(''); }} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addDomain(); } }} /></Field><Button variant="secondary" disabled={!candidate.trim()} onClick={addDomain}><IconPlus size={16} />添加</Button></div>
            <p className="model-domain-help" id={`${id}-domain-help`}>{candidateHost && candidate.trim() !== candidateHost ? `将添加域名：${candidateHost}` : '可直接粘贴 HTTPS API 地址；只添加域名，路径仍在连接中填写。'}</p>
            {domainError ? <p className="form-error" role="alert">{domainError}</p> : null}
            <div className="model-domain-list-heading"><span>{hosts.length} 个域名</span><small>{domainsChanged ? '有待保存的修改' : settings.source === 'admin' ? '已保存到平台' : '当前使用部署初始配置'}</small></div>
            <ul className="model-domain-list">{hosts.map(host => <li key={host}><IconGlobe size={18} /><div><strong>{host}</strong><small>{settings.hosts.includes(host) ? `平台连接 ${settings.usage[host]?.platform || 0} · 个人连接 ${settings.usage[host]?.personal || 0}` : '新增 · 保存时校验公网解析'}</small></div><Button variant="ghost" aria-label={`移除域名 ${host}`} onClick={() => { setHosts(current => current.filter(value => value !== host)); setNotice(''); }}><IconTrash size={16} />移除</Button></li>)}</ul>
            {!hosts.length ? <p className="model-domain-empty">尚无允许域名。云端模型连接将不可用，本地整理不受影响。</p> : null}
            {removed.length ? <div className="model-removal-note" role="status"><strong>将移除 {removed.length} 个域名{affected ? `，影响 ${affected} 个连接` : ''}</strong><p>{removed.join('、')}</p><p>保存后，这些连接的新请求会被阻止，原连接配置仍然保留。</p></div> : null}
            <Field label="操作原因"><input required minLength={2} maxLength={500} value={reason} placeholder="例如：允许新的模型服务商" onChange={e => setReason(e.target.value)} /></Field>
            <div className="model-form-actions"><Button type="submit" busy={busy === 'domains'} disabled={!domainsChanged || !!candidate.trim()}>保存允许域名</Button><span>{candidate.trim() ? '请先将输入的域名添加到列表。' : '保存后立即生效，无需重启服务。'}</span></div>
          </fieldset>
        </form>
      </section>
    </>}
  </div>;
}
