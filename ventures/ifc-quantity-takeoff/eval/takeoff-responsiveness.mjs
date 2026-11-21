// How long does the page stop answering while it reads a model?
//
// Opens index.html in headless Chromium (the pre-installed Playwright),
// starts a 5 ms timer chain on the page's thread, sets the model on the
// file input and waits until the view reports "elements drawn". The gaps
// between ticks are how long a click would wait. Two windows are reported:
// "read" (file set until the bill of quantities shows: the takeoff) and
// "draw" (from there until the view is drawn). WebGL's drawArrays is stubbed
// out, as in view-responsiveness.mjs, so software GL frames don't swamp it.
//
//   node eval/takeoff-responsiveness.mjs <model.ifc>... [--json out.json] [--root dir] [--no-worker]
//
// --root serves another copy of the venture (say, `git archive` of an older
// commit); --no-worker removes Worker so the page's own fallback runs.

import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, join, extname } from "node:path";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))); }

const args = process.argv.slice(2);
const take = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args.splice(i, 2)[1] : null; };
const jsonOut = take("--json");
const rootArg = take("--root");
const nw = args.indexOf("--no-worker"); const noWorker = nw >= 0; if (noWorker) args.splice(nw, 1);
const root = rootArg ? join(rootArg, "/") : new URL("..", import.meta.url).pathname;
const label = (rootArg ? "before" : "after") + (noWorker ? ", no worker" : "");
const TYPES = { ".html": "text/html", ".mjs": "text/javascript", ".ifc": "application/octet-stream", ".txt": "text/plain" };
const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(root) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
}).listen(0);
const port = server.address().port;

const stats = (g) => { const s = g.slice().sort((a, b) => b - a); return { maxMs: Math.round(s[0] ?? 0), p99Ms: Math.round(s[Math.floor(s.length / 100)] ?? 0), over100: s.filter((x) => x > 100).length, frozenS: +(s.filter((x) => x > 100).reduce((a, b) => a + b, 0) / 1000).toFixed(1) }; };
const browser = await chromium.launch();
const results = [];
for (const file of args) {
  const page = await browser.newPage();
  await page.addInitScript((w) => { WebGLRenderingContext.prototype.drawArrays = function () {}; if (w) window.Worker = undefined; }, noWorker);
  await page.goto(`http://localhost:${port}/index.html`);
  await page.evaluate(() => {
    window.__gaps = []; window.__mark = null;
    let last = performance.now();
    const t = () => { const n = performance.now(); window.__gaps.push([n, n - last]); last = n; if (window.__mark == null && !document.getElementById("result").hidden) window.__mark = n; setTimeout(t, 5); };
    setTimeout(t, 5);
  });
  const t0 = Date.now();
  await page.setInputFiles("#ifc", file);
  await page.waitForFunction(() => /elements drawn in/.test(document.getElementById("view-status").textContent), null, { timeout: 900000, polling: 500 });
  const r = await page.evaluate(() => ({ gaps: window.__gaps, mark: window.__mark, status: document.getElementById("status").textContent, by: document.getElementById("status").dataset.readBy ?? "page" }));
  const read = r.gaps.filter(([n]) => n <= r.mark).map(([, g]) => g), draw = r.gaps.filter(([n]) => n > r.mark).map(([, g]) => g);
  const row = { model: basename(file), page: label, readBy: r.by, readS: +((r.status.match(/read in ([\d.]+) s/) || [])[1]), totalS: +((Date.now() - t0) / 1000).toFixed(1), read: stats(read), draw: stats(draw) };
  results.push(row);
  console.log(JSON.stringify(row));
  await page.close();
}
await browser.close();
server.close();
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 1) + "\n");
