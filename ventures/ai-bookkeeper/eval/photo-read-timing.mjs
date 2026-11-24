// How long the page's "Receipt photos" read takes and how long the tab stalls, in headless
// Chromium: photoocr.mjs's readPhotos (RapidOCR and tesseract.js, both real) on the first N
// photos, one call per photo, with a 10 ms timer on the page's thread recording the longest
// wait between its runs. ROOT is the venture folder to serve, so a copy of an older
// photoocr.mjs can be timed against this one (eval/rapidocr-worker-2026-11-17.md).
// jsDelivr is answered from the five npm tarballs eval/photo-ocr-browser.mjs uses.
//   node eval/photo-read-timing.mjs <root> <photos dir> <dir with the tarballs> [N]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const [root, src, tgz, n = "10"] = process.argv.slice(2);
if (!tgz) { console.error("usage: node eval/photo-read-timing.mjs <root> <photos> <tarballs> [N]"); process.exit(2); }
let chromium;
for (const c of ["playwright", process.env.PLAYWRIGHT_PATH, "/opt/node-tools/node_modules/playwright", "playwright-core"].filter(Boolean).map((c) => (c.startsWith("/") && existsSync(c) && statSync(c).isDirectory() ? join(c, "index.mjs") : c))) {
  try { ({ chromium } = await import(c.startsWith("/") ? "file://" + c : c)); break; } catch {}
}
if (!chromium) { console.log("skipped: playwright not installed"); process.exit(0); }
const unpacked = mkdtempSync(join(tmpdir(), "timing-pkg-"));
for (const t of readdirSync(tgz).filter((f) => f.endsWith(".tgz"))) {
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
    if (url === "/") return res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><title>timing</title>");
    const p = inside(root, url); res.writeHead(200, { "content-type": types[extname(p)] || "text/plain" }).end(await readFile(p));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await context.route(/^https:\/\/cdn\.jsdelivr\.net\//, async (route) => {
  const u = route.request().url(), f = local(u);
  if (!f || !existsSync(f)) return route.fulfill({ status: 404, body: "" });
  return route.fulfill({ status: 200, body: await readFile(f), headers: { "content-type": /\.m?js$/.test(u) ? "text/javascript" : u.endsWith(".wasm") ? "application/wasm" : "application/octet-stream", "access-control-allow-origin": "*" } });
});
await page.goto(`http://127.0.0.1:${server.address().port}/`);
const photos = readdirSync(src).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort().slice(0, Number(n));
// the first call downloads and starts both readers; it is timed apart from the rest
const rows = await page.evaluate(async (photos) => {
  const { readPhotos } = await import("/photoocr.mjs");
  const out = [];
  for (const f of photos) {
    const blob = await (await fetch(`/photo/${encodeURIComponent(f)}`)).blob();
    const file = new File([blob], f, { type: "image/jpeg" });
    let last = performance.now(), worst = 0;
    const t = setInterval(() => { const x = performance.now(); worst = Math.max(worst, x - last); last = x; }, 10);
    const t0 = performance.now();
    const r = await readPhotos([file]);
    const ms = performance.now() - t0;
    worst = Math.max(worst, performance.now() - last);
    clearInterval(t);
    out.push({ f, ms, worst, rapid: r.rapid, how: r.rapidHow ?? null, err: r.rapidError ?? null, text: r.text });
  }
  return out;
}, photos);
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const fmt = (x) => Math.round(x).toLocaleString("en-US");
const rest = rows.slice(1);
console.log(`root ${root}; ${rows.length} photos; RapidOCR read ${rows.filter((r) => r.rapid).length}, ran in ${[...new Set(rows.map((r) => r.how))].join("/")}${rows.find((r) => r.err) ? `; error: ${rows.find((r) => r.err).err}` : ""}`);
console.log(`first photo (readers starting): ${fmt(rows[0].ms)} ms, longest stall ${fmt(rows[0].worst)} ms`);
console.log(`photos 2-${rows.length}: read ms median ${fmt(med(rest.map((r) => r.ms)))}, total ${fmt(rest.reduce((a, r) => a + r.ms, 0))}; longest stall ms median ${fmt(med(rest.map((r) => r.worst)))}, max ${fmt(Math.max(...rest.map((r) => r.worst)))}`);
if (process.env.TIMING_TEXTS) (await import("node:fs")).writeFileSync(process.env.TIMING_TEXTS, JSON.stringify(rows.map(({ f, text }) => ({ f, text }))));
await browser.close(); server.close();
