// Writes ../sov-hrules-chrome.pdf: a schedule of values printed by Chromium (Skia) the way many
// estimating exports and "clean" spreadsheet styles look: a rule under each row and none between the
// columns, every cell top-aligned, and long descriptions that wrap onto a second or third line at the
// normal line height. Only the rules say which wrapped line belongs to which item: the gap between
// a description's lines is the same as the gap between two items.
// Run: NODE_PATH=$(npm root -g) node sov-hrules-chrome.cjs <out.pdf> (needs Playwright's Chromium).
// The figures are made up.
const { chromium } = require("playwright");

const fmt = (v) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const scopes = [
  "Mobilization",
  "Temporary power, lighting and distribution for the duration of the project, including removal at closeout",
  "Underground conduit",
  "Switchgear and main distribution panel, stored on site until the electrical room is dried in",
  "Branch wiring",
  "Lighting fixtures, controls and emergency battery units for levels 1 through 3, per the revised fixture schedule",
  "Fire alarm",
  "Low voltage rough-in",
];
const lines = [];
for (let i = 1; i <= 30; i++) {
  const desc = `${scopes[(i - 1) % scopes.length]}${i > 8 ? `, area ${Math.ceil(i / 8)}` : ""}`;
  const sched = 4000 + 1375.25 * i;
  const prev = i % 3 === 0 ? 0 : Math.round(sched * 0.5 * 100) / 100;
  const cur = Math.round(sched * 0.2 * 100) / 100;
  lines.push([String(i), desc, sched, prev, cur]);
}
const row = (l) =>
  `<tr><td>${l[0]}</td><td>${l[1]}</td>${l
    .slice(2)
    .map((v) => `<td class="n">${v ? fmt(v) : ""}</td>`)
    .join("")}</tr>`;
const html = `<!doctype html><html><head><style>
body{font-family:Arial,sans-serif;font-size:9pt;line-height:1.25;margin:0}
table{border-collapse:collapse;table-layout:fixed;width:100%}
th,td{border-bottom:0.75pt solid #000;padding:3px 4px;vertical-align:top;text-align:left}
td.n,th.n{text-align:right}
</style></head><body><h3>Schedule of Values</h3>
<table><colgroup><col style="width:6%"><col style="width:46%"><col><col><col></colgroup>
<thead><tr><th>Item</th><th>Description of work</th><th class="n">Scheduled value</th><th class="n">Previous</th><th class="n">This period</th></tr></thead>
<tbody>${lines.map(row).join("\n")}</tbody></table></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  await page.pdf({
    path: process.argv[2],
    format: "Letter",
    margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
  });
  await browser.close();
  const total = lines.reduce((a, l) => a + l[2], 0);
  console.log(`${lines.length} lines, scheduled value total ${fmt(total)}`);
})();
