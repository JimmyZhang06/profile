import { importKinds } from "../../shared/resumeImport.mjs";
import { mergeProfiles, newRecord } from "./profile.js";
import { projectDetails } from "./projects.js";

export const importSections = [
  { value: "workEntries", label: "实习与工作" },
  { value: "projects", label: "项目经历" },
  { value: "educationEntries", label: "教育背景" },
  { value: "researchEntries", label: "研究经历" },
];
export const importRecords = (parsed) =>
  importKinds.flatMap((kind) =>
    (kind === "projects" ? parsed.projects : parsed.profile[kind]).map(
      (record) => ({ kind, record }),
    ),
  );
export const recordName = (record, kind) =>
  kind === "projects" ? record.name : record.organization;
export const recordBody = (record, kind) =>
  kind === "projects" ? record.facts.join("\n") : record.description;
export const recordDate = (record, kind) =>
  kind === "projects" ? record.date : record.period;
export const recordRole = (record, kind) =>
  kind === "projects" ? record.role : record.title;
const normalized = (text) => (text || "").replace(/\s+/gu, "").toLowerCase();
const uniqueLines = (a, b) =>
  [
    ...new Map(
      (a + "\n" + b)
        .split("\n")
        .filter((s) => s.trim())
        .map((s) => [normalized(s), s]),
    ).values(),
  ].join("\n");

export function editImportRecords(parsed, kind, update) {
  return kind === "projects"
    ? { ...parsed, projects: update(parsed.projects) }
    : {
        ...parsed,
        profile: { ...parsed.profile, [kind]: update(parsed.profile[kind]) },
      };
}
export function moveImportRecord(parsed, id, to) {
  const found = importRecords(parsed).find((item) => item.record.id === id);
  if (!found || found.kind === to || !importKinds.includes(to)) return parsed;
  const { record: r, kind } = found;
  const source = {
    ...parsed.importSource,
    detailCache: {
      ...parsed.importSource?.detailCache,
      ...(r.details ? { [id]: r.details } : {}),
    },
  };
  let next = editImportRecords(
    { ...parsed, importSource: source },
    kind,
    (list) => list.filter((item) => item.id !== id),
  );
  const record =
    to === "projects"
      ? {
          id,
          name: recordName(r, kind),
          role: recordRole(r, kind),
          date: recordDate(r, kind),
          tags: [],
          facts: recordBody(r, kind).split("\n").filter(Boolean),
          ...(source.detailCache[id]
            ? { details: source.detailCache[id] }
            : {}),
        }
      : {
          ...newRecord(() => id),
          organization: recordName(r, kind),
          title: recordRole(r, kind),
          period: recordDate(r, kind),
          description: recordBody(r, kind),
        };
  return editImportRecords(next, to, (list) => [...list, record]);
}
export function splitImportRecord(parsed, kind, id, line) {
  const records = kind === "projects" ? parsed.projects : parsed.profile[kind];
  const original = records.find((r) => r.id === id),
    lines =
      original &&
      recordBody(original, kind)
        .split("\n")
        .filter((s) => s.trim());
  if (!lines || line < 1 || line >= lines.length) return parsed;
  const nextId = crypto.randomUUID();
  const compare = (text) => normalized(text.replace(/^[•●▪◦◆◇·*–-]\s*/u, ""));
  const detailPart = (right) =>
    Object.fromEntries(
      Object.entries(original.details || {}).map(([key, text]) => [
        key,
        text
          .split("\n")
          .filter((value) => {
            const at = lines.findIndex(
              (body) => compare(body) === compare(value),
            );
            return right ? at >= line : at < line;
          })
          .join("\n"),
      ]),
    );
  const left =
    kind === "projects"
      ? { ...original, facts: lines.slice(0, line), details: detailPart(false) }
      : { ...original, description: lines.slice(0, line).join("\n") };
  const right =
    kind === "projects"
      ? {
          id: nextId,
          name: "",
          role: "",
          date: "",
          tags: [],
          facts: lines.slice(line),
          details: detailPart(true),
        }
      : {
          ...newRecord(() => nextId),
          description: lines.slice(line).join("\n"),
        };
  const next = editImportRecords(parsed, kind, (list) =>
    list.flatMap((r) => (r.id === id ? [left, right] : [r])),
  );
  return {
    ...next,
    importSource: {
      ...parsed.importSource,
      evidence: {
        ...parsed.importSource.evidence,
        [nextId]: [...(parsed.importSource.evidence[id] || [])],
      },
    },
  };
}
export function mergeImportRecord(parsed, kind, id) {
  const list = kind === "projects" ? parsed.projects : parsed.profile[kind],
    index = list.findIndex((r) => r.id === id);
  if (index <= 0) return parsed;
  const previous = list[index - 1],
    current = list[index];
  const heading = [
    recordName(current, kind),
    recordRole(current, kind),
    recordDate(current, kind),
  ]
    .filter(Boolean)
    .join(" · ");
  const body = [recordBody(previous, kind), heading, recordBody(current, kind)]
    .filter(Boolean)
    .join("\n");
  const combined =
    kind === "projects"
      ? {
          ...previous,
          facts: body.split("\n"),
          details: mergeProjectDetails(previous, current),
        }
      : { ...previous, description: body };
  const next = editImportRecords(parsed, kind, (items) =>
    items.flatMap((r) =>
      r.id === current.id ? [] : [r.id === previous.id ? combined : r],
    ),
  );
  return {
    ...next,
    importSource: {
      ...parsed.importSource,
      evidence: {
        ...parsed.importSource.evidence,
        [previous.id]: [
          ...new Set([
            ...(parsed.importSource.evidence[previous.id] || []),
            ...(parsed.importSource.evidence[id] || []),
          ]),
        ],
      },
    },
  };
}
export function mergeProjectDetails(a, b) {
  const left = projectDetails(a),
    right = projectDetails(b);
  return Object.fromEntries(
    Object.keys(left).map((key) => [key, uniqueLines(left[key], right[key])]),
  );
}
export function importArchiveMatches(parsed, profile, library) {
  return importRecords(parsed).flatMap(({ kind, record }) => {
    const candidates = kind === "projects" ? library : profile[kind] || [];
    const sameIdentity = candidates.filter(
      (r) =>
        normalized(recordName(r, kind)) &&
        normalized(recordName(r, kind)) ===
          normalized(recordName(record, kind)) &&
        (!recordDate(r, kind) ||
          !recordDate(record, kind) ||
          normalized(recordDate(r, kind)) ===
            normalized(recordDate(record, kind))) &&
        (!recordRole(r, kind) ||
          !recordRole(record, kind) ||
          normalized(recordRole(r, kind)) ===
            normalized(recordRole(record, kind))),
    );
    const isExact = (sameName) =>
      normalized(recordBody(record, kind)) ===
        normalized(recordBody(sameName, kind)) &&
      normalized(recordDate(record, kind)) ===
        normalized(recordDate(sameName, kind)) &&
      normalized(recordRole(record, kind)) ===
        normalized(recordRole(sameName, kind)) &&
      (kind !== "projects" ||
        JSON.stringify(projectDetails(record)) ===
          JSON.stringify(projectDetails(sameName)));
    const sameName = sameIdentity.find(isExact) || sameIdentity[0];
    if (!sameName) return [];
    const exact = isExact(sameName);
    return [
      { id: record.id, kind, existing: sameName, incoming: record, exact },
    ];
  });
}

export function archiveImportProfile(current, incoming, matches, choices) {
  let profile = structuredClone(current),
    additions = structuredClone(incoming);
  for (const match of matches.filter((m) => m.kind !== "projects")) {
    const choice = choices[match.id];
    if (!match.exact && !["merge", "skip"].includes(choice)) continue;
    additions[match.kind] = additions[match.kind].filter(
      (r) => r.id !== match.id,
    );
    if (choice === "merge" && !match.exact)
      profile[match.kind] = profile[match.kind].map((r) =>
        r.id === match.existing.id
          ? {
              ...r,
              description: uniqueLines(
                r.description,
                match.incoming.description,
              ),
            }
          : r,
      );
  }
  return mergeProfiles(profile, additions);
}
