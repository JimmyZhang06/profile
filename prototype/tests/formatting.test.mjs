import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace, setField, fieldValue, mutateResume, undoDocument, validWorkspace, toMarkdown, acceptedProposal, validateSuggestions } from '../src/lib/workspace.js';
import { normalizeMarks, textSegments, marksForField, toEditorContent, fromEditorContent, remapTextStyles, formattedMarkdown } from '../src/lib/richText.js';
import { templateDesign, getResumeDesign, resumeTemplates } from '../src/lib/resumeDesign.js';

test('overlapping styles round-trip Chinese, emoji, empty lines and trailing whitespace', () => {
  const value = '策略🧭\n\n项目结果  ', input = [{ from: 0, to: 4, bold: true }, { from: 2, to: 4, italic: true }, { from: 6, to: 10, underline: true }];
  const draft = fromEditorContent(toEditorContent(value, input));
  assert.equal(draft.value, value);
  assert.deepEqual(draft.marks, normalizeMarks(value, input));
  assert.equal(textSegments(value, draft.marks).map(part => part.text).join(''), value);
  assert.deepEqual(normalizeMarks('🧭', [{ from: 1, to: 2, bold: true }]), []);
  assert.deepEqual(fromEditorContent(toEditorContent('', [])), { value: '', marks: [] });
});

test('format-only edits preserve plain AI context, source facts and document undo history', () => {
  const doc = initialWorkspace().documents[0], original = structuredClone(doc.resume);
  const field = doc.resume.projectIds[0] + ':0', value = fieldValue(doc.resume, field);
  const styled = mutateResume(doc, setField(doc.resume, field, value, [{ from: 0, to: 4, bold: true }]));
  assert.equal(fieldValue(styled.resume, field), value);
  assert.deepEqual(styled.resume.sources, original.sources);
  assert.deepEqual(marksForField(styled.resume, field, value), [{ from: 0, to: 4, bold: true }]);
  const changed = mutateResume(styled, { ...styled.resume, design: templateDesign('sidebar') });
  assert.deepEqual(undoDocument(changed).resume, styled.resume);
  assert.deepEqual(undoDocument(undoDocument(changed), true).resume, changed.resume);
  assert.deepEqual(undoDocument(styled).resume, original);
});

test('rewriting plain text invalidates only its old formatting, while undo restores it', () => {
  const initial = initialWorkspace().documents[0];
  const doc = mutateResume(initial, setField(initial.resume, 'summary', initial.resume.summary, [{ from: 0, to: 4, bold: true }]));
  const [suggestion] = validateSuggestions([{ field: 'summary', after: '关注用户分层与活动复盘。' }], doc);
  const accepted = acceptedProposal(doc, suggestion);
  assert.deepEqual(marksForField(accepted.resume, 'summary', accepted.resume.summary), []);
  assert.equal(accepted.resume.textStyles.summary, undefined);
  assert.deepEqual(undoDocument(accepted).resume.textStyles, doc.resume.textStyles);
  const stale = { ...doc.resume, summary: '新文字' };
  assert.deepEqual(marksForField(stale, 'summary', stale.summary), []);
  assert.equal(mutateResume(doc, stale).resume.textStyles.summary, undefined);
});

test('formatting and templates survive JSON backup; legacy backups still load', () => {
  const workspace = initialWorkspace(), doc = workspace.documents[0];
  doc.resume = setField(doc.resume, 'summary', '项目结果', [{ from: 0, to: 2, bold: true, underline: true }]);
  doc.resume.design = { ...templateDesign('editorial'), fontSize: 12.5, lineHeight: 2.2 };
  doc.versions.push({ id: 'formatted', name: '排版版本', time: Date.now(), resume: structuredClone(doc.resume) });
  assert.equal(validWorkspace(JSON.parse(JSON.stringify(workspace))), true);
  const restored = JSON.parse(JSON.stringify(workspace)).documents[0].resume;
  assert.deepEqual(restored.textStyles, doc.resume.textStyles);
  assert.equal(getResumeDesign(restored).fontSize, 12.5);
  delete doc.resume.design; delete doc.resume.textStyles;
  doc.resume.font = 'sans'; doc.resume.density = 'compact';
  assert.equal(validWorkspace(workspace), true);
  assert.equal(getResumeDesign(doc.resume).font, 'sans');
  assert.equal(getResumeDesign(doc.resume).lineHeight, 1.65);
});

test('backup validation rejects invalid styles and CSS values without accepting HTML', () => {
  for (const design of [{ ...templateDesign('classic'), fontSize: -1 }, { ...templateDesign('classic'), margin: 'url(https://example.test)' }, { ...templateDesign('classic'), template: 'unknown' }]) {
    const workspace = initialWorkspace(); workspace.documents[0].resume.design = design;
    assert.ok(!validWorkspace(workspace));
  }
  for (const marks of [[{ from: 0, to: 99, bold: true }], [{ from: 0, to: 2, html: '<script>' }], [{ from: 1, to: 2, bold: true }]]) {
    const workspace = initialWorkspace(); workspace.documents[0].resume.textStyles = { summary: { text: '🧭成果', marks } };
    assert.ok(!validWorkspace(workspace));
  }
});

test('import remaps project formatting keys without changing global fields or snapshots', () => {
  const saved = { text: '测试文字', marks: [{ from: 0, to: 2, bold: true }] };
  const styles = { 'project:0': saved, summary: saved };
  assert.deepEqual(remapTextStyles(styles, id => 'new-' + id), { 'new-project:0': saved, summary: saved });
  assert.ok(styles['project:0']);
});

test('Markdown preserves adjacent mixed marks and escapes user HTML', () => {
  assert.equal(formattedMarkdown('甲乙丙', [{ from: 0, to: 2, bold: true }, { from: 1, to: 3, italic: true }]), '<strong>甲</strong><strong><em>乙</em></strong><em>丙</em>');
  const doc = initialWorkspace().documents[0];
  doc.resume = setField(doc.resume, 'summary', '<img src=x>重点', [{ from: 11, to: 13, bold: true, underline: true }]);
  const markdown = toMarkdown(doc);
  assert.match(markdown, /&lt;img src=x&gt;<u><strong>重点<\/strong><\/u>/);
  assert.doesNotMatch(markdown, /<img/);
});

test('all template presets validate and apply independently of resume content', () => {
  const workspace = initialWorkspace(), doc = workspace.documents[0], original = structuredClone(doc.resume);
  for (const template of resumeTemplates) {
    doc.resume = { ...original, design: templateDesign(template.id) };
    assert.equal(validWorkspace(workspace), true);
    assert.equal(getResumeDesign(doc.resume).template, template.id);
    assert.deepEqual(doc.resume.sources, original.sources);
  }
});
