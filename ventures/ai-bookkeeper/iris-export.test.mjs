// The IRS IRIS 1099-NEC template export (nec1099IrisCsv, CLI `contractors --iris`), 2026-11-10.
// The layout is cross-checked in open-source copies of the template, not read on irs.gov (taxforms.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newBooks, importStatement, confirm } from "./engine.mjs";
import { contractors1099, nec1099IrisCsv, IRIS_NEC_COLUMNS } from "./taxforms.mjs";

const payer = { name: "Northwind Sample Co", tin: "12-3456780", tinType: "EIN", address: "100 Example Way", city: "Austin", state: "tx", zip: "78701" };
function books2026() {
  let { books } = importStatement(newBooks(), "Date,Description,Amount\n2026-01-10,BLUE DOOR DESIGN LLC,-2500.00\n2026-02-10,JORDAN SAMPLE,-4200.00\n2026-03-10,ZELLE BOB SMALL,-300.00\n", "1000");
  return confirm(books, Object.fromEntries(books.transactions.map((t) => [t.id, "6020"])));
}
function parse(csv) {
  return csv.trim().split("\r\n").map((line) => {
    const out = []; let cell = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { out.push(cell); cell = ""; } else cell += ch;
    }
    out.push(cell);
    return out;
  });
}

test("54 template columns, A to BB, Box 1 in column AL", () => {
  assert.equal(IRIS_NEC_COLUMNS.length, 54);
  assert.equal(IRIS_NEC_COLUMNS.indexOf("Box 1 - Nonemployee Compensation"), 37);
});

test("one row per payee over the line, payer block filled, recipient TIN and address left blank", () => {
  const out = nec1099IrisCsv(contractors1099(books2026(), { year: 2026 }), payer);
  const rows = parse(out.csv);
  assert.equal(rows.length, 3, "header and the two payees over $2,000");
  assert.deepEqual(rows[0], IRIS_NEC_COLUMNS);
  const at = (r, c) => r[IRIS_NEC_COLUMNS.indexOf(c)];
  for (const r of rows.slice(1)) {
    assert.equal(r.length, 54);
    assert.equal(at(r, "Form Type"), "1099-NEC");
    assert.equal(at(r, "Tax Year"), "2026");
    assert.equal(at(r, "Payer Taxpayer ID Number"), "123456780");
    assert.equal(at(r, "Payer State/Province/Territory"), "TX");
    assert.equal(at(r, "Recipient Taxpayer ID Number"), "");
    assert.equal(at(r, "Recipient Address Line 1"), "");
  }
  const biz = rows.find((r) => /BLUE DOOR/i.test(at(r, "Recipient Business or Entity Name Line 1")));
  assert.equal(at(biz, "Recipient Name Type"), "B");
  assert.equal(at(biz, "Box 1 - Nonemployee Compensation"), "2500.00");
  const person = rows.find((r) => at(r, "Recipient Name Type") === "I");
  assert.match(at(person, "Recipient First Name") + " " + at(person, "Recipient Last Name (Surname)"), /JORDAN SAMPLE/i);
  assert.ok(out.notes.some((n) => /split into first and last/.test(n)));
  assert.ok(out.notes.some((n) => /never stores them/.test(n)));
});

test("no payer given: the notes say so", () => {
  assert.ok(nec1099IrisCsv(contractors1099(books2026(), { year: 2026 })).notes.some((n) => /payer's TIN, name or address is blank/.test(n)));
});

test("the CLI writes the same file with --iris --payer", () => {
  const dir = mkdtempSync(join(tmpdir(), "iris-"));
  writeFileSync(join(dir, "books.json"), JSON.stringify(books2026()));
  writeFileSync(join(dir, "payer.json"), JSON.stringify(payer));
  const csv = execFileSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "--books", join(dir, "books.json"), "contractors", "--year", "2026", "--iris", "--payer", join(dir, "payer.json")], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  assert.equal(csv, nec1099IrisCsv(contractors1099(books2026(), { year: 2026 }), payer).csv);
});

// Cross-check with the sibling checker when this monorepo has it; skipped when the venture is used alone.
const checker = new URL("../irs-iris-1099-csv-check/calc.mjs", import.meta.url);
test("the IRIS CSV check reads the export as its template, and only the W-9 fields are missing", { skip: !existsSync(checker) }, async () => {
  const { validate, TEMPLATE_NEC } = await import(checker);
  assert.deepEqual(IRIS_NEC_COLUMNS, TEMPLATE_NEC, "both ventures carry the same column list");
  const r = validate(nec1099IrisCsv(contractors1099(books2026(), { year: 2026 }), payer).csv);
  assert.equal(r.summary.layout, "iris-template");
  assert.equal(r.summary.records, 2);
  const errors = new Set(r.findings.filter((f) => f.severity === "error").map((f) => f.code));
  assert.deepEqual([...errors].sort(), ["address", "city", "recipient-tin", "state", "tin-type", "zip"], "only the fields a W-9 supplies");
  // With the W-9 fields filled in, it is clean.
  const rows = parse(nec1099IrisCsv(contractors1099(books2026(), { year: 2026 }), payer).csv);
  const col = (c) => IRIS_NEC_COLUMNS.indexOf(c);
  rows.slice(1).forEach((x, i) => { x[col("Recipient TIN Type")] = "SSN"; x[col("Recipient Taxpayer ID Number")] = `41234567${i}`; x[col("Recipient Address Line 1")] = "2 B St"; x[col("Recipient City/Town")] = "Dallas"; x[col("Recipient State/Province/Territory")] = "TX"; x[col("Recipient ZIP/Postal Code")] = "75201"; });
  const clean = validate(rows.map((x) => x.map((v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\r\n"));
  assert.deepEqual(clean.findings.filter((f) => f.severity !== "info").map((f) => f.code), []);
});
