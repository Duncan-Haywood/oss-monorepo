// Writes ../submittal-stamp-chrome.pdf: a returned shop drawing page printed by Chromium (Skia), the
// way a reviewer's stamp looks once it is flattened into the page: a product-data page whose notes
// say "approved equal" (which is not a stamp), and in the corner the architect's stamp listing every
// choice with a box, the chosen one ticked (☒), and the reviewer's initials and date.
// Run: NODE_PATH=$(npm root -g) node submittal-stamp-chrome.cjs <out.pdf> (needs Playwright's Chromium).
// The firm, job and dates are made up.
const { chromium } = require("playwright");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body { font-family: Helvetica, Arial, sans-serif; font-size: 11px; margin: 36px; }
h1 { font-size: 18px; }
.stamp { position: absolute; right: 40px; top: 40px; border: 3px solid #b00; color: #b00; padding: 8px 12px; width: 230px; }
.stamp b { display: block; font-size: 12px; margin-bottom: 4px; }
.stamp div { margin: 2px 0; }
</style></head><body>
<h1>Submittal 7 - Gypsum board assemblies</h1>
<p>Section 09 21 16. Product data: 5/8" Type X gypsum board, ASTM C1396.</p>
<p>Note: the contractor may use an approved equal where the schedule allows.</p>
<p>Issued 11/02/2026 for review.</p>
<div class="stamp">
  <b>SHOP DRAWING REVIEW</b>
  <div>☐ NO EXCEPTIONS TAKEN</div>
  <div>☒ MAKE CORRECTIONS NOTED</div>
  <div>☐ REVISE AND RESUBMIT</div>
  <div>☐ REJECTED</div>
  <div>Review is for general conformance with the design concept only.</div>
  <div>BY: JS &nbsp;&nbsp; DATE: 11/20/2026</div>
</div>
</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  await page.pdf({ path: process.argv[2], format: "Letter" });
  await browser.close();
})();
