// The race worker in a real browser (2026-11-23): types a real part-played season into the single-league
// page (openfootball, CC0; team names replaced by Club A, Club B, ... so the results parser sees no digits
// in names), sets the play-off size, builds, and reads the race table twice: as the page thread first
// shows it, and after race-worker.mjs has answered. Checks the page stays usable while the worker runs,
// that the worker lowers magic numbers (or settles teams) the page showed, never raising one, and that
// no settled status contradicts the final table. Needs Playwright and a Chromium (skips with exit 0 otherwise).
//
//   node eval/browser-race-worker.mjs [season] [date index] [spots]   # default it.1.2023-24 78 17
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, join, resolve } from "node:path";

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

const [key = "it.1.2023-24", idxArg = "78", spotsArg = "17"] = process.argv.slice(2);
const data = JSON.parse(readFileSync(join(root, "eval", "data", "openfootball-results.json"), "utf8"));
const L = data.leagues[key];
const n = L.teams.length;
const names = L.teams.map((_, i) => `Club ${String.fromCharCode(65 + i)}`);
const matches = L.matches.slice().sort((x, y) => (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0));
const dates = [...new Set(matches.map((m) => m[1]))];
const d = dates[Number(idxArg)];
const spots = Number(spotsArg);
const played = matches.filter((m) => m[1] <= d);
const fin = Array(n).fill(0);
for (const m of matches) { if (m[4] > m[5]) fin[m[2]] += 3; else if (m[4] < m[5]) fin[m[3]] += 3; else { fin[m[2]]++; fin[m[3]]++; } }
const finalRank = (i, strict) => 1 + fin.filter((p, j) => j !== i && (strict ? p > fin[i] : p >= fin[i])).length;

const types = { ".html": "text/html", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm" };
const server = createServer(async (req, res) => {
  try {
    const p = resolve(root, "." + decodeURIComponent(req.url.split("?")[0]));
    if (!p.startsWith(root)) throw new Error("path outside the served root");
    res.writeHead(200, { "content-type": types[extname(p)] || "text/plain" }).end(await readFile(p));
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
for (const id of ["blackouts", "timeLimits", "grounds", "courtLimits", "courtClosures", "times", "skip", "pins", "rainouts", "withdrawals", "lateTeams", "linked", "officials", "duties", "finishBy"]) await page.fill("#" + id, "");
await page.fill("#courts", Array.from({ length: Math.ceil(n / 2) }, (_, i) => `Pitch ${i + 1}`).join(", "));
await page.fill("#teams", names.join("\n"));
await page.check("#double");
await page.fill("#rounds", "");
await page.fill("#playoff", String(spots));
await page.fill("#results", played.map((m) => `${names[m[2]]} ${m[4]} - ${m[5]} ${names[m[3]]}`).join("\n"));
const read = async () => {
  const out = {};
  for (const r of await page.locator("#race tbody tr").all()) {
    const c = await r.locator("td").allTextContents();
    out[c[0].trim()] = { status: c[4].trim(), magic: c[5].trim() };
  }
  return out;
};
const t0 = Date.now();
await page.click("#build");
await page.waitForSelector("#race-wrap:not([hidden]) #race tbody tr", { timeout: 60000 }).catch(async (e) => { console.log("status:", await page.locator("#form-status").textContent(), "warnings:", (await page.locator("body").textContent()).match(/[^.]*(not understood|unknown|Unknown)[^.]*\./g)?.slice(0, 3)); throw e; });
const first = await read();
const firstNote = await page.locator("#race-note").textContent();
const firstMs = Date.now() - t0;
check(/running in the background/.test(firstNote), `the quick table says a longer search is running (${firstMs} ms to the first table)`);
// the page answers while the worker searches
const t1 = Date.now();
const echo = await page.evaluate(() => { document.querySelector("#results").value += ""; return 1 + 1; });
check(echo === 2 && Date.now() - t1 < 500, `the page answered in ${Date.now() - t1} ms while the worker ran`);
await page.waitForFunction(() => !/running in the background/.test(document.querySelector("#race-note").textContent), null, { timeout: 90000 });
const second = await read();
const secondNote = await page.locator("#race-note").textContent();
console.log(`worker answered after ${Date.now() - t0} ms: ${secondNote.split(". ").slice(1, 2).join("")}`);
const count = (t, s) => Object.values(t).filter((r) => r.status === s).length;
console.log(`page thread: ${count(first, "Clinched")} clinched, ${count(first, "Out")} out, ${count(first, "Alive")} alive`);
console.log(`after worker: ${count(second, "Clinched")} clinched, ${count(second, "Out")} out, ${count(second, "Alive")} alive`);
let settled = 0, wrong = 0, undone = 0, lowered = 0, raised = 0;
names.forEach((nm, i) => {
  const a = first[nm], b = second[nm];
  if (a.status !== "Alive" && a.status !== b.status) undone++;
  if (a.status === "Alive" && b.status !== "Alive") settled++;
  const ma = Number(a.magic), mb = Number(b.magic);
  if (a.status === "Alive" && b.status === "Alive" && mb < ma) lowered++;
  if (a.status === "Alive" && b.status === "Alive" && mb > ma) raised++;
  if (b.status === "Clinched" && finalRank(i, false) > spots) wrong++;
  if (b.status === "Out" && finalRank(i, true) <= spots) wrong++;
});
check(settled + lowered > 0, `the worker settled ${settled} team(s) and lowered ${lowered} magic number(s) the page thread showed`);
check(raised === 0, `no magic number raised (${raised})`);
check(wrong === 0 && undone === 0, `no status contradicts the final table (${wrong}) or undoes the page's (${undone})`);
check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
