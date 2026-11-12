export function opportunityResumeRef(search) {
  const params = new URLSearchParams(search),
    id = params.get("opportunity"),
    version = Number(params.get("version"));
  return typeof id === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(id) &&
    Number.isSafeInteger(version) &&
    version > 0
    ? { id, version }
    : null;
}
export function snapshotOpportunity(item, now = Date.now()) {
  if (item?.status !== "open" || !item.jd)
    throw Error("岗位已暂停或截止，不能用于新投递");
  return {
    id: item.id,
    version: item.version,
    takenAt: now,
    title: item.title,
    company: item.company,
    jd: item.jd,
    requirements: item.requirements || "",
    applicationNotes: item.applicationNotes || "",
  };
}
export function jobForOpportunity(item) {
  snapshotOpportunity(item);
  return {
    title: item.title,
    company: item.company,
    text: [
      item.jd,
      item.requirements && "到岗与要求：\n" + item.requirements,
      item.applicationNotes && "投递须知：\n" + item.applicationNotes,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
export function resumesForOpportunity(documents, id) {
  return documents
    .filter((d) => !d.archived && d.opportunitySource?.id === id)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
