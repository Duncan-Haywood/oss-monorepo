// Print check: renders every printable output to PDF in headless Chromium (Letter and A4, the
// browser's default margins) and checks what a person would see on paper:
//   - nothing wider than the printable width (no clipped right-hand column),
//   - no blank page (a page break before and after the same element),
//   - one score sheet per page when a night fits on a page,
//   - the main page prints only the schedule (no form, no buttons).
// `node eval/print-check.mjs [--out dir]` (skips with exit 0 when Playwright is missing). Page text
// is read with pdftotext when installed; without it the blank-page check is skipped and said so.
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";
import { buildSchedule, readSpec, scoreSheetsHtml, leaguePageHtml, assignOfficials, parseOfficials } from "../calc.mjs";
import { buildDivisions, readDivisionsSpec, divisionsScoreSheetsHtml, divisionsTeamSheetsHtml } from "../divisions.mjs";
import { printPackHtml } from "../printpack.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
let chromium;
for (const c of ["playwright", process.env.PLAYWRIGHT_PATH, "/opt/node-tools/node_modules/playwright/index.mjs", "playwright-core"].filter(Boolean)) {
  try { ({ chromium } = await import(c.startsWith("/") ? "file://" + c : c)); break; } catch {}
}
if (!chromium) { console.log("skipped: playwright not installed"); process.exit(0); }
const outArg = process.argv.indexOf("--out");
const out = outArg > 0 ? process.argv[outArg + 1] : null;
if (out) await mkdir(out, { recursive: true });
let pdftotext = true;
try { execFileSync("pdftotext", ["-v"], { stdio: "ignore" }); } catch { pdftotext = false; }

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };

function pagesText(pdf) {
  if (!pdftotext) return null;
  const txt = execFileSync("pdftotext", ["-layout", "-", "-"], { input: pdf, maxBuffer: 1 << 26 }).toString();
  const pages = txt.split("\f");
  if (pages.length && pages[pages.length - 1].trim() === "") pages.pop();
  return pages;
}

const LONG = ["Northside Thunderbolts Women's Masters", "St. Bartholomew's Old Boys Reserves", "The Unbelievable Dinkmeisters of Elm Street", "Kitchen Kings", "Lob Squad", "Spin Doctors", "Net Ninjas", "Dink Dynasty", "Riverbend Rovers", "Harbour Lights"];
function single(n, extra = {}) {
  const spec = readSpec({ teams: LONG.slice(0, n).join("\n"), start: "2026-10-06", weekdays: "Tue", times: "18:00, 19:30", courts: "Court 1, Court 2, Court 3", ...extra });
  if (spec.errors.length) throw new Error(spec.errors.join("; "));
  return buildSchedule(spec.spec ?? spec);
}

const docs = [];
let s20 = single(10, { teams: [...LONG, ...Array.from({ length: 10 }, (_, i) => `Team ${i + 11}`)].join("\n"), courts: "Court 1, Court 2, Court 3, Court 4, Court 5" });
s20 = assignOfficials(s20, parseOfficials("Alex Morgan-Whitfield\nSam Lee\nJordan Price\nRiley Chen\nPat O'Neill\nDana Kowalczyk", s20.teams).officials).schedule;
docs.push({ name: "score-sheets-20-officials", html: scoreSheetsHtml(s20), sheets: s20.rounds.length });
const s10 = single(10);
docs.push({ name: "score-sheets-10", html: scoreSheetsHtml(s10), sheets: s10.rounds.length, sheetSel: ".sheet" });
docs.push({ name: "league-page-10", html: leaguePageHtml(s10) });
docs.push({ name: "print-pack-10", html: printPackHtml(s10, { league: "Elm Street Pickleball", season: "Autumn 2026", contact: "league@example.org", notes: "Arrive 10 minutes early\nBring both shirt colours" }), sheets: null });
const dspec = readDivisionsSpec(JSON.parse(await readFile(join(root, "example-divisions.json"), "utf8")));
const dsch = buildDivisions(dspec.spec ?? dspec);
docs.push({ name: "division-score-sheets", html: divisionsScoreSheetsHtml(dsch), sheets: dsch.nights.length, sheetSel: ".sheet" });
docs.push({ name: "division-team-sheets", html: divisionsTeamSheetsHtml(dsch, { contact: "league@example.org" }) });

// The two pages' own "Print" (window.print of the built page): served, filled in and built.
const types = { ".html": "text/html", ".mjs": "text/javascript", ".json": "application/json", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  try {
    const p = join(root, decodeURIComponent(req.url.split("?")[0]));
    res.writeHead(200, { "content-type": types[extname(p)] || "text/plain" }).end(await readFile(p));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;
docs.push({ name: "main-page-print", url: base + "index.html", fill: async (p) => {
  await p.fill("#teams", LONG.join("\n"));
  await p.fill("#start", "2026-10-06");
  await p.fill("#courts", "Court 1, Court 2, Court 3");
  await p.fill("#times", "18:00, 19:30");
  await p.check("#wd2");
  await p.click("#build");
  await p.waitForSelector("#report:not([hidden])");
}, hides: ["#make", "#build"] });
docs.push({ name: "divisions-page-print", url: base + "multi-division-league-schedule.html", fill: async (p) => {
  await p.click("#load-example");
  await p.waitForSelector("#report:not([hidden])");
}, hides: ["#build", "#load-example"] });

const browser = await chromium.launch();
const page = await browser.newPage();
for (const d of docs) {
  await page.emulateMedia({ media: "screen", colorScheme: "light" });
  await page.setViewportSize({ width: 1100, height: 900 });
  if (d.url) { await page.goto(d.url, { waitUntil: "load" }); await d.fill(page); }
  else await page.setContent(d.html, { waitUntil: "load" });
  await page.emulateMedia({ media: "print", colorScheme: "light" });
  if (d.hides) for (const sel of d.hides) {
    const shown = await page.$eval(sel, (el) => el.getClientRects().length > 0).catch(() => false);
    check(!shown, `${d.name}: ${sel} is not printed`);
  }
  for (const format of ["Letter", "A4"]) {
    // Printable width at the default 0.4 in margins, in CSS px.
    const widthIn = format === "Letter" ? 8.5 : 8.27;
    const printable = Math.floor((widthIn - 0.8) * 96);
    await page.setViewportSize({ width: printable, height: 1000 });
    const over = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const bad = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width && r.right > w + 1) bad.push(`${el.tagName.toLowerCase()}${el.className ? "." + el.className : ""} ${Math.round(r.right)}>${w}`);
      }
      // Short labels (a time, "Court 2", a date) must stay on one line.
      const wrapped = [];
      for (const td of document.querySelectorAll("td, th")) {
        const txt = td.textContent.trim();
        if (!txt || txt.length > 12 || td.closest("[hidden]")) continue;
        const rg = document.createRange();
        rg.selectNodeContents(td);
        const tops = new Set([...rg.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
        if (tops.size > 1) wrapped.push(txt + (td.closest("table")?.id ? ` in #${td.closest("table").id}` : ""));
      }
      // A column whose header has a name and whose every cell is empty is wasted paper.
      const empty = [];
      for (const t of document.querySelectorAll("table")) {
        const heads = [...t.querySelectorAll("thead th")];
        const rows = [...t.querySelectorAll("tbody tr")].filter((r) => !r.classList.contains("bye"));
        if (!rows.length) continue;
        let col = 0;
        for (const h of heads) {
          const span = Number(h.getAttribute("colspan") || 1);
          const name = h.getClientRects().length ? h.textContent.trim() : "";
          const blankBox = /score/i.test(name); // score boxes are meant to be written in
          if (name && !blankBox && rows.every((r) => !(r.children[col]?.textContent.trim()) && !r.children[col]?.hasAttribute("colspan"))) empty.push(name);
          col += span;
        }
      }
      const headings = [...document.querySelectorAll("h2, h3")].map((h) => h.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
      return { scroll: document.documentElement.scrollWidth, w, bad: bad.slice(0, 4), wrapped: [...new Set(wrapped)].slice(0, 6), empty: [...new Set(empty)], headings };
    });
    check(!over.wrapped.length, `${d.name} ${format}: short labels on one line${over.wrapped.length ? " (wrapped: " + over.wrapped.join(", ") + ")" : ""}`);
    if (format === "Letter") check(!over.empty.length, `${d.name}: no empty column${over.empty.length ? " (" + over.empty.join(", ") + ")" : ""}`);
    check(over.scroll <= over.w + 1 && !over.bad.length, `${d.name} ${format}: fits the printable width (${over.scroll} px of ${over.w})${over.bad.length ? " " + over.bad.join(", ") : ""}`);
    const pdf = await page.pdf({ format, printBackground: false });
    if (out) await writeFile(join(out, `${d.name}-${format}.pdf`), pdf);
    const pages = pagesText(pdf);
    if (!pages) { console.log(`     ${d.name} ${format}: pdftotext missing, page checks skipped`); continue; }
    const blank = pages.map((p, i) => (p.trim() ? -1 : i + 1)).filter((i) => i > 0);
    check(!blank.length, `${d.name} ${format}: ${pages.length} pages, no blank page${blank.length ? " (blank: " + blank.join(", ") + ")" : ""}`);
    // A heading left as the last line of a page, its table on the next one.
    const heads = new Set(over.headings);
    const orphans = [];
    pages.forEach((p, i) => {
      const lines = p.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
      const last = lines[lines.length - 1];
      if (i < pages.length - 1 && last && heads.has(last)) orphans.push(`p${i + 1} "${last}"`);
    });
    check(!orphans.length, `${d.name} ${format}: no heading stranded at the foot of a page${orphans.length ? " (" + orphans.join(", ") + ")" : ""}`);
    if (d.sheets) check(pages.length === d.sheets, `${d.name} ${format}: one sheet per page (${d.sheets} sheets, ${pages.length} pages)`);
  }
}
await browser.close();
server.close();
console.log(failed ? `${failed} failed` : "all print checks passed");
process.exit(failed ? 1 : 0);
