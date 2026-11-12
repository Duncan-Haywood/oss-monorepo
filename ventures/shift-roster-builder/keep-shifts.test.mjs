// "Keep last week's shifts" (keepValue, --keep-shifts): a per-hour bonus for a person working a shift they had the week before.
// It enters the score the way a prefer: hour does, so these check that every exact stage still reaches the brute-force best with
// it on, that it never leaves a shift open to keep someone in place, and how the planner and the CLI pass it along.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStaff, parseShifts, buildRoster, planWeeks, keepFrom, keepFromCsv, slotKey, rosterCsv, scoreBoundByColumnGeneration, sampleStaff, sampleShifts, TEMPLATES, _internals } from "./calc.mjs";
import { run, parseArgs } from "./cli.mjs";

const { buildContext, scoreOwner, ownerValid } = _internals;

function seededWeek(seed, P, S) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${8 + rnd(4) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(12); return `${days[rnd(5)]},${a},${Math.min(24, a + 3 + rnd(7))},${1 + rnd(2)}`; }).join("\n");
  return { staff: parseStaff(st).staff, slots: parseShifts(sh).slots, rnd };
}

// Least score over every owner array (each shift to one eligible person or open): the truth on a tiny week.
function bruteBest(staff, slots, options) {
  const ctx = buildContext(staff, slots, options);
  const owner = new Array(ctx.S).fill(-1);
  let best = Infinity;
  const rec = (i) => {
    if (i === ctx.S) { if (ownerValid(ctx, owner)) best = Math.min(best, scoreOwner(ctx, owner).total); return; }
    for (let p = -1; p < ctx.P; p++) {
      if (p >= 0 && !ctx.elig[p][i]) continue;
      owner[i] = p; rec(i + 1);
    }
    owner[i] = -1;
  };
  rec(0);
  return best;
}

test("with a keep bonus the exact search still returns the brute-force best, and the score bound stays below it", () => {
  let checked = 0, kept = 0;
  for (let c = 0; c < 24; c++) {
    const { staff, slots, rnd } = seededWeek(777 + 131 * c, 3, 5 + (c % 3));
    // keep: each person "had" a random half of the shifts they can take
    const keep = {};
    for (const p of staff) keep[p.name.toLowerCase()] = slots.filter(() => rnd(2) === 0).map(slotKey);
    const options = { exact: true, keep, keepValue: [0.1, 0.25, 1][c % 3], minRestHours: [10, 0][c % 2] };
    const truth = bruteBest(staff, slots, options);
    const r = buildRoster(staff, slots, options);
    assert.ok(["optimal", "improved"].includes(r.optimality?.status), `case ${c}: ${r.optimality?.status}`);
    assert.ok(Math.abs(Number(r.score) - truth) < 0.02, `case ${c}: exact search ${r.score} vs brute force ${truth}`);
    const b = scoreBoundByColumnGeneration(staff, slots, options);
    if (b && Number.isFinite(b.bound)) assert.ok(b.bound <= truth + 1e-6, `case ${c}: bound ${b.bound} above the best ${truth}`);
    checked++;
    if (Math.abs(truth - bruteBest(staff, slots, { ...options, keepValue: 0 })) > 1e-9) kept++;
  }
  assert.equal(checked, 24);
  assert.ok(kept > 12, `the bonus changed the best score on only ${kept} weeks`);
});

test("keepValue 0, or no keep map, builds the same roster as before", () => {
  const st = parseStaff(sampleStaff()).staff, sh = parseShifts(sampleShifts()).slots;
  const base = buildRoster(st, sh, { exact: false });
  const keep = keepFrom(base);
  for (const o of [{ keep, keepValue: 0 }, { keepValue: 0.25 }, { keep: {}, keepValue: 0.25 }]) {
    assert.equal(rosterCsv(buildRoster(st, sh, { exact: false, ...o })), rosterCsv(base));
  }
});

test("the bonus never opens a shift: rebuilding a week that keeps a worse roster leaves no more hours open", () => {
  for (const [name, t] of Object.entries(TEMPLATES)) {
    const st = parseStaff(t.staff()).staff, sh = parseShifts(t.shifts()).slots;
    const best = buildRoster(st, sh, {});
    // keep the roster a short quick search finds, which is no better than the proven one
    const rough = buildRoster(st, sh, { exact: false, restarts: 1, iterations: 200, longPass: false, coverPass: false });
    const r = buildRoster(st, sh, { keep: keepFrom(rough), keepValue: 1 });
    assert.equal(r.unfilledHours, best.unfilledHours, `${name}: open hours with keep`);
  }
});

test("keepFromCsv reads a roster CSV and matches a shift whatever its role", () => {
  const st = parseStaff(sampleStaff()).staff, sh = parseShifts(sampleShifts()).slots;
  const r = buildRoster(st, sh, { exact: false });
  const fromCsv = keepFromCsv(rosterCsv(r)), fromRoster = keepFrom(r);
  assert.deepEqual(Object.keys(fromCsv).sort(), Object.keys(fromRoster).sort());
  for (const k of Object.keys(fromRoster)) {
    assert.equal(fromCsv[k].length, fromRoster[k].length);
    assert.ok(fromCsv[k].every((x) => x.endsWith("|*")));
  }
  // Rebuilt with its own shifts as keep, a week moves nobody.
  const again = buildRoster(st, sh, { keep: fromCsv, keepValue: 0.25 });
  const pairs = (x) => new Set(x.assignments.filter((a) => a.person).map((a) => `${a.person}@${slotKey({ ...a.slot, role: "" })}`));
  const a = pairs(r), b = pairs(again);
  const moved = [...b].filter((x) => !a.has(x)).length;
  assert.ok(moved <= 4, `${moved} person-shifts moved against a keep of the same week`);
});

test("the planner keeps people on their usual shifts: a day off moves fewer other shifts, the week after goes back, no more hours open", () => {
  // Ana off on Tuesday and Ben on Friday of week 3, default exact check, bonus 0.1 against off.
  const staff = sampleStaff().replace(/^(Ana[^\n]*)$/m, "$1, off: 2026-12-01").replace(/^(Ben[^\n]*)$/m, "$1, off: 2026-12-04");
  const o = { weeks: 4, weekStart: "2026-11-16" };
  const pairs = (r) => new Set(r.assignments.filter((a) => a.person).map((a) => `${a.person}@${slotKey(a.slot)}`));
  const diff = (a, b) => [...b].filter((x) => !a.has(x)).length + [...a].filter((x) => !b.has(x)).length;
  const churn = (p) => p.weeks.slice(1).map((w, k) => diff(pairs(p.weeks[k].roster), pairs(w.roster)));
  const off = planWeeks(staff, sampleShifts(), o), on = planWeeks(staff, sampleShifts(), { ...o, keepValue: 0.1 });
  assert.ok(on.ok && off.ok);
  assert.equal(on.totalOpenHours, off.totalOpenHours);
  assert.ok(on.weeks.every((w) => ["optimal", "improved"].includes(w.roster.optimality?.status)));
  // README "Keep people on their usual shifts": 15 changes into week 3 and 15 back without the bonus, 11 and 11 with it.
  assert.deepEqual(churn(off), [0, 15, 15]);
  assert.deepEqual(churn(on), [0, 11, 11]);
  assert.equal(diff(pairs(on.weeks[3].roster), pairs(on.weeks[1].roster)), 0, "week 4 is the usual rota again");
  // The guide page quotes this plan.
  const html = readFileSync(new URL("./keep-a-consistent-schedule-when-someone-is-off.html", import.meta.url), "utf8");
  const cells = (label) => {
    const m = html.match(new RegExp(`<td>${label}</td><td class="n">([^<]+)</td><td class="n">([^<]+)</td>`));
    return m ? [m[1], m[2]] : null;
  };
  assert.deepEqual(cells("Person-shifts changed going into week 3"), [String(churn(off)[1]), String(churn(on)[1])]);
  assert.deepEqual(cells("Changed again going back in week 4"), [String(churn(off)[2]), String(churn(on)[2])]);
  assert.deepEqual(cells("Hours left uncovered, whole month"), [String(off.totalOpenHours), String(on.totalOpenHours)]);
  assert.deepEqual(cells("Payroll, whole month"), [`$${off.totalCost.toLocaleString("en-US")}`, `$${on.totalCost.toLocaleString("en-US")}`]);
  for (const f of ["sitemap.xml", "index.html"]) assert.match(readFileSync(new URL(`./${f}`, import.meta.url), "utf8"), /keep-a-consistent-schedule-when-someone-is-off\.html/);
  // With no time off, the bonus changes nothing and the planner reuses the same weeks.
  const plain = planWeeks(sampleStaff(), sampleShifts(), { ...o, keepValue: 0.25, weeks: 5 });
  const base = planWeeks(sampleStaff(), sampleShifts(), { ...o, weeks: 5 });
  assert.deepEqual(plain.weeks.map((w) => w.sameAs ?? null), [null, null, 2, 2, 2]);
  plain.weeks.forEach((w, k) => {
    assert.equal(diff(pairs(w.roster), pairs(base.weeks[k].roster)), 0, `week ${k + 1}: same people on the same shifts`);
    assert.equal(w.roster.cost, base.weeks[k].roster.cost);
  });
});

test("CLI: --keep-shifts with --last-week keeps last week's people in place", () => {
  const a = parseArgs(["--keep-shifts", "0.25", "--last-week", "x.csv", "s.txt", "h.txt"]);
  assert.equal(a.options.keepValue, 0.25);
  const lastWeek = run(sampleStaff(), sampleShifts(), { options: { exact: false }, mode: "csv" }).out;
  const plain = run(sampleStaff(), sampleShifts(), { options: { exact: false }, mode: "csv", lastWeekCsv: lastWeek }).out;
  const kept = run(sampleStaff(), sampleShifts(), { options: { exact: false, keepValue: 0.25 }, mode: "csv", lastWeekCsv: lastWeek }).out;
  const rows = (csv) => new Set(csv.trim().split("\n").slice(1).map((l) => l.split(",").filter((_, i) => i !== 6 && i !== 7).join(",")));
  const diff = (x, y) => [...rows(x)].filter((l) => !rows(y).has(l)).length;
  assert.ok(diff(kept, lastWeek) <= diff(plain, lastWeek), `kept moved ${diff(kept, lastWeek)}, plain ${diff(plain, lastWeek)}`);
});
