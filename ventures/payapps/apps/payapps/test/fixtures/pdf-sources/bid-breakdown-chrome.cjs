// Writes ../bid-breakdown-chrome.pdf: a two-page bid breakdown printed by Chromium (Skia), the way
// a GC's or estimator's web tool saves one. Run: NODE_PATH=$(npm root -g) node bid-breakdown-chrome.cjs <out.pdf>
// (needs Playwright's Chromium). The figures are made up.
const { chromium } = require("playwright");

const scopes = ["feeders", "branch circuits", "lighting", "fire alarm", "low voltage"];
const lines = [
  ["01 10 00", "Mobilization, bonds and insurance", 18500],
  [
    "01 50 00",
    "Temporary power and lighting for the duration of the project, including removal",
    9200,
  ],
];
for (let i = 1; i <= 46; i++)
  lines.push([
    `26 ${String(i).padStart(2, "0")} 00`,
    `Electrical scope item ${i} (${scopes[i % 5]})`,
    1000 * i + 250.5 * (i % 3),
  ]);
const total = lines.reduce((a, l) => a + l[2], 0);
const fmt = (v) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const row = (l) =>
  `<tr><td>${l[0]}</td><td class="desc">${l[1]}</td><td class="amt"><span class="d">$</span>${fmt(l[2])}</td></tr>`;
const html = `<!doctype html><html><head><style>
body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;margin:0}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #999;padding:3px 6px}
td.amt{text-align:right;white-space:nowrap} td.amt span.d{float:left} td.desc{width:55%}
thead{display:table-header-group} tr{page-break-inside:avoid}
</style></head><body>
<h2>Riverside Clinic — Electrical Bid Breakdown</h2>
<p>Subcontractor: Example Electric LLC &nbsp; Date: 11/20/2026</p>
<table><thead><tr><th>Cost Code</th><th>Description</th><th>Bid Amount</th></tr></thead><tbody>
<tr><td></td><td><b>Division 01 General requirements</b></td><td></td></tr>
${lines.slice(0, 2).map(row).join("\n")}
<tr><td></td><td><b>Division 26 Electrical</b></td><td></td></tr>
${lines.slice(2).map(row).join("\n")}
<tr><td></td><td><b>Total Bid</b></td><td class="amt"><span class="d">$</span>${fmt(total)}</td></tr>
</tbody></table></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  await page.pdf({
    path: process.argv[2],
    format: "Letter",
    margin: { top: "0.5in", bottom: "0.6in", left: "0.5in", right: "0.5in" },
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate:
      '<div style="font-size:8pt;width:100%;text-align:center">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
  });
  await browser.close();
})();
