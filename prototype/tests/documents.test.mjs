import test from 'node:test';
import assert from 'node:assert/strict';
import { activeDocument, moveDocumentToTrash, restoreDocument } from '../src/lib/documents.js';
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
