import { useState } from 'react';
import { IconLayoutSidebar, IconEdit, IconSearch, IconBooks, IconSettings, IconFileText, IconUserCircle, IconDeviceDesktop, IconTrash } from '@tabler/icons-react';
import { IconButton } from './ui/index.jsx';
import { BrandLogo } from './BrandLogo.jsx';

export function Sidebar({ state, theme, account, page, onHome, onToggle, onNew, onOpen, onSelect }) {
  const [search, setSearch] = useState('');
  const expanded = state.ui.sidebar;
  const docs = state.documents.filter(d => !d.archived && (d.title + d.job.company).includes(search));
  const trashCount = state.documents.filter(d => d.archived).length;
  const identity = account?.owner || account?.user;
  const sessionUser = !account?.owner || account?.user?.id === account.owner.id ? account?.user : null;
  const profileName = account?.owner ? state.profile?.name?.trim() : '';
  const userName = sessionUser?.name?.trim();
  const accountName = profileName || (userName && userName !== identity?.email ? userName : '') || '个人账号';
  return <aside className={'sidebar ' + (expanded ? 'expanded' : '')} aria-label="我的工作空间">
    <div className="sidebar-top"><button className="wordmark" aria-label="返回当前简历" onClick={onHome}><BrandLogo expanded={expanded} /></button>{expanded ? <IconButton label="收起侧栏" onClick={onToggle}><IconLayoutSidebar size={19} /></IconButton> : null}</div>
    <nav className="sidebar-nav">
      {!expanded ? <IconButton label="展开侧栏" onClick={onToggle}><IconLayoutSidebar size={21} stroke={1.65} /></IconButton> : null}
      <button className={'nav-row new-document ' + (page === 'new' ? 'active' : '')} aria-current={page === 'new' ? 'page' : undefined} aria-label="新建岗位简历" data-tooltip={!expanded ? '新建岗位简历' : undefined} onClick={onNew}><IconEdit size={21} stroke={1.65} />{expanded ? <span>新建简历</span> : null}</button>
      <button className={'nav-row ' + (['library', 'profile', 'projects'].includes(page) ? 'active' : '')} aria-current={['library', 'profile', 'projects'].includes(page) ? 'page' : undefined} aria-label="资料库" data-tooltip={!expanded ? '资料库' : undefined} onClick={() => onOpen('library')}><IconBooks size={21} stroke={1.65} />{expanded ? <span>资料库</span> : null}</button>
    </nav>
    {expanded ? <div className="sidebar-documents"><label className="sidebar-search"><IconSearch size={15} /><input aria-label="搜索简历" placeholder="搜索简历" value={search} onChange={e => setSearch(e.target.value)} /></label><div className="sidebar-section-label">我的简历 <span>{docs.length}</span></div><div className="document-list">{docs.map(doc => <button key={doc.id} className={'document-nav ' + (!page && state.activeId === doc.id ? 'active' : '')} onClick={() => onSelect(doc.id)}><IconFileText size={17} /><span>{doc.title}<small>{doc.job.company || '未设置公司'}{doc.example ? ' · 示例' : ''}</small></span></button>)}{!docs.length ? <p className="sidebar-empty">{search ? "没有找到简历" : "还没有简历"}</p> : null}</div><button type="button" className="sidebar-trash" aria-current={page === "trash" ? "page" : undefined} onClick={() => onOpen("trash")}><IconTrash size={15} />回收站{trashCount ? <span>{trashCount}</span> : null}</button></div> : <div className="rail-current"><IconButton label="返回简历编辑" className={!page ? 'active' : ''} onClick={onHome}><IconFileText size={21} stroke={1.65} /></IconButton>{trashCount ? <IconButton label="回收站" className={page === "trash" ? "active" : ""} onClick={() => onOpen("trash")}><IconTrash size={20} stroke={1.65} /></IconButton> : null}</div>}
    <div className="sidebar-bottom">
      <button
        className={'nav-row sidebar-account ' + (page === 'account' ? 'active' : '')}
        aria-current={page === 'account' ? 'page' : undefined}
        aria-label={identity ? `账号与安全，${accountName}，${identity.email}` : '登录账号'}
        data-tooltip={!expanded ? (identity ? '账号与安全' : '登录账号') : undefined}
        onClick={() => onOpen('account')}
      >
        <IconUserCircle size={21} stroke={1.65} />
        {expanded ? <span className="sidebar-account-copy">
          <span className="sidebar-account-name" title={identity ? accountName : undefined}>{identity ? accountName : '登录账号'}</span>
          {identity ? <span className="sidebar-account-email" title={identity.email}>{identity.email}</span> : null}
        </span> : null}
      </button>
      <button className={'nav-row ' + (page === 'settings' ? 'active' : '')} aria-current={page === 'settings' ? 'page' : undefined} aria-label="设置" data-tooltip={!expanded ? '设置' : undefined} onClick={() => onOpen('settings')}><IconSettings size={21} stroke={1.65} />{expanded ? <span>设置</span> : null}</button>
      {expanded ? <div className="local-workspace-note"><IconDeviceDesktop size={14} />{account?.owner ? '个人空间 · 云端同步' : '个人空间 · 本机保存'}</div> : null}
    </div>
  </aside>;
}
