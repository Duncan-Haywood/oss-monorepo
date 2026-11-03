// Clicks stair-stringer-calculator.html in a real browser: the optional stringer check stays off until all five design values are typed.
// `node eval-stair-click.mjs`; skips with exit 0 when Playwright or a Chromium is missing.
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
await page.goto(`http://127.0.0.1:${server.address().port}/stair-stringer-calculator.html`);
let fail = 0;
const check = (ok, msg) => { console.log((ok ? "ok: " : "FAIL: ") + msg); if (!ok) fail = 1; };
await page.waitForFunction(() => (document.querySelector("#out")?.textContent || "").length > 20);
check(!/Stringer check|bending/i.test(await page.textContent("#out")), "base page: no stringer check with the design fields blank");
await page.click("summary");
await page.fill("#live", "40"); await page.fill("#dead", "10");
await page.fill("#fb", "900"); await page.fill("#fv", "180");
check(!/Stringer check|bending/i.test(await page.textContent("#out")), "four of five values typed: still no check");
await page.fill("#e", "1600000");
await page.waitForFunction(() => /bending/i.test(document.querySelector("#out")?.textContent || ""));
const t = await page.textContent("#out");
check(/bending/i.test(t) && !/NaN|undefined/.test(t), "all five typed: the check appears with no NaN");
await page.fill("#fcp", "425");
await page.waitForFunction(() => /bearing/i.test(document.querySelector("#out")?.textContent || ""));
check(true, "Fc-perp typed: the bearing line appears");
await page.fill("#fb", "");
await page.waitForFunction(() => !/bending/i.test(document.querySelector("#out")?.textContent || ""));
check(true, "a field cleared: the check goes away");
check(errors.length === 0, "no page errors" + (errors.length ? ": " + errors[0] : ""));
await browser.close(); server.close();
process.exit(fail);
