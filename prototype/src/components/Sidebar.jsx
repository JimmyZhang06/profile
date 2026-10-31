import { useRef, useState } from 'react';
import { IconLayoutSidebar, IconEdit, IconSearch, IconBooks, IconSettings, IconFileText, IconUserCircle, IconDeviceDesktop, IconCloud, IconTrash, IconDots, IconPencil, IconX } from '@tabler/icons-react';
import { IconButton, Menu } from './ui/index.jsx';
import { BrandLogo } from './BrandLogo.jsx';

export function Sidebar({ state, saveState, account, page, onHome, onToggle, onNew, onOpen, onSelect }) {
  const [search, setSearch] = useState('');
  const searchInput = useRef(null);
  const expanded = state.ui.sidebar;
  const query = search.trim().toLocaleLowerCase();
  const docs = state.documents.filter(doc => !doc.archived && [doc.title, doc.job.company, doc.job.title].join(' ').toLocaleLowerCase().includes(query));
  const trashCount = state.documents.filter(doc => doc.archived).length;
  const identity = account?.owner || account?.user;
  const sessionUser = !account?.owner || account?.user?.id === account.owner.id ? account?.user : null;
  const profileName = account?.owner ? state.profile?.name?.trim() : '';
  const userName = sessionUser?.name?.trim();
  const accountName = profileName || (userName && userName !== identity?.email ? userName : '') || '个人账号';
  const cloud = !!account?.owner;
  const storageLabel = ({ saving: '正在保存', saved: '本机已保存', loading: '正在读取云端资料', syncing: '正在同步', synced: '云端已同步', offline: '离线 · 草稿已保存', expired: '登录已过期', conflict: '需要处理同步冲突', error: '保存失败' })[saveState] || (cloud ? '云端工作区' : '本机工作区');
  const accountLabel = identity ? `账号与安全，${accountName}，${identity.email}` : '登录账号';
  function clearSearch() { setSearch(''); searchInput.current?.focus(); }

  return <aside className={'sidebar ' + (expanded ? 'expanded' : '')} aria-label="我的工作空间">
    <div className="sidebar-top">
      <button type="button" className="wordmark" aria-label="返回当前简历" onClick={onHome}><BrandLogo expanded={expanded} /></button>
      {expanded ? <IconButton label="收起侧栏" onClick={onToggle}><IconLayoutSidebar size={19} /></IconButton> : null}
    </div>
    <nav className="sidebar-nav" aria-label="工作区导航">
      {!expanded ? <IconButton label="展开侧栏" onClick={onToggle}><IconLayoutSidebar size={20} stroke={1.65} /></IconButton> : null}
      <button type="button" className={'nav-row new-document ' + (page === 'new' ? 'active' : '')} aria-current={page === 'new' ? 'page' : undefined} aria-label="新建岗位简历" data-tooltip={!expanded ? '新建岗位简历' : undefined} onClick={onNew}><IconEdit size={20} stroke={1.65} />{expanded ? <span>新建简历</span> : null}</button>
      <button type="button" className={'nav-row ' + (['library', 'profile', 'projects'].includes(page) ? 'active' : '')} aria-current={['library', 'profile', 'projects'].includes(page) ? 'page' : undefined} aria-label="资料库" data-tooltip={!expanded ? '资料库' : undefined} onClick={() => onOpen('library')}><IconBooks size={20} stroke={1.65} />{expanded ? <span>资料库</span> : null}</button>
    </nav>

    {expanded ? <section className="sidebar-documents" aria-label="简历列表">
      <div className="sidebar-search">
        <IconSearch size={16} aria-hidden="true" />
        <input ref={searchInput} aria-label="搜索简历" placeholder="搜索简历" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') clearSearch(); }} />
        {search ? <IconButton label="清除搜索" onClick={clearSearch}><IconX size={14} /></IconButton> : null}
      </div>
      <div className="sidebar-section-label"><h2>{query ? '搜索结果' : '我的简历'}</h2><span aria-label={`${docs.length} 份简历`}>{docs.length}</span></div>
      <div className="document-list">
        {docs.map(doc => {
          const selected = !page && state.activeId === doc.id;
          const subtitle = [doc.job.company?.trim(), doc.example ? '示例' : ''].filter(Boolean).join(' · ');
          return <div className={'sidebar-document-row' + (selected ? ' active' : '')} key={doc.id}>
            <button type="button" className="document-nav" aria-current={selected ? 'page' : undefined} title={doc.title} onClick={() => onSelect(doc.id)}>
              <span className="document-nav-copy"><span className="document-nav-title">{doc.title}</span>{subtitle ? <small>{subtitle}</small> : null}</span>
            </button>
            <Menu label={'简历操作：' + doc.title} className="sidebar-document-menu" icon={<IconDots size={17} />} items={[
              {label: '重命名', icon: <IconPencil size={16} />, onClick: () => onSelect(doc.id, 'rename')},
              {label: '删除简历', icon: <IconTrash size={16} />, onClick: () => onSelect(doc.id, 'delete')},
            ]} />
          </div>;
        })}
        {!docs.length ? <div className="sidebar-empty"><p>{query ? '没有匹配的简历' : '还没有简历'}</p><button type="button" onClick={query ? clearSearch : onNew}>{query ? '清除搜索' : '创建第一份简历'}</button></div> : null}
      </div>
    </section> : <div className="rail-current"><IconButton label="返回简历编辑" className={!page ? 'active' : ''} onClick={onHome}><IconFileText size={20} stroke={1.65} /></IconButton></div>}

    <div className="sidebar-footer">
      {expanded ? <button type="button" className="sidebar-trash" aria-current={page === 'trash' ? 'page' : undefined} onClick={() => onOpen('trash')}><IconTrash size={17} stroke={1.65} /><span>回收站</span>{trashCount ? <small>{trashCount}</small> : null}</button> : trashCount ? <IconButton label="回收站" className={page === 'trash' ? 'active' : ''} onClick={() => onOpen('trash')}><IconTrash size={20} stroke={1.65} /></IconButton> : null}
      <div className="sidebar-bottom">
        <button type="button" className={'nav-row sidebar-account ' + (page === 'account' ? 'active' : '')} aria-current={page === 'account' ? 'page' : undefined} aria-label={accountLabel} title={identity ? `${accountName}\n${identity.email}\n${storageLabel}` : '登录账号，在不同设备继续编辑'} data-tooltip={!expanded ? (identity ? '账号与安全' : '登录账号') : undefined} onClick={() => onOpen('account')}>
          <span className="sidebar-avatar" aria-hidden="true">{identity ? Array.from(accountName)[0] : <IconUserCircle size={21} stroke={1.65} />}</span>
          {expanded ? <span className="sidebar-account-copy"><span className="sidebar-account-name">{identity ? accountName : '登录账号'}</span><span className="sidebar-storage" title={storageLabel}>{cloud ? <IconCloud size={12} /> : <IconDeviceDesktop size={12} />}<span>{storageLabel}</span></span></span> : null}
        </button>
        <IconButton label="设置" className={'sidebar-settings' + (page === 'settings' ? ' active' : '')} aria-current={page === 'settings' ? 'page' : undefined} onClick={() => onOpen('settings')}><IconSettings size={19} stroke={1.65} /></IconButton>
      </div>
    </div>
  </aside>;
}
