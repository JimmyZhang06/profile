import { memo } from 'react';

function InlineText({ text }) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  });
}

// Render a deliberately small, text-only Markdown subset. Model output never
// becomes raw HTML, and streaming paragraphs remain readable before completion.
export const MessageContent = memo(function MessageContent({ text, typing = false }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [], list = null;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    const item = line.match(/^\s*(?:([-*•])\s+|(\d+)[.)、]\s+)(.+)$/);
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    if (heading) {
      flushParagraph(); flushList();
      blocks.push({ kind: 'heading', text: heading[1] });
    } else if (item) {
      flushParagraph();
      const kind = item[2] ? 'ordered' : 'unordered';
      if (list?.kind !== kind) { flushList(); list = { kind, start: Number(item[2]) || 1, items: [] }; }
      list.items.push(item[3]);
    } else {
      flushList(); paragraph.push(line);
    }
  }
  flushParagraph(); flushList();
  return <div className={'message-prose' + (typing && text ? ' is-typing' : '')}>{blocks.map((block, index) => {
    if (block.kind === 'heading') return <h3 key={index}><InlineText text={block.text} /></h3>;
    if (block.kind === 'ordered' || block.kind === 'unordered') {
      const List = block.kind === 'ordered' ? 'ol' : 'ul';
      return <List key={index} start={block.kind === 'ordered' ? block.start : undefined}>{block.items.map((item, i) => <li key={i}><InlineText text={item} /></li>)}</List>;
    }
    return <p key={index}><InlineText text={block.text} /></p>;
  })}</div>;
});
