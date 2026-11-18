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
