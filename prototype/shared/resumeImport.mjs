export const importKinds = [
  "workEntries",
  "projects",
  "educationEntries",
  "researchEntries",
];
export const importLimit = {
  characters: 60000,
  chunkCharacters: 9000,
  chunkBlocks: 100,
  calls: 12,
};

export function validImportSource(value) {
  if (
    !value ||
    value.version !== 1 ||
    typeof value.filename !== "string" ||
    value.filename.length > 1000 ||
    typeof value.text !== "string" ||
    value.text.length > 170000 ||
    !Array.isArray(value.blocks) ||
    value.blocks.length > 20000 ||
    !Array.isArray(value.ocrPages) ||
    value.ocrPages.some((n) => !Number.isInteger(n) || n < 1 || n > 35)
  )
    return false;
  const ids = new Set();
  for (const b of value.blocks) {
    if (
      !b ||
      typeof b.id !== "string" ||
      ids.has(b.id) ||
      typeof b.text !== "string" ||
      b.text.length > 170000 ||
      typeof b.location !== "string" ||
      b.location.length > 200 ||
      (b.box !== undefined &&
        (!Array.isArray(b.box) ||
          b.box.length !== 4 ||
          b.box.some((n) => !Number.isFinite(n))))
    )
      return false;
    ids.add(b.id);
  }
  return (
    value.evidence &&
    typeof value.evidence === "object" &&
    !Array.isArray(value.evidence) &&
    Object.values(value.evidence).every(
      (refs) => Array.isArray(refs) && refs.every((id) => ids.has(id)),
    )
  );
}

// Source IDs survive classification and manual corrections. The complete source
// stays on the reviewed document; only the approved, redacted text is sent.
export function importSource(result, filename = "") {
  const text = String(result.text || "").replace(/\r\n?/g, "\n");
  if (text.length > 170000) throw Error("正文过长，请按简历页拆分后导入。");
  const supplied = result.blocks?.length
    ? result.blocks
    : text.split("\n").map((text) => ({ text }));
  const blocks = supplied
    .filter((b) => b.text?.trim())
    .map((b, i) => ({
      id: "b" + (i + 1),
      text: b.text.trim(),
      location: b.location || "第 " + (i + 1) + " 行",
      ...(b.page ? { page: b.page } : {}),
      ...(b.box ? { box: b.box } : {}),
      ...(b.ocr ? { ocr: true } : {}),
    }));
  return {
    version: 1,
    filename,
    text,
    blocks,
    ocrPages: result.ocrPages || [],
  };
}

function hideContacts(text) {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[联系方式已隐藏]")
    .replace(
      /(?:https?:\/\/|www\.|github\.com\/)[^\s|｜，；]+/gi,
      "[联系方式已隐藏]",
    )
    .replace(
      /(?:\+?86[\s-]?)?1[3-9]\d(?:[\s-]?\d){8}(?!\d)|\+\d{1,3}[\s(][\d\s()-]{6,18}\d/g,
      "[联系方式已隐藏]",
    );
}

export function importModelBlocks(source, profile) {
  const privateValues = [
    profile.name,
    ...(profile.contactItems || [])
      .filter((c) => ["phone", "email", "link"].includes(c.type))
      .map((c) => c.value),
  ].filter(Boolean);
  return source.blocks
    .map((block) => {
      let text = block.text;
      for (const value of privateValues)
        text = text.split(value).join("[个人信息已隐藏]");
      text = hideContacts(text);
      return {
        id: block.id,
        text,
        ...(block.page ? { page: block.page } : {}),
      };
    })
    .filter(
      (b) =>
        b.text.replace(
          /\[(?:个人信息|联系方式)已隐藏\]|[姓名电话邮箱\s：:|｜·]/gu,
          "",
        ).length > 0,
    );
}

export function importBatches(blocks, limit = importLimit.chunkCharacters) {
  const batches = [];
  let current = [],
    size = 0;
  for (const block of blocks) {
    if (
      current.length &&
      (size + block.text.length > limit ||
        current.length >= importLimit.chunkBlocks)
    ) {
      batches.push(current);
      // Keep context across page and batch boundaries. Shared block IDs allow
      // the results to be joined without merging two unrelated experiences.
      current = current.slice(-6);
      size = current.reduce((n, b) => n + b.text.length, 0);
    }
    current.push(block);
    size += block.text.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

export function validateImportContext(context, approval, connection) {
  if (
    !approval ||
    approval.connectionId !== connection?.id ||
    approval.baseUrl !== connection.baseUrl
  )
    throw Error("解析服务已变化，请重新点击「用 AI 整理」确认本次发送。");
  const blocks = context?.blocks;
  if (
    !Array.isArray(blocks) ||
    !blocks.length ||
    blocks.length > 200 ||
    blocks.some(
      (b) =>
        !b ||
        !/^b\d{1,6}$/.test(b.id) ||
        typeof b.text !== "string" ||
        !b.text.trim() ||
        b.text.length > 170000,
    ) ||
    new Set(blocks.map((b) => b.id)).size !== blocks.length ||
    blocks.reduce((n, b) => n + b.text.length, 0) > importLimit.characters
  )
    throw Error("本次解析内容过长或格式不完整，请拆分文件后重试。");
  return {
    blocks: blocks.map((b) => ({
      id: b.id,
      text: hideContacts(b.text),
      ...(Number.isInteger(b.page) && b.page > 0 ? { page: b.page } : {}),
    })),
  };
}
