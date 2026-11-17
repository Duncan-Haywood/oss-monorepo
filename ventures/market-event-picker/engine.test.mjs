import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseEvents, plan, summarize, eventNet, breakEvenSales, dayNumber, weekOf, parseHour, money } from "./engine.mjs";

const OPTS = { cogsPct: 35, crewRate: 15, setupHours: 1, teardownHours: 0.5, maxPerWeek: 0, downside: 70 };

test("parseHour and weekOf", () => {
  assert.equal(parseHour("09:30"), 9.5);
  assert.equal(parseHour("17"), 17);
  assert.ok(Number.isNaN(parseHour("25:00")));
  assert.ok(Number.isNaN(parseHour("noon")));
  // 2026-09-14 is a Monday, 2026-09-13 a Sunday
  assert.equal(weekOf(dayNumber("2026-09-14")), weekOf(dayNumber("2026-09-20")));
  assert.equal(weekOf(dayNumber("2026-09-13")) + 1, weekOf(dayNumber("2026-09-14")));
});

test("parse reports line numbers and never throws", () => {
  const r = parseEvents("name,date\nFair,2026-13-40,9,17,100\nOK,2026-09-12,09:00,17:00,100\nBad,2026-09-12,9,17,abc");
  assert.equal(r.events.length, 1);
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /^line 2: date must be YYYY-MM-DD/);
  assert.match(r.errors[1], /^line 4: expected sales must be a number/);
  assert.equal(parseEvents("").events.length, 0);
});

test("overnight events roll the end into the next day", () => {
  const e = parseEvents("Night,2026-09-12,18:00,02:00,1000").events[0];
  assert.equal(e.hours, 8);
});

test("net and break-even agree", () => {
  const e = parseEvents("Fair,2026-09-12,09:00,17:00,3200,150,0,40").events[0];
  const o = { ...OPTS };
  assert.ok(Math.abs(eventNet({ ...e, sales: breakEvenSales(e, o) }, o)) < 1e-6);
  assert.equal(money(eventNet(e, o)), "$1,747.50");
});

test("a pair of smaller events beats the biggest-sales event that blocks them", () => {
  const p = plan(parseEvents("A Big Fair,2026-09-12,09:00,19:00,4000,500,0,60\nB Morning,2026-09-12,08:00,12:00,1800,50,0,0\nC Evening,2026-09-12,14:30,21:00,2500,100,0,0"), OPTS);
  assert.deepEqual(p.chosen.map((c) => c.name), ["B Morning", "C Evening"]);
  assert.equal(p.totals.upliftVsBiggestSales, 575);
  assert.match(p.skipped[0].reason, /swapping would cost \$575\.00/);
  assert.equal(summarize(p).status, "gain");
});

test("loss-making events are skipped with their break-even sales", () => {
  const p = plan(parseEvents("Tiny,2026-09-12,09:00,17:00,200,150,0,40"), OPTS);
  assert.equal(p.chosen.length, 0);
  assert.match(p.skipped[0].reason, /loses .* even at your expected sales/);
  assert.equal(summarize(p).status, "none");
});

test("weekly limit keeps the best events in a week", () => {
  const rows = "A,2026-09-14,09:00,12:00,1000\nB,2026-09-15,09:00,12:00,2000\nC,2026-09-16,09:00,12:00,3000\nD,2026-09-21,09:00,12:00,1500";
  const free = plan(parseEvents(rows), { ...OPTS, crewRate: 0 });
  assert.equal(free.chosen.length, 4);
  const capped = plan(parseEvents(rows), { ...OPTS, crewRate: 0, maxPerWeek: 2 });
  assert.deepEqual(capped.chosen.map((c) => c.name), ["B", "C", "D"]);
  assert.match(capped.skipped[0].reason, /week is full at 2/);
});

test("setup and teardown windows make tight back-to-back events conflict", () => {
  const rows = "A,2026-09-12,09:00,12:00,1000\nB,2026-09-12,12:30,16:00,1000";
  assert.equal(plan(parseEvents(rows), { ...OPTS, crewRate: 0, setupHours: 0, teardownHours: 0 }).chosen.length, 2);
  assert.equal(plan(parseEvents(rows), { ...OPTS, crewRate: 0, setupHours: 1, teardownHours: 0.5 }).chosen.length, 1);
});

test("downside finding warns when a chosen event loses money at bad-weather sales", () => {
  const p = plan(parseEvents("Thin,2026-09-12,09:00,17:00,600,250,0,40"), { ...OPTS, crewRate: 0 });
  assert.equal(p.chosen.length, 1);
  assert.ok(p.findings.some((f) => f.rule === "downside-loss"));
});

// Independent brute force over every subset, written without sharing code with the solver.
function brute(parsed, o) {
  const ev = parsed.events;
  const net = ev.map((e) => e.sales * (1 - o.cogsPct / 100 - e.pct / 100) - e.flat - e.travel - o.crewRate * (e.hours + o.setupHours + o.teardownHours));
  let best = 0;
  for (let mask = 0; mask < 1 << ev.length; mask += 1) {
    const ids = ev.map((_, i) => i).filter((i) => mask & (1 << i));
    let ok = true;
    for (let a = 0; a < ids.length && ok; a += 1) {
      for (let b = a + 1; b < ids.length && ok; b += 1) {
        const x = ev[ids[a]], y = ev[ids[b]];
        if (x.start - o.setupHours < y.end + o.teardownHours && y.start - o.setupHours < x.end + o.teardownHours) ok = false;
      }
    }
    if (ok && o.maxPerWeek > 0) {
      const counts = {};
      for (const i of ids) counts[ev[i].week] = (counts[ev[i].week] || 0) + 1;
      if (Object.values(counts).some((c) => c > o.maxPerWeek)) ok = false;
    }
    if (!ok) continue;
    best = Math.max(best, ids.reduce((s, i) => s + net[i], 0));
  }
  return best;
}

test("optimiser matches brute force on 300 random seasons", () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let t = 0; t < 300; t += 1) {
    const n = 2 + Math.floor(rnd() * 9);
    const rows = [];
    for (let i = 0; i < n; i += 1) {
      const day = 1 + Math.floor(rnd() * 16);
      const start = 6 + Math.floor(rnd() * 12);
      const len = 2 + Math.floor(rnd() * 8);
      rows.push(`E${i},2026-09-${String(day).padStart(2, "0")},${start}:00,${start + len > 24 ? 24 : start + len}:00,${Math.floor(rnd() * 3000)},${Math.floor(rnd() * 300)},${Math.floor(rnd() * 12)},${Math.floor(rnd() * 80)}`);
    }
    const o = { cogsPct: 30, crewRate: Math.floor(rnd() * 20), setupHours: Math.floor(rnd() * 2), teardownHours: rnd() < 0.5 ? 0.5 : 0, maxPerWeek: Math.floor(rnd() * 4), downside: 70 };
    const parsed = parseEvents(rows.join("\n"));
    assert.equal(parsed.errors.length, 0, parsed.errors.join());
    const p = plan(parsed, o);
    assert.ok(Math.abs(p.totals.plan - brute(parsed, p.options)) < 1e-6, `case ${t}`);
    assert.ok(p.totals.plan >= p.totals.firstListed - 1e-9);
    assert.ok(p.totals.plan >= p.totals.biggestSalesFirst - 1e-9);
  }
});

test("too many entangled events is a clear error, not a hang", () => {
  const rows = Array.from({ length: 30 }, (_, i) => `E${i},2026-09-12,09:00,17:00,1000`).join("\n");
  assert.throws(() => plan(parseEvents(rows), OPTS), /handles up to 24/);
});

// Quality audit 2026-11-07 (portfolio/quality/audits/2026-11-07-market-event-picker.json, defects 0 and 1):
// the negotiable finding once told a vendor a $480 cut would make Harvest Fair win although its whole fee is $150.
test("negotiable never asks for a cut bigger than the event's fee", () => {
  const p = plan(parseEvents(fs.readFileSync(new URL("./fixtures/events.csv", import.meta.url), "utf8")), OPTS);
  const harvest = p.skipped.find((s) => s.name === "Harvest Fair");
  assert.ok(Math.abs(harvest.shortfall - 480) < 1e-6);
  assert.ok(!p.negotiable.some((n) => n.name === "Harvest Fair"));
  assert.ok(!p.findings.some((f) => f.rule === "negotiable"));
  for (const n of p.negotiable) assert.ok(n.fee > n.feeAsk);
});

test("a cut just over the ask flips the pick; a cut of exactly the ask only ties", () => {
  const csv = (bFlat) => `A,2026-09-12,09:00,17:00,3000,600,0,0\nB,2026-09-12,10:00,16:00,2600,${bFlat},0,0`;
  const p = plan(parseEvents(csv(500)), OPTS);
  assert.deepEqual(p.chosen.map((c) => c.name), ["A"]);
  assert.equal(p.negotiable.length, 1);
  const n = p.negotiable[0];
  assert.equal(n.name, "B");
  assert.ok(Math.abs(n.feeAsk - 130) < 1e-6);
  assert.equal(n.fee, 500);
  const f = p.findings.find((x) => x.rule === "negotiable");
  assert.equal(f.message, "A fee cut of more than $130.00 (of its $500.00 fee) would make B the better pick.");
  const over = plan(parseEvents(csv(500 - n.feeAsk - 1)), OPTS);
  assert.deepEqual(over.chosen.map((c) => c.name), ["B"]);
  const tie = plan(parseEvents(csv(500 - n.feeAsk)), OPTS);
  assert.ok(Math.abs(tie.chosen.reduce((t, c) => t + c.net, 0) - p.totals.plan) < 1e-6);
});

test("a skipped event whose shortfall is over 1.5 times its own net is not offered as negotiable", () => {
  // B nets $377.50 and is $830 short (2.2x its net); its $1,200 fee could cover the cut, but the rule keeps
  // the finding to events that are close calls.
  const p = plan(parseEvents("A,2026-09-12,09:00,17:00,3000,600,0,0\nB,2026-09-12,10:00,16:00,2600,1200,0,0"), OPTS);
  const b = p.skipped.find((s) => s.name === "B");
  assert.ok(Math.abs(b.net - 377.5) < 1e-6 && Math.abs(b.shortfall - 830) < 1e-6);
  assert.equal(p.negotiable.length, 0);
});

test("long-week and plan-flips findings fire on the cases they describe", () => {
  // Three 18-hour days in one week: 3 x (18 + 1.5) = 58.5 h is under 60; four is 78 h.
  const long = (n) => Array.from({ length: n }, (_, i) => `D${i},2026-09-1${4 + i},05:00,23:00,5000,0,0,0`).join("\n");
  assert.ok(!plan(parseEvents(long(3)), OPTS).findings.some((f) => f.rule === "long-week"));
  const lw = plan(parseEvents(long(4)), OPTS).findings.find((f) => f.rule === "long-week");
  assert.match(lw.message, /^1 week in the plan run over 60 booth-and-setup hours \(week of 2026-09-14: 78 h\)/);
  // High-sales, high-fee A beats B at full sales; at 70% of sales B wins.
  const flip = plan(parseEvents("A,2026-09-12,09:00,17:00,10000,4500,0,0\nB,2026-09-12,10:00,16:00,3000,200,0,0"), OPTS);
  assert.deepEqual(flip.chosen.map((c) => c.name), ["A"]);
  assert.deepEqual(flip.downsideChosen, ["B"]);
  assert.ok(flip.findings.some((f) => f.rule === "plan-flips"));
});
