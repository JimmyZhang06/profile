import { useState } from 'react';
import { IconLayoutSidebar, IconEdit, IconSearch, IconBooks, IconSettings, IconFileText, IconUserCircle, IconDeviceDesktop } from '@tabler/icons-react';
import { IconButton } from './ui/index.jsx';
import { ThemeMenu } from './ThemeMenu.jsx';
import { BrandLogo } from './BrandLogo.jsx';

export function Sidebar({ state, theme, account, page, onHome, onToggle, onNew, onOpen, onSelect }) {
  const [search, setSearch] = useState('');
  const expanded = state.ui.sidebar;
  const docs = state.documents.filter(d => !d.archived && (d.title + d.job.company).includes(search));
  return <aside className={'sidebar ' + (expanded ? 'expanded' : '')} aria-label="我的工作空间">
    <div className="sidebar-top"><button className="wordmark" aria-label="返回当前简历" onClick={onHome}><BrandLogo expanded={expanded} /></button>{expanded ? <IconButton label="收起侧栏" onClick={onToggle}><IconLayoutSidebar size={19} /></IconButton> : null}</div>
    <nav className="sidebar-nav">
      {!expanded ? <IconButton label="展开侧栏" onClick={onToggle}><IconLayoutSidebar size={21} stroke={1.65} /></IconButton> : null}
      <button className={'nav-row new-document ' + (page === 'new' ? 'active' : '')} aria-current={page === 'new' ? 'page' : undefined} aria-label="新建岗位简历" data-tooltip={!expanded ? '新建岗位简历' : undefined} onClick={onNew}><IconEdit size={21} stroke={1.65} />{expanded ? <span>新建简历</span> : null}</button>
      <button className={'nav-row ' + (page === 'projects' ? 'active' : '')} aria-current={page === 'projects' ? 'page' : undefined} aria-label="项目素材" data-tooltip={!expanded ? '项目素材' : undefined} onClick={() => onOpen('projects')}><IconBooks size={21} stroke={1.65} />{expanded ? <span>项目素材</span> : null}</button>
      <button className={'nav-row ' + (page === 'profile' ? 'active' : '')} aria-current={page === 'profile' ? 'page' : undefined} aria-label="个人资料" data-tooltip={!expanded ? '个人资料' : undefined} onClick={() => onOpen('profile')}><IconUserCircle size={21} stroke={1.65} />{expanded ? <span>个人资料</span> : null}</button>
    </nav>
    {expanded ? <div className="sidebar-documents"><label className="sidebar-search"><IconSearch size={15} /><input aria-label="搜索简历" placeholder="搜索简历" value={search} onChange={e => setSearch(e.target.value)} /></label><div className="sidebar-section-label">我的简历 <span>{docs.length}</span></div><div className="document-list">{docs.map(doc => <button key={doc.id} className={'document-nav ' + (!page && state.activeId === doc.id ? 'active' : '')} onClick={() => onSelect(doc.id)}><IconFileText size={17} /><span>{doc.title}<small>{doc.job.company || '未设置公司'}{doc.example ? ' · 示例' : ''}</small></span></button>)}{!docs.length ? <p className="sidebar-empty">没有找到简历</p> : null}</div></div> : <div className="rail-current"><IconButton label="返回简历编辑" className={!page ? 'active' : ''} onClick={onHome}><IconFileText size={21} stroke={1.65} /></IconButton></div>}
    <div className="sidebar-bottom"><button className={"nav-row " + (page === "account" ? "active" : "")} aria-label={account?.owner || account?.user ? "账号与安全" : "登录账号"} data-tooltip={account?.owner?.email || account?.user?.email || (account?.health?.cloudEnabled === false ? "本机工作区 · 云同步暂未开放" : "登录账号，开启云同步")} onClick={() => onOpen("account")}><IconUserCircle size={21} stroke={1.65}/>{expanded ? <span>{account?.owner?.email || account?.user?.email || "登录账号"}</span> : null}</button><ThemeMenu theme={theme} expanded={expanded} /><button className={'nav-row ' + (page === 'settings' ? 'active' : '')} aria-current={page === 'settings' ? 'page' : undefined} aria-label="AI 与设置" data-tooltip={!expanded ? 'AI 与设置' : undefined} onClick={() => onOpen('settings')}><IconSettings size={21} stroke={1.65} />{expanded ? <span>AI 与设置</span> : null}</button>{expanded ? <div className="local-workspace-note"><IconDeviceDesktop size={14} />{account?.owner ? "个人空间 · 云端同步" : "个人空间 · 本机保存"}</div> : null}</div>
  </aside>;
}
