import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { auditCharges, auditTotals } from "./audit.mjs";
import { buildImportedRows, parseRateCard, readTable, suggestMapping } from "./import.mjs";

const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const page = readFileSync(new URL("./how-to-audit-a-whole-freight-invoice.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
const readme = readFileSync(new URL("./README.md", import.meta.url), "utf8");

function scriptsOf(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    const closer = new RegExp(`</${tag}\\s*>`, "i").exec(rest.slice(contentStart));
    if (!closer) return { scripts, unclosed: tag };
    if (tag === "script") scripts.push(rest.slice(contentStart, contentStart + closer.index));
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const { scripts, unclosed } = scriptsOf(index);
const source = scripts.join("\n");

test("every raw-text element on the new page is closed", () => {
  assert.equal(scriptsOf(page).unclosed, null);
  assert.equal(unclosed, null);
});

test("the index wires the import module it advertises", () => {
  assert.match(source, /from "\.\/import\.mjs"/);
  for (const name of ["readTable", "suggestMapping", "buildImportedRows", "parseRateCard", "importSummaryNote"]) {
    assert.match(source, new RegExp(name), `${name} is imported but never used`);
  }
  assert.match(source, /countUsage\("invoice_imported"\)/);
});

test("the import controls the page describes actually exist", () => {
  for (const id of ["file", "paste", "hasHeader", "mapping", "rateCard", "onlyRated", "importAdd", "importReplace", "importStatus"]) {
    assert.match(index, new RegExp(`id="${id}"`), `#${id} is missing from the page`);
  }
  assert.match(index, /type="file"/);
});

test("imported invoice text never reaches the DOM through innerHTML", () => {
  // Cell values come from a third party's export. Rendering them as markup
  // would turn a hostile filename or charge description into script in the
  // reader's page, so the import path uses textContent and new Option only.
  const importBlock = source.slice(source.indexOf("CSV import"));
  assert.ok(importBlock.length > 0, "the import block was not found");
  // Comments are stripped first: the block explains this rule in prose, and a
  // test that its own explanation satisfies would pass on the wrong evidence.
  const code = importBlock.replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(code, /innerHTML/);
  assert.match(code, /textContent/);
});

test("the file is read locally and the page says so", () => {
  assert.match(source, /FileReader/);
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|navigator\.sendBeacon/);
  assert.match(index, /never uploaded/i);
  assert.match(page, /never uploaded|no server/i);
});

test("index and sitemap link the new explainer", () => {
  assert.match(index, /how-to-audit-a-whole-freight-invoice\.html/);
  assert.match(sitemap, /how-to-audit-a-whole-freight-invoice\.html/);
  assert.match(readme, /how-to-audit-a-whole-freight-invoice\.html/);
});

test("the explainer links back and carries the disclaimers", () => {
  assert.match(page, /href="\.\/"/);
  assert.match(page, /No warranty/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("the explainer's published figures are recomputed from the code", () => {
  // A worked example is a claim about the tool's output. Recomputing it here
  // means the page cannot drift into quoting numbers the importer no longer
  // produces — the same guard the other pages in this venture use.
  const csvBlock = page.match(/Invoice Number,PRO Number,Charge Code,Charge Amount[\s\S]*?<\/pre>/);
  assert.ok(csvBlock, "the worked-example CSV block is missing from the page");
  const csv = csvBlock[0].replace(/<\/pre>[\s\S]*$/, "").trim();

  const rateBlock = page.match(/<pre>LIFT, 75[\s\S]*?<\/pre>/);
  assert.ok(rateBlock, "the worked-example rate card is missing from the page");
  const rateText = rateBlock[0].replace(/^<pre>/, "").replace(/<\/pre>$/, "");

  const table = readTable(csv);
  const { rates } = parseRateCard(rateText);
  const built = buildImportedRows(table, suggestMapping(table.header), { rates, onlyRatedCodes: true });
  const totals = auditTotals(auditCharges(built.rows));

  assert.equal(built.summary.readRows, 6);
  assert.equal(built.summary.imported, 4);
  assert.equal(built.summary.skipped, 2);
  assert.equal(totals.billed, 595);
  assert.equal(totals.recoverable, 325);
  assert.equal(totals.flagged, 3);

  assert.match(page, /4 accessorial lines totalling\s*\n?\s*\$595\.00/);
  assert.match(page, /\$325\.00 is above the rate card/);
  assert.match(page, /3 flagged lines/);

  // The per-line table on the page must match the audit row for row.
  const above = built.rows.map((row) => Number(row.billed) - Number(row.expected || 0));
  assert.deepEqual(above, [50, 50, 225, 0]);
});

test("the headline recoverable figure says which lines it excludes", () => {
  assert.match(index, /id="recoverableNote"/);
  assert.match(source, /totals\.unpriced/);
  assert.match(source, /no expected amount and/);
});

test("the index FAQ quotes the same worked-example figures", () => {
  const faq = index.match(/Can I check a whole carrier invoice at once\?[\s\S]{0,900}/);
  assert.ok(faq, "the import FAQ entry is missing");
  assert.match(faq[0], /\$595\.00/);
  assert.match(faq[0], /\$325\.00/);
});

test("the featureList claim about importing is backed by code", () => {
  const featureList = index.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList);
  assert.match(featureList[1], /CSV invoice import with column mapping and a contract rate card/);
  assert.match(source, /buildImportedRows/);
  assert.match(source, /parseRateCard/);
});

test("the rate card shipped in the page parses to the codes it shows", () => {
  const shipped = index.match(/<textarea id="rateCard"[^>]*>([\s\S]*?)<\/textarea>/);
  assert.ok(shipped, "the default rate card is missing");
  const { rates, issues } = parseRateCard(shipped[1]);
  assert.deepEqual(issues, [], "the shipped default rate card must parse cleanly");
  assert.equal(rates.get("LIFT"), 75);
  assert.equal(rates.get("DET"), 75);
  assert.equal(rates.get("RESI"), 45);
});

test("the shipped placeholder in the paste box is a row the parser understands", () => {
  const placeholder = index.match(/id="paste"[^>]*placeholder="([^"]+)"/);
  assert.ok(placeholder, "the paste box has no placeholder example");
  const text = placeholder[1].replaceAll("&#10;", "\n");
  const table = readTable(text);
  const mapping = suggestMapping(table.header);
  assert.equal(mapping.billed != null, true, "the example's amount column must be recognised");
  const built = buildImportedRows(table, mapping);
  assert.equal(built.rows.length, 1);
  assert.equal(built.rows[0].billed, "125.00");
});
