// What the page's RapidOCR reads, in a real browser: loads rapidocr-web.mjs and ONNX Runtime
// Web in headless Chromium, draws each photo the way photoocr.mjs does (createImageBitmap, a
// canvas, getImageData) and writes the rows to <out>/<id>.txt for eval/cord-receipts.mjs.
// jsDelivr is answered from npm tarballs (onnxruntime-web@1.20.1, @gutenye/ocr-models@1.4.2):
//   node eval/rapidocr-browser.mjs <photos dir> <out dir> <dir with the two .tgz files> [--script=cyrillic --hf=<dir>]
// --script=cyrillic reads with the page's Cyrillic recogniser (rapidocr-web.mjs RAPID_RECOGNISERS);
// its Hugging Face downloads are answered from <dir>/rec.onnx and <dir>/dict.txt (fetched at the
// pinned revision), and the page still checks their hashes.
// --bands=<dir> also writes to <dir> what the page puts in the receipts box after its second
// look for a Russian slip's seller (photoocr.mjs withSecondLook: three bands drawn on a canvas,
// read by the same reader), so the two folders score the first reading against the second look.
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const [src, out, tgz] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const script = process.argv.find((a) => a.startsWith("--script="))?.slice(9) ?? "latin";
const hf = process.argv.find((a) => a.startsWith("--hf="))?.slice(5);
const bandsOut = process.argv.find((a) => a.startsWith("--bands="))?.slice(8);
if (!tgz) { console.error("usage: node eval/rapidocr-browser.mjs <photos> <out> <tarballs>"); process.exit(2); }
let chromium;
for (const c of ["playwright", process.env.PLAYWRIGHT_PATH, "/opt/node-tools/node_modules/playwright", "playwright-core"].filter(Boolean).map((c) => (c.startsWith("/") && existsSync(c) && statSync(c).isDirectory() ? join(c, "index.mjs") : c))) {
  try { ({ chromium } = await import(c.startsWith("/") ? "file://" + c : c)); break; } catch {}
}
if (!chromium) { console.log("skipped: playwright not installed"); process.exit(0); }
const root = fileURLToPath(new URL("..", import.meta.url));
const unpacked = mkdtempSync(join(tmpdir(), "rapid-pkg-"));
for (const t of readdirSync(tgz).filter((f) => /^(onnxruntime-web|gutenye-ocr-models).*\.tgz$/.test(f))) {
  const o = join(unpacked, t.replace(/\.tgz$/, "")); execFileSync("mkdir", ["-p", o]);
  execFileSync("tar", ["xzf", join(tgz, t), "-C", o, "--strip-components=1"]);
}
const local = (u) => {
  const m = u.match(/\/npm\/(@?[^@/]+(?:\/[^@/]+)?)@([\d.]+)\/(.*)$/); if (!m) return null;
  return join(unpacked, m[1].replace("@", "").replace("/", "-") + "-" + m[2], m[3]);
};
// a request path resolved inside base; anything that climbs out (../, an absolute path) is refused
const inside = (base, rel) => {
  const b = resolve(base), p = resolve(b, rel.replace(/^\/+/, ""));
  if (p !== b && !p.startsWith(b + sep)) throw new Error("outside the served folder");
  return p;
};
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript" };
const server = createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  try {
    if (url.startsWith("/photo/")) return res.writeHead(200, { "content-type": "image/jpeg" }).end(await readFile(inside(src, url.slice(7))));
    if (url === "/") return res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><title>rapid</title>");
    const p = inside(root, url); res.writeHead(200, { "content-type": types[extname(p)] || "text/plain" }).end(await readFile(p));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.route(/^https:\/\/cdn\.jsdelivr\.net\//, async (route) => {
  const f = local(route.request().url());
  if (!f || !existsSync(f)) return route.fulfill({ status: 404, body: "" });
  const u = route.request().url();
  return route.fulfill({ status: 200, body: await readFile(f), headers: { "content-type": /\.m?js$/.test(u) ? "text/javascript" : u.endsWith(".wasm") ? "application/wasm" : "application/octet-stream", "access-control-allow-origin": "*" } });
});
if (hf) await page.route(/^https:\/\/huggingface\.co\//, async (route) => {
  const name = route.request().url().split("/").pop();
  const f = join(hf, name);
  if (!existsSync(f)) return route.fulfill({ status: 404, body: "" });
  return route.fulfill({ status: 200, body: await readFile(f), headers: { "content-type": "application/octet-stream", "access-control-allow-origin": "*" } });
});
await page.goto(`http://127.0.0.1:${server.address().port}/`);
const how = await page.evaluate(async (script) => {
  const { loadRapidEngine } = await import("/photoocr.mjs");
  window.rapid = await loadRapidEngine({ script });
  return window.rapid.how;
}, script);
console.log(`RapidOCR (${script}) loaded in the ${how}`);
await mkdir(out, { recursive: true });
if (bandsOut) await mkdir(bandsOut, { recursive: true });
let looked = 0, found = 0;
const photos = readdirSync(src).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
const t0 = Date.now();
for (const f of photos) {
  const r = await page.evaluate(async ([f, bands]) => {
    const blob = await (await fetch(`/photo/${encodeURIComponent(f)}`)).blob();
    const text = await window.rapid.read(blob);
    if (!bands) return { text };
    const { withSecondLook } = await import("/photoocr.mjs");
    return { text, second: await withSecondLook(window.rapid, blob, text) };
  }, [f, !!bandsOut]);
  await writeFile(join(out, f.replace(/\.[^.]+$/, ".txt")), r.text);
  if (bandsOut) {
    await writeFile(join(bandsOut, f.replace(/\.[^.]+$/, ".txt")), r.second.text);
    looked += r.second.looked; found += r.second.found;
  }
}
if (bandsOut) console.log(`second look: ${looked} of ${photos.length} photos read again in bands, a seller put first on ${found}`);
console.log(`${photos.length} photos in ${((Date.now() - t0) / 1000).toFixed(0)} s (${((Date.now() - t0) / photos.length / 1000).toFixed(1)} s a photo)`);
await browser.close(); server.close();
