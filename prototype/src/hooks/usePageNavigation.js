import { createContext, useCallback, useState } from 'react';
import { createNavigationGuard } from '../lib/navigation.js';

export const PageNavigationContext = createContext(null);

export function usePageNavigation() {
  const [page, setPage] = useState(null), [pending, setPending] = useState(false);
  const [guard] = useState(createNavigationGuard);
  const registerDirty = useCallback(value => guard.setDirty(value), [guard]);
  const finish = useCallback(next => {
    guard.reset();
    setPending(false);
    setPage(next);
  }, [guard]);
  const request = useCallback(action => {
    const completed = guard.request(action);
    setPending(!completed);
    return completed;
  }, [guard]);
  const navigate = useCallback(next => {
    if (next === page) return;
    request(() => finish(next));
  }, [page, request, finish]);
  const discard = useCallback(() => {
    setPending(false);
    guard.discard();
  }, [guard]);
  const stay = useCallback(() => { guard.stay(); setPending(false); }, [guard]);
  return { page, pending, registerDirty, request, navigate, finish, discard, stay };
}
