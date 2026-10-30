import { useEffect, useLayoutEffect, useState } from 'react';

const THEME_KEY = 'luli.appearance.v1';
const themeNames = new Set(['light', 'dark', 'system']);
function readPreference() {
  try { const saved = localStorage.getItem(THEME_KEY); return themeNames.has(saved) ? saved : 'system'; }
  catch { return 'system'; }
}

// Appearance is stored independently so changing it never rewrites resume data.
export function useTheme() {
  const [preference, setPreference] = useState(readPreference);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const changed = event => setSystemDark(event.matches);
    const stored = event => { if (event.key === THEME_KEY || event.key === null) setPreference(readPreference()); };
    media.addEventListener('change', changed);
    window.addEventListener('storage', stored);
    return () => { media.removeEventListener('change', changed); window.removeEventListener('storage', stored); };
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#151515' : '#ffffff');
  }, [resolved]);
  function change(next) {
    if (!themeNames.has(next)) return;
    setPreference(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* The current session can still change appearance. */ }
  }
  return { preference, resolved, change };
}
