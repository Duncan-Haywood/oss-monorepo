// Scanned statements: a PDF with no text layer (a scan) or a photo of a page is
// read by OCR in the browser with tesseract.js (WebAssembly), so the statement
// never leaves the machine. The engine, its worker, the wasm core and the
// English model (about 20 MB, cached by the browser after the first scan) are
// downloaded only when someone presses "Read the scan"; nothing is requested
// before that, and the image is handed to the engine inside the tab.
//
// This module has no DOM or Node imports at the top level, so the tests and the
// eval run it in Node. The page-only parts (loading the engine, drawing a raw
// image on a canvas) are behind functions the page calls.
//
//   pageImages(bytes, inflate)  the picture on each page of an image-only PDF
//   linesFromWords(words)       OCR word boxes -> the reader's lines, columns kept
//   wordsFromTsv(tsv)           tesseract's TSV output -> word boxes (CLI, eval)
//   cleanAmountWord(text)       digit look-alikes in a number (4.5O -> 4.50)
//
// The arithmetic that checks and repairs what OCR read lives in calc.mjs
// (parseStatement with { ocr: true }).
import { bytesToBinaryString, scanObjects, findTrailer, expandObjectStreams, rawStreamBytes, PDict, PRef, isDict, isName, resolve } from './pdf-parser.mjs';

// Pinned versions, loaded from jsDelivr on click (the same set ai-bookkeeper's
// receipt reader uses).
const CDN = 'https://cdn.jsdelivr.net/npm';
export const OCR_URLS = {
  script: `${CDN}/tesseract.js@5.1.1/dist/tesseract.min.js`,
  worker: `${CDN}/tesseract.js@5.1.1/dist/worker.min.js`,
  core: `${CDN}/tesseract.js-core@5.1.1`,
  lang: `${CDN}/@tesseract.js-data/eng@1.0.0/4.0.0`,
};

export const IMAGE_FILE = /\.(png|jpe?g|webp|bmp|gif)$|^image\/(png|jpe?g|webp|bmp|gif)$/i;

// --- Digit look-alikes --------------------------------------------------------

// Inside a token that is mostly digits, O/o/D -> 0, l/I/| -> 1, S/s -> 5, B -> 8,
// Z/z -> 2. A word is left alone: only tokens that already hold two or more
// digits and no run of three real letters are touched. Adapted from
// ventures/ai-bookkeeper/cleanocr.mjs (same repository, MIT).
const LOOK = { O: '0', o: '0', D: '0', l: '1', I: '1', '|': '1', S: '5', s: '5', B: '8', Z: '2', z: '2' };
export function cleanAmountWord(text) {
  let s = String(text)
    .replace(/(\d)\.\.(\d{2})(?!\d)/g, '$1.$2') // 146..57: a doubled point
    .replace(/^(-?\$?\d{1,3}(?:,\d{3})*)[:;](\d{2})(?![\d.,])/, '$1.$2') // 2,202:33: the point read as a colon
    .replace(/^(-?\$?\d{1,3}(?:,\d{3})+),(\d{2})(?![\d.,])/, '$1.$2') // 1,335,22: the point read as a comma
    .replace(/(\d)\s+([.,])(\d{2})(?!\d)/g, '$1$2$3') // 5 .50
    .replace(/(\d[.,])\s+(\d{2})(?!\d)/g, '$1$2'); // 5. 50
  s = s.replace(/(^|[\s$€£(-])([OoIl|])(?=[.,]\d{2}(?!\d))/g, (m, p, c) => p + LOOK[c]); // O.87
  return s.replace(/[\w$€£|.,/()-]+/g, (tok) => {
    const digits = (tok.match(/\d/g) || []).length;
    const letters = (tok.match(/[A-Za-z|]/g) || []).length;
    if (digits < 2 || letters === 0 || letters > digits) return tok;
    if (/^\d[\d.,]*(CR|DR|Cr|Dr)$/.test(tok)) return tok; // 12.50CR: a tag, not digits
    if (/[a-z]{3,}/i.test(tok.replace(/[OolIDSsBZz|]/g, ''))) return tok; // a real word
    return tok.replace(/[OoDlI|SsBZz]/g, (c) => LOOK[c]);
  });
}

// --- Word boxes -> lines ------------------------------------------------------

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };

/**
 * Turns OCR word boxes into the lines parseStatement reads, keeping columns: a
 * word's x is measured in character widths from the left edge, so an amount
 * under "Balance" lines up with the heading the way it does in a text-layer PDF.
 * Words on one row closer than about one and a half characters join into one
 * item ("COFFEE SHOP"); a wider gap starts a new item (the next column).
 *
 * @param {{text: string, bbox: {x0:number,y0:number,x1:number,y1:number}, confidence?: number}[]} words
 * @param {number} page
 * @returns {{page:number, lineNo:number, items:{text:string,x:number,xEnd:number}[], key:number, ocr:true, confidence:number}[]}
 */
export function linesFromWords(words, page = 1, firstKey = 0) {
  const ws = words.filter((w) => w && w.text && w.text.trim() && w.bbox && w.bbox.x1 > w.bbox.x0 && w.bbox.y1 > w.bbox.y0)
    .map((w) => ({ text: w.text.trim(), x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1, conf: w.confidence ?? 100 }));
  if (!ws.length) return [];
  // One character's width, from words of three or more characters.
  const cw = median(ws.filter((w) => w.text.length >= 3).map((w) => (w.x1 - w.x0) / w.text.length)) || median(ws.map((w) => (w.x1 - w.x0) / w.text.length)) || 1;
  const h = median(ws.map((w) => w.y1 - w.y0)) || 1;
  const left = Math.min(...ws.map((w) => w.x0));
  // Rows: a word joins the row whose middle is within half a line height of its
  // own. A scan is often turned a little: a 1 degree skew across a 1,700 pixel
  // page moves the right edge by 30 pixels, a line's height, so the slope is
  // measured between neighbouring words and taken out first.
  const cluster = (slope) => {
    const ys = (w) => (w.y0 + w.y1) / 2 - slope * ((w.x0 + w.x1) / 2 - left);
    const sorted = [...ws].sort((a, b) => ys(a) - ys(b));
    const out = [];
    for (const w of sorted) {
      const mid = ys(w);
      const row = out.find((r) => Math.abs(r.mid - mid) < h * 0.55);
      if (row) { row.words.push(w); row.mid = (row.mid * (row.words.length - 1) + mid) / row.words.length; } else out.push({ mid, words: [w] });
    }
    return out;
  };
  // Each word and its nearest neighbour to the right on about the same height:
  // close together, so even a turned page keeps them within half a line.
  const yc = (w) => (w.y0 + w.y1) / 2, xc = (w) => (w.x0 + w.x1) / 2;
  const slopes = [];
  for (const w of ws) {
    let best = null;
    for (const v of ws) if (v.x0 > w.x1 && v.x0 - w.x1 < 40 * cw && Math.abs(yc(v) - yc(w)) < h * 0.6 && (!best || v.x0 < best.x0)) best = v;
    if (best) slopes.push((yc(best) - yc(w)) / (xc(best) - xc(w)));
  }
  const rows = cluster(slopes.length >= 3 ? median(slopes) : 0);
  rows.sort((a, b) => a.mid - b.mid);
  return rows.map((r, i) => {
    r.words.sort((a, b) => a.x0 - b.x0);
    const items = [];
    for (const w of r.words) {
      const x = (w.x0 - left) / cw, xEnd = (w.x1 - left) / cw;
      const last = items[items.length - 1];
      if (last && x - last.xEnd < 1.5) { last.text += ' ' + w.text; last.xEnd = xEnd; } else items.push({ text: w.text, x, xEnd });
    }
    for (const it of items) { it.text = cleanAmountWord(it.text); it.x = Math.round(it.x * 10) / 10; it.xEnd = Math.round(it.xEnd * 10) / 10; }
    // A lone run of digits on a row whose other figures carry two decimals is an
    // amount whose point OCR lost (21713 for 217.13). The running balance checks it.
    const decimals = items.filter((it) => /^-?\$?[\d,]*\d[.,]\d{2}(CR|DR)?$/i.test(it.text)).length;
    for (const it of items) if (decimals && it !== items[0] && /^\d{3,8}$/.test(it.text)) { it.text = `${it.text.slice(0, -2)}.${it.text.slice(-2)}`; it.pointAdded = true; }
    const conf = Math.round(r.words.reduce((a, w) => a + w.conf, 0) / r.words.length);
    return { page, lineNo: firstKey + i + 1, items, key: firstKey + i, ocr: true, confidence: conf };
  });
}

/** tesseract's `tsv` output (CLI `tesseract img out tsv`) -> word boxes. */
export function wordsFromTsv(tsv) {
  const rows = String(tsv).split(/\r?\n/);
  const head = rows.shift().split('\t');
  const at = (k) => head.indexOf(k);
  const [L, T, W, H, C, X] = ['left', 'top', 'width', 'height', 'conf', 'text'].map(at);
  return rows.map((r) => r.split('\t')).filter((c) => c.length > X && c[X] && c[X].trim() && +c[C] >= 0)
    .map((c) => ({ text: c[X], bbox: { x0: +c[L], y0: +c[T], x1: +c[L] + +c[W], y1: +c[T] + +c[H] }, confidence: +c[C] }));
}

// --- The picture on each page of a scanned PDF --------------------------------

function inherited(dict, key, objects) {
  let d = dict;
  for (let i = 0; i < 24 && isDict(d); i++) {
    if (d.has(key)) return resolve(d.get(key), objects);
    d = resolve(d.get('Parent'), objects);
  }
  return null;
}

function pageDicts(objects, trailer) {
  const pages = [], seen = new Set();
  const walk = (ref, depth) => {
    if (depth > 24) return;
    const num = ref instanceof PRef ? ref.num : null;
    if (num !== null) { if (seen.has(num)) return; seen.add(num); }
    const d = resolve(ref, objects);
    if (!isDict(d)) return;
    const kids = resolve(d.get('Kids'), objects);
    if (Array.isArray(kids) && !isName(d.get('Type'), 'Page')) kids.forEach((k) => walk(k, depth + 1));
    else pages.push(d);
  };
  const root = trailer ? resolve(trailer.get('Root'), objects) : null;
  if (isDict(root) && root.get('Pages')) walk(root.get('Pages'), 0);
  if (pages.length) return pages;
  return [...objects.entries()].filter(([, e]) => isDict(e.dict) && isName(e.dict.get('Type'), 'Page')).sort((a, b) => a[0] - b[0]).map(([, e]) => e.dict);
}

const nameOf = (v) => (v && typeof v === 'object' && 'name' in v ? v.name : null);
const filterList = (d, objects) => {
  const f = resolve(d.get('Filter'), objects);
  return (Array.isArray(f) ? f : f ? [f] : []).map((x) => nameOf(resolve(x, objects))).filter(Boolean);
};

// PNG predictors (DecodeParms /Predictor 10-15), which many PDF writers use for
// Flate images: each row starts with a filter byte.
export function unpredict(data, width, colors, bpc, predictor) {
  if (!predictor || predictor < 10) return data;
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLen = Math.ceil((width * colors * bpc) / 8);
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  for (let y = 0; y < rows; y++) {
    const ft = data[y * (rowLen + 1)];
    const src = y * (rowLen + 1) + 1, dst = y * rowLen, up = dst - rowLen;
    for (let x = 0; x < rowLen; x++) {
      const raw = data[src + x];
      const a = x >= bpp ? out[dst + x - bpp] : 0, b = y ? out[up + x] : 0, c = y && x >= bpp ? out[up + x - bpp] : 0;
      let v;
      if (ft === 0) v = raw;
      else if (ft === 1) v = raw + a;
      else if (ft === 2) v = raw + b;
      else if (ft === 3) v = raw + ((a + b) >> 1);
      else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      out[dst + x] = v & 255;
    }
  }
  return out;
}

/** Raw pixel bytes (gray, RGB or 1-bit) -> RGBA, for an ImageData. */
export function toRgba(data, width, height, colors, bpc, invert1bit = false) {
  const out = new Uint8ClampedArray(width * height * 4);
  const rowLen = Math.ceil((width * colors * bpc) / 8);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r, g, b;
      if (bpc === 1) {
        const bit = (data[y * rowLen + (x >> 3)] >> (7 - (x & 7))) & 1;
        r = g = b = (bit ^ (invert1bit ? 1 : 0)) ? 255 : 0;
      } else if (colors === 1) r = g = b = data[y * rowLen + x];
      else { const i = y * rowLen + x * 3; r = data[i]; g = data[i + 1]; b = data[i + 2]; }
      const o = (y * width + x) * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * The largest image drawn on each page of a PDF, ready for OCR.
 * Each page gives one of:
 *   { page, kind: 'jpeg', bytes, width, height }               a DCT (JPEG) scan, the common case
 *   { page, kind: 'pixels', rgba, width, height }              a Flate image (gray, RGB or 1-bit)
 *   { page, kind: 'unsupported', filter, width, height }       CCITT fax, JBIG2 or JPEG 2000
 *   { page, kind: 'none' }                                     no image on the page
 * plus `rotate` (the page's /Rotate) and `images` (how many images the page has).
 * @param {Uint8Array} bytes
 * @param {(b: Uint8Array) => Promise<Uint8Array|null>} inflate
 */
export async function pageImages(bytes, inflate) {
  const bin = bytesToBinaryString(bytes);
  const objects = scanObjects(bin);
  await expandObjectStreams(objects, bin, inflate);
  const trailer = findTrailer(bin, objects);
  if (trailer && trailer.has('Encrypt')) return { encrypted: true, pages: [] };
  const out = [];
  let pageNo = 0;
  for (const page of pageDicts(objects, trailer)) {
    pageNo++;
    const res = inherited(page, 'Resources', objects);
    const rotate = ((Number(inherited(page, 'Rotate', objects)) || 0) % 360 + 360) % 360;
    const imgs = [];
    const collect = (resDict, depth) => {
      const xo = isDict(resDict) ? resolve(resDict.get('XObject'), objects) : null;
      if (!isDict(xo) || depth > 3) return;
      for (const [, ref] of xo.map) {
        const entry = ref instanceof PRef ? objects.get(ref.num) : null;
        const d = entry && entry.dict instanceof PDict ? entry.dict : null;
        if (!d) continue;
        if (isName(d.get('Subtype'), 'Image')) imgs.push(entry);
        else if (isName(d.get('Subtype'), 'Form')) collect(resolve(d.get('Resources'), objects), depth + 1);
      }
    };
    collect(res, 0);
    if (!imgs.length) { out.push({ page: pageNo, kind: 'none', rotate, images: 0 }); continue; }
    const size = (e) => (Number(resolve(e.dict.get('Width'), objects)) || 0) * (Number(resolve(e.dict.get('Height'), objects)) || 0);
    const e = imgs.sort((a, b) => size(b) - size(a))[0];
    const d = e.dict;
    const width = Number(resolve(d.get('Width'), objects)) || 0, height = Number(resolve(d.get('Height'), objects)) || 0;
    const filters = filterList(d, objects);
    const base = { page: pageNo, width, height, rotate, images: imgs.length };
    const raw = rawStreamBytes(e, null, bin);
    const last = filters[filters.length - 1];
    if (last === 'DCTDecode' || last === 'DCT') {
      let data = raw;
      for (const f of filters.slice(0, -1)) data = f === 'FlateDecode' || f === 'Fl' ? await inflate(data) : null;
      out.push(data ? { ...base, kind: 'jpeg', bytes: data } : { ...base, kind: 'unsupported', filter: filters.join('+') });
      continue;
    }
    if (filters.every((f) => f === 'FlateDecode' || f === 'Fl')) {
      let data = raw;
      for (let k = 0; k < filters.length && data; k++) data = await inflate(data);
      const cs = resolve(d.get('ColorSpace'), objects);
      const csName = nameOf(cs) || (Array.isArray(cs) ? nameOf(resolve(cs[0], objects)) : null);
      const bpc = Number(resolve(d.get('BitsPerComponent'), objects)) || 8;
      const imageMask = resolve(d.get('ImageMask'), objects) === true;
      const colors = csName === 'DeviceRGB' || csName === 'CalRGB' ? 3 : csName === 'DeviceGray' || csName === 'CalGray' || imageMask ? 1 : null;
      if (data && colors && (bpc === 8 || (bpc === 1 && colors === 1))) {
        const parms = resolve(d.get('DecodeParms'), objects);
        const pred = isDict(parms) ? Number(resolve(parms.get('Predictor'), objects)) || 0 : 0;
        const px = unpredict(data, width, colors, bpc, pred);
        // a 1-bit gray image: 0 is black; an image mask: 0 paints (black on white)
        out.push({ ...base, kind: 'pixels', rgba: toRgba(px, width, height, colors, bpc, false) });
        continue;
      }
      out.push({ ...base, kind: 'unsupported', filter: `Flate ${csName || 'colour space'} ${bpc}-bit` });
      continue;
    }
    out.push({ ...base, kind: 'unsupported', filter: filters.join('+') || 'none' });
  }
  return { encrypted: false, pages: out };
}

// --- The page side: engine and reading --------------------------------------

/** Words with boxes from each image, through an engine `{ words(image) }`. */
export async function readScanImages(images, engine, onProgress = () => {}) {
  const lines = [];
  const confidences = [];
  for (let i = 0; i < images.length; i++) {
    onProgress({ page: i + 1, pages: images.length });
    const words = await engine.words(images[i]);
    const ls = linesFromWords(words, i + 1, lines.length);
    lines.push(...ls);
    confidences.push(...ls.map((l) => l.confidence));
  }
  lines.forEach((l, i) => { l.lineNo = i + 1; l.key = i; });
  return { lines, meanConfidence: confidences.length ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : null };
}

function loadScript(src) {
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.crossOrigin = 'anonymous';
    s.onerror = () => fail(new Error('Could not load the OCR reader (are you offline?). Download the statement as a PDF from your bank instead, or paste the text.'));
    document.head.appendChild(s);
  });
}

/** Browser only: tesseract.js loaded on first use; `words(image)` returns word boxes. */
export async function loadEngine(onProgress = () => {}, urls = OCR_URLS) {
  if (!globalThis.Tesseract) await loadScript(urls.script);
  const worker = await globalThis.Tesseract.createWorker('eng', 1, {
    workerPath: urls.worker, corePath: urls.core, langPath: urls.lang,
    logger: (m) => onProgress(m), errorHandler: () => {},
  });
  // one block of text (psm 6): a statement page is a table, one row per line
  await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
  return {
    words: async (image) => (await worker.recognize(image, {}, { blocks: true })).data.blocks
      .flatMap((b) => b.paragraphs).flatMap((p) => p.lines).flatMap((l) => l.words)
      .map((w) => ({ text: w.text, bbox: w.bbox, confidence: w.confidence })),
    done: () => worker.terminate(),
  };
}

/** Browser only: a pageImages entry or an image File -> something tesseract.js reads. */
export async function imageSource(p) {
  if (p instanceof Blob) return p;
  let canvas;
  if (p.kind === 'jpeg') {
    const bmp = await createImageBitmap(new Blob([p.bytes], { type: 'image/jpeg' }));
    canvas = document.createElement('canvas');
    canvas.width = bmp.width; canvas.height = bmp.height;
    canvas.getContext('2d').drawImage(bmp, 0, 0);
  } else if (p.kind === 'pixels') {
    canvas = document.createElement('canvas');
    canvas.width = p.width; canvas.height = p.height;
    canvas.getContext('2d').putImageData(new ImageData(p.rgba, p.width, p.height), 0, 0);
  } else return null;
  if (!p.rotate) return canvas;
  // the page is shown turned; turn the picture the same way before reading it
  const r = document.createElement('canvas');
  const quarter = p.rotate === 90 || p.rotate === 270;
  r.width = quarter ? canvas.height : canvas.width; r.height = quarter ? canvas.width : canvas.height;
  const g = r.getContext('2d');
  g.translate(r.width / 2, r.height / 2); g.rotate((p.rotate * Math.PI) / 180);
  g.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return r;
}
