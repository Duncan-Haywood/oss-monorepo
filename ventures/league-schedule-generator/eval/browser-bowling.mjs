// node eval/browser-bowling.mjs: loads bowling-league-schedule.html in headless Chromium, builds
// the sample, an odd league with skip dates, and a bad input, and checks the page at phone width.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { existsSync } from "node:fs";
// Same search as eval/browser-click.mjs: the import path, PLAYWRIGHT_PATH, then global installs.
let chromium;
for (const c of ["playwright", process.env.PLAYWRIGHT_PATH, "/opt/node-tools/node_modules/playwright/index.mjs", "/opt/node22/lib/node_modules/playwright/index.mjs"].filter(Boolean)) {
  if (c.startsWith("/") && !existsSync(c)) continue;
  try { ({ chromium } = await import(c.startsWith("/") ? "file://" + c : c)); break; } catch {}
}
if (!chromium) { console.log("skipped: playwright not installed"); process.exit(0); }
const root = new URL("..", import.meta.url).pathname;
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".wasm": "application/wasm" };
const server = createServer(async (req, res) => {
  try { const f = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)); res.writeHead(200, { "content-type": types[extname(f)] || "text/plain" }); res.end(await readFile(f)); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/bowling-league-schedule.html`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
let ok = 0, bad = 0;
const check = (c, msg) => { if (c) ok++; else { bad++; console.log("FAIL", msg); } };
await page.goto(url);
await page.waitForSelector("#out:not([hidden])");
check((await page.locator("#sched tbody tr").count()) === 16, "sample: 16 weeks");
check(/8 of 8 teams have the most even lane split/.test(await page.textContent("#summary")), "sample: 8 of 8 at bound");
check(/Checked:/.test(await page.textContent("#summary")), "sample: validator passed");
await page.fill("#teams", "A\nB\nC\nD\nE\nF\nG\nH\nI");
await page.fill("#weeks", "30");
await page.fill("#positions", "15, 30");
await page.fill("#skip", "2026-11-24");
await page.click("#build");
await page.waitForFunction(() => document.querySelector("#sched tbody") && document.querySelectorAll("#sched tbody tr").length === 30);
const sum = await page.textContent("#summary");
check(/10 teams \(with the Vacancy\) on 5 lane pairs/.test(sum), "odd: vacancy and 5 pairs");
check(/No bowling on Tue 24 Nov 2026/.test(sum), "odd: skip date named");
check((await page.locator("#counts tbody tr").count()) === 10, "odd: 10 count rows");
const before = await page.innerHTML("#sched");
await page.click("#again");
await page.waitForFunction((b) => document.querySelector("#sched").innerHTML !== b, before);
check(true, "reshuffle changes the lane deal");
// Lane limits: the end pair kept free of one team, the avoided cell shown as a dash.
await page.fill("#teams", "Pin Pals\nAlley Cats\nSplit Happens\nGutter Gang\nLucky Strikes\nTen Pin Titans\nSpare Me\nRolling Thunder");
await page.fill("#skip", "");
await page.fill("#avoid", "Pin Pals: 7-8\nSpare Me: first");
await page.click("#build");
await page.waitForFunction(() => /Lane limits kept/.test(document.querySelector("#summary").textContent));
const limSum = await page.textContent("#summary");
check(/8 of 8 teams are inside their fair share/.test(limSum), `limits: 8 of 8 in share (${limSum.slice(0, 200)})`);
check(/Checked:/.test(limSum), "limits: validator passed");
const onEnd = await page.evaluate(() => [...document.querySelectorAll("#sched tbody tr")].filter((tr) => /Pin Pals/.test(tr.cells[5]?.textContent || "") && !/place/.test(tr.cells[5].textContent)).length);
check(onEnd === 0, `limits: Pin Pals never on Lanes 7-8 (${onEnd})`);
const dash = await page.evaluate(() => [...document.querySelectorAll("#counts tbody tr")].find((tr) => tr.cells[0].textContent === "Pin Pals").cells[4].textContent);
check(dash === "\u2013", `limits: avoided pair shown as a dash (${dash})`);
// 20 teams x 30 weeks with one team off both end pairs: the search alone left a team or two off
// its share; the page now deals the team a stored shape answer's slot (bowling-avoid-shapes.mjs).
const savedWeeks = await page.inputValue("#weeks");
await page.fill("#teams", Array.from({ length: 20 }, (_, i) => `Team ${i + 1}`).join("\n"));
await page.fill("#weeks", "30");
await page.fill("#avoid", "Team 7: ends");
await page.click("#build");
await page.waitForFunction(() => /Lane limits kept/.test(document.querySelector("#summary").textContent) && /20 of 20 teams are inside/.test(document.querySelector("#summary").textContent), null, { timeout: 30000 });
check(true, "limits: 20 teams x 30 weeks, one team off both ends, 20 of 20 in share");
// The slowest season measured (24 teams x 26 weeks, six teams off both end pairs: several full
// lane searches, ~10 s) builds in a Web Worker, so the page thread keeps running: the longest gap
// between 50 ms timer ticks while it builds is the time the tab was frozen.
await page.fill("#teams", Array.from({ length: 24 }, (_, i) => `Team ${i + 1}`).join("\n"));
await page.fill("#weeks", "26");
await page.fill("#positions", "");
await page.fill("#avoid", Array.from({ length: 6 }, (_, i) => `Team ${i + 1}: ends`).join("\n"));
await page.evaluate(() => { window.__gap = 0; let t = performance.now(); window.__tick = setInterval(() => { const n = performance.now(); window.__gap = Math.max(window.__gap, n - t); t = n; }, 50); });
const tBuild = Date.now();
await page.click("#build");
await page.waitForFunction(() => /24 teams on 12 lane pairs/.test(document.querySelector("#summary").textContent) && !/Dealing/.test(document.querySelector("#status").textContent), null, { timeout: 120000 });
const slowMs = Date.now() - tBuild;
const gap = await page.evaluate(() => { clearInterval(window.__tick); return window.__gap; });
const slowSum = await page.textContent("#summary");
check(/Lane limits kept/.test(slowSum) && /Checked:/.test(slowSum), "slow season: built, limits kept, validated");
check(gap < 500, `slow season: page thread never blocked 0.5 s (longest gap ${Math.round(gap)} ms over a ${slowMs} ms build)`);
console.log(`slow season (24 x 26, six off both ends): built in ${slowMs} ms; longest page-thread gap ${Math.round(gap)} ms`);
// A second click while one search runs: the newer one wins and the older result never lands.
await page.click("#build");
await page.fill("#teams", "A\nB\nC\nD\nE\nF");
await page.fill("#weeks", "10");
await page.fill("#avoid", "");
await page.click("#build");
await page.waitForFunction(() => /6 teams on 3 lane pairs/.test(document.querySelector("#summary").textContent), null, { timeout: 30000 });
await page.waitForTimeout(12000);
check(/6 teams on 3 lane pairs/.test(await page.textContent("#summary")), "a newer click replaces an older search's result");
await page.fill("#weeks", savedWeeks);
await page.fill("#avoid", "Nobody: 1");
await page.click("#build");
await page.waitForFunction(() => /not one of the teams/.test(document.querySelector("#status").textContent));
check(true, "limits: unknown team reported");
await page.fill("#avoid", "");
await page.fill("#teams", "Solo");
await page.click("#build");
await page.waitForFunction(() => /at least two teams/i.test(document.querySelector("#status").textContent));
check(await page.locator("#out").isHidden(), "error hides the old schedule");
const width = await page.evaluate(() => document.documentElement.scrollWidth);
check(width <= 390, `no horizontal page scroll at 390 px (got ${width})`);
check(errs.length === 0, `console errors: ${errs.join(" | ")}`);
await browser.close();
server.close();
console.log(`${ok} checks pass, ${bad} fail`);
process.exit(bad ? 1 : 0);
