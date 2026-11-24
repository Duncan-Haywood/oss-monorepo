// Drives site/cull.html in headless Chromium with "Check for closed eyes"
// ticked, over a folder of photos, and prints what the page decided per frame
// (faces, the largest blink score, eyes closed) plus the timing. The MediaPipe
// library and model are served from local copies in place of the CDN.
//
//   npm i @mediapipe/tasks-vision@0.10.21          (in some scratch folder)
//   curl -O https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
//   node eval/cull-closed-eyes.mjs node_modules/@mediapipe/tasks-vision face_landmarker.task PHOTOS > out.tsv
//
// PNGs are re-encoded to JPEG in the page first (the cull page takes camera
// raws and JPEGs); raws and JPEGs go in as they are.
import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");
const [mpDir, modelPath, photos] = process.argv.slice(2);
if (!photos) { console.error("usage: node eval/cull-closed-eyes.mjs MEDIAPIPE_DIR MODEL.task PHOTOS"); process.exit(2); }
const site = join(dirname(fileURLToPath(import.meta.url)), "..", "site");
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".wasm": "application/wasm", ".webp": "image/webp" };

const files = [];
(function walk(d) { for (const n of readdirSync(d).sort()) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(png|jpe?g|nef|cr3|cr2|arw|raf|orf|rw2|pef|srw|dng)$/i.test(n)) files.push(p); } })(photos);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.route("**/*", (route) => {
  const u = new URL(route.request().url());
  let f = null;
  if (u.hostname === "site.local") f = join(site, u.pathname === "/" ? "cull.html" : u.pathname.slice(1));
  else if (u.hostname === "cdn.jsdelivr.net") f = join(mpDir, u.pathname.replace(/^\/npm\/@mediapipe\/tasks-vision@[^/]+\//, ""));
  else if (u.hostname === "storage.googleapis.com" && u.pathname.endsWith("face_landmarker.task")) f = modelPath;
  if (!f) return route.abort();
  route.fulfill({ body: readFileSync(f), contentType: types[extname(f)] || "application/octet-stream" });
});
await page.goto("http://site.local/cull.html");

// Re-encode PNGs to JPEG with the browser's own encoder (into a temp folder:
// Playwright passes files by path, and real raws pass the 50 MB buffer cap).
const inputs = [];
const tmp = mkdtempSync(join(tmpdir(), "cull-eyes-"));
for (const f of files) {
  const name = relative(photos, f).replace(/[\\/]/g, "_");
  if (/\.png$/i.test(f)) {
    const b64 = readFileSync(f).toString("base64");
    const jpg = await page.evaluate(async (b64) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height); c.getContext("2d").drawImage(bmp, 0, 0);
      const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.92 });
      return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.readAsDataURL(blob); });
    }, b64).catch(() => null);
    if (jpg) { const out = join(tmp, name.replace(/\.png$/i, ".jpg")); writeFileSync(out, Buffer.from(jpg, "base64")); inputs.push(out); }
  } else inputs.push(f);
}

// Load the card first, then tick the box (the toolbar appears with the files).
const t0 = Date.now();
await page.setInputFiles("#pickFiles", inputs);
await page.waitForFunction(() => /^\d+ files/.test(document.getElementById("status").textContent), null, { timeout: 600000 });
const loaded = (Date.now() - t0) / 1000;
await page.check("#eyesOn");
await page.waitForFunction(() => /Eyes checked on|could not load/.test(document.getElementById("status").textContent), null, { timeout: 600000 });
const status = await page.textContent("#status");
const csv = await (async () => {
  const dl = page.waitForEvent("download");
  await page.click("#dlCsv");
  return readFileSync(await (await dl).path(), "utf8");
})();
const closedTiles = await page.$$eval(".tile .eyes", (els) => els.length);
await page.selectOption("#filter", "eyesclosed");
const filtered = await page.$$eval(".tile", (els) => els.length);
console.error(`status: ${status}`);
console.error(`wall: ${loaded.toFixed(1)} s to load, ${((Date.now() - t0) / 1000 - loaded).toFixed(1)} s for the eye check (model load included), ${inputs.length} files; tiles tagged "eyes closed": ${closedTiles}; Eyes closed filter shows ${filtered}`);
// RFC 4180 rows: lens names and errors carry commas and quotes.
function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const [head, ...rows] = parseCsv(csv);
const col = (n) => head.indexOf(n);
console.log(["file", "faces", "eyes_closed", "blink_max", "sharpest_in_burst", "error"].join("\t"));
for (const r of rows) console.log([r[col("file")], r[col("faces")], r[col("eyes_closed")], r[col("blink_max")], r[col("sharpest_in_burst")], r[col("error")]].join("\t"));
await browser.close();
rmSync(tmp, { recursive: true, force: true });
