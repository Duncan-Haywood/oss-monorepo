// Scanned (image-only) bank statements, end to end: made-up statements in four
// common layouts are drawn as HTML in headless Chromium, photographed into a PNG at
// scan resolution, degraded the way a desk scanner or phone scan is (a small skew,
// noise, blur, JPEG compression), wrapped as an image-only PDF, and read back with
// `readStatementFile` (pdftoppm + tesseract, ocr.mjs) and the pasted-statement
// reader. Every row is compared with the statement it was drawn from.
//
//   node eval/scanned-statements.mjs [--n 40] [--seed 7] [--keep DIR] [--json] [--one-pass] [--no-repair] [--only 3,7 --debug]
//
// The statements are synthetic (seeded, made-up payees), so this measures the OCR
// route's wiring and its error rate on clean-ish typeset pages, not on any real
// bank's scan. Exit 0 with "skipped" when playwright, tesseract, pdftoppm or
// ImageMagick is missing.
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { readStatementFile } = await import(join(here, "..", "ocr.mjs"));
const { readStatement } = await import(join(here, "..", "bank.mjs"));

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg("--n", 40), SEED = +arg("--seed", 7), KEEP = arg("--keep", null), JSON_OUT = process.argv.includes("--json"), ONE_PASS = process.argv.includes("--one-pass");
const NO_REPAIR = process.argv.includes("--no-repair");
const ONLY = arg("--only", null)?.split(",").map(Number) ?? null, DEBUG = process.argv.includes("--debug");

for (const [cmd, a] of [["tesseract", ["--version"]], ["pdftoppm", ["-v"]], ["convert", ["-version"]]]) {
  if (spawnSync(cmd, a).error) { console.log(`skipped: ${cmd} not installed`); process.exit(0); }
}
let chromium;
for (const c of ["playwright", process.env.PLAYWRIGHT_PATH, "/opt/node-tools/node_modules/playwright", "playwright-core"].filter(Boolean).map((c) => (c.startsWith("/") && existsSync(c) && statSync(c).isDirectory() ? join(c, "index.mjs") : c))) {
  try { ({ chromium } = await import(c.startsWith("/") ? "file://" + c : c)); break; } catch {}
}
if (!chromium) { console.log("skipped: playwright not installed"); process.exit(0); }

// mulberry32
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const OUT_PAYEES = ["CORNER HARDWARE #112", "BLUE DOOR COFFEE", "CITY WATER UTIL", "ACME OFFICE SUPPLY", "NORTHSIDE FUEL 0447", "PRINT SHOP ON MAIN", "METRO TRANSIT", "WEBHOST MONTHLY", "PARCEL EXPRESS", "GREEN LEAF CATERING", "SUNRISE INSURANCE CO", "VALLEY PHONE SVC", "LAKESIDE RENT LLC", "TOOL DEPOT 2291", "CLOUD STORAGE PLAN", "DELI 44 MARKET", "PAYROLL SERVICE FEE", "CHECK 1043", "ATM WITHDRAWAL", "MONTHLY SERVICE FEE"];
const IN_PAYEES = ["DEPOSIT", "MOBILE DEPOSIT", "ACH CREDIT CLIENT PMT", "STRIPE TRANSFER", "SQUARE INC DEPOSIT", "ZELLE FROM J RIVERA", "WIRE IN HARBOR LTD", "INTEREST PAYMENT"];
const CARD_PAYEES = ["BLUE DOOR COFFEE", "AIRLINE TICKET 0042", "HOTEL HARBORVIEW", "OFFICE CHAIR STORE", "SOFTWARE ANNUAL", "TAXI 7781", "RESTAURANT PINE", "ONLINE ADS", "FUEL STOP 19", "BOOKSHOP ON 5TH"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const signed = (c) => (c < 0 ? "-" : "") + money(c);
const dollars = (c) => (c < 0 ? "-$" : "$") + money(c);
const money = (c) => (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function makeStatement(r, k) {
  const layout = ["columns", "sections", "card", "uk"][k % 4];
  const month = Math.floor(r() * 12), year = 2026;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const n = 8 + Math.floor(r() * 22);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const day = 1 + Math.floor(r() * days);
    const card = layout === "card";
    const inflow = card ? r() < 0.12 : r() < 0.3;
    const desc = card ? (inflow ? "PAYMENT THANK YOU" : CARD_PAYEES[Math.floor(r() * CARD_PAYEES.length)]) : inflow ? IN_PAYEES[Math.floor(r() * IN_PAYEES.length)] : OUT_PAYEES[Math.floor(r() * OUT_PAYEES.length)];
    const mag = Math.round((inflow ? 200 + r() * 6000 : 3 + r() * (r() < 0.2 ? 4000 : 300)) * 100);
    rows.push({ day, desc, cents: inflow ? mag : -mag });
  }
  rows.sort((a, b) => a.day - b.day);
  const date = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  for (const x of rows) x.date = date(x.day);
  const opening = Math.round((1000 + r() * 20000) * 100);
  let bal = opening;
  for (const x of rows) { bal += x.cents; x.balance = bal; }
  return { k, layout, month, year, days, rows, opening, closing: bal };
}

const CSS = `body{font-family:Arial,Helvetica,sans-serif;font-size:11px;margin:48px;color:#111}
h1{font-size:18px;margin:0 0 4px}table{border-collapse:collapse;width:100%}td,th{padding:3px 6px;text-align:left}
th{border-bottom:1px solid #444;font-size:10px;text-transform:uppercase}td.n,th.n{text-align:right}
.box{border:1px solid #888;padding:8px;margin:12px 0}h2{font-size:13px;margin:16px 0 4px;border-bottom:2px solid #333}`;

function html(s) {
  const per = `${MON[s.month]} 1, ${s.year} through ${MON[s.month]} ${s.days}, ${s.year}`;
  const md = (x) => `${String(s.month + 1).padStart(2, "0")}/${String(x.day).padStart(2, "0")}`;
  const head = `<h1>Riverbend Community Bank</h1><div>Business Checking &middot; Account ending 4417</div><div>Statement period: ${per}</div>`;
  if (s.layout === "columns") {
    const tr = s.rows.map((x) => `<tr><td>${md(x)}</td><td>${x.desc}</td><td class=n>${x.cents < 0 ? money(x.cents) : ""}</td><td class=n>${x.cents > 0 ? money(x.cents) : ""}</td><td class=n>${signed(x.balance)}</td></tr>`).join("");
    return `${head}<div class=box>Beginning balance ${signed(s.opening)} &nbsp; Ending balance ${signed(s.closing)}</div>
<table><tr><th>Date</th><th>Description</th><th class=n>Withdrawals</th><th class=n>Deposits</th><th class=n>Balance</th></tr>
<tr><td></td><td>Beginning Balance</td><td></td><td></td><td class=n>${signed(s.opening)}</td></tr>${tr}</table>`;
  }
  if (s.layout === "sections") {
    const sec = (rows) => rows.map((x) => `<tr><td>${md(x)}</td><td>${x.desc}</td><td class=n>$${money(x.cents)}</td></tr>`).join("");
    const ins = s.rows.filter((x) => x.cents > 0), outs = s.rows.filter((x) => x.cents < 0);
    return `${head}<div class=box><table><tr><td>Beginning Balance</td><td class=n>${dollars(s.opening)}</td></tr><tr><td>Ending Balance</td><td class=n>${dollars(s.closing)}</td></tr></table></div>
<h2>Deposits and Additions</h2><table><tr><th>Date</th><th>Description</th><th class=n>Amount</th></tr>${sec(ins)}</table>
<h2>Electronic Withdrawals</h2><table><tr><th>Date</th><th>Description</th><th class=n>Amount</th></tr>${sec(outs)}</table>`;
  }
  if (s.layout === "card") {
    const tr = s.rows.map((x) => `<tr><td>${md(x)}</td><td>${md({ day: Math.min(s.days, x.day + 1) })}</td><td>${x.desc}</td><td class=n>${x.cents > 0 ? "-" : ""}${money(x.cents)}</td></tr>`).join("");
    // half the card statements print a summary (owed is positive: new = previous + purchases - payments), half print none
    const owed = s.opening - s.rows.reduce((a, x) => a + x.cents, 0);
    const summary = s.k % 8 === 2 ? "" : `<div class=box><div>Previous Balance ${dollars(s.opening)}</div><div>New Balance ${dollars(owed)}</div></div>`;
    return `<h1>Summit Rewards Card</h1><div>Account ending 9031 &middot; Statement period: ${per}</div>${summary}
<table><tr><th>Trans</th><th>Post</th><th>Description</th><th class=n>Amount</th></tr>${tr}</table>`;
  }
  const tr = s.rows.map((x) => `<tr><td>${String(x.day).padStart(2, "0")} ${MON[s.month]}</td><td>${x.desc}</td><td class=n>${x.cents < 0 ? money(x.cents) : ""}</td><td class=n>${x.cents > 0 ? money(x.cents) : ""}</td><td class=n>${signed(x.balance)}</td></tr>`).join("");
  return `<h1>Harbour Mutual</h1><div>Business Current Account</div><div>Statement period: 1 ${MON[s.month]} ${s.year} to ${s.days} ${MON[s.month]} ${s.year}</div>
<table><tr><th>Date</th><th>Details</th><th class=n>Paid out</th><th class=n>Paid in</th><th class=n>Balance</th></tr>
<tr><td>01 ${MON[s.month]}</td><td>Balance brought forward</td><td></td><td></td><td class=n>${signed(s.opening)}</td></tr>${tr}</table>`;
}

const r = rng(SEED);
const work = KEEP ? (mkdirSync(KEEP, { recursive: true }), KEEP) : mkdtempSync(join(tmpdir(), "scanned-"));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 200 / 96 });
const sum = { secondPass: 0, secondKept: 0, statements: 0, rows: 0, found: 0, exact: 0, wrongAmount: 0, wrongSign: 0, wrongDate: 0, extra: 0, missing: 0, perfect: 0, flagged: 0, silentWrong: 0, byLayout: {} };
const details = [];
for (let k = 0; k < N; k++) {
  const s = makeStatement(r, k);
  const tilt = ((r() - 0.5) * 2.4).toFixed(2), noise = (0.1 + r() * 0.4).toFixed(2), blur = (0.3 + r() * 0.5).toFixed(2), q = 45 + Math.floor(r() * 40);
  if (ONLY && !ONLY.includes(k)) continue;
  await page.setContent(`<style>${CSS}</style>${html(s)}`);
  const png = join(work, `s${k}.png`), jpg = join(work, `s${k}.jpg`), pdf = join(work, `s${k}.pdf`);
  await page.screenshot({ path: png, fullPage: true });
  // a scan: grey, skewed, a little noise and blur, JPEG, then an image-only PDF at 200 dpi
  spawnSync("convert", [png, "-seed", String(SEED * 1000 + k), "-colorspace", "Gray", "-background", "white", "-rotate", tilt, "-attenuate", noise, "+noise", "Gaussian", "-blur", `0x${blur}`, "-quality", String(q), jpg]);
  spawnSync("convert", [jpg, "-density", "200", "-units", "PixelsPerInch", pdf]);
  let got, score = null;
  try {
    const { text, ocr } = readStatementFile(pdf, { dayFirst: s.layout === "uk", maxPasses: ONE_PASS ? 1 : 2 });
    score = ocr.score;
    if (ocr.passes > 1) sum.secondPass++;
    if (ocr.chose) sum.secondKept++;
    if (!ocr) throw new Error("expected the OCR route");
    got = readStatement(text, { dayFirst: s.layout === "uk", ocr: !NO_REPAIR });
  } catch (e) { got = { rows: [], problems: [String(e.message)] }; }
  const truth = s.rows.map((x) => ({ ...x }));
  const used = new Set();
  let ok = 0, wa = 0, ws = 0, wd = 0, miss = 0;
  for (const t of truth) {
    // pair by position among unused rows with the same date, else nearest unused
    let j = got.rows.findIndex((g, i) => !used.has(i) && g.date === t.date && Math.abs(g.cents) === Math.abs(t.cents));
    if (j < 0) j = got.rows.findIndex((g, i) => !used.has(i) && g.date === t.date && g.desc.slice(0, 6).toUpperCase() === t.desc.slice(0, 6));
    if (j < 0) j = got.rows.findIndex((g, i) => !used.has(i) && Math.abs(g.cents) === Math.abs(t.cents));
    if (j < 0) { miss++; continue; }
    used.add(j);
    const g = got.rows[j];
    const amtOk = Math.abs(g.cents) === Math.abs(t.cents), sgnOk = Math.sign(g.cents) === Math.sign(t.cents), dateOk = g.date === t.date;
    if (amtOk && sgnOk && dateOk) ok++;
    if (!amtOk) wa++; else if (!sgnOk) ws++;
    if (!dateOk) wd++;
  }
  const extra = got.rows.length - used.size;
  if (DEBUG) { console.error(`--- s${k} ${s.layout} score ${score}`); for (const t of truth) console.error(`truth ${t.date} ${t.cents} ${t.desc}`); for (const g of got.rows) console.error(`read  ${g.date} ${g.cents} ${g.desc}`); }
  const perfect = ok === truth.length && extra === 0;
  // would the reader have told the user? statementScore > 0: a running balance
  // that breaks, or the rows not adding up from opening to closing
  const flagged = score > 0 || got.rows.length === 0;
  sum.statements++; sum.rows += truth.length; sum.found += truth.length - miss; sum.exact += ok; sum.wrongAmount += wa; sum.wrongSign += ws; sum.wrongDate += wd; sum.extra += extra; sum.missing += miss; sum.perfect += perfect ? 1 : 0;
  if (!perfect && flagged) sum.flagged++;
  if (!perfect && !flagged) sum.silentWrong++;
  const L = (sum.byLayout[s.layout] ??= { statements: 0, rows: 0, exact: 0, perfect: 0 });
  L.statements++; L.rows += truth.length; L.exact += ok; L.perfect += perfect ? 1 : 0;
  details.push({ k, layout: s.layout, rows: truth.length, exact: ok, wrongAmount: wa, wrongSign: ws, wrongDate: wd, missing: miss, extra, flagged: !perfect && !!flagged, tilt: +tilt });
}
await browser.close();
if (!KEEP) rmSync(work, { recursive: true, force: true });
if (JSON_OUT) console.log(JSON.stringify({ seed: SEED, n: N, sum, details }, null, 1));
else {
  console.log(`${sum.statements} scanned statements (seed ${SEED}), ${sum.rows} rows`);
  console.log(`rows exact (date, amount, sign): ${sum.exact} of ${sum.rows} (${(100 * sum.exact / sum.rows).toFixed(1)}%)`);
  console.log(`wrong amount ${sum.wrongAmount}, wrong sign ${sum.wrongSign}, wrong date ${sum.wrongDate}, missing ${sum.missing}, extra ${sum.extra}`);
  console.log(`statements read perfectly: ${sum.perfect} of ${sum.statements}; imperfect but flagged by a balance check: ${sum.flagged}; imperfect and silent: ${sum.silentWrong}`);
  console.log(`second (--psm 4) reading run on ${sum.secondPass} statements, kept on ${sum.secondKept}`);
  for (const [l, v] of Object.entries(sum.byLayout)) console.log(`  ${l.padEnd(9)} ${v.exact}/${v.rows} rows exact, ${v.perfect}/${v.statements} statements perfect`);
}
