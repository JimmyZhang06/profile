import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPreview, recordPreview, selectionPreview } from '../src/lib/experiencePreview.js';

const project = { id: 'example-project', name: '星桥体验优化（虚构）', role: '产品实习', date: '2025.06—2025.09', tags: ['用户研究'], facts: ['原始要点'], details: { background: '发现表单完成率偏低', goals: '减少填写负担', actions: '走查并简化非必要字段', results: '完成两轮可用性验证', notes: '尚未开展线上效果统计' } };
test('preview contains the complete draft without saving or compressing the source', () => {
  const draft = { ...project, facts: '要点甲\n要点乙', tags: '用户研究、需求分析、用户研究 ' };
  const before = structuredClone(draft), preview = projectPreview(draft);
  assert.deepEqual(preview.tags, ['用户研究', '需求分析']);
  assert.deepEqual(preview.sections.flatMap(section => section.text || section.items), [...Object.values(project.details), '要点甲', '要点乙']);
  assert.deepEqual(draft, before);
});
test('a quoted bullet previews the entire resume experience with its latest overrides', () => {
  const resume = { projectIds: [project.id], sources: [project], projectBullets: { [project.id]: ['岗位表达一', '岗位表达二', '岗位表达三'] }, overrides: { [project.id + ':1']: '手动修改的第二条' } };
  const before = structuredClone(resume), preview = selectionPreview(resume, project.id + ':1');
  assert.deepEqual(preview.sections[0].items, ['岗位表达一', '手动修改的第二条', '岗位表达三']);
  assert.equal(preview.sections[0].highlighted, 1);
  assert.equal(preview.sections.some(section => section.text === project.details.notes), false);
  assert.deepEqual(resume, before);
  assert.deepEqual(project.facts, ['原始要点']);
});
test('each structured experience is previewed independently, including unsaved text', () => {
  const entry = { id: 'work-a', organization: '星桥（虚构）', title: '产品实习生', period: '2025.07', description: '第一段\n\n第二段', visible: true };
  const resume = { projectIds: [], sources: [], workEntries: [entry, { ...entry, id: 'work-b', description: '另一段经历' }], profileSource: { workEntries: [{ ...entry, description: '旧资料' }] } };
  const preview = selectionPreview(resume, 'work-a:title');
  assert.equal(preview.sections[0].text, '第一段\n\n第二段');
  assert.equal(preview.title, entry.organization);
  assert.deepEqual(recordPreview({}, { description: '正文' }).sections, []);
});
test('legacy work and ordinary fields remain readable without adding unrelated records', () => {
  const resume = { projectIds: [], sources: [], company: '虚构公司', experience: '旧版经历全文', summary: '简介内容', contactItems: [{ id: 'mail', type: 'email', label: '', value: 'fiction@example.test' }] };
  assert.equal(selectionPreview(resume, 'experience').sections[0].text, '旧版经历全文');
  assert.equal(selectionPreview(resume, 'summary').kind, 'field');
  assert.equal(selectionPreview(resume, 'mail:value').sections[0].text, 'fiction@example.test');
  assert.equal(selectionPreview(resume, 'mail:value').kind, 'field');
});
