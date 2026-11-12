// Reissuing a posted week (2026-11-12): keepShift (a per-shift keep bonus, the shape of a per-change short-notice premium),
// pinStarted (shifts that already started stay as posted), and the CLI's --changes path that uses both.
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildRoster, rosterCsv, keepFromCsv, slotKey, pinStarted, STARTED_OPEN, scheduleChanges, scoreBoundByColumnGeneration, sampleStaff, sampleShifts, _internals } from "./calc.mjs";
import { run } from "./cli.mjs";

const { buildContext, scoreOwner, ownerValid } = _internals;

function seededWeek(seed, P, S) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${8 + rnd(4) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(12); return `${days[rnd(5)]},${a},${Math.min(24, a + 3 + rnd(7))},${1 + rnd(2)}`; }).join("\n");
  return { staff: parseStaff(st).staff, slots: parseShifts(sh).slots, rnd };
}
function bruteBest(staff, slots, options) {
  const ctx = buildContext(staff, slots, options);
  const owner = new Array(ctx.S).fill(-1);
  let best = Infinity;
  const rec = (i) => {
    if (i === ctx.S) { if (ownerValid(ctx, owner)) best = Math.min(best, scoreOwner(ctx, owner).total); return; }
    for (let p = -1; p < ctx.P; p++) { if (p >= 0 && !ctx.elig[p][i]) continue; owner[i] = p; rec(i + 1); }
    owner[i] = -1;
  };
  rec(0);
  return best;
}

test("with keepShift the exact search returns the brute-force best and the score bound stays below it", () => {
  let changed = 0;
  for (let c = 0; c < 24; c++) {
    const { staff, slots, rnd } = seededWeek(4242 + 97 * c, 3, 5 + (c % 3));
    const keep = {};
    for (const p of staff) keep[p.name.toLowerCase()] = slots.filter(() => rnd(2) === 0).map(slotKey);
    const options = { exact: true, keep, keepShift: [0.5, 1, 2][c % 3], keepValue: c % 4 === 0 ? 0.1 : 0, minRestHours: [10, 0][c % 2] };
    const truth = bruteBest(staff, slots, options);
    const r = buildRoster(staff, slots, options);
    assert.ok(["optimal", "improved"].includes(r.optimality?.status), `case ${c}: ${r.optimality?.status}`);
    assert.ok(Math.abs(Number(r.score) - truth) < 0.02, `case ${c}: exact ${r.score} vs brute force ${truth}`);
    const b = scoreBoundByColumnGeneration(staff, slots, options);
    if (b && Number.isFinite(b.floor)) assert.ok(b.floor <= truth + 1e-6 * (1 + truth), `case ${c}: bound ${b.floor} above ${truth}`);
    if (Math.abs(truth - bruteBest(staff, slots, { ...options, keepShift: 0, keepValue: 0 })) > 1e-9) changed++;
  }
  assert.ok(changed > 12, `keepShift changed the best score on only ${changed} of 24 weeks`);
});

test("keepShift 0 with no keepValue builds the same roster as no keep at all", () => {
  const st = parseStaff(sampleStaff()).staff, sh = parseShifts(sampleShifts()).slots;
  const base = buildRoster(st, sh, { exact: false });
  assert.equal(rosterCsv(buildRoster(st, sh, { exact: false, keep: keepFromCsv(rosterCsv(base)), keepShift: 0 })), rosterCsv(base));
});

test("pinStarted holds shifts that started before the change, keeps open ones open, and leaves later shifts alone", () => {
  const st = parseStaff(sampleStaff()).staff, sh = parseShifts(sampleShifts()).slots;
  const posted = buildRoster(st, sh, { minRestHours: 10 });
  const csv = rosterCsv(posted);
  const at = 2 * 1440 + 17 * 60; // Wednesday 5pm
  const p = pinStarted(sh, csv, at);
  assert.equal(p.slots.length, sh.length);
  sh.forEach((s, i) => {
    if (s.start >= at) { assert.equal(p.slots[i], s); return; }
    assert.ok(p.slots[i].fixed, `started shift ${i} not pinned`);
  });
  const started = sh.filter((s) => s.start < at).length;
  assert.equal(p.pinned + p.open, started);
  assert.ok(p.open > 0 && p.pinned > 0, "the sample week has both held and open started shifts");
  // Rebuild with someone off Thursday: every started shift comes back exactly as posted, open ones open.
  const off = parseStaff(sampleStaff().split("\n").map((l, n) => (n === 0 ? l + ", off" : l.startsWith("Dev,") ? l + ", off: Thu" : l)).join("\n")).staff;
  const r = buildRoster(off, p.slots, { minRestHours: 10 });
  assert.ok(!r.warnings.some((w) => w.includes(STARTED_OPEN)), "no 'not in the staff list' warning for started open shifts");
  sh.forEach((s, i) => { if (s.start < at) assert.equal(r.owner[i] >= 0 ? off[r.owner[i]].name : null, posted.owner[i] >= 0 ? st[posted.owner[i]].name : null, `shift ${i} moved`); });
});

test("on the café, a call-out rebuilt with the posted roster kept owes no more premium than a free rebuild and leaves the same hours open", () => {
  const staffText = sampleStaff();
  const st = parseStaff(staffText).staff, sh = parseShifts(sampleShifts()).slots;
  const posted = buildRoster(st, sh, { minRestHours: 10 });
  const csv = rosterCsv(posted);
  const wages = Object.fromEntries(st.map((s) => [s.name, s.wage]));
  let freeOwed = 0, keptOwed = 0;
  for (const [who, day] of [["Dev", "Thu"], ["Ana", "Wed"], ["Fay", "Fri"]]) {
    const at = ({ Wed: 1, Thu: 2, Fri: 3 })[day] * 1440 + 17 * 60;
    const off = parseStaff(staffText.split("\n").map((l, n) => (n === 0 ? l + ", off" : l.startsWith(who + ",") ? l + `, off: ${day}` : l)).join("\n")).staff;
    const slots = pinStarted(sh, csv, at).slots;
    const free = buildRoster(off, slots, { minRestHours: 10 });
    const kept = buildRoster(off, slots, { minRestHours: 10, keep: keepFromCsv(csv), keepShift: 1 });
    assert.equal(kept.unfilledHours, free.unfilledHours, `${who} ${day}: open hours differ`);
    assert.ok(["optimal", "improved"].includes(kept.optimality?.status));
    const opt = { changedAt: at, noticeHours: 336, premiumHours: 1, wages, exempt: [who] };
    freeOwed += scheduleChanges(csv, rosterCsv(free), opt).owed;
    keptOwed += scheduleChanges(csv, rosterCsv(kept), opt).owed;
  }
  assert.ok(keptOwed < freeOwed, `kept ${keptOwed} vs free ${freeOwed}`);
});

test("CLI --changes keeps the posted shifts by default and --keep-posted 0 rebuilds freely", () => {
  const staff = sampleStaff(), shifts = sampleShifts();
  const posted = run(staff, shifts, { mode: "csv" }).out;
  const off = staff.split("\n").map((l, n) => (n === 0 ? l + ", off" : l.startsWith("Dev,") ? l + ", off: Thu" : l)).join("\n");
  const base = { postedCsv: posted, weekStart: "2026-11-02", changedAt: "2026-11-04 17:00", exempt: "Dev" };
  const kept = run(off, shifts, base).out, free = run(off, shifts, { ...base, keepPosted: 0 }).out;
  assert.match(kept, /Rebuilt keeping posted shifts where it could/);
  assert.match(kept, /15 shift\(s\) that started before the change held as posted/);
  assert.match(free, /Rebuilt freely/);
  const owed = (o) => Number(/Premium on your numbers[^:]*: \$([\d,.]+)/.exec(o)[1].replace(/,/g, ""));
  assert.ok(owed(kept) < owed(free), `kept ${owed(kept)} vs free ${owed(free)}`);
});
