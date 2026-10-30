import test from 'node:test';
import assert from 'node:assert/strict';
import { createTypewriter } from '../src/lib/typewriter.js';
import { clampPanelRatio, panelBounds } from '../src/lib/panels.js';
import { initialWorkspace, validWorkspace } from '../src/lib/workspace.js';

function harness(options = {}) {
  let time = 0, nextId = 0;
  const tasks = new Map(), values = [], controller = new AbortController();
  const clock = { now: () => time, schedule: callback => { tasks.set(++nextId, callback); return nextId; }, cancel: id => tasks.delete(id) };
  const writer = createTypewriter({ onText: value => values.push(value), signal: controller.signal, clock, ...options });
  function advance(ms) {
    for (let elapsed = 0; elapsed < ms; elapsed += 24) {
      time += 24;
      const pending = [...tasks.values()]; tasks.clear(); pending.forEach(callback => callback());
    }
  }
  return { writer, values, controller, advance, tasks };
}

test('instant local replies reveal progressively and complete before suggestions can be committed', async () => {
  const h = harness(), text = '这是需要逐字展示的虚构简历检查结果。'.repeat(8);
  let done = false;
  const finished = h.writer.finish(text).then(() => { done = true; });
  assert.deepEqual(h.values, []);
  h.advance(240);
  assert.ok(h.values.length > 1);
  assert.ok(h.values.at(-1).length < text.length);
  assert.equal(done, false);
  assert.ok(h.values.every(value => text.startsWith(value)));
  h.advance(5000); await finished;
  assert.equal(h.values.at(-1), text);
  assert.equal(h.tasks.size, 0);
  h.writer.dispose();
});

test('bursty model chunks remain ordered and never split complete emoji or combining graphemes', async () => {
  const h = harness(), segments = ['你', '好', '👩🏽‍💻', 'é', '🇨🇳', '，', '请', '核', '对', '。'];
  h.writer.push(segments.slice(0, 3).join('')); h.advance(24);
  h.writer.push(segments.slice(0, 5).join('')); h.advance(24);
  const finished = h.writer.finish(segments.join(''));
  h.advance(1000); await finished;
  const prefixes = segments.map((_, i) => segments.slice(0, i + 1).join(''));
  assert.ok(h.values.every(value => prefixes.includes(value)));
  assert.equal(h.values.at(-1), segments.join(''));
  h.writer.dispose();
});

test('stop discards buffered output, rejects completion and ignores late network chunks', async () => {
  const h = harness();
  const finished = h.writer.finish('只保留停止之前已经显示的虚构内容。'.repeat(20));
  const rejected = assert.rejects(finished, { name: 'AbortError' });
  h.advance(96); const visible = h.values.at(-1);
  assert.ok(visible);
  h.controller.abort();
  h.writer.push('不应该出现的迟到响应'); h.advance(10000);
  await rejected;
  assert.equal(h.values.at(-1), visible);
  assert.equal(h.tasks.size, 0);
  await assert.rejects(h.writer.finish('也不应出现'), { name: 'AbortError' });
});

test('emoji extended across separate network chunks does not flash partial graphemes', async () => {
  const h = harness();
  h.writer.push('A👩'); h.advance(300);
  assert.equal(h.values.at(-1), 'A');
  h.writer.push('A👩🏽‍'); h.advance(300);
  assert.equal(h.values.at(-1), 'A');
  h.writer.push('A👩🏽‍💻B'); h.advance(300);
  assert.equal(h.values.at(-1), 'A👩🏽‍💻');
  const finished = h.writer.finish('A👩🏽‍💻B'); h.advance(300); await finished;
  assert.deepEqual(h.values, ['A', 'A👩🏽‍💻', 'A👩🏽‍💻B']);
  h.writer.dispose();
});

test('the real timer scheduler releases a cancelled completion immediately', async () => {
  const controller = new AbortController(), values = [];
  const writer = createTypewriter({ signal: controller.signal, onText: value => values.push(value) });
  const finished = writer.finish('取消后不应再继续的虚构内容。'.repeat(20));
  const rejected = assert.rejects(finished, { name: 'AbortError' });
  controller.abort(); await rejected;
  assert.deepEqual(values, []);
  writer.dispose();
});

test('final parsing can trim a streamed suffix, and reduced motion bypasses animation', async () => {
  const h = harness({ reducedMotion: () => true });
  h.writer.push('保留这段原文。临时后缀');
  await h.writer.finish('保留这段原文。');
  assert.equal(h.values.at(-1), '保留这段原文。');
  assert.equal(h.tasks.size, 0);
  h.writer.dispose();
});

test('large finished chunks catch up without imposing a long artificial typing delay', async () => {
  const h = harness(), text = '虚构内容。'.repeat(2000);
  const finished = h.writer.finish(text);
  h.advance(3200); await finished;
  assert.equal(h.values.at(-1), text);
  h.writer.dispose();
});

test('panel sizing protects both reading widths and accepts persisted wider preferences', () => {
  for (const width of [845, 1064, 1544, 2000]) {
    const bounds = panelBounds(width);
    const narrowChat = clampPanelRatio(-1, width), wideChat = clampPanelRatio(2, width);
    assert.equal(narrowChat, bounds.min); assert.equal(wideChat, bounds.max);
    assert.ok(narrowChat * (width - 1) >= 320 - .01);
    assert.ok((1 - wideChat) * (width - 1) >= 360 - .01);
  }
  const workspace = initialWorkspace();
  workspace.ui.chatRatio = .7;
  assert.equal(validWorkspace(JSON.parse(JSON.stringify(workspace))), true);
  assert.equal(clampPanelRatio(.7, 2000), .7);
  assert.ok(clampPanelRatio(.7, 845) < .7);
  assert.equal(workspace.ui.chatRatio, .7);
});
