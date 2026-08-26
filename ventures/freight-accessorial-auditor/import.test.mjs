import assert from "node:assert/strict";
import test from "node:test";

import { auditCharges, auditTotals } from "./audit.mjs";
import {
  buildImportedRows,
  detectDelimiter,
  importSummaryNote,
  parseMoney,
  parseRateCard,
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
  assert.deepEqual(mapping, { invoice: null, reference: null, code: null, billed: null, expected: null });
});

test("a rate card is read from the shapes people paste", () => {
  const { rates, issues } = parseRateCard(
    ["# contract rates", "LIFT,75", "DET 60", "resi: $30.00", "LUMPER = 90", "", "REWEIGH\t45"].join("\n"),
  );
  assert.deepEqual(issues, []);
  assert.equal(rates.get("LIFT"), 75);
  assert.equal(rates.get("DET"), 60);
  assert.equal(rates.get("RESI"), 30);
  assert.equal(rates.get("LUMPER"), 90);
  assert.equal(rates.get("REWEIGH"), 45);
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
