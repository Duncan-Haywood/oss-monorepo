// Drives the sales tax return worksheet in a real browser: hidden on
// books with no sales tax, shown once invoices carry a tax line, with the rate
// check and a malformed rate refused. `node eval/browser-salestax-return.mjs`; skips with
// exit 0 when Playwright or Chromium is missing (same lookup as browser-click.mjs).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
let chromium;
const candidates = ["playwright", process.env.PLAYWRIGHT_PATH, "/opt/node-tools/node_modules/playwright", "playwright-core"].filter(Boolean).map((c) => (!c.startsWith("/") || !existsSync(c) ? c : statSync(c).isDirectory() ? join(c, "index.mjs") : c));
for (const c of candidates) {
  try { ({ chromium } = await import(c.startsWith("/") ? "file://" + c : c)); break; } catch {}
}
if (!chromium) { console.log("skipped: playwright not installed"); process.exit(0); }
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json" };
const server = createServer(async (req, res) => {
  try {
    const u = req.url.split("?")[0];
    res.writeHead(200, { "content-type": types[extname(u === "/" ? "index.html" : u)] || "text/plain" }).end(await readFile(join(root, u === "/" ? "index.html" : decodeURIComponent(u))));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);

await page.click("#example");
await page.waitForFunction(() => /synthetic months/.test(document.querySelector("#import-status").textContent), null, { timeout: 5000 });
check(await page.locator("#str-box").isHidden(), "no sales tax on the books: the return worksheet is hidden");
const csv = ["type,number,date,due,party,amount,account,description", "invoice,1,2026-01-10,,A Co,100.00,4000,Goods", "invoice,1,2026-01-10,,A Co,6.00,2100,CA state", "invoice,1,2026-01-10,,A Co,1.00,2100,LA county", "invoice,2,2026-03-31,,B Co,200.00,4000,Goods", "invoice,2,2026-03-31,,B Co,12.00,2100,CA state"].join("\n");
await page.fill("#docs-paste", csv);
await page.click("#docs-load");
await page.waitForFunction(() => !document.querySelector("#str-box").hidden, null, { timeout: 5000 }).catch(() => {});
check(await page.locator("#str-box").isVisible(), "tax on invoices: the return worksheet appears");
await page.evaluate(() => { document.querySelector("#str-box").open = true; });
let t = (await page.locator("#str").textContent()).replace(/\s+/g, " ");
console.log("     worksheet:", t.slice(0, 300));
check(/CA state[^|]*18\.00/.test(t) && /LA county/.test(t), "CA state tax 18.00 and LA county listed for the quarter");
await page.selectOption("#str-state", "TX");
await page.fill("#str-rate", "CA state=7.25");
await page.locator("#str-rate").blur();
t = (await page.locator("#str").textContent()).replace(/\s+/g, " ");
check(/expected 7\.25%/.test(t), "an expected rate that differs from the collected 6.00% warns");
await page.fill("#str-rate", "CA state=abc");
await page.locator("#str-rate").blur();
t = (await page.locator("#str").textContent()).replace(/\s+/g, " ");
check(/percent between 0 and 100/.test(t), "a malformed rate is refused with a message, not NaN");
check(errors.length === 0, `no page errors${errors.length ? ": " + errors[0] : ""}`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
