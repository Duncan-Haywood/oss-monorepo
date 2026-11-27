// Writes ../submittal-register-chrome.pdf: a GC's submittal register printed by Chromium, the way a
// project-management tool's "print" or "export to PDF" saves one: a title block, a header repeated
// on page 2, division heading rows, dates as MM/DD/YYYY and lead times in days or weeks.
// Run: NODE_PATH=$(npm root -g) node submittal-register-chrome.cjs <out.pdf> (needs Playwright's
// Chromium). The job and entries are made up.
const { chromium } = require("playwright");

const rows = [["", "<b>DIVISION 08 - OPENINGS</b>", "", "", "", ""]];
const types = ["Shop Drawings", "Product Data", "Samples"];
for (let i = 1; i <= 44; i++) {
  rows.push([
    `08 ${String(10 + i).padStart(2, "0")} 00`,
    `${String(i).padStart(3, "0")}`,
    `Openings item ${i} ${types[i % 3].toLowerCase()}`,
    types[i % 3],
    `12/${String(1 + (i % 27)).padStart(2, "0")}/2026`,
    i % 4 === 0 ? `${(i % 5) + 1} weeks` : `${10 + i}`,
  ]);
}
rows.push(["", "<b>DIVISION 09 - FINISHES</b>", "", "", "", ""]);
rows.push(["09 21 16", "025", "Gypsum board assemblies", "Product Data", "", "5 business days"]);
const html = `<!doctype html><html><head><style>
body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;margin:0}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #999;padding:3px 5px;text-align:left}
thead{display:table-header-group} tr{page-break-inside:avoid}
</style></head><body>
<h2>Submittal Register</h2>
<p>Project: Harbor Clinic TI &nbsp; Printed: 11/20/2026</p>
<table><thead><tr><th>Spec Section</th><th>Number</th><th>Title</th><th>Type</th><th>Required On-Site Date</th><th>Lead Time</th></tr></thead><tbody>
${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("\n")}
</tbody></table></body></html>`;

(async () => {
  const out = process.argv[2];
  if (!out) throw new Error("usage: node submittal-register-chrome.cjs <out.pdf>");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  await page.pdf({
    path: out,
    format: "Letter",
    margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
  });
  await browser.close();
})();
