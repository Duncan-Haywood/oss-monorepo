import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, splitRows, parseCsv, toCsv, cleanMoney, dateShape, taxIdProblem, nameKey, findingsCsv, sampleFile, sampleBrokenFile, conceptOf, ROW_LIMIT } from "./calc.mjs";

const codes = (r) => r.findings.map((f) => f.code);
const cust = (...rows) => toCsv([["Display Name", "Email", "Billing ZIP", "Opening Balance", "Opening Balance As Of"], ...rows]);

test("each clean example has no errors or warnings and each broken one has both", () => {
  for (const kind of ["customers", "vendors", "products"]) {
    const ok = validate(sampleFile(kind), { kind });
    assert.deepEqual(ok.findings.filter((f) => f.severity !== "info"), [], kind);
    const bad = validate(sampleBrokenFile(kind), { kind });
    assert.ok(bad.findings.some((f) => f.severity === "error"), kind);
    assert.ok(bad.findings.some((f) => f.severity === "warning"), kind);
  }
});

test("parser handles quotes and reports the line", () => {
  const p = parseCsv('a,b\n"x, ""y""","l1\nl2"\nz,w\n');
  assert.deepEqual(p.rows.map((r) => r.cells), [["a", "b"], ['x, "y"', "l1\nl2"], ["z", "w"]]);
  assert.equal(p.rows[2].line, 4);
  assert.equal(parseCsv('a,"open\nb').unterminated, 1);
});

test("empty file, no name column, unterminated quote and header-only stop early", () => {
  assert.equal(validate("").findings[0].code, "empty");
  assert.equal(validate("Email,Phone\na@b.co,1\n").findings.at(-1).code, "no-name");
  assert.equal(validate('Display Name,Email\n"A,1\n').findings[0].code, "quote");
  assert.equal(validate("Display Name,Email\n").findings.at(-1).code, "no-rows");
  assert.equal(validate("SKU,Price\nA,1\n", { kind: "products" }).findings.at(-1).code, "no-name");
});

test("a name can be built from company or first and last", () => {
  const r = validate("Company,Email\nAcme LLC,a@acme.example\n");
  assert.ok(codes(r).includes("derived-name"));
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.ok(codes(validate("First Name,Last Name\nAnn,Lee\n")).includes("derived-name"));
});

test("blank names, long names, colons and bad characters", () => {
  const r = validate(cust(["", "a@b.co", "", "", ""], ["x".repeat(101), "", "", "", ""], ["Acme: East", "", "", "", ""], ['Say "hi"', "", "", "", ""]));
  for (const c of ["blank-name", "name-length", "colon", "bad-char"]) assert.ok(codes(r).includes(c), c);
  assert.equal(r.findings.find((f) => f.code === "blank-name").line, 2);
});

test("duplicate names ignore capitals and extra spaces and name the earlier line", () => {
  const r = validate(cust(["Hartwell Bakery", "", "", "", ""], ["hartwell  bakery ", "", "", "", ""]));
  const d = r.findings.find((f) => f.code === "dup-name");
  assert.equal(d.line, 3);
  assert.match(d.title, /line 2/);
  assert.equal(nameKey(" A  B "), "a b");
});

test("emails: invalid ones are flagged, several addresses are allowed", () => {
  assert.ok(codes(validate(cust(["A", "no-at.example", "", "", ""]))).includes("email"));
  assert.ok(!codes(validate(cust(["A", "a@x.co, b@y.co", "", "", ""]))).includes("email"));
});

test("scientific notation and short ZIPs", () => {
  const r = validate("Display Name,Phone,Billing ZIP\nA,5.55E+09,1852\n");
  assert.ok(codes(r).includes("sci-phone"));
  assert.ok(codes(r).includes("zip-zero"));
});

test("opening balances: format, symbols, missing date, bad and mixed dates", () => {
  assert.ok(codes(validate(cust(["A", "", "", "abc", "2026-01-01"]))).includes("balance-format"));
  assert.ok(codes(validate(cust(["A", "", "", "$1,250.00", "2026-01-01"]))).includes("balance-clean"));
  assert.ok(codes(validate(cust(["A", "", "", "5", ""]))).includes("balance-no-date"));
  assert.ok(!codes(validate(cust(["A", "", "", "0", ""]))).includes("balance-no-date"));
  assert.ok(codes(validate(cust(["A", "", "", "5", "yesterday"]))).includes("date-format"));
  const mixed = validate(cust(["A", "", "", "5", "13/01/2026"], ["B", "", "", "5", "01/13/2026"]));
  assert.ok(codes(mixed).includes("date-mixed"));
  const amb = validate(cust(["A", "", "", "5", "13/01/2026"], ["B", "", "", "5", "03/04/2026"]));
  assert.ok(codes(amb).includes("date-ambiguous"));
  assert.ok(codes(validate(cust(["A", "", "", "5", "03/04/2026"]))).includes("date-order"));
});

test("date shapes", () => {
  assert.equal(dateShape("2026-02-30"), "iso");
  assert.equal(dateShape("2026-13-01"), "bad");
  assert.equal(dateShape("25/12/2026"), "dmy");
  assert.equal(dateShape("12/25/2026"), "mdy");
  assert.equal(dateShape("01/02/2026"), "either");
  assert.equal(dateShape("soon"), "bad");
});

test("vendor tax IDs and the 1099 flag", () => {
  const r = validate("Display Name,Business ID No.,Track Payments for 1099\nA,12-345678,Maybe\nB,,Yes\nC,12-3456789,No\n", { kind: "vendors" });
  const t = r.findings.find((f) => f.code === "tax-id");
  assert.match(t.title, /5678/);
  assert.doesNotMatch(t.title, /12-3/);
  assert.ok(codes(r).includes("track-1099"));
  assert.ok(codes(r).includes("1099-no-id"));
  assert.equal(taxIdProblem("123456789"), null);
  assert.match(taxIdProblem("12345678"), /leading zero/);
});

test("products: type, price formats, SKUs, inventory fields, services", () => {
  const H = ["Name", "SKU", "Type", "Sales Price", "Cost", "Quantity on Hand", "As of Date", "Inventory Asset Account"];
  const f = (...rows) => validate(toCsv([H, ...rows]), { kind: "products" });
  assert.ok(codes(f(["A", "1", "Stuff", "", "", "", "", ""])).includes("type"));
  assert.ok(codes(f(["A", "1", "inventory", "", "", "1", "2026-01-01", "Inv"])).includes("type-case"));
  assert.ok(codes(f(["A", "1", "Service", "free", "", "", "", ""])).includes("price-format"));
  assert.ok(codes(f(["A", "1", "Service", "$5.00", "", "", "", ""])).includes("price-clean"));
  assert.ok(codes(f(["A", "1", "Service", "-5", "", "", "", ""])).includes("price-negative"));
  assert.ok(codes(f(["A", "S1", "Service", "1", "", "", "", ""], ["B", "s1", "Service", "1", "", "", "", ""])).includes("dup-sku"));
  assert.ok(codes(f(["A", "1.2E+12", "Service", "1", "", "", "", ""])).includes("sci-sku"));
  for (const c of ["inv-qty", "inv-asset"]) assert.ok(codes(f(["A", "1", "Inventory", "1", "", "", "", ""])).includes(c), c);
  assert.ok(codes(f(["A", "1", "Inventory", "1", "", "-2", "", "Inv"])).includes("qty-negative"));
  assert.ok(codes(f(["A", "1", "Inventory", "1", "", "2", "", "Inv"])).includes("qty-no-date"));
  assert.ok(codes(f(["A", "1", "Service", "1", "", "5", "", ""])).includes("service-qty"));
  assert.ok(codes(f(["A:B", "1", "Service", "1", "", "", "", ""])).includes("colon"));
});

test("over 1000 rows warns and names the number of files", () => {
  const rows = Array.from({ length: ROW_LIMIT + 1 }, (_, i) => [`Customer ${i}`]);
  const r = validate(toCsv([["Display Name"], ...rows]));
  const w = r.findings.find((f) => f.code === "row-limit");
  assert.match(w.detail, /2 files/);
  assert.equal(r.summary.chunks, 2);
});

test("ragged rows, Excel errors and mojibake", () => {
  const r = validate("Display Name,Email\nA,a@b.co,extra\nB\n#REF!,x\nCafÃ©,y\n");
  for (const c of ["extra-cells", "short-row", "excel-error", "mojibake"]) assert.ok(codes(r).includes(c), c);
});

test("semicolon file is reported and repaired", () => {
  const text = "Display Name;Email\nA;a@b.co\n";
  assert.ok(codes(validate(text)).includes("delimiter"));
  assert.match(repair(text).text, /^Display Name,Email\r\n/);
});

test("repair changes only money, type spelling, name edges and the delimiter, and lists each change", () => {
  const text = "Display Name,Opening Balance,Opening Balance As Of\n Acme ,\"$1,250.00\",2026-01-01\nBeta,5.55E+09,\n";
  const f = repair(text);
  const rows = parseCsv(f.text).rows.map((r) => r.cells);
  assert.equal(rows[1][0], "Acme");
  assert.equal(rows[1][1], "1250.00");
  assert.equal(rows[2][1], "5.55E+09");
  assert.equal(f.changes.length, 2);
  const p = repair("Name,Type,Sales Price\nMug,inventory,\"$14.50\"\n", { kind: "products" });
  assert.match(p.text, /Mug,Inventory,14\.50/);
});

test("repair never touches emails, phones, ZIPs, SKUs or tax IDs", () => {
  const text = "Display Name,Email,Phone,Billing ZIP\nAcme,A@B.CO ,555,1852\n";
  const f = repair(text);
  assert.equal(f.changes.length, 0);
  assert.match(f.text, /A@B\.CO /);
});

test("splitRows writes files of at most N rows, each with the header", () => {
  const rows = Array.from({ length: 5 }, (_, i) => [`C${i}`, "x"]);
  const parts = splitRows(toCsv([["Display Name", "Email"], ...rows]), 2);
  assert.deepEqual(parts.map((p) => p.rows), [2, 2, 1]);
  for (const p of parts) assert.match(p.text, /^Display Name,Email\r\n/);
  assert.deepEqual(splitRows(""), []);
});

test("helpers", () => {
  assert.equal(cleanMoney("$1,250.00"), "1250.00");
  assert.equal(cleanMoney("12,50"), "12.50");
  assert.equal(cleanMoney("(40.00)"), "-40.00");
  assert.equal(conceptOf("As of Date", "products"), "qtyasof");
  assert.equal(conceptOf("As of Date", "customers"), "asof");
  assert.match(findingsCsv(validate("Display Name\nA\nA\n")), /dup-name/);
});

test("a final row that is only an empty quoted cell is still a row", () => {
  assert.equal(parseCsv('a\n""').rows.length, 2);
  assert.equal(parseCsv("a\n1").rows.length, 2);
});

test("dateShape rejects a three-digit month", () => {
  assert.equal(dateShape("2024-123-05"), "bad");
  assert.equal(dateShape("2024-012-05"), "bad");
  assert.equal(dateShape("2024-12-05"), "iso");
});

test("a file with no name column reports the error on the header line", () => {
  const r = validate("Email\na@b.com\nc@d.com\n", { kind: "customers" });
  const f = r.findings.find((x) => x.code === "no-name");
  assert.ok(f);
  assert.equal(f.line, r.findings.find((x) => x.code === "no-name").line);
  assert.equal(f.line, 1);
});

test("a colon in a customer name warns and explains the sub-customer reading", () => {
  const r = validate(cust(["Acme: East", "a@b.com", "12345", "", ""]), { kind: "customers" });
  const f = r.findings.find((x) => x.code === "colon");
  assert.ok(f);
  assert.match(f.title, /sub-customer/);
  const p = validate(toCsv([["Name"], ["Pipe: Large"]]), { kind: "products" }).findings.find((x) => x.code === "colon");
  assert.equal(p.title, "Name contains a colon");
  assert.match(p.detail, /means a sub-item/);
  assert.match(f.detail, /may be created as a sub-customer of "Acme"/);
});

test("findingsCsv has one row per finding with its severity and code", () => {
  const r = validate(sampleBrokenFile("customers"), { kind: "customers" });
  const out = parseCsv(findingsCsv(r)).rows.map((x) => x.cells);
  assert.equal(out.length, r.findings.length + 1);
  assert.equal(out[1][0], r.findings[0].severity);
  assert.equal(out[1][2], r.findings[0].code);
  const withLine = r.findings.findIndex((x) => x.line);
  assert.ok(withLine >= 0);
  assert.equal(out[withLine + 1][1], String(r.findings[withLine].line));
});
