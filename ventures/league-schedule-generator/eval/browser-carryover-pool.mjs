// Clicks "Spread who you meet next" on a 20-team home-and-away season in a real browser, with the
// page told it has 1, 2, 4 and 8 cores (navigator.hardwareConcurrency), and reports the wait, the
// worst gap between frames and the kept season. Checks that every core count keeps the same season
// (the pool only changes the wait). Real parallelism is capped by the machine running it.
// Options: --teams=12, --cores=1,4.
// Needs Playwright and a Chromium: `node eval/browser-carryover-pool.mjs` (skips with
// exit 0 when neither is installed). Looks for `playwright` on the import
// path, then PLAYWRIGHT_PATH, then /opt/node-tools/node_modules/playwright.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
let chromium;
const candidates = ["playwright", process.env.PLAYWRIGHT_PATH, "/opt/node-tools/node_modules/playwright", "playwright-core"].filter(Boolean).map((c) => {
  if (!c.startsWith("/") || !existsSync(c)) return c;
  return statSync(c).isDirectory() ? join(c, "index.mjs") : c;
});
for (const c of candidates) {
  try { ({ chromium } = await import(c.startsWith("/") ? "file://" + c : c)); break; } catch {}
}
if (!chromium) { console.log("skipped: playwright not installed"); process.exit(0); }
const types = { ".html": "text/html", ".mjs": "text/javascript", ".json": "application/json" };
const server = createServer(async (req, res) => {
  try {
    const p = join(root, decodeURIComponent(req.url.split("?")[0]));
    const body = await readFile(p);
    res.writeHead(200, { "content-type": types[extname(p)] || "text/plain" }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };
const teams = Number(process.argv.find((a) => /^--teams=\d+$/.test(a))?.slice(8) || 20);
const coreCounts = (process.argv.find((a) => a.startsWith("--cores="))?.slice(8) || "1,2,4,8").split(",").map(Number);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const seen = [];
for (const cores of coreCounts) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((c) => Object.defineProperty(Navigator.prototype, "hardwareConcurrency", { get: () => c }), cores);
  await page.goto(url);
  await page.fill("#teams", Array.from({ length: teams }, (_, i) => `Team ${i + 1}`).join("\n"));
  await page.fill("#start", "2026-10-06");
  await page.check("#wd2");
  await page.check("#double");
  await page.check("#carryOver");
  await page.evaluate(() => {
    window.__gaps = [];
    let last = performance.now();
    const tick = (t) => { window.__gaps.push(t - last); last = t; window.__raf = requestAnimationFrame(tick); };
    window.__raf = requestAnimationFrame(tick);
  });
  const t0 = Date.now();
  await page.click("#build");
  await page.waitForFunction(() => /Best of \d+ searches/.test(document.querySelector("#carry-line")?.textContent || ""), null, { timeout: 180000 });
  const secs = (Date.now() - t0) / 1000;
  const worst = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return Math.max(...window.__gaps); });
  const line = await page.locator("#carry-line").textContent();
  const kept = (line.match(/Best of .*?\)\./) || [line])[0];
  const fixtures = await page.evaluate(() => [...document.querySelectorAll("table tbody tr")].slice(0, 40).map((r) => r.textContent).join("|"));
  console.log(`${teams} teams, ${cores} core(s): ${secs.toFixed(1)} s, worst frame gap ${worst.toFixed(0)} ms; ${kept}`);
  seen.push({ cores, kept, fixtures });
  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
  await page.close();
}
check(seen.every((s) => s.kept === seen[0].kept && s.fixtures === seen[0].fixtures), "every core count keeps the same season");
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
