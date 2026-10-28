// Drives the cash-basis profit and loss card in a real browser: absent on
// bank-only books, present after an unpaid invoice is loaded, and the timing
// difference equals that invoice. `node eval/browser-cashbasis.mjs`; skips with
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
check((await page.locator("#cashpnl").textContent()).trim() === "", "bank-only books show no cash-basis card");

await page.fill("#docs-paste", "type,number,date,due,party,amount,account\ninvoice,INV-9001,2026-01-05,2026-02-04,Zyxq Quorvex Ltd,1200.00,4000");
await page.click("#docs-load");
await page.waitForFunction(() => document.querySelector("#cashpnl").textContent.includes("cash basis"), null, { timeout: 5000 }).catch(() => {});
const card = await page.locator("#cashpnl").textContent();
console.log("     card:", card.replace(/\s+/g, " ").slice(0, 400));
check(/Profit and loss, cash basis/.test(card), "the cash-basis card appears once an invoice is loaded");
check(/Timing difference[^\d-]*1,200\.00/.test(card), "the unpaid 1,200.00 invoice is the whole timing difference");
check(errors.length === 0, `no page errors${errors.length ? ": " + errors[0] : ""}`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
