import test from 'node:test';
import assert from 'node:assert/strict';
import { activeDocument, emptyDocumentTrash, moveDocumentToTrash, restoreDocument } from '../src/lib/documents.js';
import {appendImportedResume, importedResume, parseResumeText} from '../src/lib/resumeImport.js';
import {pdfPageText} from '../src/lib/readPdf.js';
import {toMarkdown} from '../src/lib/workspace.js';
import {templateDesign} from '../src/lib/resumeDesign.js';
import { initialWorkspace, makeDocument, validWorkspace } from '../src/lib/workspace.js';
import { emptyCloudWorkspace, isPlaceholderDocument, mergeImportedWorkspace } from '../src/lib/cloudWorkspace.js';

test('deleting a resume preserves every draft, version, chat and source and switches to another document', () => {
  const state = initialWorkspace(), first = state.documents[0], second = makeDocument();
  first.composer = '尚未发送的虚构草稿';
  state.documents.push(second);
  const trashed = moveDocumentToTrash(state, first.id, 1700000000000);
  assert.equal(activeDocument(trashed).id, second.id);
  assert.equal(first.archived, undefined);
  assert.equal(trashed.library, state.library);
  assert.equal(trashed.profile, state.profile);
  assert.deepEqual(trashed.documents[0], {...first, archived: true, archivedAt: 1700000000000});
  assert.equal(moveDocumentToTrash(trashed, first.id), trashed);
  const restored = restoreDocument(trashed, first.id);
  assert.deepEqual(restored.documents[0], {...first, archived: false});
  assert.equal(activeDocument(restored).id, first.id);
  assert(validWorkspace(JSON.parse(JSON.stringify(restored))));
});

test('deleting the final resume leaves a valid recoverable workspace without creating another document', () => {
  const state = emptyCloudWorkspace(), id = state.activeId;
  const trashed = moveDocumentToTrash(state, id);
  assert.equal(activeDocument(trashed), null);
  assert.equal(trashed.documents.length, 1);
  assert(validWorkspace(JSON.parse(JSON.stringify(trashed))));
  assert.equal(isPlaceholderDocument(trashed.documents[0]), false);
  const restored = restoreDocument(trashed, id);
  assert.equal(activeDocument(restored).id, id);
  assert.equal(restored.documents[0].archivedAt, undefined);
  assert.equal(restoreDocument(restored, id), restored);
  assert.equal(moveDocumentToTrash(state, 'missing'), state);
});

test('emptying the bin only purges the reviewed archive snapshot, including a valid last-document purge', () => {
  const start = initialWorkspace(), second = makeDocument(), third = makeDocument();
  const all = {...start,documents:[...start.documents, second, third]};
  const archived = moveDocumentToTrash(moveDocumentToTrash(all, start.activeId, 12), second.id, 24);
  const confirmed = archived.documents.filter(d => d.archived);
  const changed = moveDocumentToTrash(restoreDocument(archived,second.id), third.id,36);
  const result = emptyDocumentTrash(changed,confirmed);
  assert.deepEqual(result.documents.map(d => d.id),[second.id,third.id]);
  assert.equal(result.activeId, second.id);
  const rearchived = moveDocumentToTrash(changed,second.id,48);
  assert(emptyDocumentTrash(rearchived,confirmed).documents.some(d => d.id === second.id));
  const empty = emptyDocumentTrash(rearchived,rearchived.documents);
  assert.deepEqual(empty.documents,[]); assert.equal(empty.activeId,null);
  assert.equal(empty.library,start.library);
  assert(validWorkspace(JSON.parse(JSON.stringify(empty))));
  assert(validWorkspace(mergeImportedWorkspace(empty,empty)));
  assert.equal(emptyDocumentTrash(empty,confirmed),empty);
});

test('PDF reading keeps dates and roles with their record and reads true columns independently', () => {
  const viewport = {width:600,convertToViewportPoint:(x,y) => [x,y]};
  const item = (str,x,y,width) => ({str,transform:[1,0,0,1,x,y],width,height:11});
  const rows = [0,1,2,3].flatMap(n => [
    item('示例工作室',40,20*n,65),item('产品实习生',230,20*n,65),item('2026.01–2026.05',410,20*n,94),
  ]);
  assert.deepEqual(pdfPageText(rows,viewport).split('\n'),Array(4).fill('示例工作室\t产品实习生\t2026.01–2026.05'));
  const columns = [0,1,2,3].flatMap(n => [item('左栏事实'+n,35,n*20,97),item('右栏经历'+n,311,n*20,100)]);
  assert.equal(pdfPageText(columns,viewport),'左栏事实0\n左栏事实1\n左栏事实2\n左栏事实3\n右栏经历0\n右栏经历1\n右栏经历2\n右栏经历3');
});

test('a reviewed import preserves every original point, unmatched text, structured records and independent archives', () => {
  const parsed = parseResumeText('林予安\t产品实习生\nreview@example.test | 138-0000-0000\n教育背景\n示例大学\t信息管理 本科\t2024.09–2028.06\n工作经历\n2025.06–2025.08\n示例公司\t产品实习生\n• 整理功能验收清单。\n第二工作室\t研究助理\t2026.03–2026.05\n• 组织访谈。\n项目经历\nAtlas\t产品设计\t2026.01–2026.03\n• 访谈用户。\n• 定义流程。\n• 复核原型。\n• 跟进交付。\n研究经历\n内容检索课题\t研究助理\t2025.03–2025.05\n核对索引。\n荣誉奖项\n示例竞赛优秀奖');
  assert.equal(parsed.profile.name,'林予安'); assert.equal(parsed.profile.workEntries.length,2);
  assert.equal(parsed.profile.workEntries[0].organization,'示例公司');
  assert.equal(parsed.profile.workEntries[0].period,'2025.06–2025.08');
  assert.equal(parsed.profile.contactItems.length,2);
  const doc = importedResume(parsed,'校对稿'), prior = emptyCloudWorkspace();
  const copy = appendImportedResume(prior,doc,false);
  assert.equal(copy.library, prior.library); assert.equal(copy.profile, prior.profile);
  assert.equal(copy.documents[1].origin,'file'); assert.equal(doc.resume.projectBullets[parsed.projects[0].id].length,4);
  const saved = appendImportedResume(prior,doc,true);
  const duplicate = appendImportedResume(saved,importedResume(parseResumeText('项目经历\nAtlas\t产品设计\t2026.01–2026.03\n• 访谈用户。\n• 定义流程。\n• 复核原型。\n• 跟进交付。'),'另一个版本'),true);
  assert.equal(duplicate.library.length,1);
  assert.equal(duplicate.documents.at(-1).resume.projectIds[0],saved.library[0].id);
  assert.equal(saved.profile.workEntries.length,2); assert(validWorkspace(saved));
  for (const id of ['application','scholar','portfolio']) {
    const md = toMarkdown({...doc,resume:{...doc.resume,design:templateDesign(id)}});
    assert(md.includes('示例竞赛优秀奖')); assert(md.includes('跟进交付。'));
    assert(templateDesign(id).fontSize >= 11 && templateDesign(id).lineHeight >= 1.5);
    if (id === 'scholar') assert(md.indexOf('## 研究经历') < md.indexOf('## 项目经历'));
    if (id === 'portfolio') assert(md.indexOf('## 项目经历') < md.indexOf('## 教育背景'));
  }
});

test('backup import retains trashed blank resumes and never selects an imported deleted document over an active resume', () => {
  const current = emptyCloudWorkspace();
  const archived = moveDocumentToTrash(current, current.activeId, 1700000000000);
  const incoming = initialWorkspace();
  const merged = mergeImportedWorkspace(archived, incoming);
  assert.equal(merged.documents.length, 2);
  assert.deepEqual(merged.documents.find(doc => doc.id === archived.activeId), archived.documents[0]);
  assert.equal(activeDocument(merged).archived, undefined);
  const source = moveDocumentToTrash(incoming, incoming.activeId);
  const active = initialWorkspace();
  const withTrash = mergeImportedWorkspace(active, source);
  assert.equal(withTrash.activeId, active.activeId);
  assert.equal(withTrash.documents.filter(doc => doc.archived).length, 1);
  assert(validWorkspace(withTrash));
});
