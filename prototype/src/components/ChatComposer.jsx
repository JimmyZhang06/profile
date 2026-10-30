import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { IconArrowUp, IconPlus, IconX, IconSquareFilled, IconFileText, IconBooks, IconBriefcase2, IconSparkles, IconPlug } from '@tabler/icons-react';
import { IconButton, Menu } from './ui/index.jsx';
import { fieldLabel, fieldValue } from '../lib/workspace.js';
import { modelName } from '../lib/assistant.js';

function fitInput(input) {
  if (!input?.clientWidth) return;
  input.style.height = 'auto';
  input.style.height = Math.min(144, Math.max(32, input.scrollHeight)) + 'px';
}

export function ChatComposer({ doc, settings, selected, busy, focusKey, active, onSend, onStop, onInput, onRemoveSelection, onOpen, onModel }) {
  const inputRef = useRef(null), hintId = useId();
  const enabled = settings.enabled && settings.capabilities.rewrite;

  useEffect(() => { if (active && focusKey) inputRef.current?.focus(); }, [focusKey, active]);
  useLayoutEffect(() => fitInput(inputRef.current), [doc.composer, selected, active]);
  useEffect(() => {
    let previousWidth = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width !== previousWidth) {
        previousWidth = entry.contentRect.width;
        fitInput(inputRef.current);
      }
    });
    observer.observe(inputRef.current);
    return () => observer.disconnect();
  }, []);

  function send(text) {
    if (!text.trim() || busy || !enabled) return;
    onSend(text);
    inputRef.current?.focus();
  }

  return <>
    <form className={'composer ' + (!enabled ? 'composer-disabled' : '')} aria-label="发送对话消息" onSubmit={event => { event.preventDefault(); send(doc.composer); }}>
      {selected ? <div className="composer-selection">
        <div><IconFileText size={16} /><span>{fieldLabel(doc.resume, selected)}<small>{fieldValue(doc.resume, selected).slice(0, 70)}</small></span></div>
        <IconButton label="移除选中的段落" onClick={onRemoveSelection}><IconX size={15} /></IconButton>
      </div> : null}
      <textarea ref={inputRef} aria-label="消息输入框" aria-describedby={hintId}
        placeholder={enabled ? '想怎样调整这份简历？' : 'AI 已关闭，可直接编辑简历'}
        value={doc.composer} onChange={event => onInput(event.target.value)}
        disabled={!enabled} maxLength={12000} rows={1} wrap="soft"
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault(); send(doc.composer);
          }
        }} />
      <div className="composer-bottom">
        <Menu label="添加资料" className="attach-menu opens-up" icon={<IconPlus size={20} />} value="" items={[
          { label: '项目素材', description: '当前简历已关联 ' + doc.resume.projectIds.length + ' 个项目', icon: <IconBooks size={18} />, onClick: () => onOpen('projects') },
          { label: '岗位 JD', description: doc.job.title || '添加目标岗位', icon: <IconBriefcase2 size={18} />, onClick: () => onOpen('job') },
          { label: '个人资料', icon: <IconFileText size={18} />, onClick: () => onOpen('profile') },
        ]} />
        <Menu label="快捷调整" className="quick-actions-menu opens-up" icon={<IconSparkles size={18} />} value="" items={
          [selected ? '精简这段文字' : '精简个人简介', '推荐相关项目', '检查完整度'].map(text => ({ label: text, disabled: !enabled || busy, onClick: () => send(text) }))
        } />
        <Menu label="选择对话模型" className="model-menu opens-up" value={<span>{enabled ? modelName(settings) : '手工模式'}</span>} items={[
          { label: '本地整理', description: '精简、选材与完整度检查', selected: settings.bindings.rewrite === 'offline', onClick: () => onModel('offline') },
          ...settings.connections.map(connection => ({ label: connection.name, description: connection.model, selected: settings.bindings.rewrite === connection.id, onClick: () => onModel(connection.id) })),
          { separator: true },
          { label: '管理模型连接', icon: <IconPlug size={16} />, onClick: () => onOpen('settings') },
        ]} />
        {busy ? <IconButton label="停止生成" className="send-button" onClick={onStop}><IconSquareFilled size={14} /></IconButton> :
          <button className="send-button" aria-label="发送消息" type="submit" disabled={!doc.composer.trim() || !enabled}><IconArrowUp size={19} stroke={2} /></button>}
      </div>
    </form>
    <div className="composer-caption" id={hintId}>
      {!enabled ? '手工编辑与导出仍可使用' : settings.bindings.rewrite === 'offline' ? '本地整理 · 无需联网' : '采用建议前，请核对事实'}
      <span>Enter 发送 · Shift Enter 换行</span>
    </div>
  </>;
}
