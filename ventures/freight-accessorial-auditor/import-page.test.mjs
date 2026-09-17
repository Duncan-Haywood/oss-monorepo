import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { auditCharges, auditTotals } from "./audit.mjs";
import { buildImportedRows, parseRateCard, priceEnteredRows, readTable, suggestMapping } from "./import.mjs";

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
  assert.match(source, /no expected amount/);
  // A line whose evidence supports the billed condition is excluded from the
  // same headline figure, not only an unpriced one — see audit.mjs's
  // `recoverable` fix: evidence that supports a charge already reconciles
  // it, so it must not still read as an outstanding overage.
  assert.match(source, /totals\.supported/);
  assert.match(source, /supported by evidence/);
});

test("the demo the page ships and the figures it quotes for it agree", () => {
  // The demo table is the first thing a visitor audits, so the FAQ's numbers
  // for it are a claim about the tool's output like any other worked example.
  // Both are recomputed here from the rate card and rows the page actually
  // ships, so neither can drift away from the code or from each other.
  const shipped = index.match(/<textarea id="rateCard"[^>]*>([\s\S]*?)<\/textarea>/);
  const { rates } = parseRateCard(shipped[1]);

  const seeded = [...source.matchAll(/^\s*add\(\{([^}]*)\}\);/gm)].map((match) =>
    Object.fromEntries(
      [...match[1].matchAll(/(\w+):\s*"([^"]*)"/g)].map(([, key, value]) => [key, value]),
    ),
  );
  assert.equal(seeded.length, 4, "the demo rows could not be read out of the page");

  const priced = priceEnteredRows(seeded, rates);
  const detention = priced.find((row) => row.code === "DET");
  assert.ok(detention, "the demo no longer shows a per-unit line");
  // Typed by nobody: the card priced it from the quantity alone.
  assert.equal(detention.expected, "195.00");
  assert.equal(detention.basis, "3 hours past 2 free × $65.00/hour");

  const totals = auditTotals(auditCharges(priced));
  assert.equal(totals.recoverable, 205);
  assert.equal(totals.flagged, 4);
  assert.equal(totals.actionable, 3);
  assert.equal(totals.unpriced, 0);

  const faq = index.match(/How do I audit freight accessorial charges\?[\s\S]{0,900}/);
  assert.ok(faq, "the demo FAQ entry is missing");
  assert.match(faq[0], /\$205\.00 above expected across 4 flagged of 4 lines, 3 actionable/);
  assert.match(faq[0], /rates it at \$195\.00/);
});

test("the entered table is priced by the rate card, not only the import", () => {
  assert.match(source, /priceEnteredRows/, "render must apply the card to typed rows");
  // The card is now an input to the entered table too, so editing it has to
  // re-render that table and not just the import preview.
  const listener = source.match(/getElementById\("rateCard"\)\.addEventListener\([\s\S]{0,220}/);
  assert.ok(listener, "the rate card has no input listener");
  assert.match(listener[0], /render\(/);
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
  assert.equal(rates.get("LIFT").amount, 75);
  assert.equal(rates.get("LIFT").per, null);
  assert.equal(rates.get("RESI").amount, 45);
  // The default card demonstrates the per-unit grammar, because a shipper who
  // never sees it will keep leaving detention — the accessorial most worth
  // auditing — with no expected amount at all.
  const detention = rates.get("DET");
  assert.equal(detention.per, "hour");
  assert.equal(detention.amount, 65);
  assert.equal(detention.free, 2);
  assert.equal(detention.max, 325);
});

test("the shipped placeholder in the paste box is a row the parser understands", () => {
  const placeholder = index.match(/id="paste"[^>]*placeholder="([^"]+)"/);
  assert.ok(placeholder, "the paste box has no placeholder example");
  const text = placeholder[1].replaceAll("&#10;", "\n");
  const table = readTable(text);
  const mapping = suggestMapping(table.header);
  assert.equal(mapping.billed != null, true, "the example's amount column must be recognised");
  assert.equal(mapping.units != null, true, "the example's quantity column must be recognised");
  const shipped = index.match(/<textarea id="rateCard"[^>]*>([\s\S]*?)<\/textarea>/);
  const { rates } = parseRateCard(shipped[1]);
  const built = buildImportedRows(table, mapping, { rates });
  assert.equal(built.rows.length, 2);
  assert.equal(built.rows[0].billed, "125.00");
  // 3 hours on dock, 2 free, $65/hour — the placeholder and the default rate
  // card are one worked example, so a visitor who pastes what they are shown
  // immediately sees a priced overage rather than a blank expected column.
  assert.equal(built.rows[1].expected, "65.00");
  assert.match(built.rows[1].basis, /1 hour past 2 free × \$65\.00\/hour/);
});

test("the page carries the quantity and basis through the queue without a build step", () => {
  // The queue is rebuilt from the DOM on every keystroke, so anything the
  // importer computed has to live in the row or it is lost the moment the
  // user edits a cell. The quantity is an editable column now that the card
  // prices typed rows too — a shipper has to be able to correct it — while
  // the basis stays carried rather than edited.
  assert.match(index, /<th>Qty \/ hrs<\/th>/);
  assert.match(source, /for \(const key of \["invoice", "reference", "code", "billed", "units", "expected"\]\)/);
  assert.match(source, /carried\.dataset\.key = "basis"/);
  assert.match(source, /carried\.type = "hidden"/);
  assert.match(source, /tr\.cells\[0\]\.append\(carried\)/);
  // Cleared when the expected amount is typed over: a cited contract term
  // must not survive the figure it explains.
  assert.match(source, /input\[data-key="basis"\]/);
  assert.match(source, /Expected from \$\{row\.basis\}/);
  assert.match(source, /per_unit_rule_priced/);
});

test("the page explains the per-unit grammar it now accepts", () => {
  assert.match(index, /DET 65\/hr after 2 hours, max 325/);
  assert.match(index, /REWEIGH 4\.50\/cwt min 45/);
  assert.match(index, /hour, minute, day, cwt, pallet, piece, mile, stop, and unit/);
  // The rate-card status reads per-unit rules back so a shipper can see the
  // allowance was understood as an allowance.
  assert.match(source, /per-unit rule/);
  // The status names both places a quantity can come from, now that the card
  // prices typed lines as well as imported ones.
  assert.match(source, /These need a quantity — map the column on an import, or fill the Qty \/ hrs cell/);
});

test("the explainer's per-unit worked example is recomputed, not asserted", () => {
  // Same guard as the flat worked example above: the page states figures, so
  // the figures have to come back out of the code that produces them.
  const ruleBlock = page.match(/<pre>DET 65\/hr after 2 hours, max 325[\s\S]*?<\/pre>/);
  assert.ok(ruleBlock, "the per-unit rate-card block is missing from the page");
  const { rates, issues } = parseRateCard(
    ruleBlock[0].replace(/^<pre>/, "").replace(/<\/pre>$/, ""),
  );
  assert.deepEqual(issues, [], "every rule the page shows must parse cleanly");

  const csv = ["Invoice,Code,Charge Amount,Detention Hours", "INV-4471,DET,300.00,5"].join("\n");
  const table = readTable(csv);
  const built = buildImportedRows(table, suggestMapping(table.header), { rates });
  const [line] = auditCharges(built.rows);

  assert.equal(line.expected, 195);
  assert.equal(line.variance, 105);
  assert.equal(line.basis, "3 hours past 2 free × $65.00/hour");
  for (const figure of ["$300.00", "5 hours", "$195.00", "$105.00", "3 hours past 2 free × $65.00/hour"]) {
    assert.ok(page.includes(figure), `the page is missing ${figure}`);
  }
  assert.match(page, /hour, minute, day, cwt, pallet, piece, mile, stop, and\s*\n?\s*unit/);
  // The page promises a blank expected amount, not a zero, when the quantity
  // is missing. Check the promise against the importer.
  const noQuantity = buildImportedRows(
    readTable(["Invoice,Code,Charge Amount", "INV-4471,DET,300.00"].join("\n")),
    suggestMapping(["Invoice", "Code", "Charge Amount"]),
    { rates },
  );
  assert.equal(noQuantity.rows[0].expected, "");
});

// The page opens with an empty file picker, an empty paste box, a mapping UI
// and a rate card -- a lot of apparatus with nothing to apply it to. The
// placeholder text in the textarea looks like a sample but cannot be run, so
// until this button existed nobody could see the auditor work without first
// producing a carrier invoice. Pinned to the findings it is meant to show: a
// fixture that quietly stopped flagging would leave the demo claiming less
// than the tool does.
test("the worked example runs through the real importer and produces the findings it advertises", () => {
  assert.match(index, /id="loadExample"/);
  assert.match(index, /Load a worked example/);

  const match = index.match(/const example = \[([\s\S]*?)\]\.join\("\\n"\);/);
  assert.ok(match, "index.html must carry the inline worked-example rows");
  const csv = match[1]
    .split("\n")
    .map((line) => line.trim().replace(/^"|",?$/g, ""))
    .filter(Boolean)
    .join("\n");

  const table = readTable(csv, { hasHeader: true });
  const built = buildImportedRows(table, suggestMapping(table.header), {});
  assert.equal(built.rows.length, 5, "the example should import five accessorial lines");

  const results = auditCharges(built.rows);
  const flagged = results.filter((row) => row.flags.length);
  const allFlags = flagged.flatMap((row) => row.flags);

  assert.ok(allFlags.some((f) => /Over expected by/.test(f)), "needs a line billed above the contracted amount");
  assert.ok(allFlags.includes("Possible duplicate"), "needs a line billed twice on the same PRO");
  assert.ok(results.some((row) => !row.flags.length), "needs a line that is billed correctly and stays quiet");

  const totals = auditTotals(results);
  assert.ok(totals.billed > totals.expected, "the example should show a real overage against expected");
});
