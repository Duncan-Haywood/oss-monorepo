// Reads receipt photos in the browser with tesseract.js (WebAssembly), so the image
// never leaves the machine. The engine, its worker, the wasm core and the English
// model (about 20 MB, cached by the browser after the first photo) are fetched from
// jsDelivr only when someone picks a photo; nothing is requested before that.
// `loadEngine` is injectable so the tests can run without a network.
import { cleanOcr } from "./cleanocr.mjs";

const CDN = "https://cdn.jsdelivr.net/npm";
export const OCR_URLS = {
  script: `${CDN}/tesseract.js@5.1.1/dist/tesseract.min.js`,
  worker: `${CDN}/tesseract.js@5.1.1/dist/worker.min.js`,
  core: `${CDN}/tesseract.js-core@5.1.1`,
  lang: `${CDN}/@tesseract.js-data/eng@1.0.0/4.0.0`,
};

export const IMAGE_TYPES = /^image\/(png|jpe?g|webp|bmp|gif)$/i;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve;
    s.onerror = () => reject(new Error("Could not load the photo reader (are you offline?). Paste the receipt text instead, or read the photo with any OCR tool."));
    document.head.appendChild(s);
  });
}

export async function loadEngine(onProgress = () => {}) {
  if (!globalThis.Tesseract) await loadScript(OCR_URLS.script);
  const worker = await globalThis.Tesseract.createWorker("eng", 1, {
    workerPath: OCR_URLS.worker, corePath: OCR_URLS.core, langPath: OCR_URLS.lang,
    logger: (m) => onProgress(m),
  });
  return { recognize: async (file) => (await worker.recognize(file)).data.text, close: () => worker.terminate() };
}

// One text block per photo, `---` between them, ready for the receipts box.
// Photos that are not images, or that read as empty, come back in `skipped`.
export async function readPhotos(files, { loadEngine: load = loadEngine, onProgress = () => {} } = {}) {
  const list = [...files];
  const images = list.filter((f) => IMAGE_TYPES.test(f.type || ""));
  const skipped = list.filter((f) => !images.includes(f)).map((f) => ({ name: f.name, why: "not a PNG, JPEG, WebP, BMP or GIF image" }));
  if (!images.length) return { text: "", read: 0, skipped };
  const engine = await load(onProgress);
  const blocks = [];
  try {
    for (const [i, f] of images.entries()) {
      onProgress({ status: "reading", index: i, total: images.length, name: f.name });
      const raw = await engine.recognize(f);
      const text = cleanOcr(String(raw || "")).split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim()).join("\n");
      if (text) blocks.push(text); else skipped.push({ name: f.name, why: "no text found in the photo" });
    }
  } finally { await engine.close?.(); }
  return { text: blocks.join("\n---\n"), read: blocks.length, skipped };
}
