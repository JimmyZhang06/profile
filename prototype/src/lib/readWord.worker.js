import {unzipSync, strFromU8} from 'fflate';
import * as CFB from 'cfb';

const maxXml = 8 * 1024 * 1024;
function docx(bytes) {
  let total = 0, count = 0;
  const entries = unzipSync(bytes,{filter(entry) {
    if (++count > 4096) throw Error('文档内的文件太多，请另存一份简历后重试。');
    if (!/^word\/(?:document|header\d*|footer\d*)\.xml$/.test(entry.name)) return false;
    total += entry.originalSize;
    if (total > maxXml) throw Error('Word 正文过大，请按简历页拆分文件。');
    return true;
  }});
  if (!entries['word/document.xml']) throw Error('文件中没有 Word 正文，请用 Word 另存为 .docx。');
  const xml = name => {
    const entry = entries[name];
    return entry[0] === 255 && entry[1] === 254 ? new TextDecoder('utf-16le').decode(entry) : strFromU8(entry);
  };
  const names = Object.keys(entries);
  return {xml:[...names.filter(n => n.includes('/header')),'word/document.xml',...names.filter(n => n.includes('/footer'))].map(xml)};
}

function binaryWord(bytes) {
  const storage = CFB.read(bytes,{type:'array'});
  const get = name => {
    const content = CFB.find(storage,'/' + name)?.content;
    return content && (content instanceof Uint8Array ? content : Uint8Array.from(content));
  };
  const word = get('WordDocument');
  if (!word || word.length < 88) throw Error('未找到 Word 正文。若文件已加密，请先另存为无密码的 .docx。');
  const view = buf => new DataView(buf.buffer,buf.byteOffset,buf.byteLength);
  const fib = view(word);
  if (fib.getUint16(10,true) & 0x8100) throw Error('Word 文档已加密，请先解密后重新导入。');
  if (fib.getUint16(2,true) < 0xc1) throw Error('这是 Word 97 之前的格式，请用 Word 另存为 .docx。');
  const table = get(fib.getUint16(10,true) & 0x0200 ? '1Table' : '0Table');
  if (!table) throw Error('Word 文档缺少文字索引，请另存为 .docx。');
  // MS-DOC §2.4.1. Resolve logical characters through the piece table,
  // including non-contiguous edits and mixed Unicode/ANSI text pieces.
  const lw = 34 + 2 * fib.getUint16(32,true), pairs = lw + 2 + 4*fib.getUint16(lw,true);
  const mainLength = fib.getUint32(lw + 14,true), clx = pairs + 2 + 33*8;
  const end = fib.getUint32(clx,true) + fib.getUint32(clx+4,true), tab = view(table);
  let at = fib.getUint32(clx,true);
  if (end > table.length || mainLength > 170000) throw Error('文档内容过大或索引不完整，请拆分后重试。');
  while (at < end && table[at] === 1) at += 3 + tab.getUint16(at+1,true);
  if (at >= end || table[at] !== 2) throw Error('无法读取旧版 Word 文字索引，请另存为 .docx。');
  const size = tab.getUint32(at+1,true), first = at+5, pieces = (size-4)/12;
  if (!Number.isInteger(pieces) || pieces < 0 || first+size > end) throw Error('Word 正文索引不完整。');
  const text = [];
  for (let i=0;i<pieces;i++) {
    const cp = tab.getUint32(first + 4*i,true);
    if (cp >= mainLength) break;
    const length = Math.min(mainLength,tab.getUint32(first+4*(i+1),true))-cp;
    const fc = tab.getUint32(first+4*(pieces+1)+8*i+2,true), ansi = !!(fc & 0x40000000);
    const start = (fc & 0x3fffffff)/(ansi ? 2 : 1), stop = start + length*(ansi ? 1 : 2);
    if (length < 0 || !Number.isInteger(start) || stop > word.length) throw Error('Word 正文不完整。');
    text.push(new TextDecoder(ansi ? 'windows-1252':'utf-16le').decode(word.subarray(start,stop)));
  }
  return {text:text.join('').replace(/\x13[^\x14\x15]*[\x14\x15]/g,'').replace(/\x15/g,'').replace(/[\r\x0b\x0c]/g,'\n').replace(/\x07/g,'\t').replace(/[\x00-\x06\x08\x0e-\x1f]/g,'')};
}

self.onmessage = ({data}) => {
  try {
    const bytes = new Uint8Array(data);
    const result = bytes[0] === 0x50 && bytes[1] === 0x4b ? docx(bytes)
      : bytes[0] === 0xd0 && bytes[1] === 0xcf ? binaryWord(bytes) : null;
    if (!result) throw Error('文件内容与 Word 格式不符，请打开原件并另存为 .docx。');
    self.postMessage(result);
  } catch (error) { self.postMessage({error:/[\u3400-\u9fff]/u.test(error.message) ? error.message : '无法读取 Word 文件，请检查文件是否完整或另存为 .docx。'}); }
};
