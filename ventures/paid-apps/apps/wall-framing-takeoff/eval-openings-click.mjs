// Clicks index.html in a real browser: the door and window schedule button downloads a CSV of marks from the example house.
// `node eval-openings-click.mjs`; skips with exit 0 when Playwright or a Chromium is missing.
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
await page.click("#example");
await page.click("#run");
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#openingsCsvBtn")]);
check(dl.suggestedFilename() === "door-window-schedule.csv", `file name ${dl.suggestedFilename()}`);
const csv = (await readFile(await dl.path(), "utf8")).split("\n");
check(csv[0].startsWith("mark,kind,count,ro_width_in"), "header row");
const doors = csv.slice(1).filter((l) => l.split(",")[1] === "door").reduce((s, l) => s + Number(l.split(",")[2]), 0);
const wins = csv.slice(1).filter((l) => l.split(",")[1] === "window").reduce((s, l) => s + Number(l.split(",")[2]), 0);
check(doors === 6 && wins === 6 && csv.length - 1 === 9, `6 doors, 6 windows, 9 marks (got ${doors}, ${wins}, ${csv.length - 1})`);
check(errors.length === 0, `no page errors ${errors.join("|")}`);
await browser.close(); server.close();
process.exit(fail);
