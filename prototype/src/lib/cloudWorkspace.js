import {
  blankProfile,
  fieldLabels,
  makeDocument,
  clone,
  DEFAULT_CHAT_RATIO,
} from "./workspace.js";
import { templateDesign } from "./resumeDesign.js";

export const canonicalJSON = (value) =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : item,
  );

export function isPlaceholderDocument(d) {
  return (
    d.title === "我的简历" &&
    !Object.keys(fieldLabels).some((key) => d.resume[key]) &&
    !Object.values(d.job).some(Boolean) &&
    !d.resume.sources.length &&
    !Object.keys(d.resume.overrides).length &&
    !d.messages.length &&
    !d.composer &&
    !d.revision &&
    !d.undo.length &&
    !d.redo.length &&
    d.versions.length <= 1 &&
    !d.resume.design?.catalogId &&
    Object.entries(templateDesign("classic")).every(
      ([key, value]) => d.resume.design?.[key] === value,
    )
  );
}

export function emptyCloudWorkspace() {
  const doc = makeDocument();
  return {
    schema: 2,
    activeId: doc.id,
    library: [],
    profile: clone(blankProfile),
    documents: [doc],
    settings: {
      enabled: true,
      capabilities: { rewrite: true, match: true },
      bindings: { rewrite: "offline", match: "offline" },
      connections: [],
    },
    ui: { layoutVersion: 1, sidebar: false, chatRatio: DEFAULT_CHAT_RATIO },
  };
}
export function selectImport(workspace, selection) {
  const ids = new Set(selection.documents || []),
    projects = new Set(selection.projects || []);
  const documents = workspace.documents.filter((d) => ids.has(d.id)),
    library = workspace.library.filter((p) => projects.has(p.id));
  return {
    ...clone(workspace),
    documents,
    library,
    profile: selection.profile ? clone(workspace.profile) : clone(blankProfile),
    activeId: documents[0]?.id,
    settings: emptyCloudWorkspace().settings,
  };
}
export function mergeImportedWorkspace(
  current,
  incoming,
  makeId = () => crypto.randomUUID(),
) {
  const mappings = new Map();
  function collect(value) {
    if (!value || typeof value !== "object") return;
    if (typeof value.id === "string")
      mappings.set(value.id, mappings.get(value.id) || makeId());
    for (const child of Object.values(value)) collect(child);
  }
  collect(incoming.library);
  collect(incoming.documents);
  function mapped(value) {
    if (mappings.has(value)) return mappings.get(value);
    if (typeof value === "string" && value.includes(":")) {
      const [prefix, ...rest] = value.split(":");
      if (mappings.has(prefix))
        return mappings.get(prefix) + ":" + rest.join(":");
    }
    return value;
  }
  function transform(value) {
    if (Array.isArray(value)) return value.map(transform);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          mapped(key),
          transform(item),
        ]),
      );
    return typeof value === "string" ? mapped(value) : value;
  }
  const imported = transform(incoming),
    existing = current.documents.filter(
      (d) => !(current.documents.length === 1 && isPlaceholderDocument(d)),
    );
  const documents = [...existing, ...imported.documents];
  if (!documents.length) documents.push(...current.documents);
  return {
    ...current,
    profile: Object.fromEntries(
      Object.entries(current.profile).map(([key, value]) => [
        key,
        value || imported.profile[key] || "",
      ]),
    ),
    library: [...current.library, ...imported.library],
    documents,
    activeId: imported.documents[0]?.id || documents[0].id,
  };
}
export const cloudCacheKey = (ownerId) => "luli:cloud:" + ownerId;
