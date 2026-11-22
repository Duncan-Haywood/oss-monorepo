// Each test builds a workbook whose every cell is known and checks the
// rule against a hand-worked answer. Rule sources: Microsoft Support,
// "Detect errors in formulas" (Excel's background error-checking rules:
// inconsistent formula, formula omits cells, numbers as text, formulas
// referring to empty cells), and the FAST Standard / ICAEW Financial
// Modelling Code on typed constants in formulas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildXlsx } from "./xlsxwrite.mjs";
import { auditBytes, findingsCsv } from "./audit.mjs";
import { exampleWorkbook } from "./example.mjs";

const audit = (spec) => auditBytes(buildXlsx(spec));
const by = (r, rule) => r.findings.filter((f) => f.rule === rule);

test("a mistyped reference in a copied row is found, with the formula its neighbours imply", async () => {
  // Revenue row: B4..E4 = units * price. D4 was typed =D2*C3 (last year's
  // price). Hand check: the neighbours' formula moved to D4 is D2*D3.
  const r = await audit({ sheets: [{ name: "M", cells: {
    B2: 100, C2: 110, D2: 120, E2: 130, B3: 5, C3: 5, D3: 6, E3: 6,
    B4: "=B2*B3", C4: "=C2*C3", D4: "=D2*C3", E4: "=E2*E3", F4: "=SUM(B4:E4)",
  } }] });
  const f = by(r, "inconsistent-formula");
  assert.equal(f.length, 1);
  assert.equal(f[0].cell, "D4");
  assert.equal(f[0].expected, "D2*D3");
  assert.equal(f[0].severity, "high");
  // The totals cell at the end of the row does a different operation: not flagged.
  assert.ok(!r.findings.some((x) => x.cell === "F4" && x.rule === "inconsistent-formula"));
});

test("the last cell of a run with the same operation but another reference is found", async () => {
  const r = await audit({ sheets: [{ name: "M", cells: { B2: 1, C2: 2, D2: 3, E2: 4, B3: "=B2*2", C3: "=C2*2", D3: "=D2*2", E3: "=D2*2" } }] });
  const f = by(r, "inconsistent-formula");
  assert.deepEqual(f.map((x) => [x.cell, x.expected]), [["E3", "E2*2"]]);
});

test("a number typed over a formula in a copied column is found", async () => {
  const r = await audit({ sheets: [{ name: "M", cells: { A1: 10, A2: 20, A3: 30, A4: 40, B1: "=A1*1.1", B2: "=A2*1.1", B3: 33, B4: "=A4*1.1" } }] });
  const f = by(r, "overwritten-formula");
  assert.deepEqual(f.map((x) => [x.cell, x.expected, x.severity]), [["B3", "A3*1.1", "high"]]);
});

test("SUM that stops one row short of a number is found; a year header above is not", async () => {
  // B1 is a year header (2025); B2:B5 are values; B6 = SUM(B2:B4) leaves out B5.
  const r = await audit({ sheets: [{ name: "M", cells: { B1: 2025, B2: 1, B3: 2, B4: 3, B5: 4, B6: "=SUM(B2:B4)", C1: 2026, C2: 1, C3: 2, C4: "=SUM(C2:C3)" } }] });
  const f = by(r, "omits-adjacent");
  assert.deepEqual(f.map((x) => x.cell), ["B6"]);
  assert.match(f[0].title, /B5/);
});

test("subtotals beside a range are not counted as left-out numbers", async () => {
  const r = await audit({ sheets: [{ name: "M", cells: { A1: 1, A2: 2, A3: "=SUM(A1:A2)", A4: 5, A5: 6, A6: "=SUM(A4:A5)", A7: "=A3+A6" } }] });
  assert.equal(by(r, "omits-adjacent").length, 0);
});

test("circular references are found across sheets, and iterative calculation is named", async () => {
  const r = await audit({ iterate: true, sheets: [{ name: "A", cells: { A1: "=B!A1+1" } }, { name: "B", cells: { A1: "=A!A1*2", B1: "=B1" } }] });
  const c = by(r, "circular");
  assert.equal(c.length, 2);
  assert.ok(c.some((x) => /through 2 cells/.test(x.title) && /A!A1/.test(x.detail) && /B!A1/.test(x.detail)));
  assert.ok(c.some((x) => /refers to itself/.test(x.title) && x.cell === "B1"));
  assert.match(c[0].detail, /Iterative calculation is on/);
  assert.equal(by(r, "iterative-calc").length, 1);
});

test("a long chain of formulas does not overflow and has no cycle", async () => {
  const cells = { A1: 1 };
  for (let i = 2; i <= 20000; i++) cells[`A${i}`] = `=A${i - 1}+1`;
  const r = await audit({ sheets: [{ name: "Long", cells }] });
  assert.equal(by(r, "circular").length, 0);
  assert.equal(r.summary.formulas, 19999);
  assert.equal(r.summary.distinct, 1);
});

test("error values are traced to the cell where they start", async () => {
  const r = await audit({ sheets: [{ name: "M", cells: { A1: 0, B1: { f: "10/A1", e: "#DIV/0!" }, C1: { f: "B1*2", e: "#DIV/0!" }, D1: { f: "C1+1", e: "#DIV/0!" } } }] });
  const e = by(r, "error-value");
  assert.deepEqual(e.map((x) => x.cell), ["B1"]);
  assert.match(e[0].detail, /2 other error cells/);
});

test("#REF! in a formula and in a named range are found", async () => {
  const r = await audit({ names: [{ name: "Gone", ref: "#REF!$A$1" }], sheets: [{ name: "M", cells: { A1: "=#REF!+1", A2: "=Sheet9!A1" } }] });
  assert.equal(by(r, "ref-error")[0].cell, "A1");
  assert.equal(by(r, "missing-sheet")[0].cell, "A2");
  assert.equal(by(r, "broken-name").length, 1);
});

test("references to empty cells, numbers stored as text, typed constants", async () => {
  const r = await audit({ sheets: [{ name: "M", cells: { A1: "250", B1: "=A1*1.2+Z9", C1: "=SUM(A1:A1)", D1: "=1200+350", E1: "=ROUND(B1,2)", F1: "00123" } }] });
  assert.deepEqual(by(r, "empty-reference").map((x) => x.cell), ["B1"]);
  const t = by(r, "number-as-text");
  assert.ok(t.some((x) => x.cell === "A1" && x.severity === "medium"));
  assert.ok(t.some((x) => x.severity === "info" && /1 number stored as text/.test(x.title)));
  const h = by(r, "hardcoded-number").map((x) => x.title);
  assert.ok(h.some((x) => /^1\.2 typed into 1 formula/.test(x)));
  // ROUND(x, 2): the 2 is a setting of ROUND, not a model assumption.
  assert.ok(!h.some((x) => /^2 typed/.test(x)));
  assert.equal(by(r, "constant-formula")[0].cell, "D1");
});

test("a formula stored as text is found; a label starting with = and no formula is not", async () => {
  const r = await audit({ sheets: [{ name: "M", cells: { A1: { text: "=SUM(D2:D5)" }, A2: { text: "= see note" }, A3: { text: "==" } } }] });
  assert.deepEqual(by(r, "formula-as-text").map((x) => x.cell), ["A1"]);
});

test("names resolve to their cells for the dependency graph", async () => {
  const r = await audit({ names: [{ name: "Loop", ref: "M!$A$1" }], sheets: [{ name: "M", cells: { A1: "=Loop+1" } }] });
  assert.equal(by(r, "circular").length, 1);
});

test("hidden sheets, hidden rows, volatile functions and external references", async () => {
  const r = await audit({ manual: true, sheets: [
    { name: "M", cells: { A1: 5, A2: "=OFFSET(A1,1,0)", A3: "=[1]Other!A1", A4: "=TODAY()" }, hiddenRows: [1] },
    { name: "Secret", state: "veryHidden", cells: { A1: 0.07 } },
  ] });
  assert.equal(by(r, "hidden-sheet")[0].severity, "medium");
  assert.equal(by(r, "hidden-cells").length, 1);
  assert.deepEqual(by(r, "volatile-function").map((x) => x.title).sort(), ["OFFSET in 1 formula", "TODAY in 1 formula"]);
  assert.equal(by(r, "external-link").length, 1);
  assert.equal(by(r, "manual-calc").length, 1);
});

test("a clean, consistently copied model has no high or medium findings", async () => {
  const cells = { A1: "Rate", B1: 0.05 };
  for (let c = 0; c < 12; c++) {
    const col = String.fromCharCode(66 + c);
    cells[`${col}3`] = 100 + c;
    cells[`${col}4`] = `=${col}3*(1+$B$1)`;
    cells[`${col}5`] = `=${col}4-${col}3`;
  }
  cells.N4 = "=SUM(B4:M4)";
  const r = await audit({ sheets: [{ name: "Plan", cells }] });
  assert.equal(r.summary.high + r.summary.medium, 0, JSON.stringify(r.findings.filter((f) => f.severity !== "info"), null, 1));
  assert.equal(r.sheets[0].distinct, 3);
});

test("findings CSV is guarded against formula injection", async () => {
  const r = await audit({ sheets: [{ name: "M", cells: { A1: 1, A2: 2, A3: 3, B1: "=A1*2", B2: 9, B3: "=A3*2" } }] });
  const csv = findingsCsv(r);
  assert.match(csv, /^severity,rule,sheet,cell/);
  assert.match(csv, /,'=A2\*2,/);
  assert.doesNotMatch(csv, /,=A/);
});

test("the sheet map marks pattern starts, copies, numbers, text and flags", async () => {
  const r = await audit({ sheets: [{ name: "M", cells: { A1: "x", B1: 1, C1: 2, D1: 3, B2: "=B1*2", C2: "=C1*2", D2: "=D1*2", C3: 7 } }] });
  assert.deepEqual(r.map("M").rows, ["tnnn", ".Fff", "..n."]);
});

test("the page's worked example contains one of each headline fault", async () => {
  const r = await auditBytes(exampleWorkbook());
  const rules = new Set(r.findings.map((f) => f.rule));
  for (const rule of ["inconsistent-formula", "overwritten-formula", "omits-adjacent", "circular", "error-value", "hardcoded-number", "number-as-text"]) assert.ok(rules.has(rule), rule);
});
