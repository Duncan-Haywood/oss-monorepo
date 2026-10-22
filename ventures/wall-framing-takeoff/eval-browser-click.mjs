// Clicks the page through in a real browser: sheathing on, then "long side along the wall".
// `node eval-browser-click.mjs`; skips with exit 0 when Playwright or a Chromium is missing.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
let chromium;
try { ({ chromium } = await import("playwright")); } catch {
  try { const m = await import(process.env.PLAYWRIGHT_PATH || "playwright-core"); chromium = (m.default ?? m).chromium; } catch { console.log("skipped: playwright not installed"); process.exit(0); }
}
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
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.check("#sheath");
await page.waitForSelector("#sheathing table");
const vertical = await page.textContent("#sheathing");
await page.check("#sheathH");
await page.waitForFunction(() => document.querySelector("#sheathing")?.textContent.includes("long side along the wall"));
const horizontal = await page.textContent("#sheathing");
await page.selectOption("#advFrame", "both");
await page.waitForFunction(() => document.querySelector("#sheathing")?.textContent.includes("long side along the wall"));
const adv = await page.textContent("#sheathing");
console.log(adv.includes("CHECK FAILED") ? "FAIL: advanced framing check" : "ok: advanced framing both, no check failures");
console.log(vertical.includes("Panels run vertically") && horizontal.includes("CHECK FAILED") === false ? "ok: vertical then horizontal, no check failures" : "FAIL");
await page.fill("#panelMax", "12 ft");
await page.fill("#sheathPsf", "1.5");
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#drawings")]);
const drawn = await (await import("node:fs/promises")).readFile(await dl.path(), "utf8");
const panelsOk = drawn.includes("Shop panels (up to 12") && drawn.includes("Panel A") && /lb/.test(drawn) && !/NaN|undefined/.test(drawn);
console.log(panelsOk ? "ok: drawings download with shop panels" : "FAIL: shop panels missing");
console.log("page errors:", errors.length);
await browser.close(); server.close();
process.exit(errors.length || !panelsOk || horizontal.includes("CHECK FAILED") ? 1 : 0);
