// Clicks the single-league page's team duties box and team sheets download in a real browser
// (2026-11-13): the example league with five teams (so byes), two officials and two duties.
// Checks the duty line, the downloaded sheets (a page per team, byes, duty column, rota page),
// the rota text, and that a bad duty line refuses the download. Needs Playwright and a Chromium:
// `node eval/browser-click-team-sheets.mjs` (skips with exit 0 when neither is installed).
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
const url = `http://127.0.0.1:${server.address().port}/index.html`;

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(url);
await page.click("#load-example");
await page.waitForFunction(() => /Sample league/.test(document.querySelector("#form-status").textContent));
await page.fill("#teams", "Aces\nBlockers\nChamps\nDiggers\n<Eagles>");
for (const id of ["blackouts", "timeLimits", "grounds", "results"]) await page.fill("#" + id, "");
await page.fill("#officials", "Pat\nSam");
await page.fill("#duties", "Snack stand: 2\nScoreboard");
await page.fill("#sheetTitle", "Spring league");
await page.fill("#sheetContact", "Sam, 555 0100");
await page.click("#build");
await page.waitForSelector("#report:not([hidden])");
await page.waitForFunction(() => /Duties:/.test(document.querySelector("#duty-line").textContent));
const line = await page.locator("#duty-line").textContent();
console.log("duty line:", line);
check(/slots filled/.test(line), "duty line reports the rota");
const grab = async (btn) => {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), page.click(btn)]);
  const p = await dl.path();
  return { name: dl.suggestedFilename(), text: await readFile(p, "utf8") };
};
const sheets = await grab("#dl-team-sheets");
const n = (re) => (sheets.text.match(re) || []).length;
console.log(`team-sheets.html: ${sheets.text.length} bytes, ${n(/<section class="sheet">/g)} sheets, ${n(/<tr class="bye">/g)} bye rows, ${n(/<tr><td class="s">/g)} game rows`);
check(sheets.name === "team-sheets.html", "downloads team-sheets.html");
check(n(/<section class="sheet">/g) === 6, "five team sheets and a rota page");
check(n(/<tr class="bye">/g) === 5, "each team's bye on its sheet");
check(n(/<tr><td class="s">/g) === 20, "every game on both teams' sheets (10 games)");
check(/<th>Your duty<\/th>/.test(sheets.text) && /<th>Official<\/th>/.test(sheets.text) && /Duty rota/.test(sheets.text), "duty and official columns, rota page");
check(/Spring league/.test(sheets.text) && /Questions: Sam, 555 0100/.test(sheets.text), "title and contact line");
check(sheets.text.includes("&lt;Eagles&gt;") && !sheets.text.includes("<Eagles>"), "team name escaped");
const rota = await grab("#dl-duties");
check(rota.name === "team-duties.txt" && /Snack stand: /.test(rota.text) && /Duties per team: /.test(rota.text), "rota text downloads");
await page.fill("#duties", "Snack stand: 99");
await page.dispatchEvent("#duties", "input");
let got = false;
page.once("download", () => { got = true; });
await page.click("#dl-team-sheets");
await page.waitForTimeout(500);
check(!got && /Not downloaded/.test(await page.locator("#duty-line").textContent()), "a bad duty line refuses the download");
check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
