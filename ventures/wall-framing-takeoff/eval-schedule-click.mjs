// Clicks "Download CSV" on the schedule page in a real browser and reads the downloaded file.
// `node eval-schedule-click.mjs`; skips with exit 0 when Playwright or a Chromium is missing.
// Finds playwright on the import path, PLAYWRIGHT_PATH (file or package dir), or /opt/node-tools.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
let chromium;
const { existsSync, statSync } = await import("node:fs");
// playwright is not on the default import path in cloud containers; try the
// env override (a file or a package directory) and the known container path.
const candidates = ["playwright", process.env.PLAYWRIGHT_PATH, "/opt/node-tools/node_modules/playwright", "playwright-core"].filter(Boolean).map((c) => {
  if (!c.startsWith("/") || !existsSync(c)) return c;
  return statSync(c).isDirectory() ? join(c, "index.mjs") : c;
});
for (const c of candidates) {
  try { const m = await import(c.startsWith("/") ? "file://" + c : c); chromium = (m.default ?? m).chromium; if (chromium) break; } catch {}
}
if (!chromium) { console.log("skipped: playwright not installed"); process.exit(0); }
const types = { ".html": "text/html", ".mjs": "text/javascript" };
const server = createServer(async (req, res) => {
  try {
    const p = join(root, req.url.split("?")[0] === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0]));
    const body = await readFile(p);
    res.writeHead(200, { "content-type": types[extname(p)] || "text/plain" }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
try { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); } catch (e) { console.log("skipped: no Chromium:", e.message.split("\n")[0]); server.close(); process.exit(0); }
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let bad = 0;
const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) bad = 1; };
await page.goto(`http://127.0.0.1:${server.address().port}/schedule-calculator.html`);
await page.waitForSelector("#gantt svg");
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#csv")]);
check(dl.suggestedFilename() === "schedule.csv", "download is named schedule.csv");
const { readFile: rf } = await import("node:fs/promises");
const csv = await rf(await dl.path(), "utf8");
const lines = csv.trim().split("\n");
check(lines[0] === "id,name,crew,days,start,finish,slack,critical,note", "header row");
const sample = await page.evaluate(() => JSON.parse(document.getElementById("src").value).activities.length);
check(lines.length - 1 >= sample, `one row per activity (${sample}) plus slips: ${lines.length - 1} rows`);
check(lines[1].startsWith("footings,Footings,concrete,3,2026-03-02,"), "first row is footings starting on the typed date");
// a weather percentage changes the exported durations once an activity is marked exposed
await page.evaluate(() => { const t = document.getElementById("src"); const j = JSON.parse(t.value); j.activities.find((a) => a.id === "roof").exposed = true; t.value = JSON.stringify(j); t.dispatchEvent(new Event("input")); });
await page.fill("#wl", "50");
const [dl2] = await Promise.all([page.waitForEvent("download"), page.click("#csv")]);
const csv2 = await rf(await dl2.path(), "utf8");
check(csv2 !== csv && /weather allowance/.test(csv2), "CSV follows the weather field (roof exposed, 50%)");
// invalid JSON: the button must not export the stale schedule
await page.fill("#src", "{not json");
let downloaded = false;
page.on("download", () => { downloaded = true; });
await page.click("#csv"); await page.waitForTimeout(600);
check(!downloaded, "no download after invalid JSON");
check(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join("; ") : ""));
await browser.close(); server.close();
process.exit(bad ? 1 : 0);
