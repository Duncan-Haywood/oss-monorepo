// Clicks index.html in a real browser: a wall's Steps field splits it into level segments, each with its own stud length.
// `node eval-steps-click.mjs`; skips with exit 0 when Playwright or a Chromium is missing.
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
await page.click("#example");
await page.click("#run");
const before = await page.textContent("body");
if (/ \(a\)/.test(before)) throw new Error("segment names shown with no steps");
const first = page.locator('#walls tr').nth(1).locator('input[aria-label$="steps, position and stud length"]');
await first.fill("14 ft : 6 ft");
await page.click("#run");
const after = await page.textContent("body");
if (!/ \(a\)/.test(after) || !/ \(b\)/.test(after)) throw new Error("no segments after a step; errors: " + await page.textContent("#errors") + " | steps value: " + await first.inputValue() + " | " + (await page.textContent("#summary")).slice(0, 300));
await first.fill("14 ft : bad");
await page.click("#run");
const err = await page.textContent("#errors");
if (!/step stud length/.test(err)) throw new Error("bad step not reported: " + err);
if (errors.length) throw new Error("page errors: " + errors.join("; "));
console.log("ok: a step splits the wall into (a) and (b); a bad step is reported");
await browser.close(); server.close();
