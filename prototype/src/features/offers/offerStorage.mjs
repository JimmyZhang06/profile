// Guest input and each account's local recovery data have separate namespaces.
export const offerDraftKey = owner => 'luli:offers:drafts:v1:' + owner;
export const offerRecoveryKey = owner => 'luli:offers:v1:' + owner;
export const offerPendingPrefix = owner => 'luli:offers:pending:' + encodeURIComponent(owner) + ':';
export function clearOfferDeviceData(storage, owner) {
  if (!owner || owner === 'guest') return;
  const prefix = offerPendingPrefix(owner);
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key === offerDraftKey(owner) || key === offerRecoveryKey(owner) || key?.startsWith(prefix))
      storage.removeItem(key);
  }
}
