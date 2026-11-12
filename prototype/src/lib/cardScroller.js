// Native scrolling owns the gesture. Layout/focus may only change after it ends.
// In particular, writing scrollTop during a horizontal swipe cancels WebKit's
// momentum, even when the value being written is zero.
export function createCardScroller({
  element,
  getSlides,
  initialId,
  onSettle,
  onTarget = () => {},
  reducedMotion = () => false,
  schedule = setTimeout,
  cancel = clearTimeout,
}) {
  let activeId = initialId,
    requestedId = null,
    moving = false,
    pointerHeld = false,
    touchHeld = false;
  const held = () => pointerHeld || touchHeld;
  let timer,
    disposed = false,
    resized = false,
    width = element.clientWidth;
  const root = element.ownerDocument.defaultView;
  const slides = () => getSlides().filter((item) => item.node);
  const nearest = () =>
    slides().reduce(
      (best, item) =>
        !best ||
        Math.abs(item.node.offsetLeft - element.scrollLeft) <
          Math.abs(best.node.offsetLeft - element.scrollLeft)
          ? item
          : best,
      null,
    );
  const stopTimer = () => {
    cancel(timer);
    timer = undefined;
  };
  const later = () => {
    stopTimer();
    timer = schedule(settle, 180);
  };

  function settle() {
    stopTimer();
    if (disposed || held() || !element.clientWidth) return;
    const item = nearest();
    if (!item) return;
    // If a resize interrupted a gesture, keep the last settled/requested card.
    const target = requestedId || resized
      ? slides().find((item) => item.id === (requestedId || activeId)) || item
      : item;
    resized = false;
    if (Math.abs(target.node.offsetLeft - element.scrollLeft) > 1) {
      // Older engines may stop between snap points. Correct only at rest.
      element.scrollTo({ left: target.node.offsetLeft, behavior: "instant" });
    }
    moving = false;
    requestedId = null;
    activeId = target.id;
    onTarget(activeId);
    onSettle(activeId);
    if (element.scrollTop) element.scrollTop = 0;
  }
  function onScroll() {
    moving = true;
    later();
  }
  function begin() {
    requestedId = null;
    stopTimer();
  }
  function release() {
    if (held()) return;
    if (moving || resized) later();
    else onSettle(activeId);
  }
  const pointerStart = () => {
    pointerHeld = true;
    begin();
  };
  const touchStart = () => {
    touchHeld = true;
    begin();
  };
  const pointerEnd = () => {
    if (!pointerHeld) return;
    pointerHeld = false;
    release();
  };
  // Browsers cancel the pointer when native panning begins; the touch remains
  // down. Keep these lifetimes separate so a pause is not mistaken for release.
  const touchEnd = (event) => {
    if (!touchHeld) return;
    touchHeld = Boolean(event.touches?.length);
    release();
  };
  const blur = () => {
    pointerHeld = touchHeld = false;
    release();
  };
  function wheel() {
    requestedId = null;
  }
  const listeners = [
    [element, "scroll", onScroll],
    [element, "scrollend", settle],
    [element, "pointerdown", pointerStart],
    [element, "touchstart", touchStart],
    [element, "wheel", wheel],
    [root, "pointerup", pointerEnd],
    [root, "pointercancel", pointerEnd],
    [root, "touchend", touchEnd],
    [root, "touchcancel", touchEnd],
    [root, "blur", blur],
  ];
  for (const [node, name, fn] of listeners)
    node.addEventListener(name, fn, { passive: true });
  return {
    get moving() {
      return moving || held();
    },
    go(value, relative = false) {
      const items = slides();
      const from = Math.max(
        0,
        items.findIndex((item) => item.id === (requestedId || activeId)),
      );
      const index = Math.max(
        0,
        Math.min(items.length - 1, relative ? from + value : value),
      );
      const target = items[index];
      if (!target || disposed) return;
      requestedId = target.id;
      moving = true;
      onTarget(target.id);
      element.scrollTo({
        left: target.node.offsetLeft,
        behavior: reducedMotion() ? "instant" : "smooth",
      });
      later();
    },
    resize() {
      if (!element.clientWidth || element.clientWidth === width) return;
      width = element.clientWidth;
      resized = true;
      if (!moving && !held()) settle();
    },
    destroy() {
      disposed = true;
      stopTimer();
      for (const [node, name, fn] of listeners)
        node.removeEventListener(name, fn);
    },
  };
}
