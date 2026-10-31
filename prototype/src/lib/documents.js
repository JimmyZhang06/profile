export function activeDocument(state) {
  return state.documents.find(doc => doc.id === state.activeId && !doc.archived)
    || state.documents.find(doc => !doc.archived) || null;
}

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
