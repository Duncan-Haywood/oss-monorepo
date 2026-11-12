// Browser check: the roster builds in a Web Worker, so the page keeps drawing frames while the exact check runs;
// the result matches a build on the main thread (Worker removed); Stop ends a build; exact check "Off" is honoured.
//   (cd ventures && python3 -m http.server 8765) &
//   PLAYWRIGHT_MODULE=/path/to/node_modules node shift-roster-builder/build-worker.check.mjs
// Not a *.test.mjs file on purpose: it needs a browser and a server. Prints one line per check and the frame gaps.
import { createRequire } from "node:module";
const base = process.env.BASE_URL ?? "http://localhost:8765";
const require = createRequire(`${process.env.PLAYWRIGHT_MODULE ?? process.cwd() + "/node_modules"}/`);
const { chromium } = require("playwright");
const browser = await chromium.launch();
const url = `${base}/shift-roster-builder/index.html`;
const fail = (m) => { console.error("FAIL " + m); process.exitCode = 1; };

// Longest gap between animation frames from the click until the report shows: the page's freeze, in ms.
async function buildSample({ noWorker = false, prove = "" } = {}) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (noWorker) await page.addInitScript(() => { delete window.Worker; });
  await page.goto(url);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.selectOption("#prove", prove);
  await page.evaluate(() => {
    window.__gaps = []; let t = performance.now();
    const tick = (now) => { window.__gaps.push(now - t); t = now; if (!window.__stopTicks) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const t0 = Date.now();
  await page.click("#load-example");
  await page.waitForSelector("#report:not([hidden])", { timeout: 60000 });
  const ms = Date.now() - t0;
  const out = await page.evaluate(() => { window.__stopTicks = true; return { gap: Math.max(...window.__gaps), big: document.querySelector("#big").textContent, grid: document.querySelector("#grid tbody").textContent, notices: document.querySelector("#notices").textContent, critical: document.querySelector("#critical").textContent, stopHidden: document.querySelector("#build-stop").hidden }; });
  await ctx.close();
  return { ...out, ms, errors };
}

const w = await buildSample();
const m = await buildSample({ noWorker: true });
console.log(`worker:      ${w.ms} ms to the report, longest frame gap ${Math.round(w.gap)} ms`);
console.log(`main thread: ${m.ms} ms to the report, longest frame gap ${Math.round(m.gap)} ms`);
for (const [k, r] of [["worker", w], ["main", m]]) if (r.errors.length) fail(`${k} page errors: ${r.errors.join("; ")}`);
for (const k of ["big", "grid", "notices", "critical"]) if (w[k] !== m[k]) fail(`${k} differs between worker and main-thread builds`);
if (!/Checked against an exact search/.test(w.notices)) fail("the default build did not run the exact check");
if (!w.stopHidden) fail("Stop still showing after the build");
if (w.gap > 250) fail(`worker build froze the page for ${Math.round(w.gap)} ms`);
else console.log("ok   same roster from the worker, page kept drawing");

const off = await buildSample({ prove: "0" });
if (/Checked against an exact search/.test(off.notices)) fail('exact check ran with "Off" selected');
else console.log(`ok   exact check Off honoured (${off.ms} ms)`);

{ // Stop: click it mid-build; the report stays hidden and the status says stopped.
  const page = await browser.newPage();
  await page.goto(url);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.click("#load-example");
  await page.waitForSelector("#build-stop:not([hidden])", { timeout: 5000 });
  await page.click("#build-stop");
  await page.waitForTimeout(2500);
  const s = await page.evaluate(() => ({ hidden: document.querySelector("#report").hidden, status: document.querySelector("#form-status").textContent, stop: document.querySelector("#build-stop").hidden }));
  if (!s.hidden || !/Stopped/.test(s.status) || !s.stop) fail("Stop did not end the build: " + JSON.stringify(s));
  else console.log("ok   Stop ends the build");
  // And a fresh build after a stop still works.
  await page.click("#analyze");
  await page.waitForSelector("#report:not([hidden])", { timeout: 60000 });
  console.log("ok   builds again after Stop");
}
await browser.close();
