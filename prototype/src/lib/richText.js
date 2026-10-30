const markTypes = ['bold', 'italic', 'underline'];
const isBoundary = (text, position) => position <= 0 || position >= text.length || !(text.charCodeAt(position) >= 0xdc00 && text.charCodeAt(position) <= 0xdfff && text.charCodeAt(position - 1) >= 0xd800 && text.charCodeAt(position - 1) <= 0xdbff);

// Formatting is stored separately from plain source text. Only these three
// marks can round-trip; imported HTML, styles and editor-specific nodes cannot.
export function normalizeMarks(text, ranges = []) {
  const events = new Map();
  const event = position => { if (!events.has(position)) events.set(position, { bold: 0, italic: 0, underline: 0 }); return events.get(position); };
  for (const range of Array.isArray(ranges) ? ranges : []) {
    if (!range || !Number.isInteger(range.from) || !Number.isInteger(range.to)) continue;
    const from = Math.max(0, range.from), to = Math.min(text.length, range.to);
    if (from >= to || !isBoundary(text, from) || !isBoundary(text, to)) continue;
    for (const type of markTypes) if (range[type] === true) { event(from)[type]++; event(to)[type]--; }
  }
  const positions = [...events.keys()].sort((a, b) => a - b), active = { bold: 0, italic: 0, underline: 0 }, result = [];
  for (let index = 0; index < positions.length - 1; index++) {
    const from = positions[index], to = positions[index + 1];
    for (const type of markTypes) active[type] += events.get(from)[type];
    const marks = Object.fromEntries(markTypes.filter(type => active[type] > 0).map(type => [type, true]));
    if (!Object.keys(marks).length) continue;
    const previous = result.at(-1);
    if (previous?.to === from && markTypes.every(type => !!previous[type] === !!marks[type])) previous.to = to;
    else result.push({ from, to, ...marks });
  }
  return result;
}
export function textSegments(text, ranges = []) {
  const marks = normalizeMarks(text, ranges), result = [];
  let position = 0;
  for (const mark of marks) {
    if (mark.from > position) result.push({ text: text.slice(position, mark.from) });
    result.push({ text: text.slice(mark.from, mark.to), ...Object.fromEntries(markTypes.filter(type => mark[type]).map(type => [type, true])) });
    position = mark.to;
  }
  if (position < text.length) result.push({ text: text.slice(position) });
  return result;
}
export function marksForField(resume, field, text) {
  const saved = resume.textStyles?.[field];
  return saved?.text === text ? normalizeMarks(text, saved.marks) : [];
}
export function validTextStyles(styles) {
  if (styles === undefined) return true;
  return styles && typeof styles === 'object' && !Array.isArray(styles) && Object.entries(styles).every(([field, saved]) => field.length > 0 && saved && typeof saved.text === 'string' && Array.isArray(saved.marks) && saved.marks.every(mark =>
    mark && Number.isInteger(mark.from) && Number.isInteger(mark.to) && mark.from >= 0 && mark.to <= saved.text.length && mark.from < mark.to
    && isBoundary(saved.text, mark.from) && isBoundary(saved.text, mark.to)
    && Object.keys(mark).every(key => ['from', 'to', ...markTypes].includes(key))
    && markTypes.every(type => mark[type] === undefined || mark[type] === true) && markTypes.some(type => mark[type] === true)));
}
export function toEditorContent(text, marks = []) {
  let offset = 0;
  const normalized = normalizeMarks(text, marks);
  return { type: 'doc', content: text.split('\n').map(line => {
    const start = offset; offset += line.length + 1;
    const ranges = normalized.filter(mark => mark.to > start && mark.from < start + line.length).map(mark => ({ ...mark, from: Math.max(0, mark.from - start), to: Math.min(line.length, mark.to - start) }));
    return { type: 'paragraph', content: textSegments(line, ranges).filter(part => part.text).map(part => ({ type: 'text', text: part.text, marks: markTypes.filter(type => part[type]).map(type => ({ type })) })) };
  }) };
}
export function fromEditorContent(doc) {
  let text = ''; const marks = [];
  function visit(node) {
    if (node.type === 'hardBreak') { text += '\n'; return; }
    if (node.type === 'text') {
      const from = text.length; text += String(node.text || '');
      const styles = Object.fromEntries((node.marks || []).filter(mark => markTypes.includes(mark.type)).map(mark => [mark.type, true]));
      if (Object.keys(styles).length) marks.push({ from, to: text.length, ...styles });
    } else (node.content || []).forEach(visit);
  }
  (doc.content || []).forEach((node, index) => { if (index) text += '\n'; visit(node); });
  return { value: text, marks: normalizeMarks(text, marks) };
}
const escapeMarkdown = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_\[\]]/g, '\\$&');
export function formattedMarkdown(text, marks = []) {
  // Inline HTML is valid Markdown and avoids ambiguous adjacent emphasis
  // delimiters when a selection starts halfway through a Chinese sentence.
  return textSegments(text, marks).map(part => part.text.split('\n').map(line => {
    if (!line) return line;
    let result = escapeMarkdown(line);
    if (part.italic) result = '<em>' + result + '</em>';
    if (part.bold) result = '<strong>' + result + '</strong>';
    if (part.underline) result = '<u>' + result + '</u>';
    return result;
  }).join('\n')).join('');
}
export function remapTextStyles(styles, mapId) {
  return Object.fromEntries(Object.entries(styles || {}).map(([field, saved]) => {
    if (!field.includes(':')) return [field, saved];
    const [id, index] = field.split(':'); return [mapId(id) + ':' + index, saved];
  }));
}
