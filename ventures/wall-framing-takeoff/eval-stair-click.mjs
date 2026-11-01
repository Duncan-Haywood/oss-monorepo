// Clicks stair-stringer-calculator.html in a real browser: no check without typed values, then the stringer check from typed figures.
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
const base = await page.textContent("#out");
check(!/Stringer check/i.test(base) && !/NaN|undefined/.test(base), "no stringer check until values are typed");
await page.click("summary");
// same figures as the 2026-11-01 headless run in ROADMAP.md
for (const [id, val] of [["live", "40"], ["dead", "12"], ["fb", "900"], ["fv", "180"], ["e", "1600000"], ["fcp", "425"]]) await page.fill("#" + id, val);
await page.waitForFunction(() => /Stringer check/i.test(document.querySelector("#out")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
const typed = await page.textContent("#out");
check(/Stringer check/i.test(typed) && !/NaN|undefined/.test(typed), "stringer check appears once the five values are typed");
check(/bearing/i.test(typed), "bearing line appears with Fc-perp typed");
// blanking a required value drops the check again
await page.fill("#fb", "");
await page.waitForFunction(() => !/Stringer check/i.test(document.querySelector("#out")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
check(!/Stringer check/i.test(await page.textContent("#out")), "blanking Fb drops the check");
check(errors.length === 0, "no page errors" + (errors.length ? ": " + errors[0] : ""));
await browser.close(); server.close();
process.exit(fail);
