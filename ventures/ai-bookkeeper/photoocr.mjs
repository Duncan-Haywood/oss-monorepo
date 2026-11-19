// Reads receipt photos in the browser with tesseract.js (WebAssembly), so the image
// never leaves the machine. The engine, its worker, the wasm core and the English
// model (about 20 MB, cached by the browser after the first photo) are fetched from
// jsDelivr only when someone picks a photo; nothing is requested before that.
// `loadEngine` is injectable so the tests can run without a network.
import { cleanOcr } from "./cleanocr.mjs";
import { parseReceipt, parseReceiptPasses } from "./receipts.mjs";
import { RAPID_URLS, createRapidOcr, rapidRows, bgrFromRgba, fetchRapidModels } from "./rapidocr-web.mjs";

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
    // without a handler tesseract.js 5 also throws the error it rejects with,
    // uncaught; the rejection is enough (readPhotos skips that photo)
    errorHandler: () => {},
  });
  return {
    // psm: tesseract's page-segmentation mode, "6" (one block, tesseract.js's
    // default) or "4" (one column of text of varying sizes)
    // grow: also read a grey copy drawn at that long side in pixels, enlarged or
    // shrunk (null when the photo is exactly that size: the reading is skipped, see
    // PASSES). A shrunk copy's reading comes back as { text, shrunk: true }, and
    // readPhotos puts it before the photo's own readings.
    // threshold: tesseract's thresholding_method for this reading, "2" (Sauvola,
    // a threshold set from each pixel's neighbourhood) or the default "0" (Otsu, one
    // threshold for the whole image). Set on every reading, so one reading's choice
    // never carries over to the next.
    recognize: async (file, { psm, grow, threshold = "0" } = {}) => {
      const copy = grow ? await greyCopy(file, grow) : null;
      if (grow && !copy) return null;
      await worker.setParameters({ ...(psm ? { tessedit_pageseg_mode: psm } : {}), thresholding_method: threshold });
      const text = (await worker.recognize(copy ? copy.canvas : file)).data.text;
      return copy?.shrunk ? { text, shrunk: true } : text;
    },
    // how unevenly the photo is lit (lightSpread of a 32 x 32 grey thumbnail), so
    // readPhotos can pick the passes
    shading: async (file) => {
      const bmp = await createImageBitmap(file);
      const c = document.createElement("canvas");
      c.width = SHADE_SIDE; c.height = SHADE_SIDE;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
      g.filter = "grayscale(1)";
      g.drawImage(bmp, 0, 0, SHADE_SIDE, SHADE_SIDE);
      bmp.close?.();
      const d = g.getImageData(0, 0, SHADE_SIDE, SHADE_SIDE).data;
      const grey = new Uint8Array(SHADE_SIDE * SHADE_SIDE);
      for (let i = 0; i < grey.length; i++) grey[i] = d[i * 4];
      return lightSpread(grey);
    },
    close: () => worker.terminate(),
  };
}

// RapidOCR (PaddleOCR's PP-OCRv4 models through ONNX Runtime Web; rapidocr-web.mjs), the
// engine the CLI's `receipts --rapidocr` runs. Its reading goes first and tesseract's four
// vote after it, as `--rapidocr --four-pass` does: on SRD's 195 labelled US photos the page's
// settled total goes from tesseract's alone to RapidOCR first (eval/rapidocr-web-2026-11-17.md).
// The runtime and the models (about 16 MB) come from jsDelivr when the first photo is read
// with it.
//
// It runs in a Web Worker (rapidocr-worker.mjs) when the browser can start one, so the tab
// keeps responding while a photo is read (in headless Chromium the page's longest stall went
// from about the whole read to a few tens of milliseconds, eval/rapidocr-worker-2026-11-17.md);
// the page only draws the photo and hands the pixels over. Where a worker cannot start or
// load the reader, it runs on the page as before (loadRapidInPage); `how` on the engine says
// which ("worker" or "page"). `makeWorker` and `fetchBytes` are injectable for tests.
// `script` picks the recogniser: "latin" (the default) or "cyrillic" (Russian, Ukrainian,
// Belarusian and Bulgarian slips; rapidocr-web.mjs RAPID_RECOGNISERS).
export async function loadRapidEngine({ makeWorker = defaultMakeWorker, fetchBytes = defaultFetchBytes, inPage = loadRapidInPage, script = "latin" } = {}) {
  let w = null;
  try {
    w = makeWorker();
    if (w) return await loadRapidWorker(w, { script });
  } catch (e) {
    w?.terminate?.();
    // the reader could not be downloaded or failed its hash: the page would fail the same way
    if (/could not download|pinned hash/.test(String(e?.message ?? e))) throw e;
  }
  return inPage({ fetchBytes, script });
}

function defaultMakeWorker() {
  if (typeof Worker === "undefined") return null;
  return new Worker(new URL("./rapidocr-worker.mjs", import.meta.url), { type: "module" });
}

// drives a started rapidocr-worker.mjs: open, then one read per photo, matched by id
export async function loadRapidWorker(worker, { draw = drawPixels, script = "latin" } = {}) {
  const waiting = new Map();
  let nextId = 1, ready = null, dead = null;
  const fail = (why) => {
    dead = new Error(why);
    for (const w of waiting.values()) w.reject(dead);
    waiting.clear();
    ready?.reject(dead);
  };
  worker.onmessage = (ev) => {
    const m = ev.data;
    if (m.type === "ready") ready?.resolve();
    else if (m.type === "rows") { waiting.get(m.id)?.resolve(m.text); waiting.delete(m.id); }
    else if (m.type === "error") {
      if (m.id != null) { waiting.get(m.id)?.reject(new Error(m.message)); waiting.delete(m.id); }
      else ready?.reject(new Error(m.message));
    }
  };
  // a module the worker cannot load (an old browser, a blocked script) arrives as an error event
  worker.onerror = (ev) => { ev?.preventDefault?.(); fail(`the RapidOCR worker stopped (${ev?.message || "it could not start"})`); };
  await new Promise((resolve, reject) => { ready = { resolve, reject }; worker.postMessage({ type: "open", script }); });
  ready = null;
  return {
    how: "worker",
    read: async (file) => {
      if (dead) throw dead;
      const { rgba, width, height } = await draw(file);
      // the worker can die while the photo is drawn: a message to it now would never be answered
      if (dead) throw dead;
      const id = nextId++;
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        worker.postMessage({ type: "read", id, width, height, rgba }, [rgba.buffer]);
      });
    },
    close: async () => { worker.terminate(); fail("closed"); },
  };
}

// the photo as the browser draws it (EXIF orientation applied), as RGBA pixels
async function drawPixels(file) {
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  bmp.close?.();
  return { rgba: g.getImageData(0, 0, c.width, c.height).data, width: c.width, height: c.height };
}

// RapidOCR on the page's own thread (the tab stalls while a photo is read): the fallback
export async function loadRapidInPage({ fetchBytes = defaultFetchBytes, script = "latin" } = {}) {
  if (!globalThis.ort) await loadScript(RAPID_URLS.ort);
  const ort = globalThis.ort;
  ort.env.wasm.wasmPaths = RAPID_URLS.wasm;
  // threads need a cross-origin-isolated page, which a static page is not
  ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  const { det, cls, rec, keys } = await fetchRapidModels(fetchBytes, script);
  const engine = createRapidOcr({ ort, models: { det, cls, rec }, keys });
  await engine.open();
  return {
    how: "page",
    // the photo as the browser draws it, read into rows of text
    read: async (file) => {
      const { rgba, width, height } = await drawPixels(file);
      return rapidRows(await engine.read(bgrFromRgba(rgba, width, height)));
    },
    close: () => engine.close(),
  };
}

async function defaultFetchBytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`could not download the RapidOCR reader (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}

// A grey copy of the photo drawn on a canvas with its long side at `side` pixels,
// enlarged or shrunk, or null when the photo is exactly that size.
async function greyCopy(file, side) {
  const bmp = await createImageBitmap(file);
  const k = side / Math.max(bmp.width, bmp.height);
  if (k === 1) { bmp.close?.(); return null; }
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.filter = "grayscale(1)";
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return { canvas: c, shrunk: k < 1 };
}

// Each photo is read in these modes, as the CLI's `receipts --two-pass` does.
// On SROIE's 626 scans through tesseract.js the second reading moves the
// total from the first reading's score to the settled one (README, "The page
// reads each photo twice"). A photo under 2,000 pixels on its long side (a
// downsized phone photo) is read twice more, as a grey copy drawn at 2,000: on
// ExpressExpense's 200 US receipt photos (750 x 1000) the four readings' vote
// takes the total from 60.7% to 67.9% right (README, "US receipt photos"). A
// bigger photo (a full-size phone photo, a flatbed scan) is drawn shrunk to 2,000
// and that copy is read first (README, "Full-size photos").
export const PASSES = ["6", "4", { psm: "6", grow: 2000 }, { psm: "4", grow: 2000 }];

// An unevenly lit photo (a shadow across the slip, a dim room, a slip held in the
// hand) is read with block mode twice instead, once with tesseract's global Otsu
// threshold and once with Sauvola's local one (threshold "2"), which keeps the print
// on the dark side that one threshold for the whole image loses. Only when
// lightSpread >= SHADED_CUT: on evenly lit flatbed scans the Sauvola readings cost
// more totals than they find. Measured (README, "Shaded photos: a local
// threshold"): ExpressExpense's US photos 134 to 145 of 196, held-out half 67 to 73;
// SROIE's scans 530 to 529 of 625, held-out half 268 to 268.
export const SHADED_PASSES = ["6", { psm: "6", threshold: "2" }, { psm: "6", grow: 2000 }, { psm: "6", grow: 2000, threshold: "2" }];
export const SHADED_CUT = 0.13;
export const SHADE_SIDE = 32;

// How unevenly a photo is lit: the coefficient of variation (standard deviation
// over mean) of a SHADE_SIDE x SHADE_SIDE grey thumbnail's pixels (0-255), each
// pixel the average of its patch of the photo. A flatbed scan of a white slip is
// near 0.05; a slip on a dark table or under a shadow is 0.2 or more. The CLI
// computes it from ImageMagick's thumbnail (ocr.mjs).
export function lightSpread(grey) {
  const n = grey.length;
  if (!n) return 0;
  let sum = 0;
  for (const v of grey) sum += v;
  const mean = sum / n;
  if (!mean) return 0;
  let sq = 0;
  for (const v of grey) sq += (v - mean) ** 2;
  return Math.sqrt(sq / n) / mean;
}

const tidy = (raw) => cleanOcr(String(raw || "")).split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim()).join("\n");

// Readings of one photo -> the one block of text that goes in the receipts box.
// The box is plain text a person can fix, so the readings cannot all go in it.
// The first reading is kept; where parseReceiptPasses takes another reading's
// total (the receipt's own arithmetic confirms it), that reading's total line
// replaces the first reading's, and the result is checked to read that total.
// `note` says what changed, for the status line.
export function settleReadings(readings, { lead = false } = {}) {
  const out = settleTax(settleTotals(readings, lead), readings, lead);
  const guess = out.text ? guessedTotal(out.text) : null;
  return guess ? { ...out, note: out.note ? `${out.note}; ${guess}` : guess } : out;
}

// A photo whose text has no total line gets its total from the largest amount on
// it, and on phone photos that guess is usually the cash handed over or noise: on
// CORD's 100 validation photos through tesseract.js it was right 11 times in 30
// (README, "Receipt photos from a phone"). Say so, so the total is typed, not trusted.
export function guessedTotal(text) {
  const p = parseReceipt(text);
  if (p.cents === null) return "no total found in the photo: type it in";
  if (p.notes.some((n) => /took the largest amount/.test(n))) return `no total line found in the photo; ${(p.cents / 100).toFixed(2)} is only the largest amount on it: check the total`;
  return null;
}

// The receipts box is parsed again from the settled text, so a tax the readings agree
// on (receipts.mjs voteTax) goes into it as a line: the first reading's own tax line is
// swapped for it, or a "Tax" line goes in just above the total line. Left alone when
// the text would not then read that tax (README, "Tax on receipt photos").
function settleTax(settled, readings, lead = false) {
  const t = readings.map(tidy).filter(Boolean);
  if (t.length < 2 || !settled.text) return settled;
  const both = parseReceiptPasses(t, { lead }), now = parseReceipt(settled.text);
  if (both.taxCents === null || both.taxCents === now.taxCents || now.cents !== both.cents) return settled;
  const lines = settled.text.split("\n");
  const taxAt = now.taxLine ? lines.findLastIndex((l) => l.trim() === now.taxLine.trim()) : -1;
  const totalAt = now.totalLine ? lines.findLastIndex((l) => l.trim() === now.totalLine.trim()) : -1;
  const put = (line) => (taxAt >= 0 ? [...lines.slice(0, taxAt), line, ...lines.slice(taxAt + 1)] : totalAt >= 0 ? [...lines.slice(0, totalAt), line, ...lines.slice(totalAt)] : [...lines, line]).join("\n");
  const reads = (x) => { const b = parseReceipt(x); return b.taxCents === both.taxCents && b.cents === now.cents; };
  let text = put(`Tax ${(both.taxCents / 100).toFixed(2)}`);
  // on a whole-unit slip (rupiah) "Tax 8728.00" does not read back as 8,728: write it in the
  // slip's own style, as settleTotals does a total. The page kept none of the 7 taxes the
  // other readings added on CORD train shard 0 before this (eval/cord-shard0-lead-2026-11-17.md)
  if (!reads(text) && both.taxCents >= 100 && both.taxCents % 100 === 0) text = put(`Tax ${(both.taxCents / 100).toLocaleString("en-US")}`);
  if (!reads(text)) return settled;
  return { ...settled, text, taxNote: `tax read as ${now.taxCents === null ? "none" : (now.taxCents / 100).toFixed(2)} first; kept ${(both.taxCents / 100).toFixed(2)}, which the other readings or the receipt's own sums support: check it` };
}

function settleTotals(readings, lead = false) {
  const t = readings.map(tidy).filter(Boolean);
  if (t.length < 2) return { text: t[0] ?? "", note: null };
  const one = parseReceipt(t[0]), both = parseReceiptPasses(t, { lead });
  // a merchant only another reading found goes on top, where the reader looks for it
  const first = !one.merchant && both.merchant ? `${both.merchant}\n${t[0]}` : t[0];
  // the lead reading's total kept over an unconfirmed majority (receipts.mjs `lead`) still warns
  const kept = both.cents !== null && both.cents === one.cents ? both.notes.find((n) => /from the first engine's reading/.test(n)) : null;
  if (kept) return { text: first, note: kept.replace(/^OCR readings/, "the readings") };
  if (both.cents === null || both.cents === one.cents) return { text: first, note: null };
  const money = (c) => c === null ? "none" : (c / 100).toFixed(2);
  // the winning reading's own total line, or, when its total came from the
  // arithmetic and no line printed it (a cash line less change), a plain one
  // a whole-unit total (rupiah) with no line of its own is written with thousands
  // separators and no decimals when "Total 110000.00" would not read back on that slip
  // (not a total under 100 units: a digit kept from a damaged amount, receipts.mjs tinyWhole)
  // (CORD train shards 1-3, eval/cord-train-shards-2026-11-17.md)
  const lines = first.split("\n");
  const at = one.totalLine ? lines.findLastIndex((l) => l.trim() === one.totalLine.trim()) : -1;
  const put = (line) => (at >= 0 ? [...lines.slice(0, at), line, ...lines.slice(at + 1)] : [...lines, line]).join("\n");
  let text = put(both.totalLine ?? `Total ${money(both.cents)}`);
  if (!both.totalLine && both.cents >= 10000 && both.cents % 100 === 0 && parseReceipt(text).cents !== both.cents) {
    const whole = put(`Total ${(both.cents / 100).toLocaleString("en-US")}`);
    if (parseReceipt(whole).cents === both.cents) text = whole;
  }
  if (parseReceipt(text).cents !== both.cents) return { note: `the two readings disagree on the total (${money(one.cents)} and ${money(both.cents)}): check it`, text: first };
  const said = t.length === 2 ? `${money(one.cents)} once and ${money(both.cents)} once` : `${money(one.cents)} first and ${money(both.cents)} in ${t.map((x) => parseReceipt(x).cents).filter((c) => c === both.cents).length} of ${t.length} readings`;
  return { text, note: `total read as ${said}; kept ${money(both.cents)}, which the receipt's own arithmetic${t.length > 2 ? " and the other readings" : ""} confirm${t.length > 2 ? "" : "s"}: check it` };
}

// One text block per photo, `---` between them, ready for the receipts box.
// Photos that are not images, or that read as empty, come back in `skipped`.
// Each photo is read once per mode in `passes` and the readings settled
// (settleReadings); `notes` lists, per photo, where the readings disagreed.
// `rapid` (default on) reads each photo with RapidOCR first (loadRapidEngine); when that
// reader cannot be loaded (offline, an old browser) the photos are read with tesseract alone
// and `rapidError` says why. `rapid: false` is tesseract alone.
// `rapidScript` ("latin" or "cyrillic") picks RapidOCR's recogniser.
export async function readPhotos(files, { loadEngine: load = loadEngine, loadRapid = loadRapidEngine, rapid = true, rapidScript = "latin", onProgress = () => {}, passes = null } = {}) {
  const list = [...files];
  const images = list.filter((f) => IMAGE_TYPES.test(f.type || ""));
  const skipped = list.filter((f) => !images.includes(f)).map((f) => ({ name: f.name, why: "not a PNG, JPEG, WebP, BMP or GIF image" }));
  if (!images.length) return { text: "", read: 0, skipped, notes: [] };
  let lead = null, rapidError = null;
  // the two readers download side by side
  const leading = rapid ? (onProgress({ status: "loading rapidocr" }), Promise.resolve().then(() => loadRapid({ script: rapidScript })).then((x) => x, (e) => { rapidError = String(e?.message ?? e).replace(/^Error: /, ""); return null; })) : null;
  let engine;
  try { engine = await load(onProgress); }
  catch (e) { (await leading)?.close?.(); throw e; }
  lead = await leading;
  const blocks = [], notes = [];
  let rapidRead = 0;
  let readingsDone = 0, shaded = 0;
  try {
    for (const [i, f] of images.entries()) {
      onProgress({ status: "reading", index: i, total: images.length, name: f.name });
      const readings = [];
      let led = false;
      // one photo the reader cannot open is skipped; the others are still read
      // RapidOCR reads in its worker while tesseract reads in its own, then leads the vote
      const rapidText = lead ? lead.read(f).then((t) => t, () => null) : null;
      try {
        const first = [];
        // the passes for this photo: as given, or by how evenly it is lit (an engine
        // that cannot tell reads every photo with PASSES)
        let use = passes;
        if (!use) {
          const spread = engine.shading ? await Promise.resolve().then(() => engine.shading(f)).catch(() => null) : null;
          use = spread != null && spread >= SHADED_CUT ? SHADED_PASSES : PASSES;
          if (use === SHADED_PASSES) shaded++;
        }
        for (const pass of use) {
          const t = await engine.recognize(f, typeof pass === "string" ? { psm: pass } : pass);
          if (t == null) continue;
          if (typeof t === "object") (t.shrunk ? first : readings).push(t.text); else readings.push(t);
          readingsDone++;
        }
        readings.unshift(...first);
        // RapidOCR's reading leads the vote; a photo it cannot read keeps tesseract's
        if (lead) {
          const t = await rapidText;
          if (t && tidy(t)) { readings.unshift(t); readingsDone++; rapidRead++; led = true; }
        }
      }
      catch (e) { skipped.push({ name: f.name, why: `could not be read (${String(e?.message ?? e).replace(/^Error: /, "")})` }); continue; }
      const { text, note, taxNote } = settleReadings(readings, { lead: led });
      if (text) { blocks.push(text); if (note) notes.push({ name: f.name, note }); if (taxNote) notes.push({ name: f.name, note: taxNote }); }
      else skipped.push({ name: f.name, why: "no text found in the photo" });
    }
  } finally { await engine.close?.(); await lead?.close?.(); }
  return { text: blocks.join("\n---\n"), read: blocks.length, readings: readingsDone, shaded, skipped, notes, rapid: rapidRead, rapidError, rapidHow: lead?.how ?? null };
}
