// Writes ../spec-sections-chrome.pdf: two specification sections in the usual three-part layout
// (PART 1 GENERAL, its SUBMITTALS articles, PART 2 PRODUCTS), printed by Chromium with a running
// footer ("GYPSUM BOARD ASSEMBLIES 09 21 16 - 2") on each page, the way an architect's project
// manual reaches a subcontractor. Plus 01 33 00, the procedures section, which lists nothing.
// Run: NODE_PATH=$(npm root -g) node spec-sections-chrome.cjs <out.pdf> (needs Playwright's
// Chromium). The wording is written for this fixture, not copied from a master specification.
const { chromium } = require("playwright");

const section = (num, title, articles) => `
<section>
<h1>SECTION ${num} - ${title}</h1>
<h2>PART 1 - GENERAL</h2>
${articles}
<h2>PART 2 - PRODUCTS</h2>
<h3>2.1 MATERIALS</h3>
<p class="p">A. Provide materials from one source for each type of product.</p>
${'<p class="p">B. Filler paragraph so the section runs over a page break and its footer repeats.</p>'.repeat(14)}
<p class="end">END OF SECTION ${num}</p>
</section>`;

const html = `<!doctype html><html><head><style>
body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;margin:0}
h1{font-size:11pt} h2,h3{font-size:10pt;margin:10px 0 4px}
p{margin:3px 0} .p{margin-left:24px} .s{margin-left:48px}
section{page-break-after:always}
</style></head><body>
${section(
  "01 33 00",
  "SUBMITTAL PROCEDURES",
  `
<h3>1.1 SUBMITTALS</h3>
<p class="p">A. Submit each item under a transmittal with the specification section number.</p>
<p class="p">B. Shop Drawings: Prepare for this project; show dimensions taken in the field.</p>`,
)}
${section(
  "09 21 16",
  "GYPSUM BOARD ASSEMBLIES",
  `
<h3>1.1 SUMMARY</h3>
<p class="p">A. Section includes interior gypsum board on metal framing.</p>
<h3>1.2 ACTION SUBMITTALS</h3>
<p class="p">A. Product Data: For each type of product.</p>
<p class="p">B. Shop Drawings: Show locations of control joints and reveals.</p>
<p class="s">1. Include partition types, heights and head-of-wall details.</p>
<p class="p">C. Samples: For each textured finish, 12 inches square.</p>
<h3>1.3 INFORMATIONAL SUBMITTALS</h3>
<p class="p">A. Product Test Reports: For each assembly with a fire-resistance rating, from a qualified testing agency.</p>
<h3>1.4 QUALITY ASSURANCE</h3>
<p class="p">A. Mockups: Build a mockup of each level of finish before final installation.</p>`,
)}
${section(
  "23 31 13",
  "METAL DUCTS",
  `
<h3>1.1 SUBMITTALS</h3>
<p class="p">A. Submit the following in accordance with Section 01 33 00.</p>
<p class="p">B. Product Data: Sealants and duct liner.</p>
<p class="p">C. Shop Drawings: Fabrication, assembly and installation, at 1/4 inch = 1 foot, including</p>
<p class="p">duct layout drawn with the other trades. </p>
<p class="p">D. Welding certificates.</p>
<p class="p">E. Operation and Maintenance Data: For volume dampers.</p>
<p class="p">F. Warranty: Sample of the special warranty.</p>`,
)}
</body></html>`;

(async () => {
  const out = process.argv[2];
  if (!out) throw new Error("usage: node spec-sections-chrome.cjs <out.pdf>");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  // The running footer: the section title and number with the page within the section is what a
  // project manual prints; a page-wide footer is as close as Chromium gets (the number pattern is what matters).
  await page.pdf({
    path: out,
    format: "Letter",
    margin: { top: "0.75in", bottom: "0.75in", left: "0.75in", right: "0.75in" },
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate:
      '<div style="font-size:8pt;width:100%;text-align:center;font-family:Arial">PROJECT MANUAL 09 21 16 - <span class="pageNumber"></span></div>',
  });
  await browser.close();
})();
