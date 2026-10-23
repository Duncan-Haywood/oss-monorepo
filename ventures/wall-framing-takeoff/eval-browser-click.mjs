// Clicks the page through in a real browser: sheathing on, then "long side along the wall".
// `node eval-browser-click.mjs`; skips with exit 0 when Playwright or a Chromium is missing.
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
// Shop-panel lumber order: with a panel length set the button downloads the order and pull list; without one it says what is missing.
const [po] = await Promise.all([page.waitForEvent("download"), page.click("#panelOrderBtn")]);
const orderTxt = await (await import("node:fs/promises")).readFile(await po.path(), "utf8");
const orderOk = po.suggestedFilename() === "shop-panel-lumber-order.txt" && orderTxt.trim().split("\n").length > 3 && !/NaN|undefined/.test(orderTxt);
console.log(orderOk ? "ok: shop-panel lumber order downloads (" + orderTxt.trim().split("\n").length + " lines)" : "FAIL: shop-panel order download\n" + orderTxt.slice(0, 400));
const heavier = await (async () => { await page.fill("#sheathPsf", "0"); const [d0] = await Promise.all([page.waitForEvent("download"), page.click("#drawings")]); const t0 = await (await import("node:fs/promises")).readFile(await d0.path(), "utf8"); await page.fill("#sheathPsf", "1.5"); return t0.length < drawn.length; })();
console.log(heavier ? "ok: a sheathing weight adds panel weights to the drawings" : "FAIL: sheathing weight changed nothing in the drawings");
await page.fill("#panelMax", "");
await page.click("#panelOrderBtn");
const noLen = (await page.textContent("#status")).includes("Enter the longest shop panel");
console.log(noLen ? "ok: panel order without a length asks for one" : "FAIL: no message without a panel length");
await page.fill("#panelMax", "12 ft");
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
await page.fill("#rfWingPitch", "3");
await page.waitForFunction(() => /3:12 against the main roof/.test(document.querySelector("#roofOut")?.textContent || ""));
console.log("ok: wing at 3:12 on a 4:12 roof");
await page.selectOption("#rfWing2", "1");
await page.fill("#rfWing2W", "14 ft"); await page.fill("#rfWing2P", "10 ft");
await page.waitForFunction(() => /Cross wing/i.test(document.querySelector("#roofOut")?.textContent || "") && !document.querySelector("#errors")?.textContent);
let backingOk = true;
const wing2Txt = await page.textContent("#roofOut");
const wing2Ok = !/NaN|undefined/.test(wing2Txt) && (await page.isHidden("#rfWing2W") === false);
console.log(wing2Ok ? "ok: second wing on the left" : "FAIL: second wing card: " + wing2Txt.slice(0, 300));
await page.selectOption("#rfValleyBacking", "1");
await page.waitForFunction(() => /valley backing/i.test(document.querySelector("#roofOut")?.textContent || ""), null, { timeout: 5000 }).then(() => console.log("ok: valley backing listed"), () => { backingOk = false; console.log("FAIL: valley backing not in the roof card"); });
await page.selectOption("#rfShape", "hip");
const wingHidden = await page.isHidden("#rfWingW") && await page.isHidden("#rfWing2W");
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
await page.uncheck("#flOn");
await page.uncheck("#sheathH");
await page.uncheck("#sheath");
await page.fill("#panelMax", "");
await page.fill('[aria-label="Wall 1 gable pitch"]', "6");
await page.fill('[aria-label="Wall 1 gable peak position"]', "6 ft");
await page.click("#run");
await page.waitForFunction(() => /gable/i.test(document.body.textContent) && !document.querySelector("#errors")?.textContent, null, { timeout: 90000 });
const gableOk = !/NaN|undefined/.test(await page.textContent("#results").catch(() => ""));
console.log(gableOk ? "ok: gable wall (6:12, peak 6 ft) frames from the page" : "FAIL: gable wall");
await page.fill('[aria-label="Wall 1 gable pitch"]', "40");
await page.click("#run");
await page.waitForFunction(() => /gable pitch/.test(document.body.textContent), null, { timeout: 90000 });
console.log("ok: bad gable pitch refused on the page");
await page.fill('[aria-label="Wall 1 gable pitch"]', "");
// header table: the first opening set to auto takes the first row that covers it; a light hand pick is listed
await page.locator("details", { hasText: "Size headers from your own span table" }).locator("summary").click();
await page.fill("#hdrTable", "2 ft, 2x6\n4 ft, 2x8, 2\n8 ft, 2x12, 3");
await page.selectOption('[aria-label="Opening 1 header size"]', "auto");
await page.click("#run");
await page.waitForFunction(() => /set from the table/.test(document.querySelector("#hdrNotes")?.textContent || ""), null, { timeout: 90000 });
const hdrTxt = await page.textContent("#hdrNotes");
const hdrOk = !/NaN|undefined/.test(hdrTxt) && !(await page.textContent("#errors"));
console.log(hdrOk ? "ok: header table sizes an auto opening: " + hdrTxt.slice(0, 120) : "FAIL: header table: " + hdrTxt);
await page.fill("#hdrTable", "");
await page.click("#run");
await page.waitForFunction(() => /header table is empty/.test(document.body.textContent), null, { timeout: 90000 });
console.log("ok: auto header with no table refused on the page");
console.log("page errors:", errors.length);
await browser.close(); server.close();
process.exit(errors.length || !panelsOk || !orderOk || !heavier || !noLen || !roofOk || !hipOk || !wingOk || !wing2Ok || !backingOk || !wingHidden || !floorOk || !gableOk || !hdrOk || horizontal.includes("CHECK FAILED") ? 1 : 0);
