import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSeparators, splitSegments, parseEra, parseSchedule, analyze, buildEra, sampleEra, sampleSchedule, carcInfo, worksheetCsv, lineAllowed, money } from "./calc.mjs";

const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
const pay = (claims, extra = {}) => ({ payer: "ACME PLAN", date: "20251003", trace: "T1", claims, ...extra });
const one = (id, code, charge, allowed, pr = 0, units = 1, mods = []) => ({
  id, date: "20250901", charge, paid: allowed - pr, pr,
  lines: [{ code, mods, units, charge, paid: allowed - pr, cas: [...(pr ? [["PR", "2", pr]] : []), ["CO", "45", charge - allowed]] }],
});

test("separators come from the fixed-width ISA header", () => {
  const era = sampleEra();
  assert.deepEqual(detectSeparators(era), { el: "*", comp: ":", seg: "~", fromIsa: true });
  const odd = era.replace(/\*/g, "|").replace(/~/g, "\\").replace(/:/g, ">");
  const s = detectSeparators(odd);
  assert.equal(s.el, "|"); assert.equal(s.seg, "\\"); assert.equal(s.comp, ">");
  assert.ok(splitSegments(odd).segs.length > 20);
});

test("sample parses: one payment, eleven claims, lines, one provider adjustment", () => {
  const p = parseEra(sampleEra());
  assert.equal(p.error, undefined);
  assert.equal(p.transactions.length, 1);
  assert.equal(p.claims.length, 11);
  assert.equal(p.lines.length, 11);
  assert.equal(p.plb.length, 1);
  assert.equal(p.transactions[0].payer, "EXAMPLE HEALTH PLAN");
  assert.equal(p.transactions[0].trace, "EXAMPLE0001");
  assert.deepEqual(p.issues, []);
});

test("patient names are never kept on any parsed object", () => {
  const p = parseEra(sampleEra());
  assert.doesNotMatch(JSON.stringify(p, (k, v) => (k === "claim" ? undefined : v)), /SYNTHETIC|PATIENT/);
});

test("files that are not an 835 get a plain error, not a crash", () => {
  assert.match(parseEra("").error, /empty/);
  assert.match(parseEra("hello world").error, /No 835/);
  assert.match(parseEra("ST*837*0001~SE*2*0001~").error, /837/);
});

test("fee schedule parser reads codes, modifiers, dollars and reports bad lines", () => {
  const s = parseSchedule("code,rate\n99213,$92.50\n99213-25,80\n93000\t17.5\n99214 131\nnonsense line\n");
  assert.equal(s.count, 4);
  assert.equal(s.rates.get("99213"), 92.5);
  assert.equal(s.rates.get("99213|25"), 80);
  assert.equal(s.rates.get("93000"), 17.5);
  assert.deepEqual(s.bad, [6]);
});

test("allowed amount prefers AMT*B6 and otherwise is paid plus patient responsibility", () => {
  const p = parseEra(buildEra([pay([one("C1", "99213", 150, 92.5, 20)])]));
  assert.deepEqual(lineAllowed(p.lines[0]), { amount: 92.5, source: "paid + patient responsibility" });
  const withB6 = parseEra(buildEra([pay([{ ...one("C2", "99213", 150, 92.5, 20), lines: [{ ...one("C2", "99213", 150, 92.5, 20).lines[0], allowed: 95 }] }])]));
  assert.deepEqual(lineAllowed(withB6.lines[0]), { amount: 95, source: "AMT*B6" });
});

test("sequestration is added back so a Medicare line is not flagged for it", () => {
  const c = one("S1", "99213", 150, 92.5, 18.5);
  c.lines[0].cas.push(["CO", "253", 1.48]);
  c.lines[0].paid = 92.5 - 18.5 - 1.48; c.paid = c.lines[0].paid;
  const p = parseEra(buildEra([pay([c])]));
  near(lineAllowed(p.lines[0]).amount, 92.5);
});

test("contract mode flags only lines below the schedule by more than the tolerance", () => {
  const era = buildEra([pay([one("A", "99213", 150, 92.5, 20), one("B", "99213", 150, 74, 20), one("C", "99213", 150, 91.8, 20), one("D", "99214", 220, 131, 30)])]);
  const r = analyze(parseEra(era), { schedule: parseSchedule("99213,92.50\n99214,131"), tolerance: 1 });
  assert.equal(r.mode, "contract");
  assert.equal(r.flagged.length, 1);
  assert.equal(r.flagged[0].line.claimId, "B");
  near(r.flagged[0].shortfall, 18.5);
  near(r.shortfallTotal, 18.5);
  assert.equal(r.testedLines, 4);
});

test("units scale the expected amount", () => {
  const era = buildEra([pay([one("U", "97110", 120, 50, 0, 2)])]);
  const r = analyze(parseEra(era), { schedule: parseSchedule("97110,30") });
  assert.equal(r.flagged.length, 1);
  near(r.flagged[0].expected, 60);
  near(r.flagged[0].shortfall, 10);
});

test("a modifier rate beats the base rate when the schedule has both", () => {
  const era = buildEra([pay([one("M", "99213", 150, 70, 0, 1, ["25"])])]);
  const withMod = analyze(parseEra(era), { schedule: parseSchedule("99213,92.5\n99213-25,70") });
  assert.equal(withMod.flagged.length, 0);
  const baseOnly = analyze(parseEra(era), { schedule: parseSchedule("99213,92.5") });
  assert.equal(baseOnly.flagged.length, 1);
});

test("lines with denials, bundling or other reasons are not treated as contract tests", () => {
  const c = one("X", "99213", 150, 50, 0);
  c.lines[0].cas.push(["CO", "97", 0.01]);
  const r = analyze(parseEra(buildEra([pay([c])])), { schedule: parseSchedule("99213,92.5") });
  assert.equal(r.flagged.length, 0);
  assert.equal(r.skippedLines, 1);
});

test("payer filter limits which payers a schedule is applied to", () => {
  const era = buildEra([pay([one("A", "99213", 150, 70)], { payer: "ACME PLAN" }), pay([one("B", "99213", 150, 70)], { payer: "OTHER CARRIER", trace: "T2" })]);
  const r = analyze(parseEra(era), { schedule: parseSchedule("99213,92.5"), payerFilter: "acme" });
  assert.equal(r.flagged.length, 1);
  assert.equal(r.flagged[0].line.payer, "ACME PLAN");
});

test("codes missing from the schedule are named, not guessed", () => {
  const r = analyze(parseEra(buildEra([pay([one("A", "99213", 150, 92.5), one("B", "81002", 20, 4)])])), { schedule: parseSchedule("99213,92.5") });
  assert.deepEqual(r.unmatchedCodes, ["81002"]);
});

test("inferred mode compares a payer with its own usual amount and needs three lines", () => {
  const sample = analyze(parseEra(sampleEra()), {});
  assert.equal(sample.mode, "inferred");
  assert.deepEqual(sample.flagged.map((f) => f.line.claimId).sort(), ["A1003", "A1006"]);
  const two = analyze(parseEra(buildEra([pay([one("A", "99213", 150, 92.5), one("B", "99213", 150, 60)])])), {});
  assert.equal(two.flagged.length, 0);
});

test("inferred mode stays quiet when there is no usual amount", () => {
  const r = analyze(parseEra(buildEra([pay([one("A", "99213", 150, 92.5), one("B", "99213", 150, 80), one("C", "99213", 150, 70)])])), {});
  assert.equal(r.flagged.length, 0);
});

test("the shipped example finds the two short lines against its own schedule too", () => {
  const r = analyze(parseEra(sampleEra()), { schedule: parseSchedule(sampleSchedule()) });
  assert.equal(r.mode, "contract");
  assert.deepEqual(r.flagged.map((f) => f.line.claimId).sort(), ["A1003", "A1006"]);
  near(r.shortfallTotal, (92.5 - 74) + (131 - 104.8));
  assert.equal(r.shortByCode.length, 2);
  assert.equal(r.shortByPayer[0].lines, 2);
});

test("denials are collected with their lead reason and a next step", () => {
  const r = analyze(parseEra(sampleEra()), {});
  assert.equal(r.denials.length, 2);
  const byId = Object.fromEntries(r.denials.map((d) => [d.claimId, d]));
  assert.equal(byId.A1010.reason, "197");
  assert.equal(byId.A1010.next, "appeal");
  assert.equal(byId.A1011.next, "resubmit");
  near(r.denialTotal, 275);
  assert.equal(r.denialSummary.length, 2);
});

test("a reversal is not counted as a denial", () => {
  const rev = { id: "R", date: "20250901", charge: -100, paid: -60, pr: 0, status: 22, lines: [] };
  const r = analyze(parseEra(buildEra([pay([rev])])), {});
  assert.equal(r.denials.length, 0);
  near(r.summary.paid, -60);
});

test("provider-level adjustments are listed and netted", () => {
  const r = analyze(parseEra(sampleEra()), {});
  assert.equal(r.plb.length, 1);
  assert.equal(r.plb[0].label, "Overpayment recovery");
  near(r.summary.plbNet, 41.2);
});

test("a clean file balances, deposit included", () => {
  const r = analyze(parseEra(sampleEra()), {});
  assert.equal(r.unbalancedClaims.length, 0);
  assert.equal(r.unbalancedLines.length, 0);
  assert.equal(r.paymentMismatch.length, 0);
});

test("a deposit that disagrees with claims less provider adjustments is reported", () => {
  const r = analyze(parseEra(buildEra([pay([one("A", "99213", 150, 92.5)], { total: 100 })])), {});
  assert.equal(r.paymentMismatch.length, 1);
  near(r.paymentMismatch[0].gap, 100 - 92.5);
});

test("a claim whose adjustments do not add up is reported", () => {
  const c = one("B", "99213", 150, 92.5, 0);
  c.lines[0].cas = [["CO", "45", 40]];
  const r = analyze(parseEra(buildEra([pay([c])])), {});
  assert.equal(r.unbalancedLines.length, 1);
  assert.equal(r.unbalancedClaims.length, 1);
});

test("adjustment reasons carry plain-language text and group totals", () => {
  const r = analyze(parseEra(sampleEra()), {});
  const co45 = r.adjustmentsByReason.find((x) => x.group === "CO" && x.reason === "45");
  assert.match(co45.text, /fee schedule/);
  assert.ok(r.adjustmentsByGroup.find((g) => g.group === "PR").amount > 0);
  assert.equal(carcInfo("9999").next, "unknown");
  assert.equal(carcInfo("B7").next, "appeal");
});

test("multiple payments in one file stay separate by payer", () => {
  const era = buildEra([pay([one("A", "99213", 150, 92.5)]), pay([one("B", "99213", 150, 80)], { payer: "SECOND PLAN", trace: "T2" })]);
  const r = analyze(parseEra(era), {});
  assert.equal(r.summary.payments, 2);
  assert.deepEqual(r.payers.map((p) => p.payer).sort(), ["ACME PLAN", "SECOND PLAN"]);
});

test("worksheet CSV lists flagged lines then denials and defuses formulas", () => {
  const c = one("=HYPERLINK(1)", "99213", 150, 70);
  const r = analyze(parseEra(buildEra([pay([c])])), { schedule: parseSchedule("99213,92.5") });
  const csv = worksheetCsv(r);
  const lines = csv.split("\n");
  assert.match(lines[0], /^type,payer,patient_control_no/);
  assert.match(lines[1], /^underpaid vs contract,ACME PLAN,'=HYPERLINK\(1\)/);
  const d = worksheetCsv(analyze(parseEra(sampleEra()), {}));
  assert.match(d, /denied claim,EXAMPLE HEALTH PLAN,A1010/);
});

test("garbled amounts are reported as issues and the rest still reads", () => {
  const bad = sampleEra().replace("CLP*A1001*1*150.00", "CLP*A1001*1*abc");
  const p = parseEra(bad);
  assert.ok(p.issues.some((i) => /Claim amounts are not numbers/.test(i)));
  assert.ok(p.claims.length >= 10);
});

test("money formats", () => {
  assert.equal(money(1234.5), "$1,234.50");
  assert.equal(money(-3), "-$3.00");
  assert.equal(money(null), "–");
});
