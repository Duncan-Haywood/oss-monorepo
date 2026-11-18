#!/usr/bin/env node
// Calendar files re-sent after a change: does the re-import update the moved match, or leave the
// old date behind? A calendar import adds or updates events by UID and never deletes one that is
// missing from the new file (RFC 5545 identifies an event by UID), so every event of the first
// file whose UID is absent from the second stays in the player's calendar on its old date.
//
// "before" recomputes the UID formula main used up to 2026-11-17 (home-away-date-index); "after"
// reads the UIDs the current scheduleIcs / divisionsIcs write (fixture ids). Deterministic.
//   node eval/ics-stable-uids.mjs > eval/ics-stable-uids.txt
import { readFileSync } from "node:fs";
import { readSpec, buildSchedule, applyRainouts, applyWithdrawals, scheduleIcs, sampleFields, mulberry32 } from "../calc.mjs";
import { readDivisionsSpec, buildDivisions, applyDivisionRainouts, divisionsIcs } from "../divisions.mjs";

const iso = (d) => new Date(d * 86400000).toISOString().slice(0, 10);
const compact = (d) => iso(d).replace(/-/g, "");
const STAMP = "20261001T000000Z";
const events = (ics) => [...ics.matchAll(/BEGIN:VEVENT\r\n([\s\S]*?)END:VEVENT/g)].map((m) => ({
  uid: m[1].match(/UID:(.*)\r\n/)[1], start: m[1].match(/DTSTART[^:]*:(.*)\r\n/)[1], what: m[1].match(/SUMMARY:(.*)\r\n/)[1], cancelled: /STATUS:CANCELLED/.test(m[1]) }));
// The same events under main's old UIDs: scheduleIcs walks rounds and matches in the order oldUids
// does, so the live events line up one to one (cancelled events, new in this change, are dropped).
const asOld = (evs, uids) => { const live = evs.filter((e) => !e.cancelled), keys = [...uids.keys()]; if (keys.length !== live.length) throw new Error("order mismatch"); return live.map((e, i) => ({ ...e, uid: keys[i] })); };
// Old formula, single division: `${home}-${away}-${date}-${index in round}`.
const oldUids = (s, team) => {
  const out = new Map();
  for (const r of s.rounds) r.matches.forEach((m, i) => { if (team === null || m.home === team || m.away === team) out.set(`${m.home}-${m.away}-${compact(r.day)}-${i}`, iso(r.day)); });
  return out;
};
// What a player who imported file A, then file B, sees. An event of A whose UID is not in B stays:
// a ghost when no match of B is on that date and time with the same billing (a wrong date), a
// duplicate when B also has it under its new UID (two copies of one match).
function stale(a, b) {
  const live = new Map(b.filter((e) => !e.cancelled).map((e) => [e.uid, e]));
  const killed = new Set(b.filter((e) => e.cancelled).map((e) => e.uid));
  const shown = new Set([...live.values()].map((e) => e.start + "|" + e.what));
  let ghost = 0, dup = 0;
  for (const e of a) if (!live.has(e.uid) && !killed.has(e.uid)) shown.has(e.start + "|" + e.what) ? dup++ : ghost++;
  return { ghost, dup };
}
const add = (x, y) => { x.ghost += y.ghost; x.dup += y.dup; };
const fmt = (o, n) => `${o.ghost} ghost + ${o.dup} duplicate -> ${n.ghost} + ${n.dup}`;

const rows = [];
const z = () => ({ ghost: 0, dup: 0 });
const tot = { files: 0, moved: 0, staleOld: z(), staleNew: z(), dupUid: 0, withdrawnOld: z(), withdrawnNew: z() };
for (const n of [4, 5, 6, 7, 8, 10, 12, 14, 16]) for (const double of [false, true]) for (let seed = 1; seed <= 4; seed++) {
  const f = { ...sampleFields(), teams: Array.from({ length: n }, (_, i) => `Team ${i + 1}`).join("\n"), courts: Array.from({ length: Math.ceil(n / 4) }, (_, i) => `Court ${i + 1}`).join("\n"), double, seed: String(seed), blackouts: "", rainouts: "", results: "" };
  const { spec, errors } = readSpec(f);
  if (errors.length) throw new Error(errors[0]);
  spec.seed = seed;
  const s = buildSchedule(spec);
  const rng = mulberry32(seed * 1000 + n * 10 + (double ? 1 : 0));
  const nights = s.rounds.filter((r) => !r.makeup).map((r) => r.day);
  const pick = new Set(); while (pick.size < Math.min(2, nights.length - 1)) pick.add(nights[Math.floor(rng() * (nights.length - 1))]);
  const r = applyRainouts(s, [...pick].map(iso).join("\n"));
  const w = applyWithdrawals(r.schedule, `${iso(nights[Math.floor(nights.length / 2)])} Team ${n}`);
  const so = { ghost: 0, dup: 0 }, sn = { ghost: 0, dup: 0 }, wo = { ghost: 0, dup: 0 }, wn = { ghost: 0, dup: 0 };
  for (let t = 0; t < n - 1; t++) {
    const a = events(scheduleIcs(s, t, STAMP)), b = events(scheduleIcs(r.schedule, t, STAMP)), c = events(scheduleIcs(w.schedule, t, STAMP));
    for (const x of [a, b, c]) if (new Set(x.map((e) => e.uid)).size !== x.length) tot.dupUid++;
    const ao = asOld(a, oldUids(s, t)), bo = asOld(b, oldUids(r.schedule, t)), co = asOld(c, oldUids(w.schedule, t));
    add(so, stale(ao, bo)); add(sn, stale(a, b)); add(wo, stale(bo, co)); add(wn, stale(b, c));
    tot.files++;
  }
  tot.moved += r.moves.length; add(tot.staleOld, so); add(tot.staleNew, sn); add(tot.withdrawnOld, wo); add(tot.withdrawnNew, wn);
  rows.push(`${String(n).padStart(2)} ${double ? "double" : "single"} s${seed}: ${String(r.moves.length).padStart(2)} moved: ${fmt(so, sn)}; then a withdrawal: ${fmt(wo, wn)}`);
}

const ex = JSON.parse(readFileSync(new URL("../example-divisions.json", import.meta.url), "utf8"));
const { spec: dspec } = readDivisionsSpec(ex);
const ds = buildDivisions(dspec);
const dn = ds.nights.map((x) => x.day);
const drows = [];
const dtot = { files: 0, moved: 0, staleOld: z(), staleNew: z(), dupUid: 0 };
const oldD = (s, team, div) => new Map(s.nights.flatMap((night) => night.matches.map((m, i) => [m, i, night.day])).filter(([m]) => m.division === div && (m.homeName === team || m.awayName === team)).map(([m, i, d]) => [`${m.division}-${m.homeName}-${m.awayName}-${compact(d)}-${i}`.replace(/\s+/g, "_"), iso(d)]));
for (let k = 0; k + 1 < dn.length; k += 3) {
  const dr = applyDivisionRainouts(ds, iso(dn[k]));
  const so = z(), sn = z();
  for (const d of ds.divisions) for (const team of d.teams) {
    const a = events(divisionsIcs(ds, { team, division: d.name, stamp: STAMP })), b = events(divisionsIcs(dr.schedule, { team, division: d.name, stamp: STAMP }));
    if (new Set(a.map((e) => e.uid)).size !== a.length) dtot.dupUid++;
    add(so, stale(asOld(a, oldD(ds, team, d.name)), asOld(b, oldD(dr.schedule, team, d.name)))); add(sn, stale(a, b));
    dtot.files++;
  }
  const all = events(divisionsIcs(dr.schedule, { stamp: STAMP }));
  if (new Set(all.map((e) => e.uid)).size !== all.length) dtot.dupUid++;
  dtot.moved += dr.moves.length; add(dtot.staleOld, so); add(dtot.staleNew, sn);
  drows.push(`night ${iso(dn[k])} rained out: ${String(dr.moves.length).padStart(2)} moved: ${fmt(so, sn)}`);
}

console.log("Single division (calc.mjs scheduleIcs): 9 sizes x single/double x 4 seeds, two random nights rained out, then the last team withdraws mid-season.");
console.log("Per team file, before -> after this change: events a player still sees after importing the first file and then the updated one that are a ghost (no match then) or a duplicate (the same match twice).");
console.log(rows.join("\n"));
console.log(`TOTAL: ${tot.files} team files, ${tot.moved} matches moved. Rainouts: ${fmt(tot.staleOld, tot.staleNew)}. Withdrawal (its fixtures now sent as STATUS:CANCELLED): ${fmt(tot.withdrawnOld, tot.withdrawnNew)}. Files with a repeated UID: ${tot.dupUid}`);
console.log("");
console.log("Multi-division example (divisions.mjs divisionsIcs, example-divisions.json): every third night rained out on its own.");
console.log(drows.join("\n"));
console.log(`TOTAL: ${dtot.files} team files, ${dtot.moved} matches moved: ${fmt(dtot.staleOld, dtot.staleNew)}. Files with a repeated UID: ${dtot.dupUid}`);
