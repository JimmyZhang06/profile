export const rewriteDirections = {
  shorter:'精简字数',
  contribution:'写清个人贡献',
  outcome:'突出交付与结果',
  custom:'按我的要求修改',
};

const content = (text) => text.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
export const sameWording = (a,b) => content(a) === content(b);
export const requestsParagraphs = (prompt) => /拆(?:成|分|为|开)|分(?:行|点|段|条|成|为)|合(?:并|成一)|整理成.{0,4}(条|段|点)/u.test(prompt);
export function changedParagraphs(before,after) {
  const lines = (s) => s.split(/\r?\n/).map(content).filter(Boolean);
  return JSON.stringify(lines(before)) !== JSON.stringify(lines(after));
}

// Show the actual replacement region, preserving surrounding text on the paper.
export function changedSpan(before, after) {
  const a = Array.from(before), b = Array.from(after);
  let start = 0, tail = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (tail < Math.min(a.length,b.length) - start && a[a.length-tail-1] === b[b.length-tail-1]) tail++;
  const slice = (s) => ({lead:s.slice(0,start).join(''), edit:s.slice(start,s.length-tail).join(''), end:s.slice(s.length-tail).join('')});
  return {before:slice(a), after:slice(b)};
}

export function rewriteIssue(before, after, direction) {
  if (!after?.trim() || sameWording(before,after)) return '这一版只重复了原文，没有可采用的改动。';
  const a = content(before), b = content(after);
  if (direction === 'shorter' && b.length > Math.floor(a.length * 0.88)) return '这版没有明显缩短，已保留原文。可以具体说明想删去哪一部分。';
  if (a.length >= 10 && b.includes(a)) return '这版保留了整段原话，只在前后添加文字。请指定要调整的动作或结果。';
  const quantities = (s) => s.normalize('NFKC').match(/[-+]?\d+(?:[.,]\d+)*(?:\s*(?:%|个百分点|分钟|小时|万元|人次|人|次|天|月|年|倍|万|亿|项|个))?/g)?.map((n) => n.replace(/\s/g,'')) || [];
  const allowed = new Set(quantities(before));
  if (quantities(after).some((n) => !allowed.has(n))) return '这版出现了原段落没有的数字或单位，已保留原文。';
  return '';
}
