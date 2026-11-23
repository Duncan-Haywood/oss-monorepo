// Loads every file in CARD_DIR into site/cull.html (served at URL) in headless
// Chromium, then prints one JSON line: seconds to read, the status line, tiles,
// JS heap, and 50 arrow-key moves timed. Used for eval/cull-card-500-2026-11-23.md.
// Needs Playwright with Chromium (found as platform/pages/load-playwright.mjs
// finds it: PLAYWRIGHT, the bare name, NODE_PATH, then /opt/node-tools).
import { loadPlaywright } from "../../../platform/pages/load-playwright.mjs";
const pw = await loadPlaywright();
if (!pw) { console.error("playwright not found:", loadPlaywright.lastError); process.exit(2); }
const { chromium } = pw;
import { readdirSync } from "node:fs";
import { join } from "node:path";
const [url, dir] = process.argv.slice(2);
const files = readdirSync(dir).sort().map((n) => join(dir, n));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url);
const cdp = await page.context().newCDPSession(page);
await cdp.send("Performance.enable");
const t0 = Date.now();
await page.setInputFiles("#pickFiles", files);
await page.waitForFunction(() => /read \d+ in/.test(document.getElementById("status").textContent), null, { timeout: 600000, polling: 250 });
const secs = (Date.now() - t0) / 1000;
const m = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
const status = await page.textContent("#status");
const tiles = await page.locator("#grid .tile").count();
const withThumb = await page.locator("#grid .tile canvas").count();
// keyboard: rate 3 on the first, move 100 right timing
const t1 = Date.now();
await page.locator("#grid").focus();
for (let i = 0; i < 50; i++) await page.keyboard.press("ArrowRight");
await page.keyboard.press("3");
const keySecs = (Date.now() - t1) / 1000;
console.log(JSON.stringify({ url, files: files.length, secs, status, tiles, withThumb, jsHeapMB: Math.round(m.JSHeapUsedSize / 2 ** 20), nodes: m.Nodes, keySecs, errors }));
await browser.close();
