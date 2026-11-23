// The single-league page in a real browser: which modules it fetches on load, for a plain season,
// and for the two kinds of season that need the carry-over search or the night designs
// (loaded on demand since 2026-11-23). Needs Playwright and a Chromium (skips with exit 0 otherwise).
// Usage: node eval/browser-lazy-searches.mjs   (eval/browser-lazy-searches.txt holds a run)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
let chromium;
for (const c of ["playwright", process.env.PLAYWRIGHT_PATH, "/opt/node22/lib/node_modules/playwright/index.mjs", "/opt/node-tools/node_modules/playwright/index.mjs"].filter(Boolean)) {
  try { ({ chromium } = await import(c)); break; } catch {}
}
if (!chromium) { console.log("skipped: playwright not installed"); process.exit(0); }
const types = { ".html": "text/html", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm" };
const server = createServer(async (req, res) => {
  try {
    const p = join(root, decodeURIComponent(req.url.split("?")[0]));
    res.writeHead(200, { "content-type": types[extname(p)] || "text/plain" }).end(await readFile(p));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };
const HEAVY = ["carryover.mjs", "nights.mjs", "orient.mjs", "session-designs.mjs", "odd-designs.mjs"];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const fetched = new Set();
  page.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.endsWith(".mjs")) fetched.add(u.pathname.slice(1)); });
  const heavyNow = () => HEAVY.filter((f) => fetched.has(f));
  const reportText = () => page.$eval("#form-status", (e) => e.textContent);
  const build = async () => { await page.click("#build"); await page.waitForFunction(() => document.querySelector("#report") && !document.querySelector("#report").hidden && /CHECKED|checked/.test(document.body.innerText), null, { timeout: 120000 }).catch(() => {}); await page.waitForTimeout(300); };

  await page.goto(url, { waitUntil: "networkidle" });
  console.log(`on load: ${fetched.size} modules`);
  check(heavyNow().length === 0, `on load, none of ${HEAVY.join(", ")} fetched`);

  await page.click("#load-example");
  await page.waitForTimeout(1500);
  const rows1 = await page.$$eval("#schedule tbody tr, table tbody tr", (r) => r.length);
  console.log(`example season: ${rows1} table rows; status: ${(await reportText()).slice(0, 90)}`);
  check(rows1 > 0, "the example season builds");
  check(heavyNow().length === 0, `plain example season: still none fetched (${heavyNow().join(", ") || "none"})`);

  await page.check("#carryOver");
  await build();
  await page.waitForFunction(() => /carry-over/i.test(document.body.innerText) && !/Searching|Loading the season/.test(document.querySelector("#form-status").textContent), null, { timeout: 180000 });
  const coText = await page.evaluate(() => (document.body.innerText.match(/Carry-over: \d+[^\n]{0,80}/) || [""])[0]);
  console.log(`carry-over season: "${coText}"`);
  check(Boolean(coText), "carry-over season shows its carry-over line");
  check(fetched.has("carryover.mjs") && fetched.has("nights.mjs"), `carry-over season: search loaded on demand (${heavyNow().join(", ")})`);

  await page.uncheck("#carryOver");
  await page.fill("#times", "18:00, 19:00, 20:00");
  await page.selectOption("#gamesPerNight", "2");
  await build();
  await page.waitForTimeout(1000);
  const dh = await page.evaluate(() => (document.body.innerText.match(/(2 games a night|Back-to-back nights)[^\n]{0,80}/) || [""])[0]);
  if (!dh) console.log("status:", await reportText(), (await page.evaluate(() => document.body.innerText)).match(/[^\n]*night[^\n]*/gi)?.slice(0, 8));
  console.log(`doubleheader season: "${dh}"`);
  check(Boolean(dh), "doubleheader season builds");
  check(errors.length === 0, `no page errors (${errors.join(" | ")})`);
} finally { await browser.close(); server.close(); }
console.log(failed ? `${failed} FAILED` : "all ok");
process.exit(failed ? 1 : 0);
