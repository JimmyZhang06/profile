import { createLocalOcrWorker } from './localOcr.js';

const cjk = /[\u3000-\u9fff]/u;
function paragraphs(lines) {
  const result = [];
  for (const line of lines) {
    const prior = result.at(-1);
    // A long unfinished line in a paragraph commonly wraps in the PDF.
    // Preserve short headings, new bullets, dates and table columns.
    if (prior?.text.length >= 32 && !/[。；;.!?！？：:\t]$/u.test(prior.text) && !prior.text.includes('\t') &&
        !/^(?:[•●▪◦◆◇·\-–*]|\d{1,2}[.、)]\s)|\t|(?:19|20)\d{2}[./年–—-]/u.test(line.text) &&
        !/^(?:.{1,10}(?:背景|经历|能力|技能|奖项|证书)|Education|Projects?|Experience|Skills)$/iu.test(line.text)) {
      prior.text += cjk.test(prior.text.at(-1)) || cjk.test(line.text[0]) ? line.text : ' ' + line.text;
      prior.box = [Math.min(prior.box[0],line.box[0]),Math.min(prior.box[1],line.box[1]),
        Math.max(prior.box[2],line.box[2]),Math.max(prior.box[3],line.box[3])];
    } else result.push(line);
  }
  return result;
}
function joinRow(items) {
  let text = '', end = 0;
  for (const item of items) {
    const gap = item.x-end, previous = text.at(-1);
    if (previous && !/\s/u.test(previous) && !/^\s/u.test(item.text)) {
      if (gap > item.h*1.45) text += '\t';
      else if (gap > item.h*.16 && !(cjk.test(previous) && cjk.test(item.text[0]))) text += ' ';
    }
    text += item.text; end = item.x+item.w;
  }
  return text.trim();
}
// Use physical baselines to retain right-aligned dates. When both halves hold
// paragraphs across a repeated gutter, read each column top to bottom.
export function pdfPageBlocks(items, viewport) {
  const ordered = items.filter(item => item.str?.trim()).map(item => {
    const [x,y] = viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
    return {text:item.str,x,y,w:item.width,h:Math.max(4,item.height)};
  }).sort((a,b) => a.y-b.y || a.x-b.x);
  const rows = [];
  for (const item of ordered) {
    let row = rows.at(-1);
    if (!row || Math.abs(row.y-item.y) > Math.min(item.h,row.h)*.46) {
      row = {y:item.y,h:item.h,items:[]}; rows.push(row);
    }
    row.items.push(item);
  }
  for (const row of rows) row.items.sort((a,b) => a.x-b.x);
  const block = items => ({text: joinRow(items),box: [Math.min(...items.map(i=>i.x)),Math.min(...items.map(i=>i.y-i.h)),
    Math.max(...items.map(i=>i.x+i.w)),Math.max(...items.map(i=>i.y))]});
  let best = null;
  for (const ratio of [.32,.36,.4,.44,.48,.52,.56,.6,.64,.68]) {
    const x = viewport.width*ratio, pad = viewport.width*.014;
    const side = row => {
      if (row.items.some(i => i.x < x+pad && i.x+i.w > x-pad)) return null;
      return [row.items.filter(i => i.x < x),row.items.filter(i => i.x >= x)];
    };
    const splits = rows.map(side), dual = splits.filter(s => s?.[0].length && s[1].length);
    // A résumé often has three cells (employer, role, date) across a
    // single column. A role before the date is still part of that record.
    const body = dual.map(split => split.map(joinRow)).filter(([left,right]) =>
      left.trim().length >= 4 && right.trim().length >= 4 && /[\p{L}]{2}/u.test(right) &&
      !/(?:19|20)\d{2}\s*(?:[./年–—~-]|$)|至今|\bpresent\b/iu.test(left+' '+right));
    if (body.length >= 3 && dual.length >= rows.length*.17 && splits.filter(Boolean).length >= rows.length*.82 && (!best || body.length > best.score))
      best = {splits,score:body.length};
  }
  if (!best) return paragraphs(rows.map(r => block(r.items)));
  const lines = [], left = [], right = [];
  const flush = () => {lines.push(...paragraphs(left.splice(0)),...paragraphs(right.splice(0)));};
  best.splits.forEach((s,i) => {
    if (!s) { flush(); lines.push(block(rows[i].items)); }
    else { if (s[0].length) left.push(block(s[0])); if (s[1].length) right.push(block(s[1])); }
  });
  flush(); return lines.filter(b => b.text);
}
export function pdfPageText(items, viewport) { return pdfPageBlocks(items,viewport).map(b=>b.text).join('\n'); }

export async function readPdf(buffer,signal,onProgress) {
  const base = __RESUME_READER_BASE__;
  const pdfjs = await import(/* @vite-ignore */ base + 'pdf.js');
  signal.throwIfAborted();
  pdfjs.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.js';
  const task = pdfjs.getDocument({data:new Uint8Array(buffer),cMapUrl:base+'cmaps/',cMapPacked:true,
    standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',iccUrl:base+'iccs/',isEvalSupported:false,
    useSystemFonts:true,enableXfa:false,maxImageSize:24000000});
  let ocr, recognizing = 0;
  const abort = () => { task.destroy().catch(() => {}); ocr?.terminate().catch(() => {}); };
  signal.addEventListener('abort',abort,{once:true});
  try {
    const pdf = await task.promise, text = [], blocks = [], ocrPages = [];
    if (pdf.numPages > 35) throw Error('文件超过 35 页，请先选择简历所在的页，再导入。');
    for (let n=1;n<=pdf.numPages;n++) {
      signal.throwIfAborted();
      onProgress('正在读取 PDF 第 ' + n + ' / ' + pdf.numPages + ' 页');
      const page = await pdf.getPage(n), viewport = page.getViewport({scale:1});
      const {items} = await page.getTextContent();
      let pageBlocks = pdfPageBlocks(items,viewport);
      let value = pageBlocks.map(b=>b.text).join('\n');
      if (value.replace(/\s/g,'').length < 48) {
        const ops = await page.getOperatorList();
        const imageOps = [pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject,pdfjs.OPS.paintImageMaskXObject];
        if (ops.fnArray.some(op => imageOps.includes(op)) || (!value && ops.fnArray.length > 0)) {
          recognizing = n;
          onProgress('正在准备中英文文字识别 · 第 ' + n + ' 页');
          if (!ocr) {
            signal.throwIfAborted();
            ocr = await createLocalOcrWorker(percent => {
              if (!signal.aborted) onProgress('正在识别第 '+recognizing+' 页 · '+percent+'%');
            });
          }
          signal.throwIfAborted();
          const scale = Math.min(2.5,2100/Math.max(viewport.width,viewport.height));
          const view = page.getViewport({scale}), canvas = document.createElement('canvas');
          canvas.width = Math.ceil(view.width); canvas.height = Math.ceil(view.height);
          try {
            await page.render({canvas,viewport:view}).promise; signal.throwIfAborted();
            let cancelRecognition;
            const cancelled = new Promise((_,reject) => { cancelRecognition = () => reject(signal.reason); });
            signal.addEventListener('abort',cancelRecognition,{once:true});
            let result;
            try { result = await Promise.race([ocr.recognize(canvas, {}, {text: true, blocks: true}),cancelled]); }
            finally { signal.removeEventListener('abort',cancelRecognition); }
            if (result.data.text.trim()) {
              value = result.data.text.replace(/(?<=[\u3400-\u9fff]) +(?=[\u3400-\u9fff])/gu,'').trim();
              ocrPages.push(n);
              const paragraphs = (result.data.blocks || []).flatMap(b=>b.paragraphs || []);
              pageBlocks = paragraphs.map(p=>({text:p.text?.trim() || p.lines?.map(l=>l.text).join('\n').trim(),
                ...(p.bbox ? {box:[p.bbox.x0/scale,p.bbox.y0/scale,p.bbox.x1/scale,p.bbox.y1/scale]} : {}),ocr:true})).filter(b=>b.text);
              if (!pageBlocks.length) pageBlocks = value.split('\n').filter(Boolean).map(text=>({text,ocr:true}));
            }
          } finally {canvas.width = canvas.height = 0;}
        }
      }
      text.push(value);
      blocks.push(...pageBlocks.map((b,i)=>({...b,page:n,location:'PDF 第 '+n+' 页 · 第 '+(i+1)+' 段'})));
      page.cleanup();
      if (text.reduce((n,s) => n+s.length,0) > 170000) throw Error('正文过长，请选择简历所在的页。');
    }
    return {text:text.join('\n\n'),blocks,ocrPages};
  } catch (error) {
    signal.throwIfAborted();
    if (error.name === 'PasswordException') throw Error('PDF 受密码保护，请先解锁，再选择文件。');
    if (error.name === 'InvalidPDFException') throw Error('文件不是可读取的 PDF，请重新导出原件。');
    throw error;
  } finally {
    signal.removeEventListener('abort',abort);
    await Promise.allSettled([task.destroy(),ocr?.terminate()]);
  }
}
