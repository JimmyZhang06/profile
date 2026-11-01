import { useLayoutEffect, useRef, useState } from 'react';

// Keep the editing surface mounted and restore the exact reading position.
export function useReadingView() {
  const [reading, setReading] = useState(null), origin = useRef(null);
  useLayoutEffect(() => {
    if (!origin.current) return;
    const { scroll, top, trigger } = origin.current;
    if (reading) { if (scroll) scroll.scrollTop = 0; }
    else {
      if (scroll) scroll.scrollTop = top;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      origin.current = null;
    }
  }, [reading]);
  return {
    reading,
    openReading(value, event) {
      const trigger = event.currentTarget, scroll = trigger.closest('.workspace-page')?.querySelector('.page-scroll');
      origin.current = { trigger, scroll, top: scroll?.scrollTop || 0 };
      setReading(value);
    },
    closeReading: () => setReading(null),
  };
}
