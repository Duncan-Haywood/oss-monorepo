// The frontier picker (index.html "Other seasons from the same searches", 2026-11-12): builds a
// home-and-away season with "Spread who you meet next", clicks another season on the frontier,
// checks the schedule and the read-out follow it, that the share link reopens on it, and that
// "Back to the choice above" and changing the choice return to the first season.
// Since 2026-11-13 it also checks a squeezed season (README "Squeezing a season under a cap") is
// listed and picks it; --single (2026-11-13 later) does the same on a single round robin
// (README "Squeezing a single round robin"). --polished (2026-11-13, README "Polishing the grounds
// of the frontier") picks a regrounded season instead (index 16 and up, after the 4 squeezes; 14
// teams single lists 314 / 16). Options: --teams=12, --single, --polished. Needs Playwright and a Chromium (skips with exit 0 otherwise):
//   node eval/browser-frontier-pick.mjs
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
const teams = Number(process.argv.find((a) => /^--teams=\d+$/.test(a))?.slice(8) || 12);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
const errors = [];
const open = async (u) => { const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message)); await p.goto(u); return p; };
const fixtures = (p) => p.evaluate(() => [...document.querySelectorAll("#rounds-table tbody tr")].map((r) => r.textContent).join("|"));
const line = (p) => p.locator("#carry-line").textContent();
const waitLine = (p, re) => p.waitForFunction((src) => new RegExp(src).test(document.querySelector("#carry-line")?.textContent || ""), re.source, { timeout: 240000 });

const page = await open(url);
await page.fill("#teams", Array.from({ length: teams }, (_, i) => `Team ${i + 1}`).join("\n"));
await page.fill("#start", "2026-10-06");
await page.check("#wd2");
if (!process.argv.includes("--single")) await page.check("#double");
await page.check("#carryOver");
await page.click("#build");
await waitLine(page, /Best of \d+ searches/);
const before = await fixtures(page);
const shown = (await line(page)).match(/kept (\d+)\/(\d+)/);
const buttons = page.locator("#carry-frontier button[data-keep]:not([disabled])");
const count = await buttons.count();
check(!(await page.locator("#carry-frontier").isHidden()) && count >= 1, `the frontier list shows (${count} other season(s)): ${(await page.locator("#carry-frontier").textContent()).trim()}`);
// a squeezed season (index 12 and up, CARRY_OVER_SQUEEZE) is picked when one is listed, so the
// share link has to rebuild the squeezes to reopen on it
const keeps = await buttons.evaluateAll((bs) => bs.map((b) => Number(b.dataset.keep)));
const sqAt = keeps.findIndex((k) => k >= 12);
check(sqAt >= 0, `a squeezed season is on the list (try numbers ${keeps.join(", ")})`);
const polAt = keeps.findIndex((k) => k >= 16);
if (process.argv.includes("--polished")) check(polAt >= 0, "a regrounded season is on the list (index 16 and up)");
const target = buttons.nth(Math.max(0, process.argv.includes("--polished") ? polAt : sqAt));
const label = await target.textContent();
await target.click();
await waitLine(page, /Picked from \d+ searches/);
const after = await fixtures(page);
const picked = (await line(page)).match(/kept (\d+)\/(\d+)/);
check(after !== before && `${picked[1]} carry-over, ${picked[2]} back-to-back` === label.trim(), `picking "${label.trim()}" keeps that season (was ${shown[1]}/${shown[2]})`);
const statsCo = await page.evaluate(() => document.querySelector("#carry-line").textContent.match(/^Carry-over: (\d+)/)[1]);
check(statsCo === picked[1], `the report's own recount (${statsCo}) agrees with the kept try (${picked[1]})`);
await page.click("#copy-link");
const link = await page.evaluate(() => navigator.clipboard.readText());
check(/#s=/.test(link), "share link copied");
const other = await open(link);
await waitLine(other, /Picked from \d+ searches/);
check(await fixtures(other) === after, "the share link opens on the picked season");
await other.close();
await page.click('#carry-frontier button[data-keep=""]');
await waitLine(page, /Best of \d+ searches/);
check(await fixtures(page) === before, "Back to the choice above restores the first season");
await page.selectOption("#carryOverPick", "fair");
await buttons.first().click();
await waitLine(page, /Picked from/);
await page.selectOption("#carryOverPick", "balanced");
await page.click("#build");
await waitLine(page, /Best of \d+ searches/);
check(await fixtures(page) === before, "changing the choice drops a picked season");
check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
