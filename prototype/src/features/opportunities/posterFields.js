const fieldLabels = new Map([
  ['公司', 'company'], ['公司名称', 'company'], ['公司名', 'company'], ['company', 'company'],
  ['岗位', 'title'], ['职位', 'title'], ['岗位名称', 'title'], ['职位名称', 'title'], ['role', 'title'], ['position', 'title'],
  ['城市', 'city'], ['工作城市', 'city'], ['city', 'city'],
]);

// Only a single, explicitly labeled value may be proposed for an empty field.
export function suggestedPosterFields(text, current) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^：:]{1,20})[：:]\s*(.{1,150}?)\s*$/u);
    if (!match) continue;
    const key = fieldLabels.get(match[1].trim().toLowerCase());
    const value = match[2].trim();
    if (!key || !value || current[key]?.trim()) continue;
    if (!values.has(key)) values.set(key, new Set());
    values.get(key).add(value);
  }
  return Object.fromEntries([...values].filter(([, alternatives]) => alternatives.size === 1)
    .map(([key, alternatives]) => [key, [...alternatives][0]]));
}
