export function activeDocument(state) {
  return state.documents.find(doc => doc.id === state.activeId && !doc.archived)
    || state.documents.find(doc => !doc.archived) || null;
}
export const opensOnPaper = doc => !!doc?.delivery || doc?.origin === 'file';

// Keep the entire document snapshot, including conversations and versions.
export function moveDocumentToTrash(state, id, time = Date.now()) {
  const target = state.documents.find(doc => doc.id === id);
  if (!target || target.archived) return state;
  const documents = state.documents.map(doc => doc.id === id ? {...doc, archived: true, archivedAt: time} : doc);
  const next = activeDocument({...state, documents});
  return {...state, documents, activeId: next?.id || id};
}

export function restoreDocument(state, id) {
  const target = state.documents.find(doc => doc.id === id);
  if (!target?.archived) return state;
  const documents = state.documents.map(doc => {
    if (doc.id !== id) return doc;
    const {archivedAt, ...rest} = doc;
    return {...rest, archived: false};
  });
  return {...state, documents, activeId: id};
}

// Match the entries that were shown at confirmation. A restored or newly
// archived document in another tab must not be removed by a stale confirmation.
export function emptyDocumentTrash(state, confirmed) {
  const stamps = new Map(confirmed.map(({id, archivedAt}) => [id, archivedAt]));
  const documents = state.documents.filter(doc =>
    !doc.archived || !stamps.has(doc.id) || stamps.get(doc.id) !== doc.archivedAt);
  if (documents.length === state.documents.length) return state;
  const activeId = activeDocument({...state, documents})?.id ?? documents[0]?.id ?? null;
  return {...state, documents, activeId};
}
