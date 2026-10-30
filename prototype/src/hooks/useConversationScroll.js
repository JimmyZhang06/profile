import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function useConversationScroll(documentId, active) {
  const viewportRef = useRef(null), contentRef = useRef(null);
  const following = useRef(true), activeRef = useRef(active);
  const [atBottom, setAtBottom] = useState(true);
  activeRef.current = active;

  function scrollToLatest(animate = false) {
    following.current = true;
    setAtBottom(true);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    viewportRef.current?.scrollTo({
      top: viewportRef.current.scrollHeight,
      behavior: animate && !reduceMotion ? 'smooth' : 'instant',
    });
  }

  function onScroll() {
    const element = viewportRef.current;
    if (!activeRef.current || !element?.clientHeight) return;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
    following.current = nearBottom;
    setAtBottom(nearBottom);
  }

  // Follow new text and viewport changes, unless the reader has scrolled up.
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      const element = viewportRef.current;
      if (!activeRef.current || !element?.clientHeight) return;
      if (following.current) {
        element.scrollTop = element.scrollHeight;
        setAtBottom(true);
      } else onScroll();
    });
    observer.observe(viewportRef.current);
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => { scrollToLatest(); }, [documentId]);
  useLayoutEffect(() => {
    if (active && following.current) scrollToLatest();
  }, [active]);

  return { viewportRef, contentRef, atBottom, onScroll, scrollToLatest };
}
