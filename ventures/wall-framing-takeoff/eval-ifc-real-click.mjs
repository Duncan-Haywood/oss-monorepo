// Opens real IFC models through the page's "Open plan file" in a real browser (WASM reader).
// `IFC_MODELS=/path/to/dir node eval-ifc-real-click.mjs` where dir holds duplex_a.ifc and/or
// schependomlaan.ifc (ifc-engine/scripts/fetch-models.sh fetches them). Skips with exit 0 when
// Playwright, a Chromium or the models are missing.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const dir = process.env.IFC_MODELS;
if (!dir || !existsSync(dir)) { console.log("skipped: set IFC_MODELS to a folder with the fetched models"); process.exit(0); }
let chromium;
const candidates = ["playwright", process.env.PLAYWRIGHT_PATH, "/opt/node-tools/node_modules/playwright", "playwright-core"].filter(Boolean).map((c) =>
  !c.startsWith("/") || !existsSync(c) ? c : statSync(c).isDirectory() ? join(c, "index.mjs") : c);
for (const c of candidates) {
  try { const m = await import(c.startsWith("/") ? "file://" + c : c); chromium = (m.default ?? m).chromium; if (chromium) break; } catch {}
}
if (!chromium) { console.log("skipped: playwright not installed"); process.exit(0); }
const types = { ".html": "text/html", ".mjs": "text/javascript", ".wasm": "application/wasm" };
const server = createServer(async (req, res) => {
  try {
    const p = join(root, decodeURIComponent(req.url.split("?")[0]));
    res.writeHead(200, { "content-type": types[extname(p)] || "text/plain" }).end(await readFile(p));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
try { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); } catch (e) { console.log("skipped: no Chromium:", e.message.split("\n")[0]); server.close(); process.exit(0); }
let fail = 0;
const check = (ok, msg) => { console.log((ok ? "ok: " : "FAIL: ") + msg); if (!ok) fail = 1; };
for (const name of ["duplex_a.ifc", "schependomlaan.ifc"]) {
  const file = join(dir, name);
  if (!existsSync(file)) { console.log("skipped model:", name); continue; }
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const t0 = Date.now();
  await page.setInputFiles("#openPlan", file);
  await page.waitForFunction(() => /Opened|Could not/.test(document.querySelector("#status")?.textContent || ""), null, { timeout: 120000 });
  const ms = Date.now() - t0;
  const status = await page.textContent("#status");
  console.log(`${name}: ${ms} ms\n  ${status.slice(0, 400)}`);
  check(/^Opened /.test(status), `${name} opened`);
  const m = status.match(/(\d+) walls, (\d+) tees, (\d+) openings/);
  check(!!m && Number(m[1]) > 0, `${name} has walls (${m ? m[0] : "none"})`);
  const storeys = await page.locator("#ifcStorey option").count();
  console.log(`  storeys in picker: ${storeys}`);
  if (storeys > 1) {
    await page.selectOption("#ifcStorey", { index: 1 });
    await page.waitForFunction(() => /storey 1|storey \d/.test(document.querySelector("#status")?.textContent || ""));
    console.log("  storey 2 status:", (await page.textContent("#status")).slice(0, 200));
  }
  await page.click("#run");
  check(errors.length === 0, `${name}: no page errors ${errors.join("|").slice(0, 200)}`);
  await page.close();
}
await browser.close(); server.close();
process.exit(fail);
