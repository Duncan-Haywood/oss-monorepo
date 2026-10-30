// Random leagues through the passes the other fuzzers skip: withdrawals, shared grounds and linked teams on a
// single division, then travel tables and three-season venue carry-over on multi-division leagues.
// Checks: validateSchedule / validateDivisions clean after each pass, no match invented, a withdrawal removes
// only that team's matches on or after its date, ground sharing only flips home/away, carried history adds up
// to the matches played, and a travel table never makes the reported travel minutes negative or non-finite.
// Usage: node eval/fuzz-more.mjs [count] [seed]
import { readSpec, buildSchedule, validateSchedule, applyWithdrawals, parseGrounds, groundClashes, applyGroundSharing, parseLinkedTeams, linkedClashes, separateLinkedTeams, dayIso, mulberry32 } from "../calc.mjs";
import { readDivisionsSpec, buildDivisions, validateDivisions, carryVenueHistory, divisionStats, venueImbalance } from "../divisions.mjs";
import { makeRandomForm } from "./random-league.mjs";

const count = Number(process.argv[2] || 200);
const rnd = mulberry32(Number(process.argv[3] || 9));
const randomForm = makeRandomForm(rnd);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const stats = { single: 0, withdrawn: 0, wRemoved: 0, wErrors: 0, groundGroups: 0, groundFlips: 0, linkGroups: 0, linkMoves: 0, multi: 0, seasons: 0, rejected: 0 };
const bad = [];
const fail = (kind, extra) => bad.push({ kind, ...extra });
const matchesOf = (s) => s.rounds.flatMap((r) => r.matches.map((m) => ({ day: r.day, m })));
const pairSet = (s) => matchesOf(s).map(({ m }) => `${Math.min(m.home, m.away)}-${Math.max(m.home, m.away)}`).sort();

for (let i = 0; i < count; i++) {
  // ---- single division: withdrawals, ground sharing, linked teams
  const form = randomForm();
  const { errors, spec } = readSpec(form);
  if (!errors.length) {
    let base = null;
    try { base = buildSchedule(spec); } catch { /* unplaceable league */ }
    if (base && base.rounds.length && !validateSchedule(base).errors.length) {
      stats.single++;
      const names = base.teams, days = base.rounds.map((r) => r.day);
      // withdrawals: one or two teams, some from a date, some for the whole season
      const lines = [...new Set([pick(names), pick(names)])].map((t) => (rnd() < 0.6 ? `${dayIso(pick(days))} ${t}` : t));
      const w = applyWithdrawals(base, lines.join("\n"));
      stats.withdrawn += w.withdrawals.length; stats.wErrors += w.errors.length;
      stats.wRemoved += w.withdrawals.reduce((a, x) => a + x.removed.length, 0);
      const vw = validateSchedule(w.schedule);
      if (vw.errors.length) fail("withdrawal-invalid", { form, lines, errors: vw.errors.slice(0, 4) });
      const gone = w.withdrawals.reduce((a, x) => a + x.removed.length, 0);
      if (matchesOf(base).length - matchesOf(w.schedule).length !== gone) fail("withdrawal-count", { form, lines, gone });
      for (const x of w.withdrawals) {
        for (const { day, m } of matchesOf(w.schedule)) if ((m.home === x.team || m.away === x.team) && (x.from === null || day >= x.from)) fail("withdrawn-team-still-plays", { form, lines });
      }
      // ground sharing and linked teams on the untouched base
      const gtext = Array.from({ length: int(1, 2) }, () => [...new Set(Array.from({ length: int(2, 3) }, () => pick(names)))].join(", ")).join("\n");
      const pg = parseGrounds(gtext, names);
      if (pg.groups.length) {
        stats.groundGroups += pg.groups.length;
        const before = groundClashes(base, pg.groups).count;
        const g = applyGroundSharing(base, pg.groups);
        stats.groundFlips += g.flips.length;
        if (!validateSchedule(g.schedule).ok) fail("ground-invalid", { form, gtext });
        if (g.remainingCount > before) fail("ground-worse", { form, gtext, before, after: g.remainingCount });
        if (pairSet(base).join() !== pairSet(g.schedule).join()) fail("ground-pairs-changed", { form, gtext });
        const dayKey = (s) => matchesOf(s).map(({ day, m }) => `${day}|${m.court}|${m.time}|${Math.min(m.home, m.away)}-${Math.max(m.home, m.away)}`).sort().join();
        if (dayKey(base) !== dayKey(g.schedule)) fail("ground-moved-slot", { form, gtext });
      }
      const ltext = Array.from({ length: int(1, 2) }, () => [...new Set(Array.from({ length: int(2, 3) }, () => pick(names)))].join(", ")).join("\n");
      const pl = parseLinkedTeams(ltext, names);
      if (pl.groups.length) {
        stats.linkGroups += pl.groups.length;
        const l = separateLinkedTeams(base, pl.groups);
        stats.linkMoves += (l.moves || []).length;
        if (!validateSchedule(l.schedule).ok) fail("linked-invalid", { form, ltext, errors: validateSchedule(l.schedule).errors.slice(0, 3) });
        if (pairSet(base).join() !== pairSet(l.schedule).join()) fail("linked-pairs-changed", { form, ltext });
        if (linkedClashes(l.schedule, pl.groups).count > linkedClashes(base, pl.groups).count) fail("linked-worse", { form, ltext });
      }
    }
  }

  // ---- multi-division: travel table, three seasons of venue carry-over
  const nDiv = int(1, 3);
  const venues = ["Park", "School", "Rink"].slice(0, int(2, 3));
  const mf = {
    divisions: Array.from({ length: nDiv }, (_, d) => `D${d + 1}: ${Array.from({ length: int(2, 8) }, (_, k) => `T${k + 1}`).join(", ")}${rnd() < 0.3 ? " (double)" : ""}`).join("\n"),
    courts: Array.from({ length: int(2, 5) }, (_, c) => `C${c + 1} @ ${venues[c % venues.length]}`).join(", "),
    times: ["18:00", "19:00", "20:00"].slice(0, int(1, 3)).join(", "),
    start: "2026-03-02", weekdays: DAYS.filter(() => rnd() < 0.3).join(", ") || "Tue",
    travel: venues.flatMap((a, x) => venues.slice(x + 1).map((b) => `${a} - ${b}: ${int(5, 60)}`)).join("\n"),
    venueFairness: true, fairnessWeight: pick(["", 0, 1, 3, 10]), split: rnd() < 0.3, seed: int(1, 999),
  };
  const r0 = readDivisionsSpec(mf);
  if (r0.errors.length) { stats.rejected++; continue; }
  let hist = null, played = {};
  for (let season = 0; season < 3; season++) {
    let s;
    try { s = buildDivisions({ ...r0.spec, seed: mf.seed + season, venueHistory: hist || undefined }); } catch (e) { if (/court slots/.test(String(e))) { stats.rejected++; break; } fail("multi-throw", { mf, season, error: String(e) }); break; }
    if (!season) stats.multi++;
    stats.seasons++;
    const v = validateDivisions(s);
    if (!v.ok) { fail("multi-invalid", { mf, season, errors: v.errors.slice(0, 3) }); break; }
    const h = carryVenueHistory(s);
    for (const n of s.nights) for (const m of n.matches) for (const t of [m.home, m.away]) {
      const k = `${m.division}/${s.divisions[m.div].teams[t]}`;
      played[k] = (played[k] || 0) + 1;
    }
    for (const [k, o] of Object.entries(h)) {
      const sum = Object.values(o).reduce((a, b) => a + b, 0);
      if (sum !== (played[k] || 0)) { fail("carry-sum", { mf, season, team: k, sum, played: played[k] || 0 }); break; }
    }
    const st = divisionStats(s);
    if (st.travelMinutes !== undefined && !(Number.isFinite(st.travelMinutes) && st.travelMinutes >= 0)) fail("travel-bad", { mf, season, st });
    if (!Number.isFinite(venueImbalance(h))) fail("imbalance-bad", { mf, season });
    hist = h;
  }
}

console.log(JSON.stringify(stats));
console.log(`invalid ${bad.length}`);
for (const b of bad.slice(0, 3)) console.log(JSON.stringify(b, null, 1).slice(0, 1800));
process.exit(bad.length ? 1 : 0);
