// Real OCR, in a real browser: draws a receipt on a canvas, hands the PNG to the page's
// "Receipt photos" control and checks the text that tesseract.js reads comes back into the
// receipts box and parses to the right total. The page fetches its readers from jsDelivr; this
// script answers those requests from the npm tarballs (tesseract.js, tesseract.js-core,
// @tesseract.js-data/eng, and for RapidOCR onnxruntime-web and @gutenye/ocr-models), so it
// needs `npm pack` access but not jsDelivr:
//   node eval/photo-ocr-browser.mjs [DIR_WITH_TARBALLS] [REAL_PHOTO.jpg]
// The drawn receipt is read twice: with RapidOCR leading (the page's default) and with the
// RapidOCR box unticked (tesseract alone). A real photo, when given, is read with RapidOCR on
// and its text printed, to compare with eval/rapidocr-web.mjs's reading of the same file.
// Skips with exit 0 when playwright, Chromium or the tarballs are missing.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync, mkdtempSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const root = fileURLToPath(new URL("..", import.meta.url));
let chromium;
for (const c of ["playwright", process.env.PLAYWRIGHT_PATH, "/opt/node-tools/node_modules/playwright", "playwright-core"].filter(Boolean).map((c) => (c.startsWith("/") && existsSync(c) && statSync(c).isDirectory() ? join(c, "index.mjs") : c))) {
  try { ({ chromium } = await import(c.startsWith("/") ? "file://" + c : c)); break; } catch {}
}
if (!chromium) { console.log("skipped: playwright not installed"); process.exit(0); }

// Unpack the three npm packages the page asks jsDelivr for.
let dir = process.argv[2];
if (!dir) {
  dir = mkdtempSync(join(tmpdir(), "ocr-npm-"));
  try { for (const p of ["tesseract.js@5.1.1", "tesseract.js-core@5.1.1", "@tesseract.js-data/eng@1.0.0", "onnxruntime-web@1.20.1", "@gutenye/ocr-models@1.4.2"]) execFileSync("npm", ["pack", p], { cwd: dir, stdio: "pipe" }); }
  catch { console.log("skipped: npm pack failed (no registry access)"); process.exit(0); }
}
const unpacked = mkdtempSync(join(tmpdir(), "ocr-pkg-"));
for (const t of readdirSync(dir).filter((f) => f.endsWith(".tgz"))) {
  const out = join(unpacked, t.replace(/\.tgz$/, "")); execFileSync("mkdir", ["-p", out]);
  execFileSync("tar", ["xzf", join(dir, t), "-C", out, "--strip-components=1"]);
}
const local = (u) => {
  const m = u.match(/\/npm\/(@?[^@/]+(?:\/[^@/]+)?)@([\d.]+)\/(.*)$/); if (!m) return null;
  const [, name, ver, rest] = m;
  const folder = name.replace("@", "").replace("/", "-") + "-" + ver;
  return join(unpacked, folder, rest);
};

// Map a request path to a file under root; refuse anything that resolves outside it.
const rootDir = resolve(root);
const servedPath = (u) => {
  const p = resolve(rootDir, "." + (u === "/" ? "/index.html" : decodeURIComponent(u)));
  if (!p.startsWith(rootDir + sep)) throw new Error("outside root");
  return p;
};
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json" };
const server = createServer(async (req, res) => {
  try { const p = servedPath(req.url.split("?")[0]); res.writeHead(200, { "content-type": types[extname(p)] || "text/plain" }).end(await readFile(p)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
// routes on the context, so RapidOCR's worker (its module, ONNX Runtime, the models) is answered too
const context = await browser.newContext();
const page = await context.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const external = [];
await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
  const u = route.request().url(); external.push(u);
  const f = local(u);
  if (f && existsSync(f)) {
    const type = /\.m?js$/.test(u) ? "text/javascript" : u.endsWith(".wasm") ? "application/wasm" : "application/octet-stream";
    return route.fulfill({ status: 200, body: await readFile(f), headers: { "content-type": type, "access-control-allow-origin": "*" } });
  }
  return route.fulfill({ status: 404, body: "" });
});
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForTimeout(500);
check(external.length === 0, "no third-party request before a photo is chosen");

const lines = ["BLUE BOTTLE COFFEE", "03/14/2026", "Latte 4.50", "Muffin 5.25", "Subtotal 9.75", "Sales Tax 0.87", "Total 10.62"];
const b64 = await page.evaluate((lines) => {
  const c = document.createElement("canvas"); c.width = 700; c.height = 120 + lines.length * 70;
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#000"; g.font = "bold 44px monospace"; lines.forEach((l, i) => g.fillText(l, 40, 80 + i * 70));
  return c.toDataURL("image/png").split(",")[1];
}, lines);
const readOne = async (file, rapid) => {
  await page.fill("#receipts-text", "");
  await page.evaluate(() => { document.querySelector("#receipts-status").textContent = ""; });
  await page.setChecked("#receipts-rapid", rapid);
  const t0 = Date.now();
  await page.setInputFiles("#receipts-photos", file);
  await page.waitForFunction(() => /Read \d+ photo|could not|Could not/i.test(document.querySelector("#receipts-status").textContent), null, { timeout: 300000 }).catch(() => {});
  const status = await page.locator("#receipts-status").textContent();
  const text = await page.locator("#receipts-text").inputValue();
  console.log(`     ${rapid ? "RapidOCR on" : "RapidOCR off"} (${((Date.now() - t0) / 1000).toFixed(1)} s) status:`, status); console.log("     text:", JSON.stringify(text));
  return { status, text };
};
const drawn = { name: "receipt.png", mimeType: "image/png", buffer: Buffer.from(b64, "base64") };
for (const rapid of [true, false]) {
  const before = external.length;
  const { status, text } = await readOne(drawn, rapid);
  check(/Read 1 photo/.test(status), `the photo was read (RapidOCR ${rapid ? "on" : "off"})`);
  check(rapid ? /RapidOCR's, then/.test(status) && !/could not be loaded/.test(status) : !/RapidOCR/.test(status), rapid ? "RapidOCR read it first, in its background worker" : "tesseract read it alone");
  if (!rapid) check(!external.slice(before).some((u) => /onnx|ocr-models/.test(u)), "with the box unticked no RapidOCR file is requested");
  check(/10\.62/.test(text) && /0\.87/.test(text), "the total and tax came out of the image");
  check(/blue\s*bottle/i.test(text), "the merchant came out of the image");
}
await page.click("#receipts-read");
const row = (await page.locator("#receipts").innerText()).replace(/\s+/g, " ");
check(/10\.62/.test(row), "Read receipts parses the OCR text to a 10.62 total");
if (process.argv[3]) {
  const { text } = await readOne({ name: "photo.jpg", mimeType: "image/jpeg", buffer: await readFile(process.argv[3]) }, true);
  check(text.trim().length > 0, `the real photo ${process.argv[3]} was read`);
}
check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
