import { useState } from 'react';
import { IconArrowBackUp, IconFileText, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { Button, EmptyState, Page } from './ui/index.jsx';
import { BrandLogo } from './BrandLogo.jsx';
import './document-trash.css';

export function DeleteDocumentPage({doc, onBack, onConfirm}) {
  return <Page title="删除简历" description="这份简历会移入回收站，需要时可以恢复。" className="document-delete-page" onBack={onBack} footer={<><span className="footer-note">资料库原件和其他简历继续保留</span><div className="page-action-group"><Button variant="secondary" onClick={onBack}>取消</Button><Button onClick={onConfirm}><IconTrash size={16} />移入回收站</Button></div></>}>
    <article className="document-delete-summary"><IconFileText size={25} /><div><h2>{doc.title}</h2><p>{[doc.job.company, doc.job.title].filter(Boolean).join(' · ') || '尚未设置目标岗位'}</p><small>{doc.resume.projectIds.length} 个项目 · {doc.versions.length} 个历史版本 · {doc.messages.length} 条对话</small></div></article>
    <p className="document-trash-note">简历正文、排版、对话、输入草稿和历史版本会一并保留。恢复后可以继续编辑。</p>
  </Page>;
}

export function DocumentTrashPage({documents, onBack, onRestore}) {
  const [query, setQuery] = useState('');
  const deleted = documents.filter(doc => doc.archived).sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
  const visible = deleted.filter(doc => [doc.title, doc.job.company, doc.job.title].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  return <Page title="回收站" description="删除的简历保留在这里，可以连同对话和历史版本一起恢复。" className="document-trash-page" onBack={onBack}>
    {deleted.length ? <><div className="search-input document-trash-search"><IconSearch size={17} /><input aria-label="搜索已删除的简历" placeholder="搜索简历、公司或岗位" value={query} onChange={event => setQuery(event.target.value)} /></div><p className="document-trash-count">共 {deleted.length} 份{query ? `，找到 ${visible.length} 份` : ''}</p></> : null}
    <div className="document-trash-list">{visible.map(doc => <article className="document-trash-item" key={doc.id}><IconFileText size={22} /><div><h2>{doc.title}</h2><p>{[doc.job.company, doc.job.title].filter(Boolean).join(' · ') || '未设置目标岗位'}</p><small>{doc.archivedAt ? new Date(doc.archivedAt).toLocaleString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}) + ' 移入' : '已移入回收站'} · {doc.versions.length} 个历史版本</small></div><Button variant="secondary" aria-label={'恢复并打开：' + doc.title} onClick={() => onRestore(doc.id)}><IconArrowBackUp size={16} />恢复并打开</Button></article>)}</div>
    {!visible.length ? <EmptyState icon={<IconTrash size={28} />} title={query ? '没有找到这份简历' : '回收站是空的'}>{query ? '换一个简历名称、公司或岗位关键词。' : '移入回收站的简历会出现在这里。'}</EmptyState> : null}
  </Page>;
}

export function EmptyDocuments({onNew, onTrash, count}) {
  return <section className="empty-documents" aria-label="我的简历"><BrandLogo /><h1>为下一次投递，准备一份简历。</h1><p>从资料库挑选经历，针对目标岗位开始编辑。</p><div><Button onClick={onNew}><IconPlus size={17} />新建简历</Button>{count ? <Button variant="secondary" onClick={onTrash}><IconTrash size={16} />回收站 · {count}</Button> : null}</div></section>;
}
