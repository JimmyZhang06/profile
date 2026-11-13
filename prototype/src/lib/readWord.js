function xmlText(source) {
  if (/<!DOCTYPE/i.test(source)) throw Error('无法读取含自定义实体的文档，请另存为普通 Word 文档。');
  const doc = new DOMParser().parseFromString(source,'application/xml');
  const blocks = [];
  if (doc.getElementsByTagName('parsererror').length) throw Error('Word 正文格式损坏，请重新导出。');
  function visit(node, depth) {
    if (depth > 100) throw Error('文档结构过于复杂，请另存为普通 Word 文档。');
    const name = node.localName;
    if (name === 't') return node.textContent;
    if (['del','delText','instrText','drawing','pict'].includes(name)) {
      if (name === 'drawing' || name === 'pict') return [...node.getElementsByTagNameNS('*','txbxContent')].map(n => visit(n,depth+1)).join('\n');
      return '';
    }
    if (name === 'tab') return '\t';
    if (name === 'br' || name === 'cr') return '\n';
    const parts = [...node.children].map(child => visit(child,depth+1));
    if (name === 'tr') {
      const cells = parts.map(p => p.trim()).filter(Boolean);
      return cells.join(cells.some(p => p.includes('\n')) ? '\n' : '\t') + '\n';
    }
    const text = parts.join('');
    if (name === 'p' && text.trim()) blocks.push({text: text.trim()});
    return text + (name === 'p' ? '\n' : '');
  }
  return {text: visit(doc.documentElement,0).trim(), blocks};
}
export function readWord(buffer, signal) {
  signal.throwIfAborted();
  return new Promise((resolve,reject) => {
    const worker = new Worker(new URL('./readWord.worker.js',import.meta.url),{type:'module'});
    const timeout = setTimeout(() => end(reject,new Error('读取超时，请另存为 .docx 或粘贴文字。')),25000);
    const abort = () => end(reject,signal.reason);
    function end(fn, value) {
      clearTimeout(timeout); signal.removeEventListener('abort',abort); worker.terminate(); fn(value);
    }
    signal.addEventListener('abort',abort,{once:true});
    worker.onerror = () => end(reject,new Error('Word 解析器未能加载，请重新选择文件。'));
    worker.onmessage = ({data}) => {
      try {
        if (data.error) throw Error(data.error);
        const parts = data.xml ? [...new Set(data.xml)].map(xmlText) : [{text: data.text,
          blocks: data.text.split('\n').filter(s => s.trim()).map(text => ({text}))}];
        const blocks = parts.flatMap(p => p.blocks).map((b,i) => ({...b,location: 'Word 第 ' + (i+1) + ' 段'}));
        end(resolve,{text: parts.map(p => p.text).join('\n'), blocks, ocrPages:[]});
      } catch (error) { end(reject,error); }
    };
    worker.postMessage(buffer,[buffer]);
  });
}
