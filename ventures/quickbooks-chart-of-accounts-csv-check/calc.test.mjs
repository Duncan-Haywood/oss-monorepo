import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, splitCsv, parseCsv, toCsv, detectKind, cleanMoney, findingsCsv, sampleFile, sampleBrokenFile, KINDS, FIELDS, ROW_LIMIT } from "./calc.mjs";

const codes = (r) => r.findings.map((f) => f.code);
const csv = (head, ...rows) => toCsv([head, ...rows]);

test("every clean example has no errors or warnings, every broken one has both", () => {
  for (const k of KINDS) {
    const ok = validate(sampleFile(k));
    assert.deepEqual(ok.findings.filter((f) => f.severity !== "info"), [], k);
    assert.equal(ok.summary.kind, k);
    const bad = validate(sampleBrokenFile(k));
    assert.equal(bad.summary.kind, k);
    assert.ok(bad.findings.some((f) => f.severity === "error"), k);
    assert.ok(bad.findings.some((f) => f.severity === "warning"), k);
  }
});

test("kind is detected from the headings and can be forced", () => {
  assert.equal(detectKind(["Display Name", "Email"]), "customers");
  assert.equal(detectKind(["Display Name", "Tax ID"]), "vendors");
  assert.equal(detectKind(["Name", "SKU", "Type"]), "products");
  assert.equal(detectKind(["Account Name", "Type", "Detail Type"]), "accounts");
  const r = validate("Display Name,Email\nA,a@b.example\n", "vendors");
  assert.equal(r.summary.kind, "vendors");
});

test("parser handles quotes, doubled quotes, embedded newlines and reports the line", () => {
  const p = parseCsv('a,b\n"x, ""y""","line1\nline2"\nz,w\n');
  assert.deepEqual(p.rows.map((r) => r.cells), [["a", "b"], ['x, "y"', "line1\nline2"], ["z", "w"]]);
  assert.equal(p.rows[2].line, 4);
  assert.equal(parseCsv('a,"open\nb').unterminated, 1);
});

test("empty file, missing name column and unterminated quote stop early", () => {
  assert.equal(validate("").findings[0].code, "empty");
  assert.ok(codes(validate("Email,Phone\na@b.example,5550102030\n")).includes("missing-required"));
  assert.equal(validate('Display Name,Email\n"A,1\n').findings[0].code, "quote");
});

test("semicolon files are reported and repaired", () => {
  const text = "Display Name;Email\nAcme;a@acme.example\n";
  assert.ok(codes(validate(text)).includes("delimiter"));
  const fixed = repair(text);
  assert.match(fixed.text, /^Display Name,Email\r\n/);
  assert.match(fixed.changes[0], /semicolon/);
});

test("duplicate display names are caught case-insensitively and with a trailing space", () => {
  const r = validate(csv(["Display Name"], ["Acme"], ["ACME "]));
  const d = r.findings.find((f) => f.code === "dup-name");
  assert.ok(d);
  assert.equal(d.line, 3);
  assert.ok(codes(r).includes("whitespace"));
});

test("emails: malformed addresses are errors, several addresses in one cell are allowed", () => {
  const r = validate(csv(["Display Name", "Email"], ["A", "a@x.example, b@y.example"], ["B", "b@nodot"], ["C", "has space@x.example"]));
  assert.deepEqual(r.findings.filter((f) => f.code === "email").map((f) => f.line), [3, 4]);
});

test("Excel damage: scientific notation phone, lost ZIP and tax ID zeros", () => {
  const c = validate(csv(["Display Name", "Phone", "Billing State", "Billing ZIP", "Billing Country"], ["A", "5.55E+09", "NJ", "7102", "USA"]));
  assert.ok(codes(c).includes("sci"));
  assert.ok(codes(c).includes("zip-zero"));
  const v = validate(csv(["Display Name", "Tax ID"], ["A", "12345678"], ["B", "12-3456789"]));
  assert.deepEqual(v.findings.filter((f) => f.code === "taxid-zero").map((f) => f.line), [2]);
});

test("ZIP and state checks are skipped for non-US countries", () => {
  const r = validate(csv(["Display Name", "Billing State", "Billing ZIP", "Billing Country"], ["A", "Ontario", "K1A 0B1", "Canada"]));
  assert.deepEqual(r.findings.filter((f) => ["state", "state-name", "zip", "zip-zero", "zip-length"].includes(f.code)), []);
});

test("money: symbols, thousands separators, decimal commas and accounting negatives", () => {
  assert.equal(cleanMoney("$1,200.00"), "1200.00");
  assert.equal(cleanMoney("9,50"), "9.50");
  assert.equal(cleanMoney("(300.00)"), "-300.00");
  assert.equal(cleanMoney("300.00-"), "-300.00");
  assert.equal(cleanMoney("twelve"), "twelve");
  const r = validate(csv(["Display Name", "Opening Balance", "Opening Balance As Of"], ["A", "$10.00", "12/31/2023"], ["B", "ten", "12/31/2023"]));
  assert.deepEqual(r.findings.filter((f) => f.code === "money").map((f) => f.line), [2, 3]);
});

test("opening balance needs an as-of date", () => {
  const r = validate(csv(["Display Name", "Opening Balance", "Opening Balance As Of"], ["A", "10", ""], ["B", "0", ""]));
  assert.deepEqual(r.findings.filter((f) => f.code === "asof-missing").map((f) => f.line), [2]);
});

test("dates: impossible dates, day-first files, mixed order and Excel serials", () => {
  const head = ["Display Name", "Opening Balance", "Opening Balance As Of"];
  assert.ok(codes(validate(csv(head, ["A", "1", "13/31/2023"]))).includes("date-invalid"), "neither order makes 13/31 a date");
  assert.ok(codes(validate(csv(head, ["A", "1", "02/30/2023"]))).includes("date-invalid"));
  assert.ok(codes(validate(csv(head, ["A", "1", "29/02/2024"]))).every((c) => c !== "date-invalid"), "day-first leap day is valid");
  assert.ok(codes(validate(csv(head, ["A", "1", "30/12/2023"], ["B", "1", "12/30/2023"]))).includes("date-order-mixed"));
  assert.ok(codes(validate(csv(head, ["A", "1", "45291"]))).includes("date-serial"));
  assert.ok(codes(validate(csv(head, ["A", "1", "03/04/2024"]))).includes("date-ambiguous"));
  assert.ok(codes(validate(csv(head, ["A", "1", "2023-02-31"]))).includes("date-invalid"));
});

test("a blank Display Name with a person's name is flagged as derived", () => {
  const r = validate(csv(["Display Name", "First Name", "Last Name"], ["", "Maria", "Santos"]));
  assert.ok(codes(r).includes("required-blank"));
  assert.ok(codes(r).includes("display-name-derived"));
});

test("headings: aliases map with a note, unknown headings are info, duplicates are errors", () => {
  const r = validate(csv(["Customer", "E-mail", "Favourite colour", "Name"], ["A", "a@x.example", "red", "B"]));
  assert.ok(codes(r).includes("alias-header"));
  assert.ok(codes(r).includes("unmapped-header"));
  assert.ok(codes(r).includes("dup-header"));
  assert.equal(r.findings.find((f) => f.code === "unmapped-header").severity, "info");
});

test("vendors: 1099 vendor without a tax ID, and the same tax ID twice", () => {
  const r = validate(csv(["Display Name", "Tax ID", "Track Payments For 1099"], ["A", "", "Yes"], ["B", "12-3456789", "No"], ["C", "123456789", "No"]));
  assert.deepEqual(r.findings.filter((f) => f.code === "1099-no-taxid").map((f) => f.line), [2]);
  assert.deepEqual(r.findings.filter((f) => f.code === "dup-taxid").map((f) => f.line), [4]);
});

test("products: type spelling, quantity on a service, inventory without asset account, duplicate SKU", () => {
  const head = ["Name", "SKU", "Type", "Quantity On Hand", "Quantity As Of", "Inventory Asset Account", "Income Account"];
  const r = validate(csv(head, ["A", "S1", "Inventry", "", "", "", "Sales"], ["B", "S1", "Service", "5", "", "", "Sales"], ["C", "S3", "Inventory", "4", "", "", "Sales"]));
  const t = r.findings.find((f) => f.code === "ptype");
  assert.equal(t.line, 2);
  assert.match(t.detail, /Did you mean Inventory/);
  assert.ok(codes(r).includes("qty-noninventory"));
  assert.ok(codes(r).includes("dup-sku"));
  assert.ok(codes(r).includes("qty-asof"));
  assert.ok(codes(r).includes("asset-account"));
});

test("accounts: type spelling, duplicate number and name, parent order, balance on an income account", () => {
  const r = validate(csv(["Account Name", "Number", "Type", "Detail Type", "Balance"],
    ["Rent:Storage", "6110", "Expnses", "Rent", ""], ["Rent", "6110", "Expenses", "Rent", "900"], ["Rent", "6120", "Bank", "", ""]));
  const by = (c) => r.findings.filter((f) => f.code === c).map((f) => f.line);
  assert.deepEqual(by("atype"), [2]);
  assert.deepEqual(by("dup-number"), [3]);
  assert.deepEqual(by("dup-name"), [4]);
  assert.deepEqual(by("parent-order"), [2]);
  assert.deepEqual(by("pnl-balance"), [3]);
  assert.deepEqual(by("detail-blank"), [4]);
});

test("repair: spaces, money, state names, mailto, and nothing else", () => {
  const text = csv(["display name", "Email", "Billing State", "Billing Country", "Opening Balance", "Phone"],
    [" Acme ", "mailto:a@x.example", "Texas", "USA", "$1,000.00", "(555) 010-2030"],
    ["B", "b@x.example", "Ontario", "Canada", "(5.00)", "  "]);
  const fixed = repair(text);
  assert.equal(fixed.error, null);
  const p = parseCsv(fixed.text).rows.map((r) => r.cells);
  assert.deepEqual(p[0][0], "Display Name");
  assert.deepEqual(p[1], ["Acme", "a@x.example", "TX", "USA", "1000.00", "(555) 010-2030"]);
  assert.deepEqual(p[2], ["B", "b@x.example", "Ontario", "Canada", "-5.00", "  "]);
  assert.ok(fixed.changes.length >= 5);
});

test("repair never touches names, numbers, tax IDs or dates, and a repaired broken file has fewer errors", () => {
  const before = validate(sampleBrokenFile("customers"));
  const fixed = repair(sampleBrokenFile("customers"));
  const after = validate(fixed.text);
  const n = (r) => r.findings.filter((f) => f.severity !== "info").length;
  assert.ok(n(after) < n(before));
  assert.ok(after.findings.some((f) => f.code === "date-invalid"), "dates are left for the user");
  const v = repair(csv(["Display Name", "Tax ID", "Opening Balance As Of"], ["A", "12345678", "31/12/2023"]));
  assert.deepEqual(parseCsv(v.text).rows[1].cells, ["A", "12345678", "31/12/2023"]);
  assert.equal(repair("").error, "The file is empty.");
});

test("files over the row limit warn and splitCsv returns parts that each carry the header", () => {
  const rows = Array.from({ length: ROW_LIMIT + 5 }, (_, i) => [`Name ${i}`]);
  const text = csv(["Display Name"], ...rows);
  assert.ok(codes(validate(text)).includes("row-limit"));
  const parts = splitCsv(text);
  assert.equal(parts.length, 2);
  assert.equal(parseCsv(parts[0]).rows.length, ROW_LIMIT + 1);
  assert.equal(parseCsv(parts[1]).rows.length, 6);
  assert.match(parts[1], /^Display Name\r\n/);
  assert.deepEqual(splitCsv(""), []);
});

test("findings export is a CSV with a header row", () => {
  const out = findingsCsv(validate(sampleBrokenFile("vendors")));
  assert.match(out, /^severity,line,code,title,detail\r\n/);
});

test("field tables are consistent: unique names, aliases normalised and not shared inside a kind", () => {
  for (const k of KINDS) {
    const names = FIELDS[k].map((f) => f.name);
    assert.equal(new Set(names).size, names.length, k);
    const aliases = FIELDS[k].flatMap((f) => f.aliases || []);
    for (const a of aliases) assert.equal(a, a.toLowerCase().replace(/[^a-z0-9]/g, ""), a);
    assert.equal(new Set(aliases).size, aliases.length, `${k} aliases`);
  }
});
