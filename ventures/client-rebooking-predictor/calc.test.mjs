import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDay, dayToIso, parseRows, groupVisits, fitModel, predict, analyze, sampleText, reportCsv, contactPlan, fillTemplate, planCsv, money, pct } from "./calc.mjs";

const D = (iso) => parseDay(iso);

test("parseDay reads ISO, US, day-first-when-unambiguous and month-name dates, and rejects nonsense", () => {
  assert.equal(dayToIso(parseDay("2026-03-07")), "2026-03-07");
  assert.equal(dayToIso(parseDay("3/7/2026")), "2026-03-07");
  assert.equal(dayToIso(parseDay("3/7/26")), "2026-03-07");
  assert.equal(dayToIso(parseDay("25/12/2025")), "2025-12-25");
  assert.equal(dayToIso(parseDay("7 Mar 2026")), "2026-03-07");
  assert.equal(dayToIso(parseDay("Mar 7, 2026")), "2026-03-07");
  assert.equal(dayToIso(parseDay("2026-03-07T10:30:00")), "2026-03-07");
  assert.ok(Number.isNaN(parseDay("2026-02-31")));
  assert.ok(Number.isNaN(parseDay("hello")));
  assert.ok(Number.isNaN(parseDay("")));
});

test("parseRows handles headers in any order, quoted money, and reports skipped rows", () => {
  const r = parseRows('Amount,Customer,Appointment Date\n"$1,200.50",Ann,2026-01-05\n80,Bob,2026-01-06\n,Cy,not a date');
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].client, "ann");
  assert.equal(r.rows[0].amount, 1200.5);
  assert.equal(r.hasAmount, true);
  assert.match(r.warnings[0], /1 row\(s\) were skipped/);
  assert.ok(parseRows("").error);
  assert.ok(parseRows("only one column").error);
});

test("parseRows works with no header and no amount column", () => {
  const r = parseRows("ann,2026-01-05\nann,2026-02-05");
  assert.equal(r.rows.length, 2);
  assert.equal(r.hasAmount, false);
});

test("same-day visits by one client collapse into one visit and sum the amount", () => {
  const g = groupVisits([{ client: "a", day: 5, amount: 10 }, { client: "a", day: 5, amount: 15 }, { client: "a", day: 9, amount: 1 }]);
  assert.deepEqual(g.get("a"), [{ day: 5, amount: 25 }, { day: 9, amount: 1 }]);
});

function simulate(seed, nClients, leaveShare, days = 600) {
  let a = seed;
  const rng = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const rows = [], truth = new Map();
  for (let i = 0; i < nClients; i++) {
    const start = Math.floor(rng() * (days - 120)), mu = Math.log(20 + rng() * 50);
    const leaves = rng() < leaveShare, leaveAt = leaves ? start + 50 + rng() * 250 : Infinity;
    truth.set(`c${i}`, !(leaves && leaveAt < days));
    for (let d = start; d <= days && d < leaveAt; d += Math.max(5, Math.exp(mu + 0.2 * gauss()))) rows.push({ client: `c${i}`, day: 20000 + Math.round(d), amount: 60 });
  }
  return { rows, truth, end: 20000 + days };
}

test("on simulated salons the probability ranking beats plain recency on the hold-out and is calibrated", () => {
  const { rows } = simulate(7, 250, 0.4);
  const r = analyze(rows, { hasAmount: true });
  assert.equal(r.error, undefined);
  assert.ok(r.test, "hold-out ran");
  assert.ok(r.test.auc > 0.8, `auc ${r.test.auc}`);
  assert.ok(r.test.auc > r.test.aucRecency, "model beats recency");
  assert.ok(r.test.brier < r.test.brierBase);
  assert.equal(r.verdict, "usable");
  const g = r.test.groups;
  assert.ok(g[0].predicted < g[1].predicted && g[1].predicted < g[2].predicted);
  assert.ok(Math.abs(g[2].predicted - g[2].observed) < 0.2);
});

test("clients flagged lost are mostly the ones who really left; overdue are between due and lost", () => {
  const { rows, truth } = simulate(21, 300, 0.4);
  const r = analyze(rows, { hasAmount: true });
  const lostHit = r.lost.filter((c) => truth.get(c.client) === false).length / Math.max(1, r.lost.length);
  assert.ok(r.lost.length > 10);
  assert.ok(lostHit > 0.85, `share of flagged-lost that truly left: ${lostHit}`);
  const stayersLost = r.list.filter((c) => truth.get(c.client) && c.segment === "lost").length / r.list.filter((c) => truth.get(c.client)).length;
  assert.ok(stayersLost < 0.08, `active clients wrongly marked lost: ${stayersLost}`);
  for (const c of r.overdue) assert.ok(c.pActive >= 0.2 && c.ratio >= 1.25);
});

test("estimated continuation probability lands near the truth when nobody leaves and when many leave", () => {
  const stay = analyze(simulate(3, 200, 0.0).rows, { hasAmount: true });
  const leave = analyze(simulate(3, 200, 0.7).rows, { hasAmount: true });
  assert.ok(stay.summary.pi > leave.summary.pi);
  assert.ok(stay.summary.pi > 0.97, `pi when none leave ${stay.summary.pi}`);
});

test("predict: probability of being active falls and return-in-window peaks near the typical gap", () => {
  const { rows, end } = simulate(5, 200, 0.3);
  const m = fitModel(groupVisits(rows), end);
  const c = { ...m.clients.find((x) => x.visits.length >= 6) };
  const at = (quiet) => predict(m, { ...c, quiet }, 14);
  const gap = Math.exp(c.mu);
  assert.ok(at(1).pActive > at(gap * 3).pActive);
  assert.ok(at(gap * 0.9).pBack > at(2).pBack);
  assert.ok(at(gap * 6).pActive < 0.3);
  for (const q of [0, 1, gap, gap * 10]) { const p = at(q); assert.ok(p.pActive >= 0 && p.pActive <= 1 && p.pBack >= 0 && p.pBack <= p.pActive + 1e-9); }
});

test("refuses too few clients, too short a history, and too few return visits", () => {
  const few = simulate(1, 12, 0.2).rows;
  assert.match(analyze(few).error, /at least 30 different clients/);
  const short = simulate(1, 120, 0.2).rows.filter((r) => r.day < 20100);
  assert.match(analyze(short).error, /days are needed|different clients|return gaps/);
  const once = Array.from({ length: 60 }, (_, i) => ({ client: `x${i}`, day: 20000 + i * 5, amount: null }));
  assert.match(analyze(once).error, /return gaps|days are needed/);
});

test("the as-of date is the newest visit unless set, and set dates move who is quiet", () => {
  const { rows } = simulate(9, 150, 0.3);
  const base = analyze(rows, { hasAmount: true });
  const later = analyze(rows, { hasAmount: true, asOf: base.summary.asOf + 90 });
  assert.ok(later.summary.counts.lost >= base.summary.counts.lost);
  assert.equal(base.summary.asOf, Math.max(...rows.map((r) => r.day)));
});

test("no amount column: value fields are null and nothing is invented", () => {
  const { rows } = simulate(2, 150, 0.3);
  const r = analyze(rows.map((x) => ({ ...x, amount: null })), { hasAmount: false });
  assert.equal(r.summary.overdueValuePerYear, null);
  assert.equal(r.hasAmount, false);
  assert.ok(r.overdue.every((c) => c.avg === null));
});

test("sample data parses and analyses as usable", () => {
  const p = parseRows(sampleText());
  assert.ok(p.rows.length > 800);
  const r = analyze(p.rows, { hasAmount: p.hasAmount });
  assert.equal(r.verdict, "usable");
  assert.ok(r.summary.counts.overdue > 0 && r.summary.counts.lost > 0);
});

test("csv export has a header, quotes awkward names, and one row per listed client", () => {
  const p = parseRows(sampleText());
  const r = analyze(p.rows, { hasAmount: true });
  r.overdue[0].client = 'smith, "jo"';
  const lines = reportCsv(r).split("\n");
  assert.match(lines[0], /^client,segment,visits/);
  assert.ok(lines.some((l) => l.startsWith('"smith, ""jo""",overdue')));
  assert.equal(lines.length, 1 + r.overdue.length + r.due.length + r.lost.length);
});

test("formatters tolerate missing values", () => {
  assert.equal(money(NaN), "n/a");
  assert.equal(pct(undefined), "n/a");
  assert.equal(money(1234.6), "$1,235");
});

test("contact plan ranks overdue by expected revenue, puts due after, and respects the weekly cap", () => {
  const r = analyze(parseRows(sampleText()).rows, { hasAmount: true });
  const plan = contactPlan(r, { perWeek: 5, weeks: 2 });
  assert.equal(plan.items.length, Math.min(10, r.overdue.length + r.due.length));
  assert.ok(plan.items.every((c) => c.segment !== "lost"));
  assert.deepEqual(plan.items.map((c) => c.week).slice(0, 5), [1, 1, 1, 1, 1]);
  const nOver = plan.items.filter((c) => c.segment === "overdue").length;
  assert.ok(plan.items.slice(0, nOver).every((c) => c.segment === "overdue"));
  for (let i = 1; i < nOver; i++) assert.ok(plan.items[i - 1].pBack * plan.items[i - 1].avg >= plan.items[i].pBack * plan.items[i].avg - 1e-9);
  assert.ok(plan.expectedRevenue > 0 && plan.expectedReturns > 0 && plan.expectedReturns <= plan.items.length);
  assert.equal(contactPlan({ ...r, hasAmount: false }).expectedRevenue, null);
});

test("template fills name, last visit and usual weeks; plan CSV quotes names", () => {
  const c = { client: "Ann", last: D("2026-03-07"), typicalGap: 30 };
  assert.equal(fillTemplate("Hi {name}, since {last_visit} (about {usual_weeks} weeks). {name}!", c), "Hi Ann, since 2026-03-07 (about 4 weeks). Ann!");
  const csv = planCsv({ items: [{ week: 1, client: 'a, "b"', segment: "due", last: D("2026-03-07"), pBack: 0.5, avg: null }] });
  assert.equal(csv.split("\n")[1], '1,"a, ""b""",due,2026-03-07,0.500,');
});
