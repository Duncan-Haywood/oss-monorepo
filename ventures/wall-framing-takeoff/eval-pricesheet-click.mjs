// Clicks index.html in a real browser: the budget price sheet lists the prices still needed, a typed box writes the text-area line, and clearing it removes the line.
// `node eval-pricesheet-click.mjs`; skips with exit 0 when Playwright or a Chromium is missing.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
let chromium;
const candidates = ["playwright", process.env.PLAYWRIGHT_PATH, "/opt/node-tools/node_modules/playwright", "playwright-core"].filter(Boolean).map((c) =>
  !c.startsWith("/") || !existsSync(c) ? c : statSync(c).isDirectory() ? join(c, "index.mjs") : c);
for (const c of candidates) {
  try { const m = await import(c.startsWith("/") ? "file://" + c : c); chromium = (m.default ?? m).chromium; if (chromium) break; } catch {}
}
if (!chromium) { console.log("skipped: playwright not installed"); process.exit(0); }
const types = { ".html": "text/html", ".mjs": "text/javascript" };
const server = createServer(async (req, res) => {
  try {
    const p = join(root, decodeURIComponent(req.url.split("?")[0]));
    res.writeHead(200, { "content-type": types[extname(p)] || "text/plain" }).end(await readFile(p));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
try { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); } catch (e) { console.log("skipped: no Chromium:", e.message.split("\n")[0]); server.close(); process.exit(0); }
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
let fail = 0;
const check = (ok, msg) => { console.log((ok ? "ok: " : "FAIL: ") + msg); if (!ok) fail = 1; };
await page.click("#example");
await page.check("#dwOn"); await page.check("#sdOn");
await page.click("#run");
await page.waitForSelector("#priceSheetRows input");
const n0 = await page.locator("#priceSheetRows input").count();
check(n0 > 3, `price sheet lists the prices the plan needs (${n0})`);
const key = await page.getAttribute("#priceSheetRows input >> nth=0", "data-key");
const unpricedBefore = await page.locator("#budgetOut").textContent();
await page.fill(`#priceSheetRows input[data-key="${key}"]`, "12.5");
check(new RegExp(`${key}\\s*,\\s*12.5`).test(await page.inputValue("#priceText")), `typing a box writes "${key}, 12.5" in the text area`);
check((await page.locator("#priceSheetRows input").count()) === n0, "the row stays while its price is typed");
check((await page.locator("#budgetOut").textContent()) !== unpricedBefore, "the budget changed");
await page.fill(`#priceSheetRows input[data-key="${key}"]`, "");
check(!(await page.inputValue("#priceText")).includes(key), "emptying the box removes the line");
check(errors.length === 0, "no page errors" + (errors.length ? ": " + errors[0] : ""));
await browser.close(); server.close();
process.exit(fail);
