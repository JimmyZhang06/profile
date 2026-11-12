import { emptyOffer } from "./offerEngine.mjs";

export function privateDraftFromOpportunity(item) {
  if (
    !item ||
    item.status !== "open" ||
    !["CN", "HK"].includes(item.regionCode)
  )
    throw new Error("公开机会不可用，请手动录入");
  const p = emptyOffer(
    [item.company, item.title].filter(Boolean).join(" · ").slice(0, 160),
  );
  const c = item.compensation;
  return {
    ...p,
    kind: "internship",
    period: "contract",
    region: item.regionCode,
    currency: item.regionCode === "HK" ? "HKD" : "CNY",
    city: item.city || "",
    unit: c?.unit || "month",
    salary: null,
    source: "个人假设",
    quote: c
      ? `${c.min ?? "?"}–${c.max ?? "?"} ${c.currency}/${c.unit}`
      : "公开薪资未提供",
    publicQuote: c ? structuredClone(c) : null,
    opportunity: { id: item.id, version: item.version },
    publicSource: "已审核公开机会",
  };
}
export function draftHasInput(plan, slot = 0) {
  return (
    JSON.stringify(plan) !==
    JSON.stringify(emptyOffer(slot === 0 ? "方案 A" : "方案 B"))
  );
}
export const offerDraftKey = (owner) => "luli:offers:drafts:v1:" + owner;
export function readOfferDrafts(storage, owner) {
  try {
    const data = JSON.parse(storage.getItem(offerDraftKey(owner)));
    if (
      data?.plans?.length === 2 &&
      data.plans.every(
        (p) =>
          p?.schema === 1 &&
          p.monthly &&
          p.tax &&
          p.contributions &&
          Array.isArray(p.bonuses),
      ) &&
      data.ruleSets?.length === 2 &&
      data.ruleSets.every((r) => Array.isArray(r?.rules))
    )
      return data;
  } catch {}
  return null;
}
