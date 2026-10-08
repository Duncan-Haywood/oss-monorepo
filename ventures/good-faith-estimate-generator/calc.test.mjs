import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseISO, fmtISO, federalHolidays, isBusinessDay, addBusinessDays, businessDaysBetween, gfeDeadline,
  num, money, lineTotal, estimateTotals, checkEstimate, disputeCheck, parseHistory, exceedanceReport,
  renderText, EXAMPLE, DISPUTE_THRESHOLD,
} from "./calc.mjs";

test("parseISO rejects impossible dates", () => {
  assert.equal(parseISO("2026-02-30"), null);
  assert.equal(parseISO("26-02-03"), null);
  assert.equal(parseISO(undefined), null);
  assert.equal(fmtISO(parseISO("2026-10-08")), "2026-10-08");
});

test("federal holidays include observed days and the second Monday of October", () => {
  const h = federalHolidays(2026);
  assert.ok(h.has("2026-10-12")); // Columbus Day
  assert.ok(h.has("2026-11-26")); // Thanksgiving
  assert.ok(h.has("2026-07-03")); // July 4 falls on Saturday, observed Friday
  assert.ok(h.has("2026-05-25")); // Memorial Day
  assert.equal(h.size, 11);
  assert.ok(!federalHolidays(2020).has("2020-06-19")); // Juneteenth starts 2021
});

test("business days skip weekends and holidays, and the holiday toggle works", () => {
  const thu = parseISO("2026-10-08");
  assert.equal(fmtISO(addBusinessDays(thu, 3)), "2026-10-14"); // Fri, (Mon holiday), Tue, Wed
  assert.equal(fmtISO(addBusinessDays(thu, 3, false)), "2026-10-13");
  assert.equal(isBusinessDay(parseISO("2026-10-10")), false);
  assert.equal(businessDaysBetween(parseISO("2026-10-08"), parseISO("2026-10-09")), 0);
});

test("New Year observed on Dec 31 is not a business day", () => {
  // 2022-01-01 is a Saturday, so the observed holiday is Friday 2021-12-31.
  assert.equal(isBusinessDay(parseISO("2021-12-31")), false);
});

test("deadline tiers: 10+, 3-9, under 3, and a direct request", () => {
  const far = gfeDeadline({ scheduledOn: "2026-10-08", serviceOn: "2026-11-23" });
  assert.equal(far.tier, "10+");
  assert.equal(far.dueBy, "2026-10-14");
  const mid = gfeDeadline({ scheduledOn: "2026-10-01", serviceOn: "2026-10-09" });
  assert.equal(mid.tier, "3-9");
  assert.equal(mid.leadBusinessDays, 5);
  assert.equal(mid.dueBy, "2026-10-02");
  const near = gfeDeadline({ scheduledOn: "2026-10-08", serviceOn: "2026-10-09" });
  assert.equal(near.required, false);
  const req = gfeDeadline({ kind: "request", requestedOn: "2026-10-08" });
  assert.equal(req.tier, "request");
  assert.equal(req.dueBy, "2026-10-14");
});

test("tier boundaries: exactly 10 and exactly 3 business days ahead", () => {
  // Mon 2026-09-14 -> strictly between counts Tue..: service Mon 2026-09-28 has 9 between
  assert.equal(gfeDeadline({ scheduledOn: "2026-09-14", serviceOn: "2026-09-28" }).leadBusinessDays, 9);
  assert.equal(gfeDeadline({ scheduledOn: "2026-09-14", serviceOn: "2026-09-29" }).tier, "10+");
  assert.equal(gfeDeadline({ scheduledOn: "2026-09-14", serviceOn: "2026-09-17" }).tier, "under-3");
  assert.equal(gfeDeadline({ scheduledOn: "2026-09-14", serviceOn: "2026-09-18" }).tier, "3-9");
});

test("deadline errors are readable, not thrown", () => {
  assert.equal(gfeDeadline({ scheduledOn: "", serviceOn: "2026-10-09" }).ok, false);
  assert.equal(gfeDeadline({ scheduledOn: "2026-10-09", serviceOn: "2026-10-01" }).ok, false);
  assert.equal(gfeDeadline({ kind: "request", requestedOn: "x" }).ok, false);
});

test("num and money handle dollars, commas and junk", () => {
  assert.equal(num("$1,234.50"), 1234.5);
  assert.ok(Number.isNaN(num("")));
  assert.ok(Number.isNaN(num("abc")));
  assert.equal(money(1234.5), "$1,234.50");
  assert.equal(money(-5), "-$5.00");
});

test("line totals and per-provider subtotals", () => {
  assert.equal(lineTotal({ qty: "3", charge: "19.99" }), 59.97);
  assert.equal(lineTotal({ qty: "0", charge: "10" }), 0);
  const t = estimateTotals(EXAMPLE.lines, EXAMPLE.provider.name);
  assert.equal(t.total, 357);
  assert.deepEqual(t.byProvider, [
    { name: "Riverside Family Medicine", amount: 265 },
    { name: "Example Reference Lab", amount: 92 },
  ]);
});

test("the example estimate is complete", () => {
  const r = checkEstimate(EXAMPLE);
  assert.deepEqual(r.findings.filter((f) => f.level === "missing"), []);
  assert.equal(r.complete, true);
});

test("an empty form lists what is missing, most serious first", () => {
  const r = checkEstimate({ provider: {}, patient: {}, lines: [] });
  assert.equal(r.complete, false);
  assert.ok(r.findings.some((f) => /NPI/.test(f.text)));
  assert.ok(r.findings.some((f) => /No service lines/.test(f.text)));
  const levels = r.findings.map((f) => f.level);
  assert.deepEqual(levels, [...levels].sort((a, b) => (a === "missing" ? 0 : 1) - (b === "missing" ? 0 : 1)));
});

test("code shape checks accept CPT and HCPCS and reject nonsense", () => {
  const g = structuredClone(EXAMPLE);
  g.lines[0].code = "J3490";
  g.lines[1].code = "99";
  const r = checkEstimate(g);
  assert.ok(r.findings.some((f) => /Line 2: service code/.test(f.text)));
  assert.ok(!r.findings.some((f) => /Line 1: service code/.test(f.text)));
});

test("missing diagnosis and unlisted co-providers are warnings", () => {
  const g = structuredClone(EXAMPLE);
  g.lines[0].dx = "";
  g.otherProviders = "";
  const r = checkEstimate(g);
  assert.ok(r.findings.some((f) => f.level === "warn" && /no diagnosis/.test(f.text)));
  assert.ok(r.findings.some((f) => f.level === "warn" && /listed none/.test(f.text)));
  assert.equal(r.complete, true);
});

test("dispute test: exactly $400 over is eligible, $399.99 is not", () => {
  assert.equal(disputeCheck({ estimated: 1000, billed: 1400 }).eligible, true);
  assert.equal(disputeCheck({ estimated: 1000, billed: 1399.99 }).eligible, false);
  assert.equal(disputeCheck({ estimated: 1000, billed: 900 }).over, -100);
  assert.equal(disputeCheck({ estimated: 1000, billed: 1100 }).headroom, 300);
  assert.equal(disputeCheck({ estimated: "", billed: 5 }).ok, false);
});

test("dispute window is 120 days from the bill", () => {
  const r = disputeCheck({ estimated: 100, billed: 600, billDate: "2026-01-01", today: "2026-04-01" });
  assert.equal(r.deadline, "2026-05-01");
  assert.equal(r.daysLeft, 30);
});

test("history parser skips a header and reports unreadable lines", () => {
  const { rows, bad } = parseHistory("case,code,estimate,actual\nA1,99213,100,120\n\nbroken line\nA2,99214,x,5");
  assert.equal(rows.length, 1);
  assert.equal(bad.length, 2);
  assert.equal(rows[0].code, "99213");
});

test("exceedance report finds disputable cases and drifting codes", () => {
  const { rows } = parseHistory(EXAMPLE.history);
  const r = exceedanceReport(rows);
  assert.equal(r.cases, 5);
  // A3: +35 +100 = 135 over; A2: +40; A5: +490 -> only A5 crosses $400
  assert.equal(r.disputable, 1);
  assert.equal(r.worst[0].caseId, "A5");
  assert.equal(r.worst[0].over, 490);
  assert.equal(r.disputableRate, 0.2);
  const c99214 = r.codes.find((c) => c.code === "99214");
  assert.equal(c99214.n, 3);
  assert.equal(c99214.underEstimated, 3);
  assert.equal(r.codes[0].code, "99214");
  assert.equal(DISPUTE_THRESHOLD, 400);
});

test("exceedance report on no data does not divide by zero", () => {
  const r = exceedanceReport([]);
  assert.equal(r.cases, 0);
  assert.equal(r.disputableRate, 0);
});

test("rendered text carries totals, other providers, the patient rights paragraph and no HTML", () => {
  const t = renderText(EXAMPLE, gfeDeadline({ scheduledOn: EXAMPLE.scheduledOn, serviceOn: EXAMPLE.serviceOn }));
  assert.match(t, /TOTAL EXPECTED CHARGES: \$357\.00/);
  assert.match(t, /Subtotal, Example Reference Lab: \$92\.00/);
  assert.match(t, /not a bill and not a contract/);
  assert.match(t, /\$400\.00 or more/);
  assert.match(t, /120 calendar days/);
  assert.match(t, /Example Reference Lab, NPI/);
  assert.doesNotMatch(t, /<[a-z]/i);
});
