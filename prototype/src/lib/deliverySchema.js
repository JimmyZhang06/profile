export function validDelivery(value) {
  if (value === undefined) return true;
  const strings = (v, limit) =>
    Array.isArray(v) &&
    v.length <= limit &&
    v.every((s) => typeof s === "string");
  const evidence = (v) =>
    Array.isArray(v) &&
    v.length <= 12 &&
    v.every(
      (e) =>
        e &&
        ["source", "label", "quote"].every((k) => typeof e[k] === "string"),
    );
  return (
    !!value &&
    ["local", "model"].includes(value.mode) &&
    (value.modelLabel === undefined || typeof value.modelLabel === "string") &&
    Number.isFinite(value.createdAt) &&
    (value.considered === undefined || (value.considered &&
      ["projects", "work", "research"].every((k) => Number.isSafeInteger(value.considered[k]) && value.considered[k] >= 0))) &&
    strings(value.projectIds, 2) &&
    strings(value.workIds, 2) &&
    strings(value.researchIds, 1) &&
    strings(value.layoutSteps, 3) &&
    strings(value.gaps, 8) &&
    Array.isArray(value.changes) &&
    value.changes.length <= 20 &&
    value.changes.every(
      (c) =>
        c &&
        ["field", "text", "compact"].every((k) => typeof c[k] === "string") &&
        evidence(c.evidence),
    ) &&
    Array.isArray(value.requirements) &&
    value.requirements.length <= 6 &&
    value.requirements.every(
      (r) => r && typeof r.requirement === "string" && evidence(r.evidence),
    )
  );
}
