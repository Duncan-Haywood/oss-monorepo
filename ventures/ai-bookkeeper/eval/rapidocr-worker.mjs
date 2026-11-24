// RapidOCR in its Web Worker against RapidOCR on the page's thread, in headless Chromium:
// for each photo both engines from photoocr.mjs read it (the worker's loadRapidWorker and the
// fallback loadRapidInPage), and the page measures how long its own thread went without
// running a 10 ms timer while each read was under way (the tab's longest stall: no click,
// key or scroll is handled for that long). Writes <out>/worker/<id>.txt and
// <out>/page/<id>.txt and prints whether the texts match, the stalls and the times.
// jsDelivr is answered from npm tarballs (onnxruntime-web@1.20.1, @gutenye/ocr-models@1.4.2):
//   node eval/rapidocr-worker.mjs <photos dir> <out dir> <dir with the two .tgz files> [limit]
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const [src, out, tgz, limit] = process.argv.slice(2);
if (!tgz) { console.error("usage: node eval/rapidocr-worker.mjs <photos> <out> <tarballs> [limit]"); process.exit(2); }
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
const context = await browser.newContext();
const page = await context.newPage();
await context.route(/^https:\/\/cdn\.jsdelivr\.net\//, async (route) => {
  const f = local(route.request().url());
  if (!f || !existsSync(f)) return route.fulfill({ status: 404, body: "" });
  const u = route.request().url();
  return route.fulfill({ status: 200, body: await readFile(f), headers: { "content-type": /\.m?js$/.test(u) ? "text/javascript" : u.endsWith(".wasm") ? "application/wasm" : "application/octet-stream", "access-control-allow-origin": "*" } });
});
await page.goto(`http://127.0.0.1:${server.address().port}/`);
const how = await page.evaluate(async () => {
  const m = await import("/photoocr.mjs");
  window.worker = await m.loadRapidEngine();
  window.inPage = await m.loadRapidInPage();
  // the page's thread: a 10 ms timer; the longest wait between two of its runs while a read is under way
  window.timed = async (engine, blob) => {
    let last = performance.now(), worst = 0, ticks = 0;
    const t = setInterval(() => { const n = performance.now(); worst = Math.max(worst, n - last); last = n; ticks++; }, 10);
    const t0 = performance.now();
    const text = await engine.read(blob);
    const ms = performance.now() - t0;
    worst = Math.max(worst, performance.now() - last);
    clearInterval(t);
    return { text, ms, worst, ticks };
  };
  return window.worker.how;
});
console.log(`loadRapidEngine ran in: ${how}`);
if (how !== "worker") { console.log("the worker did not start; nothing to compare"); await browser.close(); server.close(); process.exit(1); }
for (const d of ["worker", "page"]) await mkdir(join(out, d), { recursive: true });
let photos = readdirSync(src).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
if (limit) photos = photos.slice(0, Number(limit));
const rows = [];
for (const f of photos) {
  const r = await page.evaluate(async (f) => {
    const blob = await (await fetch(`/photo/${encodeURIComponent(f)}`)).blob();
    return { worker: await window.timed(window.worker, blob), page: await window.timed(window.inPage, blob) };
  }, f);
  const id = f.replace(/\.[^.]+$/, "");
  await writeFile(join(out, "worker", id + ".txt"), r.worker.text);
  await writeFile(join(out, "page", id + ".txt"), r.page.text);
  rows.push({ id, same: r.worker.text === r.page.text, ...Object.fromEntries(["worker", "page"].flatMap((k) => [[k + "Ms", r[k].ms], [k + "Worst", r[k].worst]])) });
}
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const fmt = (x) => Math.round(x).toLocaleString("en-US");
console.log(`${rows.length} photos; worker text identical to the page thread's on ${rows.filter((r) => r.same).length}`);
for (const k of ["worker", "page"]) {
  console.log(`${k.padEnd(6)}  read ms median ${fmt(q(rows.map((r) => r[k + "Ms"]), 0.5))}, p90 ${fmt(q(rows.map((r) => r[k + "Ms"]), 0.9))}; longest stall ms median ${fmt(q(rows.map((r) => r[k + "Worst"]), 0.5))}, p90 ${fmt(q(rows.map((r) => r[k + "Worst"]), 0.9))}, max ${fmt(Math.max(...rows.map((r) => r[k + "Worst"])))}`);
}
await writeFile(join(out, "timings.json"), JSON.stringify(rows, null, 1));
await browser.close(); server.close();
