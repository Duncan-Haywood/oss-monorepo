// Browser check: the page's "Pay for call-out slack" setting reaches the build and its notice says what was bought.
//   (cd ventures && python3 -m http.server 8765) &
//   PLAYWRIGHT_MODULE=/path/to/node_modules node shift-roster-builder/cover-price.check.mjs
// Not a *.test.mjs file on purpose: it needs a browser and a server. Prints one line per check.
import { createRequire } from "node:module";
const base = process.env.BASE_URL ?? "http://localhost:8765";
const require = createRequire(`${process.env.PLAYWRIGHT_MODULE ?? process.cwd() + "/node_modules"}/`);
const { chromium } = require("playwright");
const browser = await chromium.launch();
const url = `${base}/shift-roster-builder/index.html`;
const fail = (m) => { console.error("FAIL " + m); process.exitCode = 1; };

async function build(price) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.selectOption("#template-pick", "retail");
  await page.waitForSelector("#report:not([hidden])", { timeout: 120000 });
  if (price) {
    await page.selectOption("#coverprice", price);
    await page.click("#analyze");
    await page.waitForFunction(() => !document.querySelector("#build-stop") || document.querySelector("#build-stop").hidden, null, { timeout: 120000 });
  }
  const out = await page.evaluate(() => ({ notices: document.querySelector("#notices").textContent, big: document.querySelector("#big").textContent, grid: document.querySelector("#grid tbody").textContent }));
  await ctx.close();
  return { ...out, errors };
}

const off = await build("");
const on = await build("100");
for (const [name, r] of [["off", off], ["on", on]]) {
  console.log(`${name}: ${r.errors.length} page errors; notices ${r.notices.length} chars`);
  if (r.errors.length) fail(`${name}: page errors ${r.errors.join("; ")}`);
}
if (off.notices.includes("Call-out slack")) fail("the slack notice shows with the setting off");
if (!on.notices.includes("Call-out slack")) fail("no slack notice with the setting on");
const line = (on.notices.match(/Call-out slack:[^]*?\./) || [""])[0];
console.log(`on: ${line}`);
if (on.grid === off.grid) console.log("note: the roster did not change (no move paid for itself at this price)");
else console.log("the roster changed, as the notice says");
await browser.close();
console.log(process.exitCode ? "FAILED" : "OK");
