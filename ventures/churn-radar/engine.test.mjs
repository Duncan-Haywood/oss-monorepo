import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "./engine.mjs";

const NOW = Date.UTC(2026, 9, 15, 12);
const acct = (signupDaysAgo, eventDaysAgo, churnedDaysAgo = null, type = "login") => ({
  signupAt: NOW - signupDaysAgo * E.DAY, churnedAt: churnedDaysAgo == null ? null : NOW - churnedDaysAgo * E.DAY,
  events: eventDaysAgo.map((d) => [NOW - d * E.DAY, type]).sort((a, b) => a[0] - b[0]),
});

test("windowAt counts only events up to t and splits the two weeks", () => {
  const a = acct(60, [1, 2, 3, 9, 10, 40]);
  const w = E.windowAt(a, NOW);
  assert.equal(w.e7, 3); assert.equal(w.ePrev7, 2); assert.equal(w.e28, 5);
  assert.equal(w.activeDays14, 5); assert.ok(Math.abs(w.daysSilent - 1) < 1e-9);
  const past = E.windowAt(a, NOW - 20 * E.DAY); // sees only the 40-day-old event
  assert.equal(past.e28, 1); assert.equal(past.e7, 0); assert.ok(Math.abs(past.daysSilent - 20) < 1e-9);
});

test("ingest is idempotent, orders events, and rejects bad input", () => {
  const s = E.newState();
  assert.equal(E.ingest(s, { id: "e1", account: "a", type: "login", timestamp: NOW - 2 * E.DAY }, NOW), "accepted");
  assert.equal(E.ingest(s, { id: "e1", account: "a", type: "login", timestamp: NOW - 2 * E.DAY }, NOW), "duplicate");
  E.ingest(s, { id: "e2", account: "a", timestamp: NOW - 5 * E.DAY }, NOW);
  assert.deepEqual(s.accounts.a.events.map((e) => e[0]), [NOW - 5 * E.DAY, NOW - 2 * E.DAY]);
  assert.equal(s.accounts.a.signupAt, NOW - 5 * E.DAY); // earliest event stands in for signup
  assert.throws(() => E.ingest(s, { id: "", account: "a" }, NOW), /id is required/);
  assert.throws(() => E.ingest(s, { id: "x", account: "bad account!" }, NOW), /account is required/);
  assert.throws(() => E.ingest(s, { id: "y", account: "a", timestamp: "nope" }, NOW), /timestamp/);
  assert.throws(() => E.ingest(s, { id: "z", account: "a", timestamp: NOW + 3 * E.DAY }, NOW), /future/);
});

test("snapshots never look ahead and only label outcomes that can be observed", () => {
  const retained = acct(100, [1], null), churned = acct(100, [50], 40);
  const snaps = E.buildSnapshots({ r: retained, c: churned }, NOW);
  for (const s of snaps.filter((x) => x.id === "r")) { assert.equal(s.y, 0); assert.ok(s.t + 30 * E.DAY <= NOW, "unobservable window labelled"); }
  const cs = snaps.filter((x) => x.id === "c");
  assert.ok(cs.length > 0); for (const s of cs) assert.ok(s.t < churned.churnedAt, "snapshot at or after churn");
  assert.ok(cs.some((s) => s.y === 1)); // the weeks just before the cancellation are positives
});

test("logistic regression separates a clearly separable toy problem, and auc is right", () => {
  const rows = [];
  for (let i = 0; i < 100; i++) { const bad = i % 2; rows.push({ y: bad, x: [bad ? 0 : 2, 0, bad ? -1 : 0, bad ? 20 : 1, bad ? 1 : 8, 2, 3].slice(0, E.FEATURES.length) }); }
  const m = E.fitLogistic(rows);
  const scores = rows.map((r) => E.predict(m, r.x).p);
  assert.equal(E.auc(scores, rows.map((r) => r.y)), 1);
  assert.equal(E.auc([0.1, 0.2, 0.3, 0.4], [0, 1, 0, 1]), 0.75);
  assert.equal(E.auc([0.5, 0.5], [0, 1]), 0.5); // ties share rank
  assert.equal(E.auc([0.1, 0.2], [1, 1]), null);
  assert.equal(E.topDecileCapture([0.9, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.05], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 1);
});

test("on seeded synthetic data the model validates out-of-time well above chance and is reproducible", () => {
  const acc = E.syntheticAccounts(NOW), t = E.train(acc, NOW);
  assert.equal(t.mode, "model");
  assert.ok(t.validation, "expected a validation block");
  assert.ok(t.validation.auc > 0.65, `auc ${t.validation.auc}`);
  assert.ok(t.validation.topDecileCapture > 0.25, "top 10% should find well over 10% of churners");
  const again = E.train(E.syntheticAccounts(NOW), NOW);
  assert.equal(again.validation.auc, t.validation.auc);
  // Recent silence must push risk up: weight on daysSilent is positive, on recent activity negative.
  const wt = Object.fromEntries(E.FEATURES.map((f, j) => [f.key, t.model.w[j]]));
  assert.ok(wt.daysSilent > 0 && wt.logEvents7 < 0, JSON.stringify(wt));
});

test("scoring ranks a fading account above a steady one and explains why", () => {
  const acc = E.syntheticAccounts(NOW);
  acc.fading = acct(90, [20, 21, 22, 23, 24, 25, 26, 27, 28]);
  acc.steady = acct(90, [0.2, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  const t = E.train(acc, NOW), rows = E.score(acc, t, NOW);
  const rank = (id) => rows.findIndex((r) => r.id === id);
  assert.ok(rank("fading") < rank("steady"), `${rank("fading")} vs ${rank("steady")}`);
  const f = rows[rank("fading")];
  assert.ok(f.reasons.length > 0 && f.reasons.some((r) => /last seen|no activity/.test(r)), JSON.stringify(f.reasons));
  assert.ok(!rows.some((r) => acc[r.id].churnedAt != null), "churned accounts must not be scored");
});

test("with too little history it says so and falls back to a rule-based index", () => {
  const acc = { a: acct(60, [1, 2]), b: acct(60, [40]) };
  const t = E.train(acc, NOW);
  assert.equal(t.mode, "heuristic"); assert.match(t.note, /not a probability/);
  const rows = E.score(acc, t, NOW);
  assert.equal(rows[0].id, "b"); assert.equal(rows[0].calibrated, false);
  assert.ok(rows[0].risk > rows[1].risk);
});

test("accounts under 14 days old are not scored and outcomes can be cleared", () => {
  const s = E.newState(); E.ingest(s, { id: "n1", account: "new", timestamp: NOW - 3 * E.DAY }, NOW);
  assert.equal(E.score(s.accounts, E.train(s.accounts, NOW), NOW).length, 0);
  E.setOutcome(s, "new", NOW - E.DAY, NOW); assert.ok(s.accounts.new.churnedAt);
  E.clearOutcome(s, "new"); assert.equal(s.accounts.new.churnedAt, null);
});

test("parseCsv reads events and churn dates and reports bad lines", () => {
  const { accounts, errors } = E.parseCsv("account,date,type\na,2026-09-01,login\na,2026-09-03,export\nb,not-a-date\n", "a,2026-09-20\nghost,2026-09-21\n");
  assert.equal(accounts.a.events.length, 2); assert.equal(accounts.a.churnedAt, Date.parse("2026-09-20"));
  assert.equal(errors.length, 2); assert.match(errors[0], /event line/); assert.match(errors[1], /churn line/);
});

test("prune forgets old event ids and alerts", () => {
  const s = E.newState(); s.seen.old = NOW - 61 * E.DAY; s.seen.fresh = NOW; s.alerted.o = NOW - 61 * E.DAY;
  E.prune(s, NOW); assert.deepEqual(Object.keys(s.seen), ["fresh"]); assert.deepEqual(Object.keys(s.alerted), []);
});

test("MRR ranks the at-risk list by money: a big account at middling risk outranks a tiny one at high risk", () => {
  const trained = { mode: "model", model: { baseRate: 0.1 } }; // threshold 0.3
  const rows = [
    { id: "tiny", risk: 0.9, calibrated: true, mrr: 20, expectedLoss: 18 },
    { id: "big", risk: 0.45, calibrated: true, mrr: 2000, expectedLoss: 900 },
    { id: "safe", risk: 0.05, calibrated: true, mrr: 9000, expectedLoss: 450 },
  ];
  assert.deepEqual(E.atRiskList(rows, trained).map((r) => r.id), ["big", "tiny"]);
  const s = E.summarize(rows, trained);
  assert.equal(s.mrrAtRisk, 2020); assert.equal(s.mrrTracked, 11020); assert.equal(s.expectedLoss30d, 1368);
  const noMrr = rows.map(({ mrr, expectedLoss, ...r }) => r);
  assert.deepEqual(E.atRiskList(noMrr, trained).map((r) => r.id), ["tiny", "big"]); // plain risk order
  assert.equal(E.summarize(noMrr, trained).mrrAtRisk, undefined);
});

test("a rule-based index never claims a dollar loss, and MRR input is validated", () => {
  const s = E.newState();
  E.ingest(s, { id: "e1", account: "a", timestamp: NOW - 30 * E.DAY, mrr: "$49.5" }, NOW);
  assert.equal(s.accounts.a.mrr, 49.5);
  const heur = E.score(s.accounts, { mode: "heuristic" }, NOW);
  assert.equal(heur[0].mrr, 49.5); assert.equal(heur[0].expectedLoss, null);
  assert.equal(E.summarize(heur, { mode: "heuristic" }).expectedLoss30d, null);
  assert.throws(() => E.ingest(s, { id: "e2", account: "a", mrr: -5 }, NOW), /mrr must be/);
  assert.equal(s.seen.e2, undefined, "a rejected event must not burn its id");
  assert.throws(() => E.setMrr(s, "ghost", 10), /unknown account/);
  E.setMrr(s, "a", null); assert.equal(s.accounts.a.mrr, undefined);
});

test("parseCsv reads an optional account,mrr list", () => {
  const { accounts, errors } = E.parseCsv("a,2026-09-01\nb,2026-09-01\n", "", "a,120\nb,not money\nghost,5\n");
  assert.equal(accounts.a.mrr, 120); assert.equal(accounts.b.mrr, undefined);
  assert.equal(errors.length, 2); assert.match(errors[0], /mrr line 2/);
});
