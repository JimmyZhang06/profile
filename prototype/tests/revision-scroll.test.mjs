import test from "node:test";
import assert from "node:assert/strict";
import { createRevisionScroller } from "../src/lib/revisionScroll.js";

function fixture() {
  const root = new EventTarget(),
    element = new EventTarget();
  const writes = [],
    commits = [],
    targets = [],
    timers = new Map();
  let timerId = 0;
  Object.assign(element, {
    ownerDocument: { defaultView: root },
    clientWidth: 300,
    scrollLeft: 0,
    scrollTop: 0,
    scrollTo(value) {
      writes.push(value);
      if (value.behavior === "instant") this.scrollLeft = value.left;
    },
  });
  const items = Array.from({ length: 4 }, (_, i) => ({
    id: "card-" + i,
    node: { offsetLeft: i * 316 },
  }));
  const control = createRevisionScroller({
    element,
    initialId: "card-0",
    getSlides: () => items,
    onSettle: (id) => commits.push(id),
    onTarget: (id) => targets.push(id),
    schedule(fn) {
      timers.set(++timerId, fn);
      return timerId;
    },
    cancel(id) {
      timers.delete(id);
    },
  });
  const event = (name, target = element) =>
    target.dispatchEvent(new Event(name));
  const advance = () => {
    const tasks = [...timers.values()];
    timers.clear();
    for (const fn of tasks) fn();
  };
  return {
    root,
    element,
    writes,
    commits,
    targets,
    timers,
    items,
    control,
    event,
    advance,
  };
}

test("swiping past the midpoint never changes layout or writes either scroll axis while a finger remains down", () => {
  const h = fixture();
  h.event("pointerdown");
  h.event("touchstart");
  h.element.scrollLeft = 180;
  h.event("pointercancel", h.root); // Browser takes ownership of native pan.
  h.event("scroll");
  h.advance(); // A long pause with the finger still on the card.
  h.event("scrollend");
  assert.deepEqual(h.commits, []);
  assert.deepEqual(h.writes, []);
  h.element.scrollLeft = 316;
  h.event("touchend", h.root);
  h.event("scroll"); // Native momentum continues after release.
  assert.deepEqual(h.commits, []);
  h.event("scrollend");
  assert.deepEqual(h.commits, ["card-1"]);
  assert.deepEqual(h.writes, []);
  assert.equal(h.control.moving, false);
  h.control.destroy();
});

test("fallback settles an engine without scrollend and repairs an interrupted snap only at rest", () => {
  const h = fixture();
  h.element.scrollLeft = 215;
  h.event("scroll");
  assert.deepEqual(h.writes, []);
  h.advance();
  assert.deepEqual(h.writes, [{ left: 316, behavior: "instant" }]);
  assert.deepEqual(h.commits, ["card-1"]);
  h.control.destroy();
});

test("rapid next/previous commands accumulate their destination without waiting for the prior animation", () => {
  const h = fixture();
  h.control.go(1, true);
  h.control.go(1, true);
  h.control.go(1, true);
  h.control.go(-1, true);
  assert.deepEqual(
    h.writes.map((value) => value.left),
    [316, 632, 948, 632],
  );
  assert.deepEqual(h.commits, []);
  h.element.scrollLeft = 632;
  h.event("scrollend");
  assert.deepEqual(h.commits, ["card-2"]);
  h.control.destroy();
});

test("resize during a held swipe waits until release, retains the card, and leaves no pending work after disposal", () => {
  const h = fixture();
  h.control.go(2);
  h.element.scrollLeft = 632;
  h.event("scrollend");
  h.event("pointerdown");
  h.element.clientWidth = 200;
  h.items.forEach((item, index) => {
    item.node.offsetLeft = index * 216;
  });
  const before = h.writes.length;
  h.control.resize();
  assert.equal(h.writes.length, before);
  h.event("pointercancel", h.root);
  h.advance();
  assert.equal(h.writes.at(-1).left, 432);
  assert.equal(h.commits.at(-1), "card-2");
  h.event("scroll");
  h.control.destroy();
  assert.equal(h.timers.size, 0);
  h.event("scroll");
  assert.equal(h.timers.size, 0);
});
