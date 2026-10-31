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
// the CSV follows the weather field once an activity is exposed
await page.evaluate(() => { const t = document.getElementById("src"); const j = JSON.parse(t.value); j.activities.find((a) => a.id === "roof").exposed = true; t.value = JSON.stringify(j); t.dispatchEvent(new Event("input")); });
await page.fill("#wl", "50");
const [dl2] = await Promise.all([page.waitForEvent("download"), page.click("#csv")]);
check(/weather allowance/.test(await readFile(await dl2.path(), "utf8")), "CSV follows the weather field (roof exposed, 50%)");
// the deadline field: a far-off date leaves days to spare, a start-day date is late
await page.fill("#dl", "2099-01-04");
check(/Deadline 2099-01-04: \d+ working day\(s\) to spare/.test(await page.textContent("#out")), "deadline field: far date shows days to spare");
await page.fill("#dl", "2000-01-03");
check(/Deadline 2000-01-03: \d+ working day\(s\) late/.test(await page.textContent("#out")), "deadline field: past date shows days late");
await page.fill("#dl", "");
check(!/Deadline/.test(await page.textContent("#out")), "deadline field: cleared removes the line");
// the activity-costs field: typed dollars by id give spend by month; a bad id or entry is named
await page.fill("#ac", "roof=9500, walls=$18000");
check(/Spend by month[^\n]*total \$27,500/.test(await page.textContent("#out")), "activity costs field: spend by month totals the typed costs");
await page.fill("#ac", "nope=5");
check(/Activity costs: no activity with id nope/.test(await page.textContent("#out")), "activity costs field: unknown id is named");
await page.fill("#ac", "roof=lots");
check(/Could not read: roof=lots/.test(await page.textContent("#out")), "activity costs field: unreadable entry is named");
await page.fill("#ac", "");
check(!/Spend by month/.test(await page.textContent("#out")), "activity costs field: cleared removes the spend lines");
// invalid JSON must not export the previous schedule
await page.fill("#src", "{not json");
let downloaded = false;
page.on("download", () => { downloaded = true; });
await page.click("#csv"); await page.waitForTimeout(600);
check(!downloaded, "no download after invalid JSON");
check(errors.length === 0, "no page errors" + (errors.length ? ": " + errors[0] : ""));
await browser.close(); server.close();
process.exit(fail);
