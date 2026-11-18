// Clicks promotion and relegation through on the multi-division page in a real browser: a made-up
// three-tier league, every game played (the team listed first wins), Show next season's divisions,
// then Start next season, and checks the divisions box holds the moved teams and the results are cleared.
// `node eval/promotion-click.mjs` (skips with exit 0 when Playwright is not installed).
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
const page = await (await browser.newContext()).newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.goto(url);
await page.fill("#divisions", "Premier: A1, A2, A3, A4\nDivision 1: B1, B2, B3, B4\nDivision 2: C1, C2, C3, C4");
await page.fill("#courts", "Court 1, Court 2");
await page.fill("#times", "19:00, 20:00");
await page.fill("#start", "2026-01-06");
await page.fill("#weekdays", "Tue");
await page.click("#build");
await page.waitForSelector("#nights tbody tr");
const lines = [];
for (const d of ["A", "B", "C"]) {
  const div = { A: "Premier", B: "Division 1", C: "Division 2" }[d];
  for (let i = 1; i <= 4; i++) for (let j = i + 1; j <= 4; j++) lines.push(`${div}: ${d}${i} 2 - 0 ${d}${j}`);
}
await page.fill("#results", lines.join("\n"));
await page.fill("#pr-joining", "Division 2: New Town");
await page.click("#show-promotion");
const out = await page.textContent("#promotion-out");
check(/A4: Premier -> Division 1 \(place 4 of 4, relegated\)/.test(out), "A4 relegated");
check(/C1: Division 2 -> Division 1/.test(out), "C1 promoted");
check(/Premier: A1, A2, A3, B1/.test(out), "next Premier listed");
check(!/Check:/.test(out), "no warnings on a finished season");
check(await page.isVisible("#use-promotion"), "start-next-season button shown");
await page.click("#use-promotion");
const divs = await page.inputValue("#divisions");
check(divs === "Premier: A1, A2, A3, B1\nDivision 1: B2, B3, A4, C1\nDivision 2: C2, C3, C4, B4, New Town", "divisions box filled: " + JSON.stringify(divs));
check((await page.inputValue("#results")) === "" && (await page.inputValue("#start")) === "", "results and start cleared");
await page.fill("#start", "2026-09-01");
await page.click("#build");
await page.waitForFunction(() => /2026-09/.test(document.querySelector("#nights tbody")?.textContent || ""));
check(/New Town/.test(await page.textContent("#nights tbody")), "next season builds with the new entrant");
check(errs.length === 0, "no page errors " + errs.join("; "));
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
