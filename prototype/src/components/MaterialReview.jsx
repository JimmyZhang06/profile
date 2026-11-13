import { useState } from 'react';
import { IconArrowUpRight } from '@tabler/icons-react';
import { Button, Page } from './ui/index.jsx';
import { projectDetailFields, projectDetails } from '../lib/projects.js';
import { buildAssistantContext } from '../lib/assistant.js';

// Approval exists only in this review and the ensuing request. It is not saved
// in the workspace and does not authorize later messages or a different model.
export function MaterialReview({ projects, doc, job, connection, selectionDirty, busy, onCancel, onConfirm }) {
  const [scopes, setScopes] = useState(() => Object.fromEntries(projects.map(project => [project.id,
    ['background', 'responsibilities', 'actions', 'results', 'challenges', 'collaboration'].filter(key => projectDetails(project)[key].trim()),
  ])));
  const selectedCount = Object.values(scopes).reduce((count, fields) => count + fields.length, 0);
  function toggle(projectId, key, checked) {
    setScopes(old => ({ ...old, [projectId]: checked ? [...old[projectId], key] : old[projectId].filter(field => field !== key) }));
  }
  return <Page title="确认本次优化资料" description="勾选这次写作要用的项目细节。写好的建议会出现在对话中。"
    className="page-wide material-review-page" dirty={selectionDirty} onBack={onCancel} backLabel="返回选材"
    footer={<><span className="footer-note">{projects.length} 个项目 · {selectedCount} 项详细资料 · 仅本次请求</span><div className="project-footer-actions"><Button variant="ghost" onClick={onCancel}>返回选材</Button><Button disabled={busy} onClick={() => onConfirm({ connectionId: connection.id, baseUrl: connection.baseUrl, scopes })}>发送所选资料并生成建议<IconArrowUpRight size={15} /></Button></div></>}>
    <details className="material-base-preview"><summary>查看发送范围与隐私</summary>
      <p>本次接收方为 {connection.name}（{connection.baseUrl}）。发送内容包括下方勾选的资料、岗位 JD 及以下简历要点。</p>
      <h3>{job.company} · {job.title}</h3><p>{job.text}</p>{buildAssistantContext(doc, null).fields.map(field => <section key={field.id}><h4>{field.label}</h4><p>{field.text || '尚未填写'}</p></section>)}</details>
    <div className="material-review-projects">{projects.map(project => {
      const details = projectDetails(project), fields = projectDetailFields.filter(field => details[field.key].trim());
      return <section key={project.id}><h2>{project.name}</h2>{fields.length ? fields.map(field => <div className="material-scope-row" key={field.key}>
        <label><input type="checkbox" checked={scopes[project.id].includes(field.key)} onChange={event => toggle(project.id, field.key, event.target.checked)} /><strong>{field.label}</strong><span>{details[field.key].length} 字</span></label>
        <details><summary>查看具体内容</summary><p>{details[field.key]}</p></details>
      </div>) : <p className="muted">尚未填写详细档案，本次使用已写入简历的要点。</p>}</section>;
    })}</div>
  </Page>;
}
