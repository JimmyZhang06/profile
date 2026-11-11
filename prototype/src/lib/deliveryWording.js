// These are editorial instructions about the evidence, not working achievements.
// Operational negatives such as “未通过校验的记录退回修改” remain part of the text.
const editorial = /^(?:资料(?:中)?(?:未提供|未记载|未记录)|(?:现有|当前)(?:资料|材料)(?:不足|未)|不(?:宣称|声称)|不应(?:声称|写作|写成)|(?:未记录|未提供)(?:客户使用|团队规模|投入占比|量化成效)|(?:投递前|建议本人)(?:核实|核对|补充)|(?:待核事项|证据边界|写作说明)[：:])/u;

export function reviewOnly(text) {
  return editorial.test(text.trim());
}

function removeRepeatedHeading(text, record) {
  if (!record?.organization || !record.title) return text;
  const prefix = /^([^。\n：:]{2,75})[：:]\s*/u.exec(text);
  if (!prefix) return text;
  const [org, role] = prefix[1].split(/\s*[|｜·/]\s*/u);
  return org?.length >= 2 && role === record.title && record.organization.includes(org)
    ? text.slice(prefix[0].length) : text;
}

export function manuscriptText(value, record) {
  const raw = removeRepeatedHeading(value.trim(), record);
  return raw.split(/\r?\n/).map((line) => {
    const clauses = line.match(/[^。；;！？]+[。；;！？]?/gu) || [];
    return clauses.filter((s) => !reviewOnly(s)).map((s) =>
      /^\s*外部模型(?:等)?(?:并)?非自研[。；;]?\s*$/u.test(s) ? '模型由外部提供。' : s
    ).join('').trim().replace(/[；;]$/u,'。');
  }).filter(Boolean).join('\n');
}

export function experienceParagraphs(text) {
  if (text.includes('\n') || text.length < 90) return text;
  const clauses = (text.match(/[^。；;！？]+[。；;！？]?/gu) || []).map((s) => s.trim()).filter(Boolean);
  if (clauses.length < 2) return text;
  const lines = [];
  let current = '';
  for (let i = 0; i < clauses.length; i++) {
    current += clauses[i];
    if (lines.length < 2 && current.length >= 35 && clauses.slice(i + 1).join('').length >= 24) {
      lines.push(current.replace(/[；;]$/u,'。')); current = '';
    }
  }
  return [...lines,current].filter(Boolean).join('\n');
}

export function comparable(text) {
  return text.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu,'');
}

export function addsSupportedDetail(text, fuller, evidence) {
  const before = comparable(text), after = comparable(fuller);
  return evidence.some(({quote}) => {
    const proof = comparable(quote);
    for (let i = 0; i <= proof.length - 4; i++) {
      const detail = proof.slice(i,i + 4);
      if (after.includes(detail) && !before.includes(detail)) return true;
    }
    return false;
  });
}

// Short references are sometimes cited by several rewrites of the same fact.
// Compare the wording as well so that unused space doesn't buy a repetition.
export function distinctPoint(text, existing) {
  const next = comparable(text);
  if (next.length < 8) return false;
  return existing.every((line) => {
    const old = comparable(line);
    if (!old) return true;
    if (old.includes(next) || next.includes(old) && next.length - old.length < 12) return false;
    const terms = new Set(Array.from({length:Math.max(0,next.length - 2)},(_,i) => next.slice(i,i+3)));
    return [...terms].filter((term) => old.includes(term)).length < terms.size * 0.68;
  });
}
