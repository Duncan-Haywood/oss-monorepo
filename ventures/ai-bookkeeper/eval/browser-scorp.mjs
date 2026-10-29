// Drives the S-corporation election card on the example books in a real browser.
// `node eval/browser-scorp.mjs`; skips with exit 0 when Playwright or Chromium is missing.
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

await page.fill("#est-months", "12");
await page.fill("#scorp-salary", "50000");
await page.click("#est-scorp");
await page.waitForFunction(() => document.querySelector("#scorp").textContent.length > 0, null, { timeout: 5000 }).catch(() => {});
const card = await page.locator("#scorp").textContent();
console.log("     card:", card.replace(/\s+/g, " ").slice(0, 400));
check(/S-corporation election/.test(card), "the S-corp card appears");
check(/Salary as a share of profit/.test(card) && /All in/.test(card), "comparison table and salary sweep show");
check(errors.length === 0, `no page errors${errors.length ? ": " + errors[0] : ""}`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
