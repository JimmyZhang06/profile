import { createContext, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createNavigationGuard } from '../lib/navigation.js';
import { careerPages, careerSectionForPath } from '../../shared/careerPaths.mjs';
import { opportunityResumeRef } from '../lib/opportunityResume.js';

export const PageNavigationContext = createContext(null);

function linkedPage(url) {
  return careerSectionForPath(url.pathname)
    || (url.pathname === '/' && opportunityResumeRef(url.search) ? 'opportunity-start' : null);
}

export function usePageNavigation(initialPage = null) {
  const [session] = useState(() => crypto.randomUUID?.() || String(Math.random()));
  const [route, setRoute] = useState(() => ({
    page: linkedPage(window.location) || initialPage,
    href: location.pathname + location.search,
    index: history.state?.workspaceRoute?.index ?? 0,
  }));
  const current = useRef(route), restoring = useRef(null);
  const [pending, setPending] = useState(false);
  const [guard] = useState(createNavigationGuard);
  const registerDirty = useCallback(value => guard.setDirty(value), [guard]);
  const accept = useCallback(next => {
    guard.reset();
    setPending(false);
    current.current = next;
    setRoute(next);
  }, [guard]);
  const finish = useCallback((page, href = Object.hasOwn(careerPages, page) ? '/' + page : '/', replace = false) => {
    const old = current.current;
    const push = !replace && href !== old.href;
    const next = { page, href, index: old.index + Number(push) };
    history[push ? 'pushState' : 'replaceState'](
      { ...history.state, workspaceRoute: { session, page, index: next.index } }, '', href,
    );
    accept(next);
  }, [accept, session]);
  const request = useCallback(action => {
    const completed = guard.request(action);
    setPending(!completed);
    return completed;
  }, [guard]);
  const navigate = useCallback(next => {
    if (next === current.current.page) return;
    request(() => finish(next));
  }, [request, finish]);
  const openLink = useCallback((href, replace = false) => {
    const url = new URL(href, location.origin);
    if (url.origin !== location.origin) return;
    const path = url.pathname + url.search;
    const page = linkedPage(url);
    if (path !== current.current.href || page !== current.current.page)
      request(() => finish(page, path, replace));
  }, [request, finish]);
  useLayoutEffect(() => {
    const { page, index } = current.current;
    history.replaceState({ ...history.state, workspaceRoute: { session, page, index } }, '');
    function pop(event) {
      const old = current.current, entry = event.state?.workspaceRoute;
      const next = {
        page: linkedPage(location) || (entry?.session === session ? entry.page : null),
        href: location.pathname + location.search,
        index: entry?.index ?? old.index,
      };
      const recovery = restoring.current;
      if (recovery && next.index === old.index && next.href === old.href) {
        restoring.current = null;
        recovery.resume?.();
        return;
      }
      const distance = next.index - old.index;
      if (!guard.dirty || !distance) { accept(next); return; }
      // Restore the displayed entry while the same inline leave notice is open.
      const recoveryStep = {};
      restoring.current = recoveryStep;
      history.go(-distance);
      request(() => {
        guard.reset();
        const resume = () => history.go(distance);
        if (restoring.current === recoveryStep) recoveryStep.resume = resume;
        else resume();
      });
    }
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, [accept, guard, request, session]);
  const discard = useCallback(() => {
    setPending(false);
    guard.discard();
  }, [guard]);
  const stay = useCallback(() => { guard.stay(); setPending(false); }, [guard]);
  return { ...route, pending, registerDirty, request, navigate, openLink, finish, discard, stay };
}
