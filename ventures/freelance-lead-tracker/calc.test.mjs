import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCents, formatMoney, parseDate, daysBetween, addDays, cleanLead, moveStage, ownRates, stageProbability, forecast, followUps, bySource, lostReasons, cycleDays, pipelineNeeded, check, proposalHandoffHash, toCsv, exampleLeads, DEFAULT_PROB, MIN_CLOSED_FOR_OWN_RATE } from "./calc.mjs";

const T = "2026-10-07";
const L = (o) => cleanLead({ id: "x" + Math.random(), name: "A", stage: "lead", value: 100000, created: addDays(T, -5), ...o });

test("money parses to cents and formats with separators", () => {
  assert.equal(parseCents("$1,234.5"), 123450);
  assert.equal(parseCents("abc"), null);
  assert.equal(parseCents("-5"), null);
  assert.equal(formatMoney(123456789, "USD"), "$1,234,567.89");
  assert.equal(formatMoney(5, "USD"), "$0.05");
  assert.equal(formatMoney(150000, "JPY"), "¥1,500");
});

test("dates are strict and day arithmetic is calendar-exact", () => {
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("nope"), null);
  assert.equal(daysBetween("2026-10-01", "2026-10-07"), 6);
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(addDays("bad", 1), null);
});

test("cleanLead rejects non-objects and repairs bad fields", () => {
  assert.equal(cleanLead(null), null);
  assert.equal(cleanLead([]), null);
  const l = cleanLead({ name: "x".repeat(500), stage: "bogus", value: -5, nextDate: "2026-13-01", history: [{ stage: "won", date: "2026-01-01" }, { stage: "zzz", date: "2026-01-01" }, 5] });
  assert.equal(l.name.length, 120);
  assert.equal(l.stage, "lead");
  assert.equal(l.value, 0);
  assert.equal(l.nextDate, "");
  assert.equal(l.history.length, 1);
  assert.ok(l.id);
});

test("moveStage records history and last contact, and ignores a no-op", () => {
  const a = L({ stage: "lead" });
  const b = moveStage(a, "proposal", T);
  assert.equal(b.stage, "proposal");
  assert.equal(b.lastTouch, T);
  assert.deepEqual(b.history.at(-1), { stage: "proposal", date: T });
  assert.equal(moveStage(b, "proposal", T), b);
  assert.equal(moveStage(a, "nonsense", T), a);
});

test("forecast weights open leads by stage and skips closed ones", () => {
  const leads = [L({ stage: "proposal", value: 100000 }), L({ stage: "negotiating", value: 200000 }), L({ stage: "won", value: 999999 }), L({ stage: "lost", value: 999999 })];
  const f = forecast(leads);
  assert.equal(f.openCount, 2);
  assert.equal(f.openCents, 300000);
  assert.equal(f.weightedCents, Math.round(100000 * DEFAULT_PROB.proposal) + Math.round(200000 * DEFAULT_PROB.negotiating));
  assert.equal(f.usingOwnRates, false);
});

test("own win rates replace the starting guesses only after enough closed leads", () => {
  const few = [L({ stage: "won" }), L({ stage: "lost" })];
  assert.equal(stageProbability(few, "proposal").own, false);
  const many = [];
  for (let i = 0; i < MIN_CLOSED_FOR_OWN_RATE; i++) many.push(L({ stage: i < 2 ? "won" : "lost", history: [{ stage: "proposal", date: addDays(T, -3) }] }));
  const o = ownRates(many);
  assert.equal(o.closed, MIN_CLOSED_FOR_OWN_RATE);
  assert.equal(o.overall, 2 / MIN_CLOSED_FOR_OWN_RATE);
  const p = stageProbability(many, "proposal");
  assert.equal(p.own, true);
  assert.equal(p.p, 2 / MIN_CLOSED_FOR_OWN_RATE);
});

test("a stage nobody reached keeps the starting guess even with many closed leads", () => {
  const many = Array.from({ length: 10 }, (_, i) => L({ stage: i % 2 ? "won" : "lost" }));
  assert.equal(stageProbability(many, "negotiating").own, false);
});

test("follow-ups sort overdue, today, quiet, upcoming, unscheduled", () => {
  const leads = [
    L({ name: "unsched", stage: "contacted", lastTouch: addDays(T, -1) }),
    L({ name: "upcoming", nextDate: addDays(T, 3) }),
    L({ name: "overdue", nextDate: addDays(T, -4) }),
    L({ name: "today", nextDate: T }),
    L({ name: "quiet", stage: "proposal", lastTouch: addDays(T, -20) }),
    L({ name: "closed", stage: "won", nextDate: addDays(T, -9) }),
  ];
  const rows = followUps(leads, T);
  assert.deepEqual(rows.map((r) => r.lead.name), ["overdue", "today", "quiet", "upcoming", "unsched"]);
  assert.equal(rows[0].days, 4);
  assert.equal(rows[2].kind, "quiet");
});

test("by-source counts, win rate and won value, with unknown source named", () => {
  const rows = bySource([L({ source: "Referral", stage: "won", value: 500000 }), L({ source: "Referral", stage: "lost" }), L({ source: "", stage: "lead" })]);
  const ref = rows.find((r) => r.source === "Referral");
  assert.equal(ref.winRate, 0.5);
  assert.equal(ref.wonCents, 500000);
  assert.equal(rows.find((r) => r.source === "Unknown").winRate, null);
});

test("lost reasons are tallied, blank reasons named", () => {
  const r = lostReasons([L({ stage: "lost", lostReason: "Price" }), L({ stage: "lost", lostReason: "Price" }), L({ stage: "lost" }), L({ stage: "won" })]);
  assert.deepEqual(r, [{ reason: "Price", count: 2 }, { reason: "No reason recorded", count: 1 }]);
});

test("cycle time is the median days from created to won", () => {
  const mk = (n) => L({ stage: "won", created: addDays(T, -n), history: [{ stage: "won", date: T }] });
  assert.deepEqual(cycleDays([mk(10), mk(20), mk(40)]), { n: 3, median: 20 });
  assert.equal(cycleDays([L({ stage: "lead" })]), null);
});

test("pipeline needed uses your win rate once you have one, a stated 25% before", () => {
  const first = pipelineNeeded([L({ stage: "proposal", value: 200000 })], 1000000);
  assert.equal(first.ownRate, false);
  assert.equal(first.rate, 0.25);
  assert.equal(first.winsNeeded, 5);
  assert.equal(first.leadsNeeded, 20);
  assert.equal(pipelineNeeded([], 1000000), null);
  assert.equal(pipelineNeeded([L({})], 0), null);
});

test("check flags missing next steps, stalled proposals and concentration", () => {
  const leads = [L({ name: "Big", stage: "proposal", value: 900000, lastTouch: addDays(T, -12) }), L({ name: "Small", value: 0, nextDate: T })];
  const msgs = check(leads, T).join("\n");
  assert.match(msgs, /no follow-up date/);
  assert.match(msgs, /no value/);
  assert.match(msgs, /proposal has had no contact/);
  assert.match(msgs, /Big is over 60%/);
  assert.deepEqual(check([], T), []);
});

test("the proposal hand-off carries text only in a fragment", () => {
  const h = proposalHandoffHash(L({ name: "Acme", contact: "a@b.c", notes: "Needs a site", value: 250000 }), "EUR");
  assert.match(h, /^#handoff=/);
  const o = JSON.parse(decodeURIComponent(h.slice(9)));
  assert.equal(o.from, "freelance-lead-tracker");
  assert.deepEqual(o.proposal, { client: "Acme", contact: "a@b.c", currency: "EUR", problem: "Needs a site", budget: "2500.00" });
});

test("CSV quotes commas and neutralises spreadsheet formulas", () => {
  const csv = toCsv([L({ name: "=HYPERLINK(\"x\")", notes: "a, b", stage: "won", value: 12345 })]);
  const row = csv.split("\n")[1];
  assert.match(row, /^"'=HYPERLINK/);
  assert.match(row, /"a, b"/);
  assert.match(row, /Won,123\.45/);
});

test("the example covers every kind of follow-up and parses clean", () => {
  const ex = exampleLeads(T);
  assert.equal(ex.length, 6);
  const kinds = new Set(followUps(ex, T).map((r) => r.kind));
  for (const k of ["overdue", "today", "upcoming", "quiet"]) assert.ok(kinds.has(k), k);
});
