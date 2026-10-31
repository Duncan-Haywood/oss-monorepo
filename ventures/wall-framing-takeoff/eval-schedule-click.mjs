// Clicks schedule-calculator.html in a real browser: Gantt draws, then the CSV button downloads schedule.csv.
// `node eval-schedule-click.mjs`; skips with exit 0 when Playwright or a Chromium is missing.
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
await page.goto(`http://127.0.0.1:${server.address().port}/schedule-calculator.html`);
await page.waitForSelector("#gantt svg");
const bars = await page.locator("#gantt svg rect").count();
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#csv")]);
const csv = await readFile(await dl.path(), "utf8");
const lines = csv.trim().split("\n");
let fail = 0;
const check = (ok, msg) => { console.log((ok ? "ok: " : "FAIL: ") + msg); if (!ok) fail = 1; };
check(bars > 0, `Gantt drew ${bars} bars`);
check(dl.suggestedFilename() === "schedule.csv", "download named schedule.csv");
const slipRows = lines.filter((l) => l.startsWith("slip:")).length;
check(lines.length === bars + 1 + slipRows && slipRows === 1, `CSV has a header, one row per bar and the example slip row (${lines.length} lines)`);
check(!/NaN|undefined/.test(csv), "no NaN or undefined in CSV");
check(errors.length === 0, "no page errors" + (errors.length ? ": " + errors[0] : ""));
await browser.close(); server.close();
process.exit(fail);
