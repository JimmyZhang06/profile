import { useState } from 'react';
import { IconArrowDown, IconArrowUpRight, IconCopy, IconPencil, IconRefresh, IconFileText, IconBooks, IconBriefcase2, IconPlug } from '@tabler/icons-react';
import { Button, IconButton } from './ui/index.jsx';
import { ChatComposer } from './ChatComposer.jsx';
import { useConversationScroll } from '../hooks/useConversationScroll.js';
import { MessageContent } from './MessageContent.jsx';
import { AssistantIdentity } from './AssistantIdentity.jsx';
import { BrandLogo } from './BrandLogo.jsx';
import { RevisionDeck } from './RevisionDeck.jsx';
function Message({ message, doc, onApply, onDismiss, onSource, onLocate, onOpen, onCopy, onRetry, onEdit, onReview, busy }) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(message.text);
  if (message.role === 'user') return <div className="user-turn">
    {editing ? <div className="user-edit"><textarea aria-label="重新编辑消息" value={draft} onChange={e => setDraft(e.target.value)} /><div><Button variant="ghost" onClick={() => setEditing(false)}>取消</Button><Button disabled={!draft.trim() || busy} onClick={() => { onEdit(draft); setEditing(false); }}>作为新消息发送</Button></div></div> : <><div className="user-bubble">{message.selected ? <div className="message-quote"><IconFileText size={14} />{message.selected.label}</div> : null}{message.text}</div><div className="user-message-actions"><IconButton label="复制消息" onClick={() => onCopy(message.text)}><IconCopy size={15} /></IconButton><IconButton label="编辑并重新发送" disabled={busy} onClick={() => setEditing(true)}><IconPencil size={15} /></IconButton></div></>}
  </div>;
  return <article className={'assistant-turn ' + (message.status === 'streaming' ? 'streaming' : '')} aria-label="助手回复">
    <AssistantIdentity offline={message.offline} status={message.status} hasText={Boolean(message.text)} />
    {message.kind === 'overview' ? <>
      <MessageContent text={message.text} />
      <div className="overview-points"><div><strong>会员分层，体现策略能力</strong><p>用「会员权益优化」说明如何发现问题、设计方案，并推动跨团队落地。</p></div><div><strong>活动复盘，体现数据意识</strong><p>用「新用户激活活动」呈现触达、转化分析与后续优化的过程。</p></div></div>
      <div className="source-chips"><button onClick={() => onOpen('job')}><IconBriefcase2 size={14} />增长运营 JD</button><button onClick={() => onOpen('projects')}><IconBooks size={14} />2 个示例项目</button></div>
      <button className="resume-artifact" onClick={() => onLocate('summary')}><span className="artifact-icon"><IconFileText size={23} stroke={1.55} /></span><span><strong>{doc.title}</strong><small>简历草稿 · 点击继续编辑</small></span><IconArrowUpRight size={18} /></button>
    </> : <MessageContent text={message.text || ''} typing={message.status === 'streaming'} />}
    <RevisionDeck message={message} doc={doc} onApply={onApply} onDismiss={onDismiss} onSource={onSource} onLocate={onLocate} onReview={onReview} />
    {message.recommendations?.length ? <Button variant="secondary" className="recommendation-link" onClick={() => onOpen('projects')}><IconBooks size={16} />查看项目组合</Button> : null}
    {message.connect ? <Button variant="secondary" onClick={() => onOpen('settings')}><IconPlug size={16} />连接模型</Button> : null}
    {['error', 'stopped'].includes(message.status) ? <div className={'message-notice ' + message.status}><span>{message.error || '已停止生成，未完成的建议不会写入简历。'}</span><button disabled={busy} onClick={() => onRetry(message)}><IconRefresh size={14} />重试</button></div> : null}
    {message.status !== 'streaming' ? <div className="message-actions"><IconButton label="复制回复" onClick={() => onCopy(message.text)}><IconCopy size={16} /></IconButton>{message.prompt ? <IconButton label="重新生成回复" disabled={busy} onClick={() => onRetry(message)}><IconRefresh size={16} /></IconButton> : null}</div> : null}
  </article>;
}

export function Chat({ doc, settings, selected, busy, focusKey, onSend, onStop, onInput, onRemoveSelection, onOpen, onApply, onDismiss, onSource, onLocate, onCopy, onRetry, onModel, active = true }) {
  const { viewportRef, contentRef, atBottom, onScroll, scrollToLatest, pauseFollowing } = useConversationScroll(doc.id, active);
  const enabled = settings.enabled && settings.capabilities.rewrite;

  function send(text) {
    if (!text.trim() || busy || !enabled) return;
    scrollToLatest();
    onSend(text);
  }

  return <section id="resume-conversation" className="chat-panel" aria-label="简历对话">
    <div className="chat-scroll" ref={viewportRef} role="region" aria-label="对话记录" tabIndex={0} onScroll={onScroll}>
      <div className="conversation-content" ref={contentRef}>
        {doc.example ? <div className="conversation-date">示例对话 <span>·</span> 内容均为虚构</div> : null}
        {!doc.messages.length ? <div className="chat-welcome">
          <span className="welcome-symbol"><BrandLogo /></span>
          <h1>一起打磨这份简历</h1>
          <p>说说你想突出什么。我们可以从挑选经历，或修改一段表达开始。</p>
          <div>
            <button disabled={!enabled || busy} onClick={() => send('检查这份简历的完整度')}><IconFileText size={18} /><span>看看还可以补充什么</span><IconArrowUpRight size={16} /></button>
            <button disabled={busy} onClick={() => onOpen('tailor')}><IconBooks size={18} /><span>从资料库按 JD 生成简历</span><IconArrowUpRight size={16} /></button>
          </div>
        </div> : null}
        {doc.messages.map(message => <Message key={message.id} message={message} doc={doc}
          onApply={onApply} onDismiss={onDismiss} onSource={onSource} onLocate={onLocate}
          onOpen={onOpen} onCopy={onCopy} onRetry={onRetry} onEdit={send} onReview={pauseFollowing} busy={busy} />)}
      </div>
    </div>
    <div className="composer-dock">
      {!atBottom ? <button type="button" className="scroll-latest" aria-label="回到最新消息" onClick={() => scrollToLatest(true)}><IconArrowDown size={15} /><span>回到最新</span></button> : null}
      <ChatComposer doc={doc} settings={settings} selected={selected} busy={busy} active={active}
        focusKey={focusKey} onSend={send} onStop={onStop} onInput={onInput}
        onRemoveSelection={onRemoveSelection} onOpen={onOpen} onModel={onModel} />
    </div>
  </section>;
}
