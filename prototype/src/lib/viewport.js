// Portal controls must fit inside both the app's safe area and the visible
// viewport. Intersect them so a keyboard/panned viewport is not inset twice.
export function intersectViewport(viewport, frame, gap = 8) {
  const left = Math.max(viewport.left, frame.left);
  const top = Math.max(viewport.top, frame.top);
  const right = Math.max(left, Math.min(viewport.right, frame.right));
  const bottom = Math.max(top, Math.min(viewport.bottom, frame.bottom));
  const x = Math.min(gap, (right - left) / 2);
  const y = Math.min(gap, (bottom - top) / 2);
  return { leftEdge: left + x, topEdge: top + y, rightEdge: right - x, bottomEdge: bottom - y };
}

export function getViewportBounds(gap = 8) {
  const visible = window.visualViewport;
  const left = visible?.offsetLeft || 0, top = visible?.offsetTop || 0;
  const viewport = { left, top, right: left + (visible?.width || window.innerWidth), bottom: top + (visible?.height || window.innerHeight) };
  const root = document.getElementById('root');
  if (!root) return intersectViewport(viewport, viewport, gap);
  const bounds = root.getBoundingClientRect(), style = getComputedStyle(root);
  const frame = {
    left: bounds.left + (parseFloat(style.paddingLeft) || 0),
    top: bounds.top + (parseFloat(style.paddingTop) || 0),
    right: bounds.right - (parseFloat(style.paddingRight) || 0),
    bottom: bounds.bottom - (parseFloat(style.paddingBottom) || 0),
  };
  return intersectViewport(viewport, frame, gap);
}
