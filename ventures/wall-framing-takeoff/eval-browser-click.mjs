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
await page.check("#rfOn");
await page.waitForFunction(() => document.querySelector("#roofOut")?.textContent.includes("rafters"));
const roofTxt = await page.textContent("#roofOut");
await page.selectOption("#rfSpacing", "24");
await page.waitForFunction(() => document.querySelector("#roofOut")?.textContent.includes("at 24 o.c."));
const roofOk = /Roof sheathing: \d+ sheets/.test(roofTxt) && !/NaN|undefined/.test(roofTxt) && (await page.textContent("#order")).includes("rafter") === false; // order rows carry sizes, not kinds
console.log(roofOk ? "ok: roof on, then 24 in spacing" : "FAIL: roof card");
await page.fill("#rfW", "16 ft"); await page.fill("#rfL", "24 ft"); // a 28 x 40 hip needs 21 ft hips, longer than default stock
await page.selectOption("#rfShape", "hip");
await page.selectOption("#rfHip", "2x10");
await page.waitForFunction(() => document.querySelector("#roofOut")?.textContent.includes("Hip roof"));
const hipTxt = await page.textContent("#roofOut");
const hipOk = /2x10 hips of/.test(hipTxt) && !/NaN|undefined/.test(hipTxt);
console.log(hipOk ? "ok: hip roof with 2x10 hips" : "FAIL: hip roof card");
await page.selectOption("#rfShape", "gable");
await page.fill("#rfW", "28 ft"); await page.fill("#rfL", "40 ft");
await page.selectOption("#rfWing", "1");
await page.fill("#rfWingW", "16 ft"); await page.fill("#rfWingP", "12 ft");
await page.selectOption("#rfWingValley", "2x10");
await page.waitForFunction(() => /valley/i.test(document.querySelector("#roofOut")?.textContent || ""));
const wingTxt = await page.textContent("#roofOut");
const wingOk = /2x10/.test(wingTxt) && !/NaN|undefined/.test(wingTxt) && (await page.isHidden("#rfWingW") === false);
console.log(wingOk ? "ok: cross wing with 2x10 valleys" : "FAIL: wing card: " + wingTxt.slice(0, 300));
await page.selectOption("#rfShape", "hip");
const wingHidden = await page.isHidden("#rfWingW");
console.log(wingHidden ? "ok: wing fields hidden on a hip roof" : "FAIL: wing fields shown on a hip roof");
await page.uncheck("#rfOn");
await page.check("#flOn");
await page.fill("#flOpen", "100 in, 40 in, 36 in, 100 in; 300 in, 190 in, 36 in, 100 in");
await page.click("#run");
await page.waitForFunction(() => /2 openings/.test(document.querySelector("#floorOut")?.textContent || ""));
const floorTxt = await page.textContent("#floorOut");
const floorOk = !/NaN|undefined/.test(floorTxt);
console.log(floorOk ? "ok: floor with two stairwells (2 openings)" : "FAIL: floor card: " + floorTxt.slice(0, 300));
await page.fill("#flOpen", "100 in, 40 in, 36 in, 100 in; 100 in, 100 in, 36 in, 40 in");
await page.click("#run");
await page.waitForFunction(() => /too close/.test(document.body.textContent));
console.log("ok: overlapping stairwells refused on the page");
console.log("page errors:", errors.length);
await browser.close(); server.close();
process.exit(errors.length || !panelsOk || !roofOk || !hipOk || !wingOk || !wingHidden || !floorOk || horizontal.includes("CHECK FAILED") ? 1 : 0);
