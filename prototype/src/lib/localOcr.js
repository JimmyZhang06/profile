export async function createLocalOcrWorker(onProgress) {
  const { createWorker } = await import('tesseract.js');
  const directory = new URL(__RESUME_READER_BASE__ + 'ocr/', window.location.origin);
  const assets = directory.href.slice(0, -1);
  return createWorker(['chi_sim', 'eng'], 1, {
    workerPath: new URL('worker.js', directory).href,
    corePath: assets,
    langPath: assets,
    workerBlobURL: false,
    logger(event) {
      if (event.status === 'recognizing text') onProgress(Math.round(event.progress * 100));
    },
  });
}
