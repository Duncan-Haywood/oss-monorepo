// Reads receipt photos in the browser with tesseract.js (WebAssembly), so the image
// never leaves the machine. The engine, its worker, the wasm core and the English
// model (about 20 MB, cached by the browser after the first photo) are fetched from
// jsDelivr only when someone picks a photo; nothing is requested before that.
// `loadEngine` is injectable so the tests can run without a network.
import { cleanOcr } from "./cleanocr.mjs";
import { parseReceipt, parseReceiptPasses } from "./receipts.mjs";

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
  return {
    // psm: tesseract's page-segmentation mode, "6" (one block, tesseract.js's
    // default) or "4" (one column of text of varying sizes)
    recognize: async (file, { psm } = {}) => {
      if (psm) await worker.setParameters({ tessedit_pageseg_mode: psm });
      return (await worker.recognize(file)).data.text;
    },
    close: () => worker.terminate(),
  };
}

// Each photo is read in these modes, as the CLI's `receipts --two-pass` does.
// On SROIE's 626 scans through tesseract.js the second reading moves the
// total from the first reading's score to the settled one (README, "The page
// reads each photo twice").
export const PASSES = ["6", "4"];

const tidy = (raw) => cleanOcr(String(raw || "")).split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim()).join("\n");

// Readings of one photo -> the one block of text that goes in the receipts box.
// The box is plain text a person can fix, so the readings cannot all go in it.
// The first reading is kept; where parseReceiptPasses takes another reading's
// total (the receipt's own arithmetic confirms it), that reading's total line
// replaces the first reading's, and the result is checked to read that total.
// `note` says what changed, for the status line.
export function settleReadings(readings) {
  const t = readings.map(tidy).filter(Boolean);
  if (t.length < 2) return { text: t[0] ?? "", note: null };
  const one = parseReceipt(t[0]), both = parseReceiptPasses(t);
  // a merchant only another reading found goes on top, where the reader looks for it
  const first = !one.merchant && both.merchant ? `${both.merchant}\n${t[0]}` : t[0];
  if (both.cents === null || both.cents === one.cents) return { text: first, note: null };
  const money = (c) => c === null ? "none" : (c / 100).toFixed(2);
  // the winning reading's own total line, or, when its total came from the
  // arithmetic and no line printed it (a cash line less change), a plain one
  const line = both.totalLine ?? `Total ${money(both.cents)}`;
  const lines = first.split("\n");
  const at = one.totalLine ? lines.findLastIndex((l) => l.trim() === one.totalLine.trim()) : -1;
  const swapped = at >= 0 ? [...lines.slice(0, at), line, ...lines.slice(at + 1)] : [...lines, line];
  const text = swapped.join("\n");
  if (parseReceipt(text).cents !== both.cents) return { note: `the two readings disagree on the total (${money(one.cents)} and ${money(both.cents)}): check it`, text: first };
  return { text, note: `total read as ${money(one.cents)} once and ${money(both.cents)} once; kept ${money(both.cents)}, which the receipt's own arithmetic confirms: check it` };
}

// One text block per photo, `---` between them, ready for the receipts box.
// Photos that are not images, or that read as empty, come back in `skipped`.
// Each photo is read once per mode in `passes` and the readings settled
// (settleReadings); `notes` lists, per photo, where the readings disagreed.
export async function readPhotos(files, { loadEngine: load = loadEngine, onProgress = () => {}, passes = PASSES } = {}) {
  const list = [...files];
  const images = list.filter((f) => IMAGE_TYPES.test(f.type || ""));
  const skipped = list.filter((f) => !images.includes(f)).map((f) => ({ name: f.name, why: "not a PNG, JPEG, WebP, BMP or GIF image" }));
  if (!images.length) return { text: "", read: 0, skipped, notes: [] };
  const engine = await load(onProgress);
  const blocks = [], notes = [];
  try {
    for (const [i, f] of images.entries()) {
      onProgress({ status: "reading", index: i, total: images.length, name: f.name });
      const readings = [];
      for (const psm of passes) readings.push(await engine.recognize(f, { psm }));
      const { text, note } = settleReadings(readings);
      if (text) { blocks.push(text); if (note) notes.push({ name: f.name, note }); }
      else skipped.push({ name: f.name, why: "no text found in the photo" });
    }
  } finally { await engine.close?.(); }
  return { text: blocks.join("\n---\n"), read: blocks.length, skipped, notes };
}
