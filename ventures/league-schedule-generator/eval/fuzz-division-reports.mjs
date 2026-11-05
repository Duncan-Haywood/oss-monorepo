// Random multi-division leagues through the report and editing functions fuzz-divisions.mjs leaves out:
// applyDivisionBlackouts, applyDivisionWithdrawals, divisionsIcs, divisionsDeadline, divisionsBookings,
// divisionsFacilityCost, divisionsPlayoffs and divisionsScoreSheetsHtml.
// Usage: node eval/fuzz-division-reports.mjs [count] [seed]
import { mulberry32, dayIso } from "../calc.mjs";
import { readDivisionsSpec, buildDivisions, validateDivisions, applyDivisionBlackouts, applyDivisionWithdrawals, divisionsIcs, divisionsDeadline, divisionsBookings, divisionsFacilityCost, divisionsPlayoffs, divisionsStandings, divisionsScoreSheetsHtml } from "../divisions.mjs";

const count = Number(process.argv[2] || 200);
const rnd = mulberry32(Number(process.argv[3] || 3));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function randomForm() {
  const nDiv = int(1, 4);
  const divs = Array.from({ length: nDiv }, (_, i) => ({ name: `D${i + 1}`, teams: Array.from({ length: int(2, 9) }, (_, k) => `T${k + 1}`), double: rnd() < 0.3 }));
  const nTimes = int(1, 3);
  const nCourts = int(1, 5);
  const venues = ["Park", "School", "Rink"].slice(0, int(1, 3));
  const courts = Array.from({ length: nCourts }, (_, i) => `C${i + 1} @ ${pick(venues)}`);
  const links = [];
  for (let k = int(0, 3); k > 0 && nDiv > 1; k--) {
    const a = pick(divs), b = pick(divs);
    if (a !== b) links.push(`${a.name}/${pick(a.teams)}, ${b.name}/${pick(b.teams)}`);
  }
  const start = new Date(Date.UTC(2026, 0, 1) + int(0, 300) * 864e5);
  const iso = (d) => d.toISOString().slice(0, 10);
  const wd = DAYS.filter(() => rnd() < 0.35); if (!wd.length) wd.push(pick(DAYS));
  return {
    divisions: divs.map((d) => `${d.name}: ${d.teams.join(", ")}${d.double ? " (double)" : ""}`).join("\n"),
    courts: courts.join(", "), times: ["18:00", "19:00", "20:00"].slice(0, nTimes).join(", "),
    start: iso(start), weekdays: wd.join(", "), skip: iso(new Date(start.getTime() + int(0, 60) * 864e5)),
    links: links.join("\n"), venueFairness: rnd() < 0.3, split: rnd() < 0.3, seed: int(1, 9999),
  };
}

const stats = { leagues: 0, rejected: 0, blackoutMoves: 0, withdrawn: 0, ics: 0, costs: 0 };
const bad = [];
const total = (s) => s.nights.reduce((n, x) => n + x.matches.length, 0);

for (let i = 0; i < count; i++) {
  const form = randomForm();
  const { errors, spec } = readDivisionsSpec(form);
  if (errors.length) { stats.rejected++; continue; }
  let s;
  try { s = buildDivisions(spec); } catch (e) { if (/court slots/.test(String(e))) { stats.rejected++; continue; } bad.push({ kind: "build-throw", form, error: String(e) }); continue; }
  if (!s.nights.length || !validateDivisions(s).ok) continue;
  stats.leagues++;
  const note = (kind, extra) => bad.push({ kind, form, ...extra });
  const run = (kind, f) => { try { return f(); } catch (e) { note(kind + "-throw", { error: String(e) }); return null; } };
  const n0 = total(s);

  // unavailable dates: blackouts on random team nights
  const blackouts = {};
  for (const n of s.nights) for (const m of n.matches) if (rnd() < 0.15) (blackouts[`${m.div}/${m.home}`] ||= []).push(n.day);
  const b = run("blackout", () => applyDivisionBlackouts(s, blackouts, { balance: rnd() < 0.5 }));
  if (b) {
    stats.blackoutMoves += b.moves.length;
    if (total(b.schedule) !== n0) note("blackout-count", {});
    if (!validateDivisions(b.schedule).ok) note("blackout-invalid", { errors: validateDivisions(b.schedule).errors.slice(0, 3) });
    if (!b.errors.length) for (const n of b.schedule.nights) for (const m of n.matches) for (const t of [m.home, m.away]) if ((blackouts[`${m.div}/${t}`] || []).includes(n.day) && b.moves.length) { note("blackout-left", { day: dayIso(n.day) }); }
  }

  // withdrawals
  const d0 = pick(s.divisions), t0 = pick(d0.teams);
  const from = rnd() < 0.5 ? dayIso(pick(s.nights).day) + " " : "";
  const w = run("withdraw", () => applyDivisionWithdrawals(s, `${from}${d0.name}/${t0}`));
  if (w && !w.errors.length) {
    stats.withdrawn++;
    const rep = w.withdrawals[0];
    if (total(s) - total(w.schedule) !== rep.removed) note("withdraw-count", { removed: rep.removed });
    if (!validateDivisions(w.schedule).ok) note("withdraw-invalid", {});
  }

  // calendar
  const cal = run("ics", () => divisionsIcs(s, { stamp: "20260101T000000Z", alarmMinutes: rnd() < 0.5 ? 30 : null }));
  if (cal) {
    stats.ics++;
    const lines = cal.split("\r\n");
    const ev = lines.filter((l) => l === "BEGIN:VEVENT").length;
    const uids = lines.filter((l) => l.startsWith("UID:"));
    if (ev !== n0 || lines.filter((l) => l === "END:VEVENT").length !== ev) note("ics-events", { ev, n0 });
    if (new Set(uids).size !== uids.length) note("ics-uid", {});
    if (lines.some((l) => Buffer.byteLength(l) > 75)) note("ics-long", {});
    if (!cal.endsWith("\r\n") || /[^\r]\n/.test(cal)) note("ics-endings", {});
  }

  // deadline
  const last = Math.max(...s.nights.map((n) => n.day));
  const dl = last + int(-20, 20);
  const dd = run("deadline", () => divisionsDeadline(s, dl));
  if (dd) {
    const after = s.nights.reduce((n, x) => n + (x.day > dl ? x.matches.length : 0), 0);
    if (dd.matchesAfter !== after || dd.fits !== (after === 0) || dd.lastDay !== last) note("deadline-wrong", { dd: { ...dd, text: undefined }, after });
  }

  // bookings and cost
  const bk = run("bookings", () => divisionsBookings(s));
  if (bk && bk.venues.reduce((n, v) => n + v.games, 0) !== n0) note("bookings-count", {});
  const venues = [...new Set(s.nights.flatMap((n) => n.matches.map((m) => m.venue)))];
  const rates = venues.filter(() => rnd() < 0.7).map((v) => `${v}: ${int(10, 90)}/court-hour`).join("\n");
  const extra = rnd() < 0.5 ? int(0, 200) : 0;
  const split = rnd() < 0.5 ? "games" : "team";
  const fc = run("cost", () => divisionsFacilityCost(s, rates, { extra, split }));
  if (fc) {
    stats.costs++;
    const sum = Math.round((fc.venues.reduce((n, v) => n + (v.cost || 0), 0) + extra) * 100) / 100;
    if (Math.abs(sum - fc.total) > 0.011 || fc.total < 0 || fc.venues.some((v) => v.courtHours < 0)) note("cost-total", { sum, total: fc.total });
    const paid = fc.divisions.reduce((n, d) => n + (d.perTeam || 0) * d.teams, 0);
    if (fc.teams && Math.abs(paid - fc.total) > 0.01 * fc.teams + 0.011) note("cost-split", { paid, total: fc.total, split });
  }

  // play-offs and score sheets
  const po = run("playoffs", () => divisionsPlayoffs(divisionsStandings(s, ""), { perDivision: int(1, 3), wildcards: int(0, 2) }));
  void po;
  const sh = run("sheets", () => divisionsScoreSheetsHtml(s));
  if (sh && !/<\/html>\s*$/i.test(sh) && !sh.includes("<")) note("sheets-empty", {});
}

console.log(JSON.stringify(stats));
console.log(`invalid ${bad.length}`);
for (const x of bad.slice(0, 3)) console.log(JSON.stringify(x, null, 1).slice(0, 1800));
process.exit(bad.length ? 1 : 0);
