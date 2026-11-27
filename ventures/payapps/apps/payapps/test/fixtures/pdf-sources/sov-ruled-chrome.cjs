// Writes ../sov-ruled-chrome.pdf: a dense continuation sheet printed by Chromium (Skia) with every cell
// bordered, the description column too narrow for its text (cut off at the border, `overflow: hidden`)
// and amounts that fill their cells. Chromium paints each cell's border as its own thin rectangle and
// clips the cut-off text with a clip path, leaving the hidden glyphs in the content stream.
// Run: NODE_PATH=$(npm root -g) node sov-ruled-chrome.cjs <out.pdf> (needs Playwright's Chromium).
// The figures are made up.
const { chromium } = require("playwright");

const fmt = (v) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lines = [];
for (let i = 1; i <= 24; i++) {
  const sched = 1000000 + 37311.5 * i;
  const prev = i % 4 === 0 ? 0 : Math.round(sched * 0.4 * 100) / 100;
  const cur = Math.round(sched * 0.1 * 100) / 100;
  const desc = `Scope ${i} ${i % 3 ? "framing and drywall" : "metal studs, level 2 east wing"}`;
  lines.push([String(i), desc, sched, prev, cur, Math.round((prev + cur) * 100) / 100]);
}
const row = (l) =>
  `<tr><td>${l[0]}</td><td>${l[1]}</td>${l
    .slice(2)
    .map((v) => `<td class="n">${v ? fmt(v) : ""}</td>`)
    .join("")}</tr>`;
const html = `<!doctype html><html><head><style>
body{font-family:Arial,sans-serif;font-size:7pt;margin:0}
table{border-collapse:collapse;table-layout:fixed;width:100%}
th,td{border:0.5pt solid #000;padding:2px 3px;overflow:hidden;white-space:nowrap} th{white-space:normal}
td.n{text-align:right}
</style></head><body><h3>Schedule of Values</h3>
<table><colgroup><col style="width:5%"><col style="width:28%"><col><col><col><col></colgroup>
<thead><tr><th>Item</th><th>Description of work</th><th>Scheduled value</th><th>Previous</th><th>This period</th><th>Completed to date</th></tr></thead>
<tbody>${lines.map(row).join("\n")}</tbody></table></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  await page.pdf({
    path: process.argv[2],
    format: "Letter",
    margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "4.2in" },
  });
  await browser.close();
  const total = lines.reduce((a, l) => a + l[2], 0);
  console.log(`${lines.length} lines, scheduled value total ${fmt(total)}`);
})();
