// Public links identify the reviewed posting. Private offer terms stay in the editor.
function validReference(id, version) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id)
    && Number.isSafeInteger(version) && version > 0;
}

export function offerLinkForOpportunity(item) {
  if (item?.status !== 'open' || !validReference(item.id, item.version)) return '/offers';
  const params = new URLSearchParams({ opportunity: item.id, version: String(item.version) });
  return '/offers?' + params.toString();
}

export function readOpportunityRef(search) {
  const params = new URLSearchParams(search);
  if (params.getAll('opportunity').length !== 1 || params.getAll('version').length !== 1) return null;
  const id = params.get('opportunity');
  const raw = params.get('version');
  const version = Number(raw);
  return String(version) === raw && validReference(id, version) ? { id, version } : null;
}
