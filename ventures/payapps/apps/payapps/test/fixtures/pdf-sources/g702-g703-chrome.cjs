// Writes ../g702-g703-chrome.pdf: a two-page application for payment printed by Chromium (Skia), the way a
// contractor's web tool or a "print to PDF" of a G702-style form saves one. Page 1 is the summary laid out like the
// AIA form: the contractor's lines 1 to 8 on the left with leader dots, a rate typed into the 5a and 5b blanks, "$"
// at the cell's left edge, and the architect's certificate on the right with its own amount on line 6's baseline.
// Page 2 is the continuation sheet. Stored materials on line 3 make 5a differ from the retainage column.
// Run: NODE_PATH=$(npm root -g) node g702-g703-chrome.cjs <out.pdf> (needs Playwright's Chromium). Figures made up.
const { chromium } = require("playwright");

const fmt = (v) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// item, description, scheduled (C), previous (D), this period (E), stored (F)
const lines = [
  ["1", "Mobilization", 12500, 12500, 0, 0],
  ["2", "Underground conduit", 48250.75, 30000, 8000, 0],
  ["3", "Switchgear", 96000, 20000, 10000, 44500],
  ["4", "Branch wiring", 73400, 10000, 4625.25, 0],
  ["CO-1", "Added EV chargers", 18900, 0, 0, 0],
];
const cents = (v) => Math.round(v * 100);
const rows = lines.map(([item, desc, c, d, e, f]) => {
  const g = cents(d) + cents(e) + cents(f);
  const ret = Math.round(g / 10);
  return { item, desc, c: cents(c), d: cents(d), e: cents(e), f: cents(f), g, ret };
});
const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
const usd = (c) => fmt(c / 100);
const work = rows.reduce((a, r) => a + Math.round((r.d + r.e) / 10), 0);
const stored = rows.reduce((a, r) => a + Math.round(r.f / 10), 0);
const original = rows.filter((r) => !r.item.startsWith("CO")).reduce((a, r) => a + r.c, 0);
const co = sum("c") - original;
const line4 = sum("g");
const line5 = sum("ret");
const line6 = line4 - line5;
const line7 = 9_800_000;
const line8 = line6 - line7;
if (work + stored !== line5) throw new Error("5a + 5b should be the retainage column");

const amt = (c) => `<td class="amt"><span class="d">$</span>${usd(c)}</td>`;
const lead = (label) => `<td class="lbl"><span>${label}</span></td>`;
const g702 = `
<h2>APPLICATION AND CERTIFICATE FOR PAYMENT</h2>
<table class="head"><tr><td>TO OWNER: Riverside Clinic LLC</td><td>APPLICATION NO: 7</td></tr>
<tr><td>FROM CONTRACTOR: Example Electric LLC</td><td>PERIOD TO: 10/31/2026</td></tr></table>
<table class="g702">
<tr>${lead("1. ORIGINAL CONTRACT SUM")}${amt(original)}<td class="gap"></td><td class="arch" rowspan="3">In accordance with the Contract Documents, based on on-site observations and the data comprising this application, the Architect certifies to the Owner that the Work has progressed as indicated.</td><td></td></tr>
<tr>${lead("2. Net change by Change Orders")}${amt(co)}<td class="gap"></td><td></td></tr>
<tr>${lead("3. CONTRACT SUM TO DATE (Line 1 ± 2)")}${amt(sum("c"))}<td class="gap"></td><td></td></tr>
<tr>${lead("4. TOTAL COMPLETED &amp; STORED TO DATE (Column G on G703)")}${amt(line4)}<td class="gap"></td><td></td><td></td></tr>
<tr><td class="lbl">5. RETAINAGE:</td><td></td><td class="gap"></td><td></td><td></td></tr>
<tr><td class="lbl sub">a. <u>&nbsp;10&nbsp;</u> % of Completed Work (Columns D + E on G703)</td>${amt(work)}<td class="gap"></td><td></td><td></td></tr>
<tr><td class="lbl sub">b. <u>&nbsp;10&nbsp;</u> % of Stored Material (Column F on G703)</td>${amt(stored)}<td class="gap"></td><td></td><td></td></tr>
<tr>${lead("Total Retainage (Lines 5a + 5b or Total in Column I of G703)")}${amt(line5)}<td class="gap"></td><td></td><td></td></tr>
<tr>${lead("6. TOTAL EARNED LESS RETAINAGE (Line 4 Less Line 5 Total)")}${amt(line6)}<td class="gap"></td>${lead("AMOUNT CERTIFIED")}${amt(line8)}</tr>
<tr>${lead("7. LESS PREVIOUS CERTIFICATES FOR PAYMENT")}${amt(line7)}<td class="gap"></td><td></td><td></td></tr>
<tr>${lead("8. CURRENT PAYMENT DUE")}${amt(line8)}<td class="gap"></td><td></td><td></td></tr>
<tr>${lead("9. BALANCE TO FINISH, INCLUDING RETAINAGE (Line 3 less Line 6)")}${amt(sum("c") - line6)}<td class="gap"></td><td></td><td></td></tr>
</table>`;
const g703 = `
<h2 class="break">CONTINUATION SHEET</h2>
<table class="head"><tr><td>APPLICATION NO: 7</td><td>PERIOD TO: 10/31/2026</td></tr></table>
<table class="g703"><thead><tr><th>A<br>Item No.</th><th>B<br>Description of Work</th><th>C<br>Scheduled Value</th>
<th>D<br>From Previous Application (D + E)</th><th>E<br>This Period</th><th>F<br>Materials Presently Stored (Not in D or E)</th>
<th>G<br>Total Completed and Stored to Date (D + E + F)</th><th>H<br>% (G ÷ C)</th><th>I<br>Balance to Finish (C − G)</th><th>J<br>Retainage</th></tr></thead><tbody>
${rows
  .map(
    (r) =>
      `<tr><td>${r.item}</td><td>${r.desc}</td><td class="n">${usd(r.c)}</td><td class="n">${usd(r.d)}</td><td class="n">${usd(r.e)}</td><td class="n">${usd(r.f)}</td><td class="n">${usd(r.g)}</td><td class="n">${r.c ? ((100 * r.g) / r.c).toFixed(1) : "0.0"}%</td><td class="n">${usd(r.c - r.g)}</td><td class="n">${usd(r.ret)}</td></tr>`,
  )
  .join("\n")}
<tr><td></td><td>GRAND TOTAL</td><td class="n">${usd(sum("c"))}</td><td class="n">${usd(sum("d"))}</td><td class="n">${usd(sum("e"))}</td><td class="n">${usd(sum("f"))}</td><td class="n">${usd(line4)}</td><td class="n">${((100 * line4) / sum("c")).toFixed(1)}%</td><td class="n">${usd(sum("c") - line4)}</td><td class="n">${usd(line5)}</td></tr>
</tbody></table>`;
const html = `<!doctype html><html><head><style>
body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;margin:0}
table{border-collapse:collapse;width:100%;margin-bottom:12px}
.g702 td{padding:3px 4px;vertical-align:bottom}
td.lbl{width:46%;overflow:hidden;white-space:nowrap}
td.lbl span::after{content:" . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . ."}
td.sub{padding-left:18px}
td.amt{width:14%;text-align:right;white-space:nowrap;border-bottom:1px solid #999}
td.amt span.d{float:left}
td.gap{width:4%} td.arch{font-size:8pt;width:36%}
.g703 th,.g703 td{border:1px solid #999;padding:2px 4px;font-size:8pt}
.g703 td.n{text-align:right;white-space:nowrap}
.break{page-break-before:always}
</style></head><body>${g702}${g703}</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  await page.pdf({
    path: process.argv[2],
    format: "Letter",
    landscape: true,
    margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
  });
  await browser.close();
  console.log(JSON.stringify({ original, co, line4, work, stored, line5, line6, line7, line8 }));
})();
