// How long does the page stop answering while the model view draws?
//
// Opens index.html in headless Chromium (the pre-installed Playwright), drops
// each model on it and, from the moment the bill of quantities shows until
// the view reports "elements drawn", runs a 5 ms timer chain on the page's
// thread: the gaps between its ticks are how long the page could not answer
// a click. WebGL's drawArrays is stubbed out, because software GL in a
// headless container takes hundreds of ms a frame on a 1.8M-triangle model
// that a real GPU draws in a few, and those frames would swamp the reading.
// Each model runs twice: meshed in view-worker.mjs, and with Worker removed
// so the page meshes in its own 30 ms slices (the fallback, and what the
// page did before 2026-11-21).
//
//   node eval/view-responsiveness.mjs <model.ifc>... [--json out.json] [--root dir]
//
// --root serves another copy of the venture (say, `git archive` of an older
// commit) to read the page as it was; it then runs once, as that page is.

import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, join, extname } from "node:path";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))); }

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const jsonOut = ji >= 0 ? args.splice(ji, 2)[1] : null;
const ri = args.indexOf("--root");
const root = ri >= 0 ? join(args.splice(ri, 2)[1], "/") : new URL("..", import.meta.url).pathname;
const modes = ri >= 0 ? [true] : [true, false];
const TYPES = { ".html": "text/html", ".mjs": "text/javascript", ".ifc": "application/octet-stream", ".txt": "text/plain" };
const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(root) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch();
const results = [];
for (const file of args) {
  for (const worker of modes) {
    const page = await browser.newPage();
    await page.addInitScript((w) => {
      WebGLRenderingContext.prototype.drawArrays = function () {};
      if (!w) window.Worker = undefined;
    }, worker);
    await page.goto(`http://localhost:${port}/index.html`);
    await page.setInputFiles("#ifc", file);
    await page.waitForSelector("#result:not([hidden])", { timeout: 600000 });
    await page.evaluate(() => { window.__gaps = []; let last = performance.now(); const t = () => { const n = performance.now(); window.__gaps.push(n - last); last = n; setTimeout(t, 5); }; setTimeout(t, 5); });
    await page.waitForFunction(() => /elements drawn in/.test(document.getElementById("view-status").textContent), null, { timeout: 900000 });
    const r = await page.evaluate(() => {
      const g = window.__gaps.slice().sort((a, b) => b - a);
      return { status: document.getElementById("view-status").textContent, by: document.getElementById("view").dataset.meshedBy, ticks: g.length, maxMs: Math.round(g[0]), p99Ms: Math.round(g[Math.floor(g.length / 100)]), over100: g.filter((x) => x > 100).length };
    });
    const secs = +(r.status.match(/drawn in ([\d.]+) s/) || [])[1];
    const row = { model: basename(file), meshedBy: r.by ?? "page (before 2026-11-21)", drawS: secs, ticks: r.ticks, p99Ms: r.p99Ms, maxMs: r.maxMs, gapsOver100ms: r.over100 };
    results.push(row);
    console.log(JSON.stringify(row));
    await page.close();
  }
}
await browser.close();
server.close();
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 1) + "\n");
