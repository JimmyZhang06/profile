import { cloudRequest } from "../../lib/cloudClient.js";
export const opportunityFieldLabel = {
  title: "岗位名称",
  company: "公司",
  regionCode: "招聘地区",
  city: "城市",
  remote: "远程安排",
  direction: "方向",
  jd: "职位描述",
  requirements: "到岗与要求",
  graduationYear: "毕业年份",
  graduationCondition: "毕业要求",
  daysPerWeek: "每周天数",
  durationMonths: "实习月数",
  arrival: "到岗安排",
  compensation: "薪酬",
  sourceType: "来源类型",
  application: "投递渠道",
  applicationNotes: "投递须知",
  deadlineDate: "截止日期",
  deadlineAt: "截止时刻",
  source: "来源",
  permission: "公开许可依据",
  evidence: "凭证",
  general: "整体说明",
};
export const opportunityStatus = {
  draft: "草稿",
  pending: "待审核",
  returned: "待补充",
  withdrawn: "已撤回",
  rejected: "未收录",
  published: "已发布",
  open: "在招",
  paused: "暂停投递",
  closed: "已截止",
  unpublished: "未发布",
};
export const requestId = () => crypto.randomUUID();
export const opportunityApi =
  (account) =>
  (path, options = {}) =>
    cloudRequest("cloud/" + path, { ...options, ownerId: account.user?.id });
export async function evidencePng(file) {
  if (
    !["image/jpeg", "image/png"].includes(file.type) ||
    file.size > 3 * 1024 * 1024
  )
    throw Error("请选择 3 MB 以内的 JPEG 或 PNG 图片");
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/png");
    if (result.length > 4 * 1024 * 1024)
      throw Error("转换后的图片过大，请先缩小图片");
    return result;
  } finally {
    bitmap.close();
  }
}
export function compensationText(value) {
  if (!value) return "薪酬未注明";
  const range =
    value.min == null
      ? value.max == null
        ? "未注明"
        : "不高于 " + value.max
      : value.max == null
        ? "不低于 " + value.min
        : value.min === value.max
          ? String(value.min)
          : value.min + "–" + value.max;
  return `${value.currency === "HKD" ? "HK$" : "¥"} ${range} / ${{ hour: "小时", day: "天", month: "月", year: "年" }[value.unit]}`;
}
