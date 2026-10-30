import { MIN_CHAT_RATIO, MAX_CHAT_RATIO } from './workspace.js';

export function panelBounds(width) {
  const available = Math.max(1, width - 1);
  const min = Math.max(MIN_CHAT_RATIO, 320 / available);
  const max = Math.min(MAX_CHAT_RATIO, 1 - 360 / available);
  // Small screens use tabs; a hidden/temporarily zero-width panel must not
  // overwrite the preferred desktop split with an invalid ratio.
  return min <= max ? { min, max } : { min: MIN_CHAT_RATIO, max: MAX_CHAT_RATIO };
}
export function clampPanelRatio(ratio, width) {
  const { min, max } = panelBounds(width);
  return Math.max(min, Math.min(max, ratio));
}
