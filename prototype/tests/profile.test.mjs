import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace, makeDocument, setField, fieldValue, mutateResume, undoDocument, toMarkdown, validWorkspace, validateSuggestions, proposalState } from '../src/lib/workspace.js';
import { normalizeProfile, profileSelections, applyProfileSelection, syncLegacyFields, validProfile, visibleRecords } from '../src/lib/profile.js';
import { emptyCloudWorkspace, mergeImportedWorkspace, isPlaceholderDocument } from '../src/lib/cloudWorkspace.js';
import { buildAssistantContext } from '../src/lib/assistant.js';
import { createDatabase, query } from '../server/cloud/database.mjs';
import { ensureWorkspace, importWorkspace, readWorkspace } from '../server/cloud/workspace.mjs';

function fixture() {
  return syncLegacyFields({...normalizeProfile({name: '虚构候选人', summary: '原始简介', skills: '产品设计'}),
    contactItems: [
      {id: 'contact-mail', type: 'email', label: '', value: 'candidate@example.test', visible: true},
      {id: 'contact-link', type: 'link', label: '作品集', value: 'https://example.test/work', visible: true},
      {id: 'contact-hidden', type: 'phone', label: '', value: '000-0000-0000', visible: false},
    ],
    workEntries: [
      {id: 'work-one', organization: '虚构甲公司', title: '产品实习生', period: '2025.01—2025.03', description: '整理 3 份流程文档。', visible: true},
      {id: 'work-two', organization: '虚构乙公司', title: '运营实习生', period: '2025.07—2025.09', description: '整理用户反馈，跟进 8 个问题。', visible: true},
      {id: 'work-hidden', organization: '仅在资料库保留', title: '其他', period: '', description: '不应发送或导出。', visible: false},
    ],
    educationEntries: [
      {id: 'edu-one', organization: '虚构大学', title: '本科', period: '2022—2026', description: '课程与荣誉', visible: true},
      {id: 'edu-two', organization: '虚构交流学校', title: '交流学习', period: '2024', description: '研究方法', visible: true},
    ],
    researchEntries: [{id: 'research-one', organization: '虚构研究课题', title: '研究助理', period: '2026—至今', description: '完成数据整理；独立验证仍在规划。', visible: true}],
  });
}

test('legacy data is losslessly exposed as separate records and uncertain contact text is retained', () => {
  const old = {name: '示例', contact: '123-4567-0000 | demo@example.test\nhttps://example.test/work\nGitHub：github.com/example\n城市与时间待确认', company: '示例公司 · 实习生', period: '暑期', experience: '第一段\n第二段', school: '示例学校', major: '专业 · 本科\n课程\n荣誉', educationPeriod: '时间待补'};
  const saved = structuredClone(old), profile = normalizeProfile(old);
  assert.deepEqual(old, saved);
  assert.equal(profile.contactItems[2].value, 'https://example.test/work');
  assert.equal(profile.contactItems[2].label, '');
  assert.equal(profile.contactItems[3].label, 'GitHub');
  assert.equal(profile.contactItems.at(-1).value, '城市与时间待确认');
  assert.equal(profile.workEntries[0].description, old.experience);
  assert.equal(profile.workEntries[0].title, '实习生');
  assert.equal(syncLegacyFields(profile).major, old.major);
  assert.deepEqual(normalizeProfile(profile), profile);
  assert(validProfile(profile));
});

test('new resumes retain multiple work, education and research records but exclude default-hidden records and contacts', () => {
  const profile = fixture(), doc = makeDocument({profile});
  assert.equal(doc.resume.workEntries.length, 2);
  assert.equal(doc.resume.educationEntries.length, 2);
  assert.equal(doc.resume.researchEntries.length, 1);
  assert.equal(doc.resume.contactItems.length, 2);
  const markdown = toMarkdown(doc);
  assert.match(markdown, /虚构甲公司[\s\S]*虚构乙公司/);
  assert.match(markdown, /研究经历[\s\S]*独立验证仍在规划/);
  assert.match(markdown, /虚构大学[\s\S]*虚构交流学校/);
  assert.doesNotMatch(markdown, /000-0000|仅在资料库保留/);
  doc.resume.workEntries[1].description = '为岗位修改过的表达';
  assert.equal(profile.workEntries[1].description, '整理用户反馈，跟进 8 个问题。');
});

test('applying selected sections preserves other edits and snapshots; removing a selected section is explicit and undoable', () => {
  const profile = fixture(), original = makeDocument({profile});
  let doc = mutateResume(original, setField(original.resume, 'work-two:description', '针对当前岗位的表达'));
  doc = mutateResume(doc, setField(doc.resume, 'summary', '已经手工修改的岗位简介', [{from: 0, to: 2, bold: true}]));
  const selected = profileSelections(profile);
  profile.contactItems[0].value = 'changed@example.test';
  const next = applyProfileSelection(doc.resume, profile, selected, ['contactItems']);
  assert.equal(next.summary, doc.resume.summary);
  assert.deepEqual(next.textStyles.summary, doc.resume.textStyles.summary);
  assert.equal(next.workEntries[1].description, '针对当前岗位的表达');
  assert.equal(next.profileSource.workEntries[1].description, '整理用户反馈，跟进 8 个问题。');
  assert.equal(next.contactItems[0].value, 'changed@example.test');
  const cleared = mutateResume(doc, applyProfileSelection(doc.resume, profile, {...selected, workEntries: []}, ['workEntries']));
  assert.equal(cleared.resume.workEntries.length, 0);
  assert.equal(cleared.resume.experience, '');
  assert.deepEqual(undoDocument(cleared).resume, doc.resume);
  assert.equal(original.resume.contactItems[0].value, 'candidate@example.test');
});

test('rich-text editing and AI suggestions address the second experience without exposing contact details', () => {
  const profile = fixture(), doc = makeDocument({profile});
  doc.resume = setField(doc.resume, 'work-two:description', '整理反馈并跟进 8 个问题。', [{from: 0, to: 4, bold: true}]);
  assert.equal(fieldValue(doc.resume, 'work-two:description'), '整理反馈并跟进 8 个问题。');
  assert.equal(doc.resume.workEntries[0].description, profile.workEntries[0].description);
  assert.match(toMarkdown(doc), /<strong>整理反馈<\/strong>/);
  const context = buildAssistantContext(doc, 'work-two:description');
  assert(context.fields.some(field => field.id === 'work-two:description'));
  assert(context.fields.some(field => field.id === 'research-one:description'));
  assert.doesNotMatch(JSON.stringify(context), /candidate@example|example.test\/work|000-0000|work-hidden/);
  const proposals = validateSuggestions([
    {field: 'work-two:description', after: '跟进 8 个问题。'},
    {field: 'work-one:description', after: '跟进 8 个问题。'},
    {field: 'contact-mail:value', after: 'evil@example.test'},
  ], doc);
  assert.equal(proposals.length, 1, 'numbers cannot leak from a different internship');
  assert.equal(proposalState(doc, proposals[0]), 'pending');
  const changed = {...doc, resume: {...doc.resume, workEntries: doc.resume.workEntries.filter(entry => entry.id !== 'work-two')}};
  assert.equal(proposalState(changed, proposals[0]), 'stale');
});

test('structured backups validate shapes and imports remap record styles, snapshots and archive identities', () => {
  const state = emptyCloudWorkspace(); state.profile = fixture();
  const doc = makeDocument({profile: state.profile});
  doc.resume = setField(doc.resume, 'work-two:description', doc.resume.workEntries[1].description, [{from: 0, to: 2, bold: true}]);
  state.documents = [doc]; state.activeId = doc.id;
  assert(validWorkspace(JSON.parse(JSON.stringify(state))));
  const merged = mergeImportedWorkspace(emptyCloudWorkspace(), state);
  assert(validWorkspace(merged));
  const imported = merged.documents[0].resume, second = imported.workEntries[1];
  assert.notEqual(second.id, 'work-two');
  assert(imported.textStyles[second.id + ':description']);
  assert.equal(imported.profileSource.workEntries[1].id, second.id);
  assert.equal(merged.profile.workEntries[1].id, second.id);
  assert.equal(merged.documents.length, 1);
  for (const malformed of [null, {}, [state.profile.workEntries[0], state.profile.workEntries[0]], [{...state.profile.workEntries[0], description: {bad: true}}]]) {
    const copy = structuredClone(state); copy.profile.workEntries = malformed; assert.equal(validWorkspace(copy), false);
  }
  for (const malformed of [null, [], {workEntries: 'broken'}, {contactItems: [null]}]) {
    const copy = structuredClone(state); copy.documents[0].resume.profileSource = malformed; assert.equal(validWorkspace(copy), false);
  }
  const empty = makeDocument(); empty.resume.researchEntries = [fixture().researchEntries[0]];
  assert.equal(isPlaceholderDocument(empty), false);
});

test('structured workspaces persist with the real import transaction and remain idempotent', async t => {
  const database = await createDatabase({memory: true}); t.after(() => database.close());
  await query(database.db, 'CREATE TABLE "user" (id TEXT PRIMARY KEY)');
  await query(database.db, 'CREATE TABLE session (id TEXT PRIMARY KEY)');
  await database.migrate();
  await query(database.db, 'INSERT INTO "user" (id) VALUES ($1),($2)', ['profile-owner-a', 'profile-owner-b']);
  const before = await ensureWorkspace(database.db, 'profile-owner-a');
  await ensureWorkspace(database.db, 'profile-owner-b');
  const incoming = emptyCloudWorkspace(); incoming.profile = fixture();
  const doc = makeDocument({profile: incoming.profile}); incoming.documents = [doc]; incoming.activeId = doc.id;
  const saved = await importWorkspace(database.db, 'profile-owner-a', {state: incoming, revision: before.revision});
  assert.equal(saved.state.documents[0].resume.workEntries.length, 2);
  assert.equal(saved.state.profile.workEntries.length, 3);
  const repeated = await importWorkspace(database.db, 'profile-owner-a', {state: incoming, revision: before.revision});
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.revision, saved.revision);
  const other = await readWorkspace(database.db, 'profile-owner-b');
  assert.equal(other.state.profile.name, '');
  assert.equal(other.state.documents[0].resume.workEntries, undefined);
});
