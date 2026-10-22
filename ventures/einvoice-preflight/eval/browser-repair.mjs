// Click-through of the "Repair the arithmetic" button in headless Chromium.
// Run: PLAYWRIGHT_PATH=<path to playwright> node eval/browser-repair.mjs
// Skips (exit 0) when playwright is not installed.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

let chromium;
try { ({ chromium } = await import("playwright")); } catch {
  try { ({ chromium } = await import(process.env.PLAYWRIGHT_PATH || "playwright-core")); } catch { console.log("skipped: playwright not installed"); process.exit(0); }
}
const root = fileURLToPath(new URL("..", import.meta.url));
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json" };
const server = createServer((req, res) => {
  const file = join(root, decodeURIComponent(req.url.split("?")[0]).replace(/^\/$/, "/index.html"));
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://localhost:${server.address().port}/`);
await page.fill("#paste", JSON.stringify({
  invoice_number: "INV-1", issue_date: "2026-08-24", due_date: "2026-09-23", currency: "eur",
  supplier: { id: "DE123", name: "Supplier GmbH", vat_id: "DE136695976" }, customer: { id: "DE456", name: "Customer GmbH" },
  payment: { means: "30", iban: "DE89370400440532013000" },
  lines: [{ description: "Consulting", quantity: 2, unit_price: 100, tax_percent: 19, net: 150 }],
  totals: { net: 150, tax: 28, gross: 1 },
}));
await page.click("#repair");
await page.waitForSelector("#repairLog table");
const rows = await page.locator("#repairLog tbody tr").count();
const fixed = JSON.parse(await page.inputValue("#paste"));
await page.waitForFunction(() => document.getElementById("overall").textContent.trim() !== "No invoice checked yet.");
const overall = await page.textContent("#overall");
console.log({ rows, currency: fixed.currency, totals: fixed.totals, overall: overall.trim(), errors });
const ok0 = rows >= 4 && fixed.currency === "EUR" && fixed.totals.gross === 238 && errors.length === 0;

// UBL: break the gross total in the example file, repair it in the page.
const ubl = readFileSync(join(root, "examples/ubl-invoice.xml"), "utf8").replace(/(<cbc:TaxInclusiveAmount currencyID="EUR">)[^<]*/, "$1999.99");
await page.fill("#paste", ubl);
await page.click("#repair");
await page.waitForSelector("#repairLog table");
const uRows = await page.locator("#repairLog tbody tr").count();
const uXml = await page.inputValue("#paste");
console.log({ uRows, startsXml: uXml.trimStart().startsWith("<"), gross: /TaxInclusiveAmount[^>]*>([^<]*)/.exec(uXml)?.[1], errors });
const uOk = uRows >= 1 && uXml.includes("398.50") && !uXml.includes("999.99") && errors.length === 0;
// Pasted XML: a CII credit note with a wrong VAT amount is repaired in place.
await page.fill("#paste", readFileSync(join(root, "examples/xrechnung-cii-credit-note-with-defects.xml"), "utf8"));
await page.click("#repair");
await page.waitForFunction(() => /Repaired 1 value/.test(document.getElementById("repairLog").textContent));
const xmlNow = await page.inputValue("#paste");
const xmlOk = xmlNow.includes("<ram:CalculatedAmount>190.00</ram:CalculatedAmount>") && xmlNow.startsWith("<?xml");
console.log({ xmlOk });
const ok = xmlOk && ok0;
await browser.close(); server.close();
process.exit(ok && uOk ? 0 : 1);
