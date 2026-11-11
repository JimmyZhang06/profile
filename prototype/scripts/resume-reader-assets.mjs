import {createReadStream, readFileSync, readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';

// Keep file bytes on the device, including when a scanned page needs OCR.
export function resumeReaderAssets() {
  const require = createRequire(import.meta.url);
  const pkg = name => dirname(require.resolve(name + '/package.json'));
  const version = name => require(name + '/package.json').version;
  const prefix = 'resume-reader/' + ['pdfjs-dist','tesseract.js','tesseract.js-core','@tesseract.js-data/chi_sim','@tesseract.js-data/eng'].map(version).join('-') + '/';
  const files = new Map(), pdf = pkg('pdfjs-dist'), ocr = pkg('tesseract.js-core');
  for (const name of ['pdf','pdf.worker']) files.set(name + '.js', join(pdf,'legacy','build',name + '.min.mjs'));
  for (const dir of ['cmaps','standard_fonts','wasm','iccs']) {
    for (const entry of readdirSync(join(pdf,dir),{withFileTypes:true})) {
      if (entry.isFile() && !entry.name.startsWith('quickjs')) files.set(dir + '/' + entry.name,join(pdf,dir,entry.name));
    }
  }
  files.set('PDFJS-LICENSE',join(pdf,'LICENSE'));
  files.set('ocr/worker.js',join(pkg('tesseract.js'),'dist','worker.min.js'));
  files.set('ocr/LICENSE',join(ocr,'LICENSE'));
  for (const name of ['tesseract-core-lstm.wasm.js','tesseract-core-simd-lstm.wasm.js']) files.set('ocr/' + name,join(ocr,name));
  for (const lang of ['chi_sim','eng']) files.set('ocr/' + lang + '.traineddata.gz',join(pkg('@tesseract.js-data/' + lang),'4.0.0_best_int',lang + '.traineddata.gz'));
  return {
    name:'resume-file-readers',
    config:() => ({define:{__RESUME_READER_BASE__:JSON.stringify('/' + prefix)}}),
    configureServer(server) {
      server.middlewares.use('/' + prefix.slice(0,-1),(req,res,next) => {
        const name = (req.url || '').split('?')[0].slice(1), file = files.get(name);
        if (!file) return next();
        res.setHeader('Content-Type',name.endsWith('.js') ? 'text/javascript' : name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
        createReadStream(file).on('error',next).pipe(res);
      });
    },
    generateBundle() {
      for (const [name,path] of files) this.emitFile({type:'asset',fileName:prefix + name,source:readFileSync(path)});
    },
  };
}
