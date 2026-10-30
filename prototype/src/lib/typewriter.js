const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const defaultClock = { now: () => performance.now(), schedule: callback => setTimeout(callback, 24), cancel: timer => clearTimeout(timer) };

// One request owns one writer. Persist only text already shown, so stopping or
// changing documents cannot later reveal a queued reply or its suggestions.
export function createTypewriter({ onText, signal, reducedMotion = () => false, clock = defaultClock }) {
  let target = [], shown = '', count = 0, timer = null, previous = 0, credit = 0, rate = 45;
  let closed = false, resolveDrain, rejectDrain;
  const abortError = () => new DOMException('已停止', 'AbortError');
  function clear() { if (timer !== null) clock.cancel(timer); timer = null; }
  function settle() {
    if (count === target.length) { clear(); resolveDrain?.(); resolveDrain = rejectDrain = undefined; }
  }
  function publish() {
    const next = target.slice(0, count).join('');
    if (next !== shown) { shown = next; onText(shown); }
  }
  function tick() {
    timer = null;
    if (closed) return;
    const now = clock.now();
    credit += Math.max(0, now - previous) * rate / 1000;
    previous = now;
    const step = Math.floor(credit);
    if (reducedMotion()) count = target.length;
    else { count = Math.min(target.length, count + step); credit -= step; }
    publish(); settle();
    if (count < target.length) timer = clock.schedule(tick);
  }
  function push(text, complete = false) {
    if (closed) return;
    const segments = Array.from(segmenter.segment(text), item => item.segment);
    // A later network chunk may extend the last grapheme (emoji modifiers,
    // combining marks or a surrogate pair). Reveal it only once it is closed.
    const next = complete ? segments : segments.slice(0, -1);
    let common = 0;
    while (common < count && target[common] === next[common]) common++;
    // Final parsing can trim text or correct a partial Markdown/token suffix.
    count = common;
    target = next;
    rate = Math.max(45, timer === null ? 0 : rate, (target.length - count) / 3);
    if (reducedMotion()) { count = target.length; publish(); settle(); return; }
    if (shown && !text.startsWith(shown)) publish();
    if (count < target.length && timer === null) {
      previous = clock.now(); credit = 0; timer = clock.schedule(tick);
    }
  }
  function cancel() {
    closed = true; clear();
    signal?.removeEventListener('abort', cancel);
    rejectDrain?.(abortError()); resolveDrain = rejectDrain = undefined;
  }
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  return {
    push,
    finish(text) {
      if (closed) return Promise.reject(abortError());
      push(text, true);
      if (count === target.length) return Promise.resolve();
      return new Promise((resolve, reject) => { resolveDrain = resolve; rejectDrain = reject; });
    },
    dispose: cancel,
  };
}
