import { IconArrowBackUp, IconArrowForwardUp, IconBooks, IconBriefcase2, IconCheck, IconDownload, IconFileText, IconHistory, IconMessageCircle, IconPencil, IconTypography } from '@tabler/icons-react';
import { Button, IconButton, Menu } from './ui/index.jsx';
import { proposalState } from '../lib/workspace.js';

export function WorkspaceHeader({ doc, saveState, edit, mobileView, onMobileView, onOpen, onUndo, onRedo, designOpen, onDesignToggle }) {
  const pending = doc.messages.flatMap(message => (message.proposals || []).filter(proposal => !message.dismissed?.includes(proposal.id) && proposalState(doc, proposal) === 'pending')).length;
  const saveLabel = ({ saving: '正在保存', error: '保存未完成', loading: '正在读取云端资料', syncing: '正在同步', synced: '已同步', offline: '同步失败 · 本机已保存', expired: '登录过期 · 草稿已保留', conflict: '存在同步冲突' })[saveState] || '已保存到本机';
  const contextItems = [
    { label: '目标岗位与 JD', description: doc.job.title || '添加岗位要求', icon: <IconBriefcase2 size={17} />, onClick: () => onOpen('job') },
    { label: '选择项目素材', description: `已选 ${doc.resume.projectIds.length} 个项目`, icon: <IconBooks size={17} />, onClick: () => onOpen('projects') },
  ];
  return <>
    <header className="workspace-header" aria-label="当前简历工具栏">
      <div className="workspace-document">
        <Menu label="当前简历菜单" className="document-title-menu" icon={<IconFileText size={18} />} value={<span title={doc.title}>{doc.title}</span>} items={[
          { label: '重命名简历', icon: <IconPencil size={17} />, onClick: () => onOpen('rename') },
          { label: '版本记录', icon: <IconHistory size={17} />, onClick: () => onOpen('versions') },
          { label: pending ? `修改记录 · ${pending} 条待审核` : '修改记录', icon: <IconMessageCircle size={17} />, onClick: () => onOpen('review') },
        ]} />
        <span className={'save-status ' + saveState} role="status" aria-label={saveLabel} title={saveLabel}>{saveState === 'saved' ? <IconCheck size={14} /> : saveState === 'synced' ? <><IconCheck size={14} /><span>已同步</span></> : saveLabel}</span>
      </div>
      <nav className="workspace-context" aria-label="当前简历使用的资料">
        <button className="context-button job-context" aria-label="岗位与要求" title={doc.job.title || '添加目标岗位'} onClick={() => onOpen('job')}><IconBriefcase2 size={16} /><span>{doc.job.title || '添加岗位 JD'}</span><small>JD</small></button>
        <button className="context-button" aria-label="选择项目素材" onClick={() => onOpen('projects')}><IconBooks size={16} /><span>已选 {doc.resume.projectIds.length} 个项目</span></button>
      </nav>
      <div className="workspace-actions">
        <div className="history-actions" aria-label="编辑历史"><IconButton label="撤销修改" disabled={!doc.undo.length || !!edit} onClick={onUndo}><IconArrowBackUp size={17} /></IconButton><IconButton label="重做修改" disabled={!doc.redo.length || !!edit} onClick={onRedo}><IconArrowForwardUp size={17} /></IconButton></div>
        {pending ? <button className="review-indicator" aria-label={`${pending} 条建议待审核`} onClick={() => onOpen('review')}><span className="pending-dot" />{pending}<span>条建议</span></button> : null}
        <button type="button" className="workspace-design-toggle" aria-label={designOpen ? '完成排版' : '排版与模板'} aria-expanded={designOpen} aria-controls="resume-design-panel" title={designOpen ? '完成排版，恢复对话布局' : '排版与模板'} onClick={onDesignToggle}>{designOpen ? <IconCheck size={18} /> : <IconTypography size={18} />}<span>{designOpen ? '完成排版' : '排版与模板'}</span></button>
        <Button className="workspace-export" onClick={() => onOpen('export')}><IconDownload size={15} />导出</Button>
      </div>
    </header>
    <div className="mobile-workspace-bar">
      <div className="mobile-view-tabs" role="group" aria-label="工作区视图">
        <button aria-pressed={mobileView === 'chat'} className={mobileView === 'chat' ? 'active' : ''} onClick={() => onMobileView('chat')}><IconMessageCircle size={16} />对话</button>
        <button aria-pressed={mobileView === 'document'} className={mobileView === 'document' ? 'active' : ''} onClick={() => onMobileView('document')}><IconFileText size={16} />简历</button>
      </div>
      <Menu label="岗位与素材" className="mobile-context-menu" value="岗位与素材" items={contextItems} />
    </div>
  </>;
}
