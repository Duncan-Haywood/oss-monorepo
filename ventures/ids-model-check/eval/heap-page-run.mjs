// Loads the page from a checker directory, checks a model with the starter IDS
// under a V8 heap cap, and prints the outcome; eval/heap-200mb-2026-11-17.md.
//   node eval/heap-page-run.mjs <venture dir>/ <model> <heapMB>
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");
const [dir, model, heap] = process.argv.slice(2);
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".xml": "application/xml" };
const srv = http.createServer((req, res) => {
  const root = path.resolve(dir);
  const p = path.resolve(root, "." + decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); res.end(b); });
}).listen(0, async () => {
  const browser = await chromium.launch({ args: [`--js-flags=--max-old-space-size=${heap}`] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${srv.address().port}/`);
  await page.setInputFiles("#ifc", model);
  await page.click("#starter");
  await page.waitForFunction(() => !document.querySelector("#go").disabled);
  const t0 = Date.now();
  await page.click("#go");
  let outcome;
  try {
    await page.waitForFunction(() => { const s = document.querySelector("#status").textContent; const o = document.querySelector("#out").textContent; return o.length > 50 || /error|fail|could not|crash/i.test(s); }, null, { timeout: 240000, polling: 500 });
    outcome = (await page.textContent("#status")) + " | " + (await page.textContent("#out")).slice(0, 160).replace(/\s+/g, " ");
  } catch (e) { outcome = "no result in 240 s; status: " + (await page.textContent("#status")); }
  console.log(JSON.stringify({ dir: path.basename(path.dirname(path.dirname(dir))), heap, seconds: (Date.now() - t0) / 1000, outcome }));
  await browser.close(); srv.close();
});
