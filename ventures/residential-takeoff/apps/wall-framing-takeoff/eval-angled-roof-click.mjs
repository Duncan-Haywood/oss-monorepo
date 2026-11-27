// Clicks index.html in a real browser: the "outline" roof shape takes an outline with angled sides (a 45-degree bay)
// and draws its all-hip roof plan from skeleton.mjs, gives its squares and roof lines, and says why its rafters and
// sheathing courses are not laid out. `node eval-angled-roof-click.mjs`; skips with exit 0 when Playwright or a Chromium is missing.
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
const types = { ".html": "text/html", ".mjs": "text/javascript", ".wasm": "application/wasm" };
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
await page.check("#rfOn");
await page.selectOption("#rfShape", "outline");
// 40 x 24 ft with a bay 8 ft wide at the wall, 4 ft across its front and 2 ft deep
await page.fill("#rfOutline", "0, 2'\n16', 2'\n18', 0\n22', 0\n24', 2'\n40', 2'\n40', 26'\n0, 26'");
await page.fill("#rfPitch", "6");
await page.click("#run");
await page.waitForSelector("#roofPlan svg", { timeout: 10000 });
const kinds = await page.$$eval("#roofPlan svg line", (ls) => ls.map((l) => l.getAttribute("data-kind")));
check(kinds.filter((k) => k === "valley").length === 2, `two valleys drawn (${kinds.filter((k) => k === "valley").length})`);
check(kinds.filter((k) => k === "ridge").length === 1, `one ridge drawn (${kinds.filter((k) => k === "ridge").length})`);
check(kinds.filter((k) => k === "hip").length === 7, `seven hips drawn (${kinds.filter((k) => k === "hip").length})`);
check(!kinds.includes("rafter"), "no rafters drawn");
const dims = await page.$$eval("#roofPlan svg text", (ts) => ts.length);
check(dims === 8, `eight eave sides dimensioned (${dims})`);
const roofOut = await page.textContent("#roofOut");
check(/8 corners, \d+\.\d\d squares/.test(roofOut), "squares on the roof card");
check(/angled sides/.test(roofOut), "the card says why rafters and courses are not laid out");
const card = await page.textContent("#roofCard");
check(/so its rafters and sheathing courses are not laid out/.test(card), "the note under the plan says so too");
check(errors.length === 0, `no page errors (${errors.join("; ")})`);
await browser.close();
server.close();
process.exit(fail);
