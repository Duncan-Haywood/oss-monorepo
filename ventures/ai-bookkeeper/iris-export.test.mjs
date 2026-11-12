// The IRS IRIS 1099-NEC template export (nec1099IrisCsv, CLI `contractors --iris`), 2026-11-10.
// Since 2026-11-11 the column letters and field rules are read from the IRS's own TY2025 IRIS CSV
// template formatting guidelines (taxforms.mjs); the 1099-MISC rents file was added the same day.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newBooks, importStatement, confirm } from "./engine.mjs";
import { contractors1099, nec1099IrisCsv, IRIS_NEC_COLUMNS, IRIS_MISC_COLUMNS, rents1099, misc1099IrisCsv, irisField, irisTin } from "./taxforms.mjs";

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
    assert.equal(at(r, "Payer Taxpayer ID Number"), "12-3456780", "the guidelines: EIN as XX-XXXXXXX, digits and dashes only");
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
  rows.slice(1).forEach((x, i) => { x[col("Recipient TIN Type")] = "SSN"; x[col("Recipient Taxpayer ID Number")] = `412-34-567${i}`; x[col("Recipient Address Line 1")] = "2 B St"; x[col("Recipient City/Town")] = "Dallas"; x[col("Recipient State/Province/Territory")] = "TX"; x[col("Recipient ZIP/Postal Code")] = "75201"; });
  const clean = validate(rows.map((x) => x.map((v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\r\n"));
  assert.deepEqual(clean.findings.filter((f) => f.severity !== "info").map((f) => f.code), []);
});

// Column letters as the IRS guidelines PDF prints them (TY2025, 1099-NEC A-BB and 1099-MISC A-BL).
const letter = (i) => (i < 26 ? "" : String.fromCharCode(64 + Math.floor(i / 26))) + String.fromCharCode(65 + (i % 26));
test("column letters match the IRS guidelines: NEC Box 1 in AL, MISC FATCA AK, Rents AM, Box 15 AY, last column BL", () => {
  assert.equal(letter(IRIS_NEC_COLUMNS.length - 1), "BB");
  assert.equal(letter(IRIS_NEC_COLUMNS.indexOf("Box 1 - Nonemployee Compensation")), "AL");
  assert.equal(letter(IRIS_NEC_COLUMNS.indexOf("Combined Federal/State Filing (CF/SF)")), "AP");
  assert.equal(IRIS_MISC_COLUMNS.length, 64);
  assert.equal(letter(IRIS_MISC_COLUMNS.indexOf("FATCA Filing Requirements")), "AK");
  assert.equal(letter(IRIS_MISC_COLUMNS.indexOf("Box 1 - Rents")), "AM");
  assert.equal(letter(IRIS_MISC_COLUMNS.indexOf("Box 10 - Gross proceeds paid to an attorney")), "AV");
  assert.equal(letter(IRIS_MISC_COLUMNS.indexOf("Box 15 - Nonqualified deferred compensation")), "AY");
  assert.equal(letter(IRIS_MISC_COLUMNS.indexOf("State 1")), "BA");
  assert.equal(letter(IRIS_MISC_COLUMNS.length - 1), "BL");
});

test("field rules from the guidelines: allowed characters, lengths, TIN dashes", () => {
  assert.equal(irisField("business", "SQ *BLUE DOOR DESIGN, L.L.C.").value, "SQ BLUE DOOR DESIGN LLC");
  assert.equal(irisField("business", "Smith & Sons (West) #2").value, "Smith & Sons (West) #2", "& ( ) # are allowed");
  assert.equal(irisField("person", "O'Brien").value, "OBrien");
  assert.equal(irisField("person", "José").value, "Jose");
  assert.equal(irisField("address", "100 Example Way, Ste. #4").value, "100 Example Way Ste 4");
  assert.equal(irisField("city", "St. Louis").value, "St Louis");
  const long = irisField("business", "A".repeat(45));
  assert.equal(long.value.length, 40); assert.ok(long.cut);
  assert.equal(irisTin("123456780", "EIN"), "12-3456780");
  assert.equal(irisTin("123-45-6789", "SSN"), "123-45-6789");
  assert.equal(irisTin("123 45 6789", "SSN"), "123-45-6789");
});

test("payer ZIP+4 is written as nine digits, payer phone as ten", () => {
  const out = nec1099IrisCsv(contractors1099(books2026(), { year: 2026 }), { ...payer, zip: "78701-1234", phone: "+1 (512) 555-0100", city: "St. Paul" });
  const r = parse(out.csv)[1];
  const at = (c) => r[IRIS_NEC_COLUMNS.indexOf(c)];
  assert.equal(at("Payer ZIP/Postal Code"), "787011234");
  assert.equal(at("Payer Phone"), "5125550100");
  assert.equal(at("Payer City/Town"), "St Paul");
  assert.ok(out.notes.some((n) => /payer city/.test(n)));
  assert.ok(out.notes.some((n) => /TY2025 template layout/.test(n)), "a 2026 file says the TY2026 template is not out yet");
});

function rentBooks() {
  let { books } = importStatement(newBooks(), "Date,Description,Amount\n2026-01-01,MAPLE STREET PROPERTIES LLC,-1500.00\n2026-02-01,MAPLE STREET PROPERTIES LLC,-1500.00\n2026-03-05,DANA OWNER,-2400.00\n2026-03-09,ACME STORAGE INC,-2100.00\n2026-04-01,LOT RENT PAUL,-300.00\n2026-04-02,BLUE DOOR DESIGN LLC,-2500.00\n", "1000");
  const acct = Object.fromEntries(books.transactions.map((t) => [t.id, /BLUE DOOR/.test(t.desc) ? "6020" : "6080"]));
  return confirm(books, acct);
}

test("rents1099: rent per landlord against the $2,000 line (2026), contract labor left out", () => {
  const r = rents1099(rentBooks(), { year: 2026 });
  assert.equal(r.threshold, 200000);
  assert.deepEqual(r.reportable.map((p) => [p.name, p.cents]), [["MAPLE STREET PROPERTIES LLC", 300000], ["DANA OWNER", 240000], ["ACME STORAGE INC", 210000]]);
  assert.ok(!r.payees.some((p) => /BLUE DOOR/.test(p.name)), "6020 contract labor is the NEC worksheet's");
  assert.ok(r.warnings.some((w) => /ACME STORAGE INC looks like a corporation/.test(w)));
  assert.ok(r.warnings.some((w) => /property manager/.test(w)));
  assert.equal(rents1099(rentBooks(), { year: 2026, threshold: 60000 }).reportable.length, 3);
  assert.equal(rents1099(rentBooks(), { year: 2025 }).threshold, 60000, "$600 before 2026");
});

test("misc1099IrisCsv: 64 columns, Box 1 Rents filled, FATCA and Box 7 N", () => {
  const out = misc1099IrisCsv(rents1099(rentBooks(), { year: 2026 }), payer);
  const rows = parse(out.csv);
  assert.deepEqual(rows[0], IRIS_MISC_COLUMNS);
  assert.equal(rows.length, 4);
  const at = (r, c) => r[IRIS_MISC_COLUMNS.indexOf(c)];
  for (const r of rows.slice(1)) {
    assert.equal(r.length, 64);
    assert.equal(at(r, "Form Type"), "1099-MISC");
    assert.equal(at(r, "FATCA Filing Requirements"), "N");
    assert.equal(at(r, "Box 7 - Direct sales of $5,000 or more of consumer products to a recipient for resale"), "N");
    assert.equal(at(r, "Box 3 - Other income"), "");
  }
  const dana = rows.find((r) => at(r, "Recipient Last Name (Surname)") === "OWNER");
  assert.equal(at(dana, "Box 1 - Rents"), "2400.00");
  assert.equal(at(rows.find((r) => /MAPLE/.test(at(r, "Recipient Business or Entity Name Line 1"))), "Recipient Name Type"), "B");
});

test("the CLI rents --iris writes the same file", () => {
  const dir = mkdtempSync(join(tmpdir(), "iris-misc-"));
  writeFileSync(join(dir, "books.json"), JSON.stringify(rentBooks()));
  writeFileSync(join(dir, "payer.json"), JSON.stringify(payer));
  const csv = execFileSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "--books", join(dir, "books.json"), "rents", "--year", "2026", "--iris", "--payer", join(dir, "payer.json")], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  assert.equal(csv, misc1099IrisCsv(rents1099(rentBooks(), { year: 2026 }), payer).csv);
  const text = execFileSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "--books", join(dir, "books.json"), "rents", "--year", "2026"], { encoding: "utf8" });
  assert.match(text, /RENT PAID 2026/);
  assert.match(text, /MAPLE STREET PROPERTIES LLC .*REPORT/);
});

test("the IRIS CSV check reads the MISC export as its template", { skip: !existsSync(checker) }, async () => {
  const { validate, TEMPLATE_MISC } = await import(checker);
  assert.deepEqual(IRIS_MISC_COLUMNS, TEMPLATE_MISC, "both ventures carry the same 1099-MISC column list");
  const r = validate(misc1099IrisCsv(rents1099(rentBooks(), { year: 2026 }), payer).csv);
  assert.equal(r.summary.layout, "iris-template");
  assert.equal(r.summary.records, 3);
  const errors = new Set(r.findings.filter((f) => f.severity === "error").map((f) => f.code));
  assert.deepEqual([...errors].sort(), ["address", "city", "recipient-tin", "state", "tin-type", "zip"], "only the fields a W-9 supplies");
});
