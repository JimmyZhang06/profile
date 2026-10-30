// Keep pending navigation separate from form state. Discarding a local subform
// must not mark other unsaved fields on the same page as clean.
export function createNavigationGuard() {
  let dirty = false, pending = null;
  return {
    setDirty(value) { dirty = value; },
    request(action) {
      if (dirty) { pending = action; return false; }
      pending = null;
      action();
      return true;
    },
    stay() { pending = null; },
    discard() { const action = pending; pending = null; action?.(); },
    reset() { dirty = false; pending = null; },
  };
}
