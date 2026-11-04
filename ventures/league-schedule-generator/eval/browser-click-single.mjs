// Clicks the single-league page's volleyball set-scoring box in a real browser:
// three made-up teams, two results, the standings table read with the box
// unticked (3 points a win) and ticked (a 3-2 win earns 2, the loser 1).
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
const url = `http://127.0.0.1:${server.address().port}/index.html`;

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };
const OPTS = ["balance", "flip", "relocate", "swapNights"];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(url);
await page.click("#load-example");
await page.waitForFunction(() => /Sample league/.test(document.querySelector("#form-status").textContent));
for (const id of ["blackouts", "timeLimits", "grounds"]) await page.fill("#" + id, "");
await page.fill("#teams", "Aces\nBlockers\nChamps");
await page.fill("#results", "Aces 3 - 2 Blockers\nAces 3 - 0 Champs");
const pts = async () => {
  await page.click("#build");
  await page.waitForSelector("#standings-wrap:not([hidden])", { timeout: 5000 }).catch(async () => { throw new Error("no standings: " + (await page.locator("#form-status").textContent())); });
  const rows = await page.locator("#standings tbody tr").all();
  const out = {};
  for (const r of rows) {
    const c = await r.locator("td").allTextContents();
    out[c[1].trim()] = Number(c[7]);
  }
  return out;
};
const plain = await pts();
check(plain.Aces === 6 && plain.Blockers === 0, `unticked: win = 3 points (${JSON.stringify(plain)})`);
await page.check("#setscore");
const sets = await pts();
check(sets.Aces === 5 && sets.Blockers === 1 && sets.Champs === 0, `ticked: 3-0 = 3, 3-2 = 2 and 1 (${JSON.stringify(sets)})`);
await page.uncheck("#setscore");
check((await pts()).Aces === 6, "unticking restores the default");
check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
