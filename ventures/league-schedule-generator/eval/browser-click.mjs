// Clicks the multi-division page through in a real browser: load the example,
// add a rainout, tick each make-up option (balance, flip, relocate, swapNights),
// build, and carry the ticks through a share link into a fresh page.
// Needs Playwright and a Chromium: `node eval/browser-click.mjs` (skips with
// exit 0 when neither is installed). Looks for `playwright` on the import
// path, then PLAYWRIGHT_PATH, then /opt/node-tools/node_modules/playwright.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
let chromium;
const candidates = ["playwright", process.env.PLAYWRIGHT_PATH, "/opt/node-tools/node_modules/playwright", "playwright-core"].filter(Boolean).map((c) => {
  if (!c.startsWith("/") || !existsSync(c)) return c;
  return statSync(c).isDirectory() ? join(c, "index.mjs") : c;
});
for (const c of candidates) {
  try { ({ chromium } = await import(c.startsWith("/") ? "file://" + c : c)); break; } catch {}
}
if (!chromium) { console.log("skipped: playwright not installed"); process.exit(0); }
const types = { ".html": "text/html", ".mjs": "text/javascript", ".json": "application/json" };
const server = createServer(async (req, res) => {
  try {
    const p = join(root, decodeURIComponent(req.url.split("?")[0]));
    const body = await readFile(p);
    res.writeHead(200, { "content-type": types[extname(p)] || "text/plain" }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/multi-division-league-schedule.html`;

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };
const OPTS = ["balance", "flip", "relocate", "swapNights"];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(url);

await page.click("#load-example");
check(await page.locator("#report").isVisible(), "example builds and shows the report");
check(/checked/.test(await page.locator("#check-line").textContent()), "example passes its own check");
const baseline = await page.locator("#nights tbody tr").count();

await page.fill("#rainouts", "2026-10-13 U12/Hawks, U12/Owls\n2026-10-20 U10/Lynx");
for (const o of OPTS) check(!(await page.locator("#" + o).isChecked()), `${o} starts unticked`);
await page.click("#build");
const plain = await page.locator("#notices").textContent();
check(/Moved for rainouts/.test(plain), "rainouts are moved without options");
check(await page.locator("#nights tbody tr").count() === baseline, "a moved match keeps the match count");

for (const o of OPTS) {
  await page.check("#" + o);
  await page.click("#build");
  const status = await page.locator("#form-status").textContent();
  check(/Built/.test(status), `${o} ticked: build succeeds (${status.slice(0, 40)})`);
  check(/checked/.test(await page.locator("#check-line").textContent()), `${o} ticked: schedule still passes its check`);
  check(await page.locator("#nights tbody tr").count() === baseline, `${o} ticked: match count unchanged`);
}

await page.click("#share-link");
const hash = await page.evaluate(() => location.hash);
check(hash.startsWith("#d="), "share link holds the setup in the hash");
const fresh = await ctx.newPage();
fresh.on("pageerror", (e) => errors.push(e.message));
await fresh.goto(url + hash);
for (const o of OPTS) check(await fresh.locator("#" + o).isChecked(), `${o} survives the share link`);
check(await fresh.locator("#report").isVisible(), "the link builds the schedule on open");
const a = await page.locator("#nights tbody").innerText();
const b = await fresh.locator("#nights tbody").innerText();
check(a === b, "the opened link shows the same schedule");

await page.click("#suggest-weight");
await page.waitForFunction(() => /Suggested weight/.test(document.querySelector("#suggest-out").textContent), null, { timeout: 120000 });
const sug = await page.locator("#suggest-out").textContent();
const w = await page.locator("#fairnessWeight").inputValue();
check(w !== "" && Number.isFinite(Number(w)), `suggest button fills the weight box (${sug.slice(0, 60)})`);
check(await page.locator("#venueFairness").isChecked(), "suggest button turns venue fairness on");

for (const [btn, name, test] of [
  ["#dl-grid", "division-season-grid.csv", (t) => t.split("\n").length > 2 && t.includes(",")],
]) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), page.click(btn)]);
  const path = await dl.path();
  const text = (await readFile(path, "utf8")).trim();
  check(dl.suggestedFilename() === name, `${btn} downloads ${name}`);
  check(test(text), `${name} has a header and rows (${text.split("\n").length} lines)`);
}

check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
