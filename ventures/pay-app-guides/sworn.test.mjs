import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSworn, swornStatement, toCsv, summaryText, EXAMPLE } from "./sworn.mjs";


const ex = () => parseSworn(EXAMPLE).lines;

test("reads the header row by meaning, quoted addresses included", () => {
  const { lines, errors } = parseSworn(EXAMPLE);
  assert.deepEqual(errors, []);
  assert.equal(lines.length, 3);
  assert.equal(lines[1].address, "120 Mill Rd, Springfield");
  assert.equal(lines[1].contract, "150000");
  assert.equal(lines[0].changes, "12000");
  assert.equal(lines[1].owing, "22500");
});

test("Michigan's column names map to the right fields; balance to complete is ignored, not read as completed", () => {
  const text = "Subcontractor name\tAddress\tPhone\tType of improvement furnished\tTotal contract price\tAmount already paid\tAmount currently owing\tBalance to complete\tLaborer wages due but unpaid\tFringe benefits and withholdings due but unpaid\nAcme Drywall\t1 Main\t555-0100\tDrywall\t100000\t40000\t10000\t50000\t0\t0";
  const { lines, errors } = parseSworn(text);
  assert.deepEqual(errors, []);
  const l = lines[0];
  assert.equal(l.name, "Acme Drywall");
  assert.equal(l.phone, "555-0100");
  assert.equal(l.work, "Drywall");
  assert.equal(l.contract, "100000");
  assert.equal(l.paid, "40000");
  assert.equal(l.owing, "10000");
  assert.equal(l.completed, "");
});

test("Illinois-style column names: adjusted contract does not take the change-order column", () => {
  const text = "Name,Contract amount,Change orders,Adjusted contract,Work completed to date,Retainage,Net previously paid,Net due this period\nA,100,10,110,60,6,40,14";
  const l = parseSworn(text).lines[0];
  assert.equal(l.contract, "100");
  assert.equal(l.changes, "10");
  assert.equal(l.completed, "60");
  assert.equal(l.paid, "40");
  assert.equal(l.owing, "14");
});

test("missing required columns are reported", () => {
  assert.match(parseSworn("Foo,Bar\n1,2").errors.join(" "), /name/);
  assert.match(parseSworn("").errors[0], /header row/);
});

test("the worked example adds up to the contract and the request, with no high findings", () => {
  const r = swornStatement(ex(), { contractSum: "480000", requested: "32900", state: "IL" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.totals.adjusted, 48000000);
  assert.equal(r.totals.paid, 8500000);
  assert.equal(r.totals.owing, 3290000);
  assert.equal(r.totals.retainage, 1310000);
  assert.equal(r.totals.balance, 48000000 - 8500000 - 3290000);
  assert.equal(r.rows[0].completed, 4000000 + 1040000 + 560000);
  assert.equal(r.findings.filter((f) => f.level === "high").length, 0, JSON.stringify(r.findings));
  // Lowvolt has an address and nothing paid or owing: no waiver for it.
  assert.deepEqual(r.waivers.map((w) => `${w.name}/${w.kind}`), ["Valley Electric Supply/unconditional", "Valley Electric Supply/conditional"]);
});

test("rows short of the contract sum ask for an own-forces row; over it is high", () => {
  const short = swornStatement(ex().slice(1), { contractSum: "480000" });
  assert.match(short.findings.map((f) => f.text).join(" "), /\$280,000\.00 less than your contract sum.*own work/);
  const over = swornStatement(ex(), { contractSum: "400000" });
  assert.equal(over.findings[0].level, "high");
  assert.match(over.findings[0].text, /\$80,000\.00 more than your contract sum/);
});

test("owing more than the request is high; requesting more than owed is medium", () => {
  const less = swornStatement(ex(), { requested: "30000" });
  assert.equal(less.findings[0].level, "high");
  assert.match(less.findings[0].text, /owe \$32,900\.00.*asks for \$30,000\.00/);
  const more = swornStatement(ex(), { requested: "40000" });
  assert.ok(more.findings.some((f) => f.level === "medium" && /own forces/.test(f.text)));
});

test("paid plus owing above the contract is flagged; so is completed that disagrees with paid and owing", () => {
  const r = swornStatement([{ name: "A", address: "x", contract: "100", paid: "80", owing: "30" }]);
  assert.equal(r.findings[0].level, "high");
  assert.match(r.findings[0].text, /more than the contract/);
  const c = swornStatement([{ name: "B", address: "x", contract: "100", completed: "60", retainage: "6", paid: "40", owing: "10" }]);
  assert.match(c.findings.map((f) => f.text).join(" "), /completed to date less retainage is \$54\.00, but paid plus owing is \$50\.00/);
  const ok = swornStatement([{ name: "B", address: "x", contract: "100", completed: "60", retainage: "6", paid: "40", owing: "14" }]);
  assert.deepEqual(ok.findings, []);
});

test("a deductive change order may be negative; other negatives and non-numbers are errors", () => {
  const r = swornStatement([{ name: "A", address: "x", contract: "100", changes: "-10", paid: "50" }]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.rows[0].adjusted, 9000);
  assert.match(swornStatement([{ name: "A", contract: "-1" }]).errors[0], /cannot be negative/);
  assert.match(swornStatement([{ name: "A", contract: "1e5" }]).errors[0], /not a number/);
  assert.match(swornStatement([{ name: "", contract: "1" }]).errors[0], /name is missing/);
  assert.match(swornStatement([{ name: "A", contract: "1" }], { contractSum: "lots" }).errors[0], /contract sum/);
  assert.match(swornStatement([{ name: "A", contract: "1" }], { requested: "-5" }).errors[0], /requested/);
  assert.match(swornStatement([]).errors[0], /at least one/);
});

test("missing addresses are flagged except for own forces; Michigan also wants the type of work", () => {
  const r = swornStatement([{ name: "Own forces", contract: "10" }, { name: "Acme", contract: "10" }], { state: "MI" });
  const t = r.findings.map((f) => f.text).join(" ");
  assert.doesNotMatch(t, /Own forces: no address/);
  assert.match(t, /Acme: no address.*phone number/);
  assert.match(t, /Acme: no type of improvement/);
});

test("unpaid wages and duplicate names are noted", () => {
  const r = swornStatement([{ name: "Crew", address: "x", contract: "10", wages: "2", fringe: "1" }, { name: "crew", address: "x", contract: "5" }]);
  const t = r.findings.map((f) => f.text).join(" ");
  assert.match(t, /unpaid wages \$2\.00, fringe benefits and withholdings \$1\.00/);
  assert.match(t, /listed 2 times/);
});

test("CSV has a header, one row per party and a totals row, with quoted commas", () => {
  const csv = toCsv(swornStatement(ex(), {}));
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 5);
  assert.match(lines[0], /^Name,Address,Phone,Type of work,Contract price/);
  assert.match(lines[2], /^Valley Electric Supply,"120 Mill Rd, Springfield"/);
  assert.match(lines[4], /^Totals,,,,468000\.00,12000\.00,480000\.00/);
});

test("summary lists totals, each party, findings and waivers", () => {
  const r = swornStatement(ex(), { contractSum: "480000", requested: "32900" });
  const s = summaryText(r, { project: "Elm St clinic", through: "2026-11-30" });
  assert.match(s, /Project: Elm St clinic/);
  assert.match(s, /Owing now: \$32,900\.00/);
  assert.match(s, /- Valley Electric Supply \(Wire and gear\): contract \$150,000\.00, paid \$45,000\.00, owing \$22,500\.00, balance \$82,500\.00/);
  assert.match(s, /Lien waivers to collect with it:/);
});

test("a firm whose name merely starts with 'Self' is not read as your own forces", () => {
  const r = swornStatement([{ name: "Selfridge Plumbing", contract: "10", paid: "5" }]);
  assert.match(r.findings.map((f) => f.text).join(" "), /Selfridge Plumbing: no address/);
  assert.equal(r.waivers.length, 1);
});

test("CSV defuses a name a spreadsheet would run as a formula, and keeps negative numbers", () => {
  const csv = toCsv(swornStatement([{ name: "=HYPERLINK(\"x\")", address: "x", contract: "100", changes: "-10" }]));
  assert.match(csv.split("\n")[1], /^"'=HYPERLINK\(""x""\)"/);
  assert.match(csv.split("\n")[1], /,-10\.00,/);
});
