// Clicks change-order-calculator.html in a real browser: the sample diffs, bad JSON is refused.
// `node eval-change-order-click.mjs`; skips with exit 0 when Playwright or a Chromium is missing.
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
await page.goto(`http://127.0.0.1:${server.address().port}/change-order-calculator.html`);
await page.waitForFunction(() => document.getElementById("out").textContent.length > 0);
const out = await page.textContent("#out");
const ok = [];
const check = (n, c) => { ok.push([n, !!c]); };
check("sample shows the stud change", /2x4 studs\s+300 ->\s+228/.test(out));
check("sample total -252", /-252\.00/.test(out));
check("unpriced hold-downs listed", /Hold-downs/.test(out) && /no price/i.test(out));
await page.fill("#src", "{bad");
check("bad JSON refused", /Not valid JSON/.test(await page.textContent("#out")));
await browser.close(); server.close();
for (const [n, c] of ok) console.log((c ? "ok   " : "FAIL ") + n);
console.log("page errors:", errors.length);
process.exit(ok.every(([, c]) => c) && !errors.length ? 0 : 1);
