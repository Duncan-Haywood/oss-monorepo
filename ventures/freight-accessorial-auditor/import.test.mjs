import assert from "node:assert/strict";
import test from "node:test";

import { auditCharges, auditTotals } from "./audit.mjs";
import {
  buildImportedRows,
  detectDelimiter,
  expectedFor,
  importSummaryNote,
  parseMoney,
  parseQuantity,
  parseRateCard,
  priceEnteredRows,
  readTable,
  suggestMapping,
} from "./import.mjs";

test("parses a quoted CSV with commas, doubled quotes and CRLF", () => {
  const text = 'Invoice,Description,Amount\r\n"INV-1","Liftgate, residential","$1,250.00"\r\n"INV-2","He said ""urgent""","75.00"\r\n';
  const table = readTable(text);
  assert.deepEqual(table.header, ["Invoice", "Description", "Amount"]);
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.rows[0], ["INV-1", "Liftgate, residential", "$1,250.00"]);
  assert.equal(table.rows[1][1], 'He said "urgent"');
});

test("a quoted field may contain a newline without splitting the row", () => {
  const text = 'Invoice,Note,Amount\nINV-1,"line one\nline two",50\n';
  const table = readTable(text);
  assert.equal(table.rows.length, 1);
  assert.equal(table.rows[0][1], "line one\nline two");
  assert.equal(table.rows[0][2], "50");
});

test("a file with no trailing newline keeps its last row and gains no empty one", () => {
  const withNewline = readTable("A,B\n1,2\n");
  const withoutNewline = readTable("A,B\n1,2");
  assert.deepEqual(withNewline.rows, withoutNewline.rows);
  assert.equal(withNewline.rows.length, 1);
});

test("a byte-order mark does not become part of the first header", () => {
  const table = readTable("﻿Invoice,Amount\nINV-1,50\n");
  assert.deepEqual(table.header, ["Invoice", "Amount"]);
  assert.equal(suggestMapping(table.header).invoice, 0);
});

test("tab-separated paste from a spreadsheet is detected over the commas inside amounts", () => {
  const pasted = "Invoice\tCode\tAmount\nINV-1\tLIFT\t$1,250.00\n";
  assert.equal(detectDelimiter(pasted), "\t");
  const table = readTable(pasted);
  assert.deepEqual(table.rows[0], ["INV-1", "LIFT", "$1,250.00"]);
});

test("semicolon exports are detected", () => {
  const table = readTable("Invoice;Code;Amount\nINV-1;LIFT;75,00\n");
  assert.equal(table.delimiter, ";");
  assert.deepEqual(table.rows[0], ["INV-1", "LIFT", "75,00"]);
});

test("an export with no header row still yields usable column names", () => {
  const table = readTable("INV-1,LIFT,125\nINV-2,DET,300\n", { hasHeader: false });
  assert.deepEqual(table.header, ["Column 1", "Column 2", "Column 3"]);
  assert.equal(table.rows.length, 2);
});

test("money cells are read the way carrier exports write them", () => {
  assert.equal(parseMoney("$1,250.00").value, 1250);
  assert.equal(parseMoney("1.250,00").value, 1250);
  assert.equal(parseMoney("1 250,00").value, 1250);
  assert.equal(parseMoney("75").value, 75);
  assert.equal(parseMoney("75,50").value, 75.5);
  assert.equal(parseMoney("125.00 USD").value, 125);
  assert.equal(parseMoney("(125.00)").value, -125);
  assert.equal(parseMoney("125.00-").value, -125);
  assert.equal(parseMoney("-125.00").value, -125);
});

test("a thousands comma is not mistaken for a decimal comma", () => {
  // 1,250 must be twelve hundred and fifty, not one and a quarter. Getting
  // this backwards would understate a billed line by three orders of magnitude
  // and make an overage disappear.
  assert.equal(parseMoney("1,250").value, 1250);
  assert.equal(parseMoney("1,25").value, 1.25);
  assert.equal(parseMoney("1,234,567").value, 1234567);
});

test("an unreadable money cell reports failure instead of returning zero", () => {
  for (const bad of ["", "   ", "n/a", "TBD", "$", "--", "12.3.4"]) {
    assert.equal(parseMoney(bad).ok, false, `${JSON.stringify(bad)} should not parse`);
  }
});

test("mapping is guessed from real-looking carrier headers", () => {
  const header = ["Invoice Number", "PRO Number", "Charge Code", "Charge Amount", "Contract Amount"];
  assert.deepEqual(suggestMapping(header), {
    invoice: 0,
    reference: 1,
    code: 2,
    billed: 3,
    expected: 4,
    units: null,
  });
});

test("one money column maps to billed and leaves expected unmapped", () => {
  // An invoice states what it billed. It cannot state what the shipper
  // expected, and guessing the same column for both would make every line
  // agree with itself and flag nothing.
  const mapping = suggestMapping(["Invoice", "Code", "Amount"]);
  assert.equal(mapping.billed, 2);
  assert.equal(mapping.expected, null);
});

test("no column is claimed by two fields", () => {
  const mapping = suggestMapping(["Reference", "Description", "Total"]);
  const used = Object.values(mapping).filter((index) => index != null);
  assert.equal(new Set(used).size, used.length);
});

test("unrecognisable headers map to nothing rather than to the wrong column", () => {
  const mapping = suggestMapping(["alpha", "beta", "gamma"]);
  assert.deepEqual(mapping, { invoice: null, reference: null, code: null, billed: null, expected: null, units: null });
});

test("a rate card is read from the shapes people paste", () => {
  const { rates, issues } = parseRateCard(
    ["# contract rates", "LIFT,75", "DET 60", "resi: $30.00", "LUMPER = 90", "", "REWEIGH\t45"].join("\n"),
  );
  assert.deepEqual(issues, []);
  // Values are rules, not bare numbers: a flat rate is the `per: null` case.
  assert.equal(rates.get("LIFT").amount, 75);
  assert.equal(rates.get("LIFT").per, null);
  assert.equal(rates.get("DET").amount, 60);
  assert.equal(rates.get("RESI").amount, 30);
  assert.equal(rates.get("LUMPER").amount, 90);
  assert.equal(rates.get("REWEIGH").amount, 45);
});

test("a rate-card line that is not a code and amount is reported, not ignored", () => {
  const { rates, issues } = parseRateCard(["LIFT,75", "please check these", "DET,nope"].join("\n"));
  assert.equal(rates.size, 1);
  assert.equal(issues.length, 2);
  assert.equal(issues[1].reason, "amount is not a non-negative number");
});

test("imported rows carry the rate card's expected amount and audit as an overage", () => {
  const table = readTable(
    [
      "Invoice Number,PRO Number,Charge Code,Charge Amount",
      "INV-77,PRO-1,LIFT,125.00",
      "INV-77,PRO-1,LIFT,125.00",
      "INV-77,PRO-1,DET,300.00",
    ].join("\n"),
  );
  const { rates } = parseRateCard("LIFT,75\nDET,75");
  const built = buildImportedRows(table, suggestMapping(table.header), { rates });

  assert.equal(built.rows.length, 3);
  assert.equal(built.rows[0].expected, "75.00");
  assert.equal(built.summary.withoutExpected, 0);

  const results = auditCharges(built.rows);
  const totals = auditTotals(results);
  // 50 + 50 over on the liftgates, 225 over on detention.
  assert.equal(totals.recoverable, 325);
  assert.ok(results[1].flags.includes("Possible duplicate"));
});

test("a duplicate hiding in a long invoice is found without any expected amount", () => {
  // The zero-configuration finding: a shipper who has not typed a rate card
  // still learns that the same line was billed twice.
  const lines = ["Invoice,Code,Amount"];
  for (let i = 0; i < 40; i += 1) lines.push(`INV-9,CODE${i},10.00`);
  lines.push("INV-9,CODE7,10.00");
  const table = readTable(lines.join("\n"));
  const built = buildImportedRows(table, suggestMapping(table.header));

  assert.equal(built.summary.withoutExpected, 41);
  const results = auditCharges(built.rows);
  const duplicates = results.filter((row) => row.flags.includes("Possible duplicate"));
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].code, "CODE7");
});

test("an unreadable billed amount is kept as a flagged row, never dropped or zeroed", () => {
  const table = readTable("Invoice,Code,Amount\nINV-1,LIFT,see attached\n");
  const built = buildImportedRows(table, suggestMapping(table.header));

  assert.equal(built.rows.length, 1, "the row must survive so the audit can flag it");
  assert.equal(built.rows[0].billed, "see attached");
  assert.equal(built.summary.unreadableBilled, 1);
  assert.equal(built.issues[0].reason, "billed amount could not be read");

  const [audited] = auditCharges(built.rows);
  assert.ok(audited.flags.includes("Invalid billed amount"));
  assert.equal(audited.priority, "fix-inputs");
});

test("imported rows start with no evidence status selected", () => {
  // Seeding "missing" would invent actionable overages the user never assessed.
  const table = readTable("Invoice,Code,Amount\nINV-1,LIFT,125\n");
  const { rates } = parseRateCard("LIFT,75");
  const built = buildImportedRows(table, suggestMapping(table.header), { rates });
  assert.equal(built.rows[0].evidence, "");
  assert.equal(auditCharges(built.rows)[0].priority, "review");
});

test("an expected column in the file wins over the rate card", () => {
  const table = readTable("Invoice,Code,Amount,Contract Amount\nINV-1,LIFT,125,90\n");
  const { rates } = parseRateCard("LIFT,75");
  const built = buildImportedRows(table, suggestMapping(table.header), { rates });
  assert.equal(built.rows[0].expected, "90.00");
});

test("onlyRatedCodes drops unrated lines and says exactly what it dropped", () => {
  const table = readTable(
    [
      "Invoice,Code,Amount",
      "INV-1,LINEHAUL,900.00",
      "INV-1,FUEL,180.00",
      "INV-1,LIFT,125.00",
      "INV-1,FUEL,20.00",
    ].join("\n"),
  );
  const { rates } = parseRateCard("LIFT,75");
  const built = buildImportedRows(table, suggestMapping(table.header), { rates, onlyRatedCodes: true });

  assert.equal(built.rows.length, 1);
  assert.equal(built.summary.skipped, 3);
  assert.deepEqual(built.summary.skippedCodes, [
    { code: "LINEHAUL", count: 1 },
    { code: "FUEL", count: 2 },
  ]);
  assert.match(importSummaryNote(built.summary), /Skipped 3 lines/);
  assert.match(importSummaryNote(built.summary), /FUEL ×2/);
});

test("an unmapped field yields a blank rather than shifting another column into it", () => {
  const table = readTable("Code,Amount\nLIFT,125\n");
  const mapping = suggestMapping(table.header);
  const built = buildImportedRows(table, mapping);
  assert.equal(built.rows[0].invoice, "");
  assert.equal(built.rows[0].reference, "");
  assert.equal(built.rows[0].code, "LIFT");
  assert.equal(built.rows[0].billed, "125.00");
});

test("the summary note names unreadable amounts and lines still missing an expected figure", () => {
  const table = readTable("Invoice,Code,Amount\nINV-1,LIFT,125\nINV-1,DET,n/a\n");
  const built = buildImportedRows(table, suggestMapping(table.header));
  const note = importSummaryNote(built.summary);
  assert.match(note, /Read 2 rows/);
  assert.match(note, /1 billed amount could not be read/);
  assert.match(note, /2 lines have no expected amount/);
  assert.match(note, /Nothing was uploaded/);
});

test("an empty file is reported as empty rather than importing silently", () => {
  const table = readTable("\n\n   \n");
  const built = buildImportedRows(table, suggestMapping(table.header));
  assert.equal(built.rows.length, 0);
  assert.match(importSummaryNote(built.summary), /No data rows were found/);
});

test("a header-only export imports nothing and says so", () => {
  const table = readTable("Invoice,Code,Amount\n");
  const built = buildImportedRows(table, suggestMapping(table.header));
  assert.equal(built.summary.readRows, 0);
  assert.match(importSummaryNote(built.summary), /No data rows were found/);
});

test("the worked example published on the SEO page is what the code produces", () => {
  // A published figure is a claim about the tool's output. This recomputes it
  // so the page cannot drift into quoting numbers the tool no longer returns.
  const csv = [
    "Invoice Number,PRO Number,Charge Code,Charge Amount",
    "INV-4471,PRO-77120,LINEHAUL,912.40",
    "INV-4471,PRO-77120,FUEL,187.30",
    "INV-4471,PRO-77120,LIFT,125.00",
    "INV-4471,PRO-77120,LIFT,125.00",
    "INV-4471,PRO-77120,DET,300.00",
    "INV-4471,PRO-77120,RESI,45.00",
  ].join("\n");
  const table = readTable(csv);
  const { rates } = parseRateCard("LIFT,75\nDET,75\nRESI,45");
  const built = buildImportedRows(table, suggestMapping(table.header), { rates, onlyRatedCodes: true });
  const totals = auditTotals(auditCharges(built.rows));

  assert.equal(built.summary.readRows, 6);
  assert.equal(built.summary.imported, 4);
  assert.equal(built.summary.skipped, 2);
  assert.equal(totals.billed, 595);
  assert.equal(totals.recoverable, 325);
  // The residential line is billed at the rate card figure, so it carries no
  // flag: three of the four imported lines are flagged, not all four.
  assert.equal(totals.flagged, 3);
  assert.equal(totals.actionable, 3);
});

// ---------------------------------------------------------------------------
// Per-unit rate-card rules
//
// A flat `CODE, amount` card can only price accessorials that are flat. The
// three worth the most money on an LTL invoice — detention, storage, reweigh —
// are rated per unit with a free allowance and often a cap, so on a flat card
// they imported with no expected amount at all and dropped out of the audit.
// These tests pin the grammar and, more importantly, the arithmetic: a wrong
// expected amount is worse than a blank one, because it is the number the
// shipper puts in front of the carrier.
// ---------------------------------------------------------------------------

test("reads a per-unit rule with a free allowance and a cap", () => {
  const { rates, issues } = parseRateCard("DET 65/hr after 2 hours, max 325");
  assert.deepEqual(issues, []);
  assert.deepEqual(rates.get("DET"), {
    code: "DET",
    amount: 65,
    per: "hour",
    free: 2,
    min: null,
    max: 325,
    source: "DET 65/hr after 2 hours, max 325",
  });
});

test("reads the spellings a rate confirmation actually uses", () => {
  const { rates, issues } = parseRateCard(
    [
      "STO $40 per day after 1 day",
      "REWEIGH 4.50/cwt min 45",
      "INSIDE DELIVERY 95",
      "DRIVER ASSIST 35/hour, not to exceed 140",
      "SORT 1.25/piece",
    ].join("\n"),
  );
  assert.deepEqual(issues, []);
  assert.equal(rates.get("STO").per, "day");
  assert.equal(rates.get("STO").free, 1);
  assert.equal(rates.get("REWEIGH").per, "cwt");
  assert.equal(rates.get("REWEIGH").min, 45);
  // A code with a space in it is a description column pasted verbatim, which
  // is how most people write their card the first time.
  assert.equal(rates.get("INSIDE DELIVERY").amount, 95);
  assert.equal(rates.get("INSIDE DELIVERY").per, null);
  assert.equal(rates.get("DRIVER ASSIST").max, 140);
  assert.equal(rates.get("SORT").per, "piece");
});

test("clause order does not change the rule", () => {
  const { rates } = parseRateCard("DET 65/hr max 325 min 65 after 2");
  assert.equal(rates.get("DET").max, 325);
  assert.equal(rates.get("DET").min, 65);
  assert.equal(rates.get("DET").free, 2);
});

test("prices a per-unit line past its free allowance", () => {
  const { rates } = parseRateCard("DET 65/hr after 2 hours");
  const priced = expectedFor(rates.get("DET"), "5");
  assert.equal(priced.ok, true);
  assert.equal(priced.amount, 195);
  assert.match(priced.basis, /3 hours past 2 free × \$65\.00\/hour/);
});

test("a line inside its free allowance expects nothing, and the minimum does not invent a charge", () => {
  // A shipment that left inside free time should expect $0.00, so a billed
  // detention line on it shows as the whole amount above expected. Applying
  // the contract minimum here would quietly agree that something was owed.
  const { rates } = parseRateCard("DET 65/hr after 2 hours min 65");
  const priced = expectedFor(rates.get("DET"), "1.5");
  assert.equal(priced.amount, 0);
  assert.doesNotMatch(priced.basis, /minimum/);
});

test("the cap and the minimum bound the priced amount", () => {
  const { rates } = parseRateCard("DET 65/hr after 2, min 100, max 325");
  assert.equal(expectedFor(rates.get("DET"), "3").amount, 100);
  assert.equal(expectedFor(rates.get("DET"), "12").amount, 325);
  assert.match(expectedFor(rates.get("DET"), "12").basis, /capped at \$325\.00/);
});

test("dock minutes price against a per-hour rate", () => {
  // Carrier exports report dock time in minutes at least as often as hours.
  // Reading 210 as 210 hours would put $13,000 of expected detention on a
  // line that should expect $162.50.
  const { rates } = parseRateCard("DET 65/hr after 2 hours");
  const priced = expectedFor(rates.get("DET"), "210 min");
  assert.equal(priced.amount, 97.5);
  assert.match(priced.basis, /from minutes/);
});

test("a quantity in the wrong unit is refused rather than converted", () => {
  const { rates } = parseRateCard("REWEIGH 4.50/cwt");
  const priced = expectedFor(rates.get("REWEIGH"), "3 pallets");
  assert.equal(priced.ok, false);
  assert.match(priced.reason, /pallets but REWEIGH is rated per cwt/);
});

test("shipment weight in pounds prices against a per-cwt rate", () => {
  // A carrier's own weight column is pounds far more often than it is
  // hundredweight. Reading "5000 lb" as 5000 cwt would put $22,500 of
  // expected reweigh on a line that should expect $225.
  const { rates } = parseRateCard("REWEIGH 4.50/cwt");
  const priced = expectedFor(rates.get("REWEIGH"), "5000 lbs");
  assert.equal(priced.ok, true);
  assert.equal(priced.amount, 225);
  assert.match(priced.basis, /50 cwts from pounds/);
});

test("a free-weight allowance in pounds converts against a per-cwt rate", () => {
  const { rates, issues } = parseRateCard("REWEIGH 4.50/cwt after 500 lb free");
  assert.deepEqual(issues, []);
  assert.equal(rates.get("REWEIGH").free, 5);
  const priced = expectedFor(rates.get("REWEIGH"), "5500 lbs");
  assert.equal(priced.ok, true);
  // 55 cwt total, less the 5 cwt (500 lb) free allowance, at $4.50/cwt.
  assert.equal(priced.amount, 225);
});

test("a per-unit rule with no quantity leaves the expected amount blank, never zero", () => {
  // The whole honesty rule of this importer in one case: a $0.00 expected
  // amount would headline the entire billed line as recoverable.
  const csv = ["Invoice,Code,Amount", "INV-1,DET,300.00"].join("\n");
  const table = readTable(csv);
  const { rates } = parseRateCard("DET 65/hr after 2 hours");
  const built = buildImportedRows(table, suggestMapping(table.header), { rates });
  assert.equal(built.rows[0].expected, "");
  assert.equal(built.summary.needsUnits, 1);
  // Not also counted as unpriced-for-want-of-a-rate-card-entry: the code is on
  // the card. Counting it twice made the summary tell the shipper to add a
  // code they had already typed, alongside the correct advice to map a column.
  assert.equal(built.summary.withoutExpected, 0);
  assert.match(built.issues[0].reason, /rated per hour — map a quantity column/);
  const totals = auditTotals(auditCharges(built.rows));
  assert.equal(totals.recoverable, 0);
  assert.equal(totals.unpriced, 1);
});

test("a quantity column is guessed and priced end to end", () => {
  const csv = [
    "Invoice Number,PRO Number,Charge Code,Charge Amount,Detention Hours",
    "INV-1,PRO-1,DET,300.00,5",
    "INV-1,PRO-1,LIFT,125.00,",
  ].join("\n");
  const table = readTable(csv);
  const mapping = suggestMapping(table.header);
  assert.equal(mapping.units, 4);
  const { rates } = parseRateCard("DET 65/hr after 2 hours, max 325\nLIFT, 75");
  const built = buildImportedRows(table, mapping, { rates });
  assert.equal(built.rows[0].expected, "195.00");
  assert.equal(built.rows[1].expected, "75.00");
  assert.equal(built.summary.pricedPerUnit, 1);
  assert.equal(built.summary.perUnitRules, 1);
  const results = auditCharges(built.rows);
  assert.equal(results[0].variance, 105);
  assert.match(results[0].basis, /\$65\.00\/hour/);
  assert.equal(results[1].basis, "flat contract rate $75.00");
});

test("the carrier export's own expected column still wins over the rate card", () => {
  // A rated amount agreed for this shipment beats the card's general rule.
  const csv = ["Invoice,Code,Charge Amount,Contract Amount,Hours", "INV-1,DET,300.00,150.00,5"].join("\n");
  const table = readTable(csv);
  const { rates } = parseRateCard("DET 65/hr after 2 hours");
  const built = buildImportedRows(table, suggestMapping(table.header), { rates });
  assert.equal(built.rows[0].expected, "150.00");
  assert.match(built.rows[0].basis, /carrier's own export/);
  assert.equal(built.summary.pricedPerUnit, 0);
});

test("a free allowance written against a flat rate is reported, not dropped", () => {
  // Silently pricing this as flat $65 would apply no allowance while the
  // shipper believes two hours are free.
  const { rates, issues } = parseRateCard("DET 65 after 2 hours");
  assert.equal(rates.size, 0);
  assert.match(issues[0].reason, /needs a per-unit rate/);
});

test("an unusable rule is reported rather than half-applied", () => {
  const { rates, issues } = parseRateCard(
    ["DET 65/fortnight", "STO 40/day min 300 max 100", "LIFT 75"].join("\n"),
  );
  assert.equal(rates.size, 1);
  assert.match(issues[0].reason, /unknown unit "fortnight"/);
  assert.match(issues[1].reason, /minimum is above the cap/);
});

test("a quantity cell reads the way a carrier export writes one", () => {
  assert.equal(parseQuantity("3", "hour").value, 3);
  assert.equal(parseQuantity("3.5 hrs", "hour").value, 3.5);
  assert.equal(parseQuantity("1,250 cwt", "cwt").value, 1250);
  assert.equal(parseQuantity("", "hour").ok, false);
  assert.equal(parseQuantity("n/a", "hour").ok, false);
});

test("parseQuantity converts pounds against a per-cwt rate, and only that pair", () => {
  const pounds = parseQuantity("250 lbs", "cwt");
  assert.equal(pounds.ok, true);
  assert.equal(pounds.value, 2.5);
  assert.equal(pounds.unit, "cwt");
  assert.equal(pounds.converted, "pounds");
  // Pounds do not convert against any other unit — only the documented cwt
  // pairing exists, same as minutes only converts against hour.
  const wrongTarget = parseQuantity("250 lbs", "hour");
  assert.equal(wrongTarget.ok, false);
  assert.equal(wrongTarget.reason, "wrong-unit");
});

test("the rate card prices hand-entered rows, and never overwrites a typed figure", () => {
  const { rates } = parseRateCard("DET 65/hr after 2 hours, max 325\nLIFT, 75");
  const rows = [
    { code: "DET", billed: "300", units: "5" },
    { code: "LIFT", billed: "125" },
    // Typed by the shipper for this shipment: their figure, not the card's.
    { code: "LIFT", billed: "125", expected: "90" },
    { code: "DET", billed: "300" },
    { code: "MYSTERY", billed: "40" },
  ];
  const priced = priceEnteredRows(rows, rates);

  assert.equal(priced[0].expected, "195.00");
  assert.equal(priced[0].pricedPerUnit, true);
  assert.match(priced[0].basis, /3 hours past 2 free × \$65\.00\/hour/);

  assert.equal(priced[1].expected, "75.00");
  assert.equal(priced[1].pricedPerUnit, false);

  assert.equal(priced[2].expected, "90");
  assert.equal(priced[2].basis, undefined, "a typed figure keeps no borrowed basis");

  // Per-unit rule, no quantity: blank rather than zero, with the reason for
  // the page to show on the cell that takes one.
  assert.equal(priced[3].expected, undefined);
  assert.match(priced[3].priceHint, /rated per hour — map a quantity column/);

  assert.equal(priced[4].expected, undefined);
  assert.equal(priced[4].priceHint, undefined);

  // The card is re-applied on every keystroke, so a pass must not mutate the
  // rows it was handed or an edited card could never lower a price again.
  assert.equal(rows[0].expected, undefined);
  assert.deepEqual(priceEnteredRows(rows, new Map())[0], rows[0]);
});

test("a missing quantity and a missing rate-card entry are counted apart", () => {
  // Two different lines, two different fixes. Before, the DET line landed in
  // both counters and the summary reported one line as two.
  const csv = ["Invoice,Code,Amount", "INV-1,DET,300.00", "INV-1,MYSTERY,40.00"].join("\n");
  const table = readTable(csv);
  const { rates } = parseRateCard("DET 65/hr after 2 hours\nLIFT, 75");
  const built = buildImportedRows(table, suggestMapping(table.header), { rates });
  assert.equal(built.summary.needsUnits, 1);
  assert.equal(built.summary.withoutExpected, 1);
});

test("a free allowance written without naming its unit is an allowance, not an unknown unit", () => {
  // "after 2 free" is as common on a confirmation as "after 2 hours free",
  // and the trailing word is the allowance's own, not a unit name.
  for (const line of ["DET 65/hr after 2 free", "DET 65/hr after 2 hours free", "DET 65/hr after 2 hours"]) {
    const { rates, issues } = parseRateCard(line);
    assert.deepEqual(issues, [], line);
    assert.equal(rates.get("DET").free, 2, line);
    assert.equal(rates.get("DET").per, "hour", line);
  }
  // The minutes conversion still applies through the same clause.
  const { rates } = parseRateCard("DET 65/hr past 30 min free, max 325");
  assert.equal(rates.get("DET").free, 0.5);
  assert.equal(rates.get("DET").max, 325);
});

test("the import summary says what the per-unit rules did and did not price", () => {
  const note = importSummaryNote({
    readRows: 4, columns: 5, imported: 4, skipped: 0, skippedCodes: [],
    unreadableBilled: 0, withoutExpected: 1, needsUnits: 1, pricedPerUnit: 2,
    ratedCodes: 3, perUnitRules: 1,
  });
  assert.match(note, /2 lines were priced from a per-unit rule/);
  assert.match(note, /map the column holding hours, days, or weight/);
});
