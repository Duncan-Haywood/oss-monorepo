// Builds a 10-team single round robin on the page with "Spread who you meet next" ticked and "the most even carry-over" kept, and reads
// the carry-over line: since eval/carryover-bnb.c proved 94 the least at 10 teams, the page should
// say the schedule reaches it (README "The least carry-over at 10 teams is 94").
// Needs Playwright and a Chromium: `node eval/browser-proved-least.mjs` (skips with exit 0 when
// neither is installed).
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
const OPTS = ["balance", "flip", "relocate", "swapNights"];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(url);
await page.click("#load-example");
await page.waitForFunction(() => /Sample league/.test(document.querySelector("#form-status").textContent));
for (const id of ["blackouts", "timeLimits", "grounds", "results", "courts", "times"]) await page.fill("#" + id, "").catch(() => {});
await page.fill("#teams", Array.from({ length: 10 }, (_, i) => `Team ${i + 1}`).join("\n"));
const double = page.locator("#double");
if (await double.count()) await double.uncheck().catch(() => {});
await page.check("#carryOver");
await page.selectOption("#carryOverPick", "fair"); // keep the most even carry-over, not the balance with breaks
await page.click("#build");
const line = await page.waitForFunction(() => {
  const m = document.body.innerText.match(/Carry-over: \d+[^\n]*/);
  return m && /searches for an even carry-over/.test(m[0]) ? m[0] : null;
}, null, { timeout: 540000 }).then((h) => h.jsonValue());
console.log(line);
check(/^Carry-over: 94 /.test(line), "the 10-team search keeps 94");
check(/no 10-team round robin can go below 94, and this schedule reaches it; an exhaustive search proved it/.test(line), "the line says 94 is the least and reached");
check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
