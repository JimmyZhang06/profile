import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavigationGuard } from '../src/lib/navigation.js';

test('unsaved page content survives a cancelled navigation', () => {
  const guard = createNavigationGuard(), visited = [];
  assert.equal(guard.request(() => visited.push('projects')), true);
  guard.setDirty(true);
  assert.equal(guard.request(() => visited.push('settings')), false);
  assert.deepEqual(visited, ['projects']);
  guard.stay();
  guard.discard();
  assert.deepEqual(visited, ['projects']);
});

test('discard follows the latest destination once and preserves other dirty fields', () => {
  const guard = createNavigationGuard(), visited = [];
  guard.setDirty(true);
  guard.request(() => visited.push('profile'));
  guard.request(() => visited.push('project-list'));
  guard.discard();
  guard.discard();
  assert.deepEqual(visited, ['project-list']);
  assert.equal(guard.request(() => visited.push('editor')), false);
  guard.setDirty(false);
  assert.equal(guard.request(() => visited.push('editor')), true);
  assert.deepEqual(visited, ['project-list', 'editor']);
});

test('saving a page clears a previously queued departure', () => {
  const guard = createNavigationGuard(), visited = [];
  guard.setDirty(true);
  guard.request(() => visited.push('settings'));
  guard.reset();
  guard.discard();
  assert.deepEqual(visited, []);
  assert.equal(guard.request(() => visited.push('editor')), true);
  assert.deepEqual(visited, ['editor']);
});
