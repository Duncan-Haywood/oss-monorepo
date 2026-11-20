// @ts-check
// Flighted play-offs for a golf league (2026-11-20).
//
// A twilight league's last night is rarely "top four, bracket": most of the field has nothing
// left to play for by week 10. The usual fix is flights. The final standings are cut into
// flights (A, B, C ...), each flight plays its own single-elimination bracket, and every flight
// has a champion. This turns the standings from `golfRecap` into the play-off nights: which
// flight each team is in, who meets whom, the night each round is played, the nine, and the tee
// time (or shotgun hole) of every group.
//
// Choices a league can argue with, made here and said in the output:
//  - Flights are consecutive places in the standings, as even as possible, the higher flights
//    larger when the field does not divide (or sizes typed by the organiser).
//  - Seeds inside a flight follow the standings; a first-round bye goes to the top seeds of a
//    field that is not a power of two (the bracket maker in calc.mjs).
//  - Every flight's final is on the last night. A flight with fewer rounds starts later, so the
//    league has one finals night with every flight's champion decided in front of the others.
//  - The nine alternates after the last regular week, as the season did.
//  - Groups on a night are ordered flight A first, then by match; the organiser can reverse
//    that with `flightOrder: "last-first"` (the flight with the most to play for goes last,
//    when the field is likely to be watching it).
//  - A tie on the cut line (two teams level on points and holes won across two flights) is
//    named, not broken: the standings' own order decides and the line says so.
import { playoffBracket, dayLabel, csvCell } from "./calc.mjs";
import { slotLabels, whereName } from "./golf.mjs";

const FLIGHT_NAMES = "ABCDEFGH";

/** Sizes of `flights` flights over `n` teams: even, larger ones first. */
export function flightSizes(n, flights) {
  const base = Math.floor(n / flights), extra = n % flights;
  return Array.from({ length: flights }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * @param {{ standings: { team: string, place: number, points: number, holesWon: number }[] }} recap  from golfRecap
 * @param {{ weeks: { day: number, nine: string }[], rotation?: { course: string, nine: string }[], startType?: string, firstTee?: string, interval?: number, nSlots?: number }} season  the season the recap is of
 * @param {{ flights?: number, sizes?: number[], flightOrder?: "first-first" | "last-first", thirdPlace?: boolean, nights?: number[], nine?: "alternate" | "front" | "back" }} [opts]
 *   `nights`: day numbers for the play-off nights (default: one week apart after the last regular week).
 */
export function golfPlayoffs(recap, season, opts = {}) {
  const errors = [];
  const table = recap?.standings ?? [];
  const n = table.length;
  if (n < 2) return { errors: ["Type the season's cards first: the play-offs are drawn from the standings."] };
  /** @type {number[]} */
  let sizes;
  if (opts.sizes) {
    sizes = opts.sizes.map(Number);
    if (sizes.some((s) => !Number.isInteger(s) || s < 2)) errors.push("Every flight needs at least two teams.");
    else if (sizes.reduce((a, b) => a + b, 0) > n) errors.push(`Flights of ${sizes.join(" + ")} need ${sizes.reduce((a, b) => a + b, 0)} teams and the league has ${n}.`);
  } else {
    const flights = Number(opts.flights ?? 2);
    if (!Number.isInteger(flights) || flights < 1 || flights > FLIGHT_NAMES.length) errors.push(`Flights must be a whole number from 1 to ${FLIGHT_NAMES.length}.`);
    else if (Math.floor(n / flights) < 2) errors.push(`${n} teams cannot make ${flights} flights of at least two.`);
    sizes = errors.length ? [] : flightSizes(n, flights);
  }
  if (errors.length) return { errors };
  const lastWeek = season.weeks[season.weeks.length - 1];
  if (!lastWeek) return { errors: ["The season has no weeks."] };

  const warnings = [];
  const flights = [];
  let at = 0;
  sizes.forEach((size, f) => {
    const teams = table.slice(at, at + size);
    const bracket = playoffBracket(teams.map((t) => t.team), { thirdPlace: Boolean(opts.thirdPlace) });
    flights.push({ name: FLIGHT_NAMES[f], teams: teams.map((t, i) => ({ seed: i + 1, team: t.team, place: t.place })), bracket });
    // A level pair split across the cut: named, not broken.
    if (f > 0) {
      const above = table[at - 1], below = table[at];
      if (above.points === below.points && above.holesWon === below.holesWon) warnings.push(`${above.team} and ${below.team} are level on points and holes won across the cut between flights ${FLIGHT_NAMES[f - 1]} and ${FLIGHT_NAMES[f]}; the standings' order put ${above.team} in ${FLIGHT_NAMES[f - 1]}. Settle it on the course if your rules say so.`);
    }
    at += size;
  });
  const left = table.slice(at).map((t) => t.team);

  const roundsOf = flights.map((f) => f.bracket.rounds.filter((r) => r.matches.some((m) => !m.bye)));
  const nNights = Math.max(...roundsOf.map((r) => r.length));
  const days = opts.nights ?? Array.from({ length: nNights }, (_, i) => lastWeek.day + 7 * (i + 1));
  if (days.length < nNights) return { errors: [`The longest flight has ${nNights} rounds, so it needs ${nNights} nights; ${days.length} given.`] };
  const nineFirst = lastWeek.nine === "front" ? "back" : "front";
  // A league on a course rotation keeps rotating into the play-offs (unless a nine is forced).
  const rot = season.rotation?.length && opts.nine !== "front" && opts.nine !== "back" ? season.rotation : null;
  const atOn = (i) => (rot ? rot[(season.weeks.length + i) % rot.length] : null);
  const nineOn = (i) => (rot ? atOn(i).nine : opts.nine === "front" || opts.nine === "back" ? opts.nine : i % 2 === 0 ? nineFirst : nineFirst === "front" ? "back" : "front");

  /** @type {{ night: number, day: number, nine: string, groups: { slot: string, flight: string, round: string, id: string, a: string, b: string }[] }[]} */
  const nights = [];
  const label = (fl, s) => ("from" in s ? `Winner of ${fl}-${s.from}` : "loserOf" in s ? `Loser of ${fl}-${s.loserOf}` : s.name);
  const slotName = (s) => (s === null ? "TBD" : `#${s.seed} ${s.name}`);
  for (let i = 0; i < nNights; i++) {
    const groups = [];
    flights.forEach((fl, fi) => {
      // Align finals: the flight's round j is played on night i = (nNights - rounds) + j.
      const j = i - (nNights - roundsOf[fi].length);
      if (j < 0) return;
      const round = roundsOf[fi][j];
      for (const m of round.matches) {
        if (m.bye) continue;
        const side = (s) => ("seed" in s ? slotName(s) : label(fl.name, s));
        groups.push({ slot: "", flight: fl.name, round: round.name, id: `${fl.name}-${m.id}`, a: side(m.a), b: side(m.b) });
      }
    });
    if (opts.flightOrder === "last-first") groups.reverse();
    const labels = slotLabels(groups.length, { startType: season.startType, firstTee: season.firstTee, interval: season.interval, nine: nineOn(i) });
    if (season.startType === "shotgun" && groups.length > 18) errors.push(`Night ${i + 1} has ${groups.length} groups, more than a shotgun start takes (18); use tee times or fewer flights.`);
    groups.forEach((g, k) => { g.slot = labels[k]; });
    nights.push({ night: i + 1, day: days[i], nine: nineOn(i), ...(rot ? { course: atOn(i).course } : {}), groups });
  }
  if (errors.length) return { errors };
  return { errors: [], flights, nights, warnings, notInFlights: left };
}

/** The play-off draw as text for the group chat. */
export function golfPlayoffsText(p) {
  const out = [];
  for (const f of p.flights) out.push(`Flight ${f.name}: ${f.teams.map((t) => `${t.seed}. ${t.team}`).join(", ")}`);
  if (p.notInFlights.length) out.push(`Not in a flight: ${p.notInFlights.join(", ")}`);
  for (const n of p.nights) {
    out.push("", `Night ${n.night}, ${dayLabel(n.day)} (${whereName(n)})`);
    for (const g of n.groups) out.push(`  ${g.slot}  Flight ${g.flight} ${g.round}: ${g.a} v ${g.b}`);
  }
  for (const w of p.warnings) out.push("", `Note: ${w}`);
  return out.join("\n") + "\n";
}

// Every cell goes through calc.mjs csvCell, the formula-injection guard (a cell starting =, +, -,
// @, tab or CR gets an apostrophe), so a team named "=SUM(...)" stays text in a spreadsheet.
export function golfPlayoffsCsv(p) {
  const rows = [["Night", "Date", "Nine", "Start", "Flight", "Round", "Match", "Side A", "Side B"]];
  for (const n of p.nights) for (const g of n.groups) rows.push([n.night, dayLabel(n.day), whereName(n), g.slot, g.flight, g.round, g.id, g.a, g.b]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
