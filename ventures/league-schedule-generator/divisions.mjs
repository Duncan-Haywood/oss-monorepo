// Multi-division scheduling on shared venues: several divisions (U10, U12, Adult...) play their own
// round robin, but they share the same courts and time slots, so one solve decides which divisions
// play on which night and which match gets which court and time. The goals, in order:
//   1. no court is booked twice and no closed court is used (hard);
//   2. teams that share a coach or a player (`links`) are not in two places at the same time (soft,
//      penalised heavily; the ones that cannot be avoided are listed, never hidden);
//   3. a team plays at the same venue as on its previous night where it can (fewer trips).
// Each division keeps the circle-method round robin of calc.mjs (home/away balance and byes), so only
// the dates, courts and times are decided here.
import { roundRobin, mulberry32, parseDate, parseDateList, parseWeekdays, parseTimes, parseNameList, parseCourtClosures, parseOfficials, dayIso, dayOfWeek, courtClosedOn, dayLabel, htmlEsc, icsEscape, icsFold, icsAlarm } from "./calc.mjs";

const MAX_NIGHTS = 800;
const W_CLASH = 1000;
const W_TRIP = 5;
const W_FAIR = 3; // per match-slot a team is over its even share of a venue (only when venue fairness is on)

/** "U10: Hawks, Owls, Lynx" per line (a trailing "(double)" makes that division a double round robin). */
export function parseDivisions(text) {
  const errors = [];
  const divisions = [];
  const seen = new Set();
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([^:]+):(.*)$/);
    if (!m) { errors.push(`"${line}": write a division as "Name: team, team, team".`); continue; }
    let rest = m[2];
    const double = /\(double\)\s*$/i.test(rest);
    rest = rest.replace(/\(double\)\s*$/i, "");
    const name = m[1].trim();
    const teams = rest.split(",").map((s) => s.trim()).filter(Boolean);
    if (seen.has(name.toLowerCase())) { errors.push(`Division "${name}" is listed twice.`); continue; }
    seen.add(name.toLowerCase());
    if (teams.length < 2) { errors.push(`${name}: at least two teams.`); continue; }
    if (new Set(teams.map((t) => t.toLowerCase())).size !== teams.length) { errors.push(`${name}: a team name is repeated.`); continue; }
    divisions.push({ name, teams, double });
  }
  if (!divisions.length && !errors.length) errors.push("Enter at least one division.");
  return { divisions, errors };
}

/**
 * Soft checks on a travel table (not errors; the schedule still builds). A pair left out is priced as the longest listed,
 * which silently overstates it, and a direct time longer than going via a third venue usually means a typo.
 * Returns an array of messages.
 */
export function travelWarnings(travel, venues) {
  const out = [];
  const vs = [...new Set(venues || [])];
  if (!travel || !Object.keys(travel).length) return out;
  const key = (a, b) => [a, b].sort().join("|");
  const longest = Math.max(...Object.values(travel));
  for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
    if (travel[key(vs[i], vs[j])] === undefined) out.push(`No travel time for ${vs[i]} - ${vs[j]}: it is priced as ${longest} min, the longest you gave.`);
  }
  for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
    const direct = travel[key(vs[i], vs[j])];
    if (direct === undefined) continue;
    for (const k of vs) {
      if (k === vs[i] || k === vs[j]) continue;
      const a = travel[key(vs[i], k)], b = travel[key(k, vs[j])];
      if (a !== undefined && b !== undefined && direct > a + b) { out.push(`${vs[i]} - ${vs[j]} is ${direct} min but ${vs[i]} - ${k} - ${vs[j]} is ${a + b}: check the ${direct}.`); break; }
    }
  }
  return out;
}

/**
 * Travel times between venues, one per line: "Park - School: 25" (minutes, either direction).
 * Venues are the names after "@" in the courts box; a pair not listed is treated as the longest one given.
 */
export function parseTravel(text, venues) {
  const errors = [];
  const travel = {};
  const known = new Map((venues || []).map((v) => [v.toLowerCase(), v]));
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.+?)\s*:\s*(\d+(?:\.\d+)?)\s*(?:min\w*)?$/i);
    if (!m) { errors.push(`"${line}": write travel as "Park - School: 25" (minutes).`); continue; }
    // a venue name may hold a hyphen ("North-Park"), so try every separator and keep the split where both sides are venues
    const seps = [...m[1].matchAll(/\s*(?:-|–|<->)\s*/g)];
    if (!seps.length) { errors.push(`"${line}": write travel as "Park - School: 25" (minutes).`); continue; }
    const split = seps.map((x) => [m[1].slice(0, x.index).trim(), m[1].slice(x.index + x[0].length).trim()]);
    const hit = split.find(([l, r]) => known.has(l.toLowerCase()) && known.has(r.toLowerCase()));
    const [left, right] = hit || split[0];
    const a = known.get(left.toLowerCase()), b = known.get(right.toLowerCase());
    if (!a || !b) { errors.push(`"${line}": ${!a ? left : right} is not a venue in the courts box (write a court as "Field 1 @ Park").`); continue; }
    if (a === b) { errors.push(`"${line}": a venue is not away from itself.`); continue; }
    const mins = Number(m[2]);
    if (!(mins > 0)) { errors.push(`"${line}": minutes must be above zero.`); continue; }
    travel[[a, b].sort().join("|")] = mins;
  }
  return { travel, errors };
}

/** Links, one group per line: "U10/Hawks, U12/Hawks" (teams that share a coach or players). */
export function parseDivisionLinks(text, divisions) {
  const errors = [];
  const groups = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const refs = [];
    for (const tok of line.split(",").map((s) => s.trim()).filter(Boolean)) {
      const [d, ...t] = tok.split("/");
      const di = divisions.findIndex((x) => x.name.toLowerCase() === d.trim().toLowerCase());
      const ti = di < 0 ? -1 : divisions[di].teams.findIndex((x) => x.toLowerCase() === t.join("/").trim().toLowerCase());
      if (di < 0 || ti < 0) { errors.push(`"${tok}": not a Division/Team in this league.`); continue; }
      refs.push({ d: di, t: ti });
    }
    if (refs.length >= 2) groups.push(refs);
    else errors.push(`"${line}": a link needs two or more teams in this league.`);
  }
  return { groups, errors };
}

function playDays(start, weekdays, skip) {
  const days = [];
  const ws = new Set(weekdays), sk = new Set(skip || []);
  for (let d = start, g = 0; g < MAX_NIGHTS * 7 && days.length < MAX_NIGHTS; d++, g++) if (ws.has(dayOfWeek(d)) && !sk.has(d)) days.push(d);
  return days;
}

/**
 * spec: { divisions:[{name, teams[], double}], courts[], times[], venues{court: venueName}, start (day),
 *         weekdays[], skipDays[], courtClosures{court: days[]}, links:[[{d,t}...]], seed, optimize,
 *         venueFairness, venueHistory{"Division/Team": {venue: matches}} }
 * `venueFairness: true` (or any `venueHistory`) also weighs how often each team has played at each venue, so a team that
 * had the far or poor venue most of last season gets the other one this season. `venueHistory` carries earlier seasons in
 * (`carryVenueHistory` builds it from a finished schedule); with fairness on and no history it evens out within the season.
 * `fairnessWeight` (default 3, against 5 per venue change) sets how hard fairness pulls against travel: 0 ignores it, 10 puts it first.
 * `optimize: false` is the naive baseline (matches take cells in the order they come), kept so the
 * gain can be measured. Returns { divisions[{name, teams, rounds[{day, label, matches[]}]}], nights[], conflicts[], stats, config }.
 */
export function buildDivisions(spec) {
  const divs = spec.divisions || [];
  if (!divs.length) throw new Error("Enter at least one division.");
  const courts = spec.courts && spec.courts.length ? spec.courts : null;
  if (!courts) throw new Error("Name the shared courts.");
  const times = spec.times && spec.times.length ? spec.times : [""];
  if (!Number.isInteger(spec.start)) throw new Error("The season start date is not a real date.");
  if (!(spec.weekdays || []).length) throw new Error("Pick at least one weekday to play on.");
  const venueOf = (c) => (spec.venues && spec.venues[c]) || c;
  const closures = spec.courtClosures || {};
  const travel = spec.travel && Object.keys(spec.travel).length ? spec.travel : null;
  const travelMin = makeTravelMin(travel);
  const tripUnit = travel ? Math.min(...Object.values(travel)) : 1;
  const cfg = { courts, times, closures };
  const rng = mulberry32(spec.seed ?? 1);
  const optimize = spec.optimize !== false;
  const split = Boolean(spec.splitRounds);

  const queues = divs.map((d) => ({ plan: roundRobin(d.teams.length, { double: Boolean(d.double) }), next: 0, rem: null, part: 0 }));
  const biggest = Math.max(...queues.flatMap((q) => q.plan.map((r) => r.matches.length)));
  if (!split && biggest > courts.length * times.length) throw new Error(`A round of ${biggest} matches needs ${biggest} court slots, but ${courts.length} court(s) x ${times.length} time(s) give ${courts.length * times.length}.`);

  // team id -> [division, team]; linked partners per team
  const linkOf = new Map();
  for (const g of spec.links || []) for (const a of g) for (const b of g) if (a !== b && !(a.d === b.d && a.t === b.t)) {
    const k = `${a.d}/${a.t}`;
    if (!linkOf.has(k)) linkOf.set(k, new Set());
    linkOf.get(k).add(`${b.d}/${b.t}`);
  }
  const lastVenue = new Map(); // "d/t" -> venue of the previous match
  const venueList = [...new Set(courts.map(venueOf))];
  const history = spec.venueHistory && typeof spec.venueHistory === "object" ? spec.venueHistory : null;
  const fair = venueList.length > 1 && Boolean(spec.venueFairness || (history && Object.keys(history).length));
  const wFair = Number.isFinite(Number(spec.fairnessWeight)) && Number(spec.fairnessWeight) >= 0 ? Number(spec.fairnessWeight) : W_FAIR;
  const tally = new Map(); // "d/t" -> {venue: matches played there, earlier seasons included}
  const tallyOf = (k) => { let o = tally.get(k); if (!o) { o = Object.fromEntries(venueList.map((v) => [v, 0])); tally.set(k, o); } return o; };
  if (fair && history) divs.forEach((d, di) => d.teams.forEach((name, ti) => { const h = history[`${d.name}/${name}`]; if (h) for (const v of venueList) tallyOf(`${di}/${ti}`)[v] += Number(h[v]) || 0; }));
  const out = divs.map((d) => ({ name: d.name, teams: d.teams, double: Boolean(d.double), rounds: [] }));
  const nights = [];
  const days = playDays(spec.start, spec.weekdays, spec.skipDays);

  for (const day of days) {
    if (queues.every((q) => q.next >= q.plan.length)) break;
    const open = [];
    for (let ti = 0; ti < times.length; ti++) for (let ci = 0; ci < courts.length; ci++) if (!courtClosedOn(cfg, courts[ci], day)) open.push({ ci, ti });
    if (!open.length) continue;
    // divisions with the most rounds left go first, so they all finish together
    const order = queues.map((q, i) => i).filter((i) => queues[i].next < queues[i].plan.length)
      .sort((a, b) => (queues[b].plan.length - queues[b].next) - (queues[a].plan.length - queues[a].next) || a - b);
    const todo = [];
    let left = open.length;
    for (const i of order) {
      const q = queues[i];
      const mine = q.rem || q.plan[q.next].matches;
      if (mine.length <= left) {
        left -= mine.length;
        todo.push({ i, matches: mine, idx: q.next, part: q.rem ? q.part + 1 : 0, last: Boolean(q.rem) });
        q.next++; q.rem = null; q.part = 0;
      } else if (split && left > 0) {
        // a round that does not fit the slots still free tonight: play part of it now, the rest on the next night
        todo.push({ i, matches: mine.slice(0, left), idx: q.next, part: q.part + 1, last: false });
        q.rem = mine.slice(left); q.part++; left = 0;
      }
    }
    if (!todo.length) continue;
    const ms = todo.flatMap(({ i, matches, idx }) => matches.map(([h, a]) => ({ div: i, home: h, away: a, round: idx })));

    // assignment: ms[k] -> open[cellOf[k]]
    const cellOf = ms.map((_, k) => k);
    const used = new Set(cellOf);
    const free = () => open.map((_, c) => c).filter((c) => !used.has(c));
    const trip = (m, c) => {
      const v = venueOf(courts[open[c].ci]);
      let n = 0;
      for (const t of [m.home, m.away]) { const pv = lastVenue.get(`${m.div}/${t}`); if (pv !== undefined && pv !== v) n += travelMin(pv, v) / tripUnit; }
      return n;
    };
    // how far over an even share of venue v the team already is, summed over both teams of the match
    const unfair = (m, c) => {
      if (!fair) return 0;
      const v = venueOf(courts[open[c].ci]);
      let n = 0;
      for (const t of [m.home, m.away]) { const o = tallyOf(`${m.div}/${t}`); n += o[v] - venueList.reduce((a, x) => a + o[x], 0) / venueList.length; }
      return n;
    };
    const clashCost = (k, c, cells) => {
      let s = 0;
      for (let j = 0; j < ms.length; j++) {
        if (j === k) continue;
        const cj = cells[j];
        for (const ta of [ms[k].home, ms[k].away]) {
          const partners = linkOf.get(`${ms[k].div}/${ta}`);
          if (!partners) continue;
          for (const tb of [ms[j].home, ms[j].away]) {
            if (!partners.has(`${ms[j].div}/${tb}`)) continue;
            const dt = Math.abs(open[c].ti - open[cj].ti);
            if (dt === 0) s += W_CLASH;
            else if (dt === 1 && venueOf(courts[open[c].ci]) !== venueOf(courts[open[cj].ci])) s += 50;
          }
        }
      }
      return s;
    };
    const total = (cells) => cells.reduce((s, c, k) => s + W_TRIP * trip(ms[k], c) + wFair * unfair(ms[k], c) + clashCost(k, c, cells) / 2, 0);
    if (optimize) {
      let cur = total(cellOf);
      const iters = (travel ? 6000 : 600) + 40 * ms.length; // a travel table has more to gain from search (measured in divisions.test.mjs)
      for (let it = 0; it < iters && cur > 0; it++) {
        const k = Math.floor(rng() * ms.length);
        const spare = free();
        const useFree = spare.length && rng() < 0.4;
        const k2 = Math.floor(rng() * ms.length);
        if (useFree) {
          const c = spare[Math.floor(rng() * spare.length)];
          const old = cellOf[k];
          cellOf[k] = c;
          const nxt = total(cellOf);
          if (nxt <= cur) { cur = nxt; used.delete(old); used.add(c); } else cellOf[k] = old;
        } else if (k2 !== k) {
          [cellOf[k], cellOf[k2]] = [cellOf[k2], cellOf[k]];
          const nxt = total(cellOf);
          if (nxt <= cur) cur = nxt; else [cellOf[k], cellOf[k2]] = [cellOf[k2], cellOf[k]];
        }
      }
    }
    const night = { day, matches: [] };
    for (const { i, idx, part, last } of todo) out[i].rounds.push({ day, label: part || last ? `Round ${idx + 1} (part ${part})` : `Round ${idx + 1}`, matches: [] });
    ms.forEach((m, k) => {
      const cell = open[cellOf[k]];
      const court = courts[cell.ci];
      const rec = { division: out[m.div].name, home: m.home, away: m.away, homeName: out[m.div].teams[m.home], awayName: out[m.div].teams[m.away], court, time: times[cell.ti], venue: venueOf(court) };
      out[m.div].rounds[out[m.div].rounds.length - 1].matches.push(rec);
      night.matches.push({ ...rec, div: m.div, round: m.round });
      if (fair) { tallyOf(`${m.div}/${m.home}`)[rec.venue]++; tallyOf(`${m.div}/${m.away}`)[rec.venue]++; }
      lastVenue.set(`${m.div}/${m.home}`, rec.venue);
      lastVenue.set(`${m.div}/${m.away}`, rec.venue);
    });
    night.matches.sort((a, b) => times.indexOf(a.time) - times.indexOf(b.time) || courts.indexOf(a.court) - courts.indexOf(b.court));
    nights.push(night);
  }
  if (queues.some((q) => q.next < q.plan.length)) throw new Error("Not enough playable nights in the next few years for every division. Add weekdays, courts or time slots.");
  const schedule = { divisions: out, nights, config: { weekdays: spec.weekdays, skipDays: spec.skipDays || [], courts, times, venues: Object.fromEntries(courts.map((c) => [c, venueOf(c)])), closures, start: spec.start, links: spec.links || [], travel: travel || {}, seed: spec.seed ?? 1, ...(fair ? { venueFairness: true, venueHistory: history || {} } : {}) } };
  schedule.conflicts = linkConflicts(schedule);
  schedule.stats = divisionStats(schedule);
  return schedule;
}

const BALANCE_WINDOW = 6; // nights a make-up may be weighed over when keeping home/away alternating

/**
 * Team unavailable dates across divisions, one team per line: "U10/Hawks: 2026-11-05, 2026-11-12 to 2026-11-19" or
 * "U10/Hawks cannot play 2026-11-05". Returns { blackouts{"divIndex/teamIndex": days[]}, errors[] }.
 */
export function parseDivisionBlackouts(text, divisions) {
  const blackouts = {}, errors = [];
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.*?)\s*(?::|\bcannot play\b|\bcan't play\b|\bunavailable\b)\s*(.+)$/i);
    if (!m) { errors.push(`Line ${i + 1}: write Division/Team, a colon, then the dates (U10/Hawks: 2026-11-05).`); continue; }
    const [dn, ...tn] = m[1].trim().split("/");
    const di = divisions.findIndex((d) => d.name.toLowerCase() === dn.trim().toLowerCase());
    const ti = di < 0 || !tn.length ? -1 : divisions[di].teams.findIndex((t) => t.toLowerCase() === tn.join("/").trim().toLowerCase());
    if (ti < 0) { errors.push(`Line ${i + 1}: "${m[1].trim()}" is not a Division/Team in this league.`); continue; }
    const { days, errors: e } = parseDateList(m[2]);
    for (const x of e) errors.push(`Line ${i + 1}: ${x}`);
    const k = `${di}/${ti}`;
    blackouts[k] = [...new Set([...(blackouts[k] || []), ...days])].sort((a, b) => a - b);
  }
  return { blackouts, errors };
}

/**
 * Moves every match that falls on a night one of its teams cannot play to the earliest later night both teams are free
 * (the rainout mover, which also keeps every moved match off the teams' unavailable dates). Takes the rainout options.
 * Returns what `applyDivisionRainouts` does.
 */
export function applyDivisionBlackouts(schedule, blackouts, opts = {}) {
  const byDay = new Map();
  for (const n of schedule.nights) for (const m of n.matches) for (const t of [m.home, m.away]) {
    if ((blackouts[`${m.div}/${t}`] || []).includes(n.day)) {
      if (!byDay.has(n.day)) byDay.set(n.day, new Set());
      byDay.get(n.day).add(`${m.division}/${t === m.home ? m.homeName : m.awayName}`);
    }
  }
  const text = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([d, ts]) => `${dayIso(d)} ${[...ts].join(", ")}`).join("\n");
  return applyDivisionRainouts(schedule, text, { ...opts, blackouts });
}

/**
 * Rainouts across divisions, one per line: "2026-10-13" (the whole night), "2026-10-13 U10" (a division) or
 * "2026-10-13 U10/Hawks, U12/Owls" (those teams' matches), optionally ending "-> 2026-10-20" for a make-up date
 * you agreed. Each cancelled match moves to the earliest later play night where both teams are free and a court
 * is open, never double-booking a court or a team and, where a free slot allows it, keeping linked teams out of
 * the same time slot; a refusal says why and leaves the match where it was. Nothing else moves.
 * Returns { schedule, moves[{division, home, away, from, to, court, time}], errors[] }.
 * `{ balance: true }` weighs the first few nights that fit and takes the one that adds the fewest home/away breaks
 * (two home or two away matches in a row for a team), preferring nights already on the calendar.
 * `{ flip: true }` then swaps home and away of a moved match wherever that removes breaks and both teams stay
 * within one home game of even (single round robins only: a double keeps each pair hosting once each way). It moves
 * no match to another night, so it costs no delay; the `flipped` flag on a move says it happened.
 * `{ relocate: true }` moves a make-up to an earlier night that is already on the calendar (never one you fixed with
 * "->") when that lowers the total breaks, so it never adds delay and can shorten it; the move's `to` and a
 * `relocated` flag show it. It runs before `flip`.
 */
export function applyDivisionRainouts(schedule, text, { balance = false, flip = false, relocate = false, swapNights = false, blackouts = null } = {}) {
  const s = JSON.parse(JSON.stringify(schedule));
  const cfg = s.config;
  const weekdays = new Set(cfg.weekdays || []), skip = new Set(cfg.skipDays || []);
  const links = cfg.links || [];
  const inGroup = (g, div, team) => g.some((x) => x.d === div && x.t === team);
  const linked = (d1, t1, d2, t2) => !(d1 === d2 && t1 === t2) && links.some((g) => inGroup(g, d1, t1) && inGroup(g, d2, t2));
  const moves = [], errors = [];
  const nightOf = (day) => s.nights.find((n) => n.day === day);
  for (const raw of String(text ?? "").split(/\n+/)) {
    let line = raw.trim();
    if (!line) continue;
    let fixed = null;
    const arrow = line.match(/^(.*?)\s*(?:->|=>|→)\s*(\d{4}-\d{1,2}-\d{1,2})\s*$/);
    if (arrow) { fixed = parseDate(arrow[2]); line = arrow[1].trim(); if (fixed === null) { errors.push(`"${raw.trim()}": "${arrow[2]}" is not a real date.`); continue; } }
    const m = line.match(/^(\d{4}-\d{1,2}-\d{1,2})\s*[:,-]?\s*(.*)$/);
    const day = m ? parseDate(m[1]) : null;
    if (day === null) { errors.push(`"${line}": start each line with a real date like 2026-10-13.`); continue; }
    const night = nightOf(day);
    if (!night || !night.matches.length) { errors.push(`${dayIso(day)}: no matches are scheduled that night.`); continue; }
    const wantDiv = new Set(), wantTeam = new Set();
    let bad = false;
    for (const tok of parseNameList(m[2])) {
      const [dn, ...tn] = tok.split("/");
      const di = s.divisions.findIndex((d) => d.name.toLowerCase() === dn.trim().toLowerCase());
      if (di < 0) { errors.push(`"${tok}": not a division or Division/Team in this league.`); bad = true; continue; }
      if (!tn.length) { wantDiv.add(di); continue; }
      const ti = s.divisions[di].teams.findIndex((t) => t.toLowerCase() === tn.join("/").trim().toLowerCase());
      if (ti < 0) { errors.push(`"${tok}": ${s.divisions[di].name} has no such team.`); bad = true; continue; }
      wantTeam.add(`${di}/${ti}`);
    }
    if (bad) continue;
    const named = wantDiv.size || wantTeam.size;
    const cancelled = night.matches.filter((x) => !named || wantDiv.has(x.div) || wantTeam.has(`${x.div}/${x.home}`) || wantTeam.has(`${x.div}/${x.away}`));
    if (!cancelled.length) { errors.push(`${dayIso(day)}: none of those teams play that night.`); continue; }
    night.matches = night.matches.filter((x) => !cancelled.includes(x));
    for (const mt of cancelled) {
      const label = `${mt.division} ${mt.homeName} v ${mt.awayName} (${dayIso(day)})`;
      if (fixed !== null && fixed <= day) { errors.push(`${label}: ${dayIso(fixed)} is not after ${dayIso(day)}.`); night.matches.push(mt); continue; }
      const cand = fixed !== null ? [fixed] : [];
      if (fixed === null) for (let d = day + 1, g = 0; g < 400 && cand.length < 120; d++, g++) if (weekdays.has(dayOfWeek(d)) && !skip.has(d)) cand.push(d);
      let placed = null, why = "";
      // home/away runs of the two teams without this match, to price each night it could move to
      const runOf = (t, home) => {
        const seq = [];
        for (const n of s.nights) for (const x of n.matches) if (x.div === mt.div && (x.home === t || x.away === t)) seq.push([n.day, x.home === t]);
        return { seq, home };
      };
      const breaksWith = ({ seq, home }, d) => {
        const all = seq.concat([[d, home]]).sort((a, b) => a[0] - b[0]);
        let n = 0;
        for (let i = 1; i < all.length; i++) if (all[i][1] === all[i - 1][1]) n++;
        return n;
      };
      const runs = [runOf(mt.home, true), runOf(mt.away, false)];
      const options = [];
      for (const d of cand) {
        if (blackouts && [mt.home, mt.away].some((t) => (blackouts[`${mt.div}/${t}`] || []).includes(d))) { why = `${dayIso(d)}: a team is unavailable`; continue; }
        const target = nightOf(d);
        const there = target ? target.matches : [];
        if (there.some((x) => x.div === mt.div && [x.home, x.away].some((t) => t === mt.home || t === mt.away))) { why = `${dayIso(d)}: a team already plays`; continue; }
        let best = null;
        for (let ti = 0; ti < cfg.times.length; ti++) for (const court of cfg.courts) {
          if (there.some((x) => x.court === court && x.time === cfg.times[ti]) || courtClosedOn({ courtClosures: cfg.closures || {} }, court, d)) continue;
          const clash = there.filter((x) => x.time === cfg.times[ti] && [x.home, x.away].some((t) => [mt.home, mt.away].some((u) => linked(mt.div, u, x.div, t)))).length;
          const score = clash * 1000 + ti * 10 + cfg.courts.indexOf(court);
          if (!best || score < best.score) best = { court, ti, score };
        }
        if (!best) { why = `${dayIso(d)}: no open court slot`; continue; }
        options.push({ d, ...best, fresh: !target, breaks: runs.reduce((a, r) => a + breaksWith(r, d), 0) });
        // with a fixed make-up date there is one choice; otherwise look at the first few nights that fit
        if (fixed !== null || !balance || options.length >= BALANCE_WINDOW) break;
      }
      // a night that is not on the calendar yet only wins when no night already playing has room: this trims, but does not remove, the delay balancing costs
      const pool = options.some((o) => !o.fresh) ? options.filter((o) => !o.fresh) : options;
      if (pool.length) placed = pool.reduce((a, o) => (o.breaks < a.breaks ? o : a));
      if (!placed) { errors.push(`${label}: ${why || "no play night found"}; left where it was.`); night.matches.push(mt); continue; }
      const rec = { ...mt, court: placed.court, time: cfg.times[placed.ti], venue: cfg.venues[placed.court] || placed.court };
      let target = nightOf(placed.d);
      if (!target) { target = { day: placed.d, matches: [] }; s.nights.push(target); }
      target.matches.push(rec);
      const dv = s.divisions[mt.div];
      let rd = dv.rounds.find((r) => r.day === placed.d);
      if (!rd) { rd = { day: placed.d, label: "Make-up", matches: [] }; dv.rounds.push(rd); }
      const { div: _d, round: _r, ...plain } = rec;
      rd.matches.push(plain);
      const old = dv.rounds.find((r) => r.day === day);
      if (old) old.matches = old.matches.filter((x) => !(x.home === mt.home && x.away === mt.away));
      moves.push({ division: mt.division, home: mt.homeName, away: mt.awayName, from: day, to: placed.d, court: rec.court, time: rec.time, _rec: rec, _rd: plain, _fixed: fixed !== null });
    }
  }
  for (const dv of s.divisions) { dv.rounds = dv.rounds.filter((r) => r.matches.length); dv.rounds.sort((a, b) => a.day - b.day); }
  s.nights = s.nights.filter((n) => n.matches.length).sort((a, b) => a.day - b.day);
  for (const n of s.nights) n.matches.sort((a, b) => cfg.times.indexOf(a.time) - cfg.times.indexOf(b.time) || cfg.courts.indexOf(a.court) - cfg.courts.indexOf(b.court));
  if (relocate || swapNights) relocateMoved(s, moves, linked, { move: relocate, swap: swapNights });
  if (flip) flipMoved(s, moves);
  for (const m of moves) { delete m._rec; delete m._rd; delete m._fixed; }
  s.conflicts = linkConflicts(s);
  s.stats = divisionStats(s);
  return { schedule: s, moves, errors };
}

/**
 * After the moves, tries each make-up on every earlier night that is already on the calendar (after its rainout,
 * with both teams free, an open court and no new linked-team clash) and keeps the move that most lowers the
 * schedule's home/away breaks, repeating until none helps. A make-up with a date you agreed stays put.
 */
function relocateMoved(s, moves, linked, { move = true, swap = false } = {}) {
  const cfg = s.config;
  const nightOf = (day) => s.nights.find((n) => n.day === day);
  const roundOf = (dv, day) => dv.rounds.find((r) => r.day === day);
  const put = (mv, night, court, time, venue) => {
    const rec = mv._rec, dv = s.divisions[rec.div];
    const cur = s.nights.find((n) => n.matches.includes(rec));
    cur.matches = cur.matches.filter((x) => x !== rec);
    const oldRd = dv.rounds.find((r) => r.matches.includes(mv._rd));
    oldRd.matches = oldRd.matches.filter((x) => x !== mv._rd);
    Object.assign(rec, { court, time, venue });
    Object.assign(mv._rd, { court, time, venue });
    night.matches.push(rec);
    let rd = roundOf(dv, night.day);
    if (!rd) { rd = { day: night.day, label: "Make-up", matches: [] }; dv.rounds.push(rd); }
    rd.matches.push(mv._rd);
    return cur;
  };
  for (let improved = move, guard = 0; improved && guard < 20; guard++) {
    improved = false;
    for (const mv of moves) {
      const rec = mv._rec;
      const cur = s.nights.find((n) => n.matches.includes(rec));
      if (mv._fixed || !cur) continue;
      const before = divisionStats(s).homeAwayBreaks;
      let best = null;
      for (const night of s.nights) {
        if (night.day <= mv.from || night.day >= cur.day) continue;
        if (night.matches.some((x) => x.div === rec.div && [x.home, x.away].some((t) => t === rec.home || t === rec.away))) continue;
        for (let ti = 0; ti < cfg.times.length; ti++) for (const court of cfg.courts) {
          if (night.matches.some((x) => x.court === court && x.time === cfg.times[ti]) || courtClosedOn({ courtClosures: cfg.closures || {} }, court, night.day)) continue;
          if (night.matches.some((x) => x.time === cfg.times[ti] && [x.home, x.away].some((t) => [rec.home, rec.away].some((u) => linked(rec.div, u, x.div, t))))) continue;
          const keep = { court: rec.court, time: rec.time, venue: rec.venue };
          const from = put(mv, night, court, cfg.times[ti], cfg.venues[court] || court);
          const after = divisionStats(s).homeAwayBreaks;
          if (after < before && (!best || after < best.after || (after === best.after && night.day < best.night.day))) best = { after, night, court, time: cfg.times[ti] };
          put(mv, from, keep.court, keep.time, keep.venue);
        }
      }
      if (best) {
        put(mv, best.night, best.court, best.time, cfg.venues[best.court] || best.court);
        Object.assign(mv, { to: best.night.day, court: best.court, time: best.time, relocated: true });
        improved = true;
      }
    }
  }
  if (swap) {
    // two make-ups trade nights (and slots) when each is free on the other's night, neither lands before its own rainout, no linked team clashes, and the total breaks fall
    const free = (rec, night, other) => night.matches.every((x) => x === other || (!(x.div === rec.div && [x.home, x.away].some((t) => t === rec.home || t === rec.away))
      && !(x.time === other.time && [x.home, x.away].some((t) => [rec.home, rec.away].some((u) => linked(rec.div, u, x.div, t))))));
    const nightHolding = (rec) => s.nights.find((n) => n.matches.includes(rec));
    for (let improved = true, guard = 0; improved && guard < 20; guard++) {
      improved = false;
      for (let i = 0; i < moves.length; i++) for (let j = i + 1; j < moves.length; j++) {
        const a = moves[i], b = moves[j];
        if (a._fixed || b._fixed) continue;
        const na = nightHolding(a._rec), nb = nightHolding(b._rec);
        if (!na || !nb || na === nb || nb.day <= a.from || na.day <= b.from) continue;
        if (!free(a._rec, nb, b._rec) || !free(b._rec, na, a._rec)) continue;
        const before = divisionStats(s).homeAwayBreaks;
        const sa = { court: a._rec.court, time: a._rec.time, venue: a._rec.venue }, sb = { court: b._rec.court, time: b._rec.time, venue: b._rec.venue };
        put(a, nb, sb.court, sb.time, sb.venue);
        put(b, na, sa.court, sa.time, sa.venue);
        if (divisionStats(s).homeAwayBreaks < before) {
          Object.assign(a, { to: nb.day, court: sb.court, time: sb.time, relocated: true });
          Object.assign(b, { to: na.day, court: sa.court, time: sa.time, relocated: true });
          improved = true;
        } else {
          put(a, na, sa.court, sa.time, sa.venue);
          put(b, nb, sb.court, sb.time, sb.venue);
        }
      }
    }
  }
  for (const dv of s.divisions) { dv.rounds = dv.rounds.filter((r) => r.matches.length); dv.rounds.sort((a, b) => a.day - b.day); }
  s.nights = s.nights.filter((n) => n.matches.length).sort((a, b) => a.day - b.day);
  for (const n of s.nights) n.matches.sort((a, b) => cfg.times.indexOf(a.time) - cfg.times.indexOf(b.time) || cfg.courts.indexOf(a.court) - cfg.courts.indexOf(b.court));
}

/**
 * After the moves, swaps home and away of a moved match wherever that lowers the schedule's home/away breaks and
 * leaves both teams within one home game of even, repeating until no swap helps. Doing it after all the moves (not
 * match by match) means it can only ever lower the total. Single round robins only. Marks the move `flipped`.
 */
function flipMoved(s, moves) {
  const swap = (rec, rd) => {
    const [h, a, hn, an] = [rec.home, rec.away, rec.homeName, rec.awayName];
    Object.assign(rec, { home: a, away: h, homeName: an, awayName: hn });
    Object.assign(rd, { home: a, away: h, homeName: an, awayName: hn });
  };
  const counts = (dv, t) => {
    let h = 0, a = 0;
    for (const r of dv.rounds) for (const x of r.matches) { if (x.home === t) h++; else if (x.away === t) a++; }
    return h - a;
  };
  for (let improved = true, guard = 0; improved && guard < 20; guard++) {
    improved = false;
    for (const mv of moves) {
      const dv = s.divisions[mv._rec.div];
      if (dv.double || !s.nights.some((n) => n.matches.includes(mv._rec))) continue; // a make-up cancelled again has moved on
      const { home, away } = mv._rec;
      if (Math.abs(counts(dv, home) - 2) > 1 || Math.abs(counts(dv, away) + 2) > 1) continue;
      const before = divisionStats(s).homeAwayBreaks;
      swap(mv._rec, mv._rd);
      if (divisionStats(s).homeAwayBreaks < before) { mv.flipped = !mv.flipped; mv.home = mv._rec.homeName; mv.away = mv._rec.awayName; improved = true; }
      else swap(mv._rec, mv._rd);
    }
  }
}

/** Minutes between two venues; an unlisted pair counts as the longest listed (1 per change with no table). */
function makeTravelMin(travel) {
  if (!travel) return () => 1;
  const longest = Math.max(...Object.values(travel));
  return (a, b) => travel[[a, b].sort().join("|")] ?? longest;
}

/** Linked teams in two matches at the same time on the same night. */
export function linkConflicts(schedule) {
  const out = [];
  const links = schedule.config.links || [];
  for (const night of schedule.nights) {
    for (const g of links) {
      const byTime = new Map();
      for (const m of night.matches) for (const ref of g) {
        if (m.div === ref.d && (m.home === ref.t || m.away === ref.t)) {
          const arr = byTime.get(m.time) || [];
          arr.push(`${schedule.divisions[ref.d].name}/${schedule.divisions[ref.d].teams[ref.t]}`);
          byTime.set(m.time, arr);
        }
      }
      for (const [time, who] of byTime) if (who.length > 1) out.push(`${dayIso(night.day)} ${time || "the one time slot"}: ${who.sort().join(" and ")} are linked but play at once.`);
    }
  }
  return out;
}

/**
 * Matches each team has played at each venue: { "Division/Team": {venue: n} }, the schedule plus any `venueHistory` it was
 * built with. Pass the result as the next season's `venueHistory` and that season starts from where this one left off.
 */
export function carryVenueHistory(schedule) {
  const venues = [...new Set(Object.values(schedule.config.venues))];
  const out = {};
  schedule.divisions.forEach((d) => d.teams.forEach((t) => { out[`${d.name}/${t}`] = Object.fromEntries(venues.map((v) => [v, Number((schedule.config.venueHistory || {})[`${d.name}/${t}`]?.[v]) || 0])); }));
  for (const n of schedule.nights) for (const m of n.matches) for (const t of [m.home, m.away]) out[`${m.division}/${schedule.divisions[m.div].teams[t]}`][m.venue]++;
  return out;
}

const WEIGHT_GRID = [0, 0.5, 1, 1.5, 2, 3, 5, 10];

/**
 * Picks `fairnessWeight` for this league from its own venues and travel table. It builds `seasons` seasons in a row (history
 * carried, `seeds` seeds each) at every weight on a grid and keeps the largest weight whose travel stays within `slack` of
 * weight 0 (the same league with fairness off). Travel is minutes when the spec has a travel table, else venue changes.
 * When no weight fits the slack (three venues with real distances often do not) it falls back to the smallest weight that halves
 * the imbalance and says so (`overSlack: true`, `extraTravel`), so the person sees the price instead of getting 0 silently.
 * Returns { weight, basis, slack, overSlack, extraTravel (share over weight 0), rows[{weight, imbalance, travel}] }.
 */
export function suggestFairnessWeight(spec, { seasons = 3, seeds = 4, slack = 0.05, weights = WEIGHT_GRID } = {}) {
  const base = Number(spec.seed ?? 1) || 1;
  let basis = "venue changes";
  const rows = weights.map((w) => {
    let imb = 0, travel = 0;
    for (let k = 0; k < seeds; k++) {
      let hist = {};
      const all = {};
      for (let y = 0; y < seasons; y++) {
        const s = buildDivisions({ ...spec, seed: base * 100 + k * 10 + y, venueFairness: true, venueHistory: hist, fairnessWeight: w });
        if (s.stats.travelMinutes !== undefined) { basis = "minutes of travel"; travel += s.stats.travelMinutes; } else travel += s.stats.trips;
        const one = carryVenueHistory({ ...s, config: { ...s.config, venueHistory: {} } });
        for (const key of Object.keys(one)) { all[key] ||= {}; for (const v of Object.keys(one[key])) all[key][v] = (all[key][v] || 0) + one[key][v]; }
        hist = carryVenueHistory(s);
      }
      imb += venueImbalance(all) / seeds;
    }
    return { weight: w, imbalance: Number(imb.toFixed(2)), travel };
  });
  const zero = rows.find((r) => r.weight === 0) || rows[0];
  let best = rows[0].weight;
  for (const r of rows) if (r.travel <= zero.travel * (1 + slack) && r.imbalance < zero.imbalance && r.weight >= best) best = r.weight;
  let overSlack = false;
  if (best === 0) {
    const half = rows.find((r) => r.weight > 0 && r.imbalance <= zero.imbalance / 2);
    if (half) { best = half.weight; overSlack = true; }
  }
  const pick = rows.find((r) => r.weight === best) || zero;
  return { weight: best, basis, slack, overSlack, extraTravel: zero.travel ? Number((pick.travel / zero.travel - 1).toFixed(3)) : 0, rows };
}

/** Mean over teams of (most-played venue minus least-played venue), in matches: 0 is an even split. */
export function venueImbalance(history) {
  const rows = Object.values(history);
  if (!rows.length) return 0;
  return rows.reduce((a, o) => { const c = Object.values(o); return a + Math.max(...c) - Math.min(...c); }, 0) / rows.length;
}

export function divisionStats(schedule) {
  let trips = 0, matches = 0, travelMinutes = 0;
  const travel = schedule.config.travel && Object.keys(schedule.config.travel).length ? schedule.config.travel : null;
  const travelMin = makeTravelMin(travel);
  const last = new Map();
  const role = new Map(); // "d/t" -> was the previous match at home
  let homeAwayBreaks = 0;
  for (const night of schedule.nights) {
    for (const m of night.matches) {
      matches++;
      for (const [t, home] of [[m.home, true], [m.away, false]]) {
        const k = `${m.div}/${t}`;
        if (role.get(k) === home) homeAwayBreaks++;
        role.set(k, home);
        if (last.has(k) && last.get(k) !== m.venue) { trips++; travelMinutes += travelMin(last.get(k), m.venue); }
        last.set(k, m.venue);
      }
    }
  }
  const cap = schedule.config.courts.length * schedule.config.times.length;
  return { nights: schedule.nights.length, matches, trips, homeAwayBreaks, ...(travel ? { travelMinutes } : {}), ...(schedule.config.venueFairness ? { venueImbalance: venueImbalance(carryVenueHistory(schedule)) } : {}), clashes: schedule.conflicts.length, utilisation: matches / (schedule.nights.length * cap), lastDay: schedule.nights.length ? schedule.nights[schedule.nights.length - 1].day : null };
}

/** Independent re-check of a finished multi-division schedule. */
export function validateDivisions(schedule) {
  const errors = [];
  const cfg = schedule.config;
  const cfgCal = { courts: cfg.courts, courtClosures: cfg.closures || {} };
  const seenNight = new Set();
  for (const night of schedule.nights) {
    if (seenNight.has(night.day)) errors.push(`${dayIso(night.day)} appears twice.`);
    seenNight.add(night.day);
    const cells = new Set();
    const teams = new Set();
    for (const m of night.matches) {
      const cell = `${m.court}|${m.time}`;
      if (cells.has(cell)) errors.push(`${dayIso(night.day)}: ${m.court} at ${m.time || "the one slot"} is booked twice.`);
      cells.add(cell);
      if (!cfg.courts.includes(m.court)) errors.push(`${dayIso(night.day)}: unknown court ${m.court}.`);
      else if (courtClosedOn(cfgCal, m.court, night.day)) errors.push(`${dayIso(night.day)}: ${m.court} is closed.`);
      for (const t of [m.home, m.away]) {
        const k = `${m.div}/${t}`;
        if (teams.has(k)) errors.push(`${dayIso(night.day)}: ${m.division}/${t} plays twice.`);
        teams.add(k);
      }
    }
  }
  for (const d of schedule.divisions) {
    const n = d.teams.length, want = d.double ? 2 : 1;
    const pair = new Map(), home = Array(n).fill(0), away = Array(n).fill(0);
    let prev = -Infinity;
    for (const r of d.rounds) {
      if (r.day <= prev) errors.push(`${d.name}: ${r.label} is not after the round before it.`);
      prev = r.day;
      for (const m of r.matches) {
        const key = `${Math.min(m.home, m.away)}-${Math.max(m.home, m.away)}`;
        const rec = pair.get(key) || { c: 0, lo: 0, hi: 0 };
        rec.c++; if (m.home < m.away) rec.lo++; else rec.hi++;
        pair.set(key, rec); home[m.home]++; away[m.away]++;
      }
    }
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const rec = pair.get(`${a}-${b}`);
      if (!rec || rec.c !== want) errors.push(`${d.name}: ${d.teams[a]} and ${d.teams[b]} meet ${rec ? rec.c : 0} time(s), expected ${want}.`);
      else if (want === 2 && (rec.lo !== 1 || rec.hi !== 1)) errors.push(`${d.name}: ${d.teams[a]} and ${d.teams[b]} do not each host once.`);
    }
    for (let t = 0; t < n; t++) if (Math.abs(home[t] - away[t]) > (want === 2 ? 0 : 1)) errors.push(`${d.name}: ${d.teams[t]} has ${home[t]} home and ${away[t]} away games.`);
  }
  const recount = linkConflicts(schedule);
  if (recount.length !== schedule.conflicts.length) errors.push(`The conflict list (${schedule.conflicts.length}) does not match a recount (${recount.length}).`);
  return { ok: errors.length === 0, errors };
}

/**
 * Officials for a multi-division schedule: the same list format as `parseOfficials` (`Name (Hawks): Tue, Thu max 6`);
 * a team in brackets is matched by name in every division that has it. Returns { officials, errors }.
 */
export function parseDivisionOfficials(text, divisions) {
  const names = [...new Set(divisions.flatMap((d) => d.teams))];
  const r = parseOfficials(text, names);
  return { officials: r.officials.map((o) => ({ ...o, teamName: o.team >= 0 ? names[o.team] : "" })), errors: r.errors };
}

/**
 * Give every match one official. Hard rules as in `assignOfficials`: weekday, not from either team, one match per
 * time slot of a night, under their cap. Least-loaded first, then list order. Deterministic; the schedule is copied.
 */
export function assignDivisionOfficials(schedule, officials) {
  const s = JSON.parse(JSON.stringify(schedule));
  const load = officials.map(() => 0);
  const unfilled = [];
  for (const night of s.nights) {
    const wd = dayOfWeek(night.day);
    const busy = new Set();
    for (const m of night.matches) {
      const why = { weekday: 0, team: 0, busy: 0, cap: 0 };
      const ok = [];
      officials.forEach((o, i) => {
        if (o.days && !o.days.includes(wd)) { why.weekday++; return; }
        if (o.teamName && (o.teamName === m.homeName || o.teamName === m.awayName)) { why.team++; return; }
        if (busy.has(`${i}|${m.time ?? ""}`)) { why.busy++; return; }
        if (load[i] >= o.max) { why.cap++; return; }
        ok.push(i);
      });
      if (!ok.length) {
        m.official = "";
        const reason = !officials.length ? "no officials were listed" : Object.entries({ "off that weekday": why.weekday, "belong to a team in this match": why.team, "already on another match at that time": why.busy, "at their match cap": why.cap }).filter(([, c]) => c).map(([t, c]) => `${c} ${t}`).join(", ");
        unfilled.push({ day: night.day, time: m.time, court: m.court, division: m.division, home: m.homeName, away: m.awayName, reason });
        continue;
      }
      ok.sort((a, b) => load[a] - load[b] || a - b);
      load[ok[0]]++;
      busy.add(`${ok[0]}|${m.time ?? ""}`);
      m.official = officials[ok[0]].name;
    }
  }
  return { schedule: s, loads: officials.map((o, i) => ({ name: o.name, matches: load[i] })), unfilled, total: load.reduce((a, b) => a + b, 0) };
}

/** Independent re-check of `match.official` on a multi-division schedule. Empty list = clean. */
export function validateDivisionOfficials(schedule, officials) {
  const errors = [];
  const byName = new Map(officials.map((o) => [o.name, o]));
  const count = new Map();
  for (const night of schedule.nights) {
    const used = new Set();
    for (const m of night.matches) {
      if (!m.official) continue;
      const o = byName.get(m.official);
      const tag = `${dayIso(night.day)} ${m.division}: ${m.homeName} v ${m.awayName}`;
      if (!o) { errors.push(`${tag}: ${m.official} is not a listed official.`); continue; }
      if (o.days && !o.days.includes(dayOfWeek(night.day))) errors.push(`${tag}: ${o.name} is off that weekday.`);
      if (o.teamName && (o.teamName === m.homeName || o.teamName === m.awayName)) errors.push(`${tag}: ${o.name} belongs to a team in the match.`);
      const key = `${o.name}|${m.time ?? ""}`;
      if (used.has(key)) errors.push(`${tag}: ${o.name} is on two matches at ${m.time || "the same time"}.`);
      used.add(key);
      count.set(o.name, (count.get(o.name) || 0) + 1);
    }
  }
  for (const o of officials) if ((count.get(o.name) || 0) > o.max) errors.push(`${o.name}: ${count.get(o.name)} matches is over their cap of ${o.max}.`);
  return errors;
}

export function divisionsCsv(schedule) {
  const q = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  const withOfficial = schedule.nights.some((n) => n.matches.some((m) => m.official !== undefined));
  const rows = [["Date", "Time", "Court", "Venue", "Division", "Round", "Home", "Away", ...(withOfficial ? ["Official"] : [])]];
  for (const night of schedule.nights) for (const m of night.matches) rows.push([dayIso(night.day), m.time, m.court, m.venue, m.division, m.round + 1, m.homeName, m.awayName, ...(withOfficial ? [m.official || ""] : [])]);
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
}

/**
 * Season grid for a multi-division schedule: one row per team (division first, so two teams that share a
 * name in different divisions stay apart), one column per playing night. A cell is "v Opponent 19:00 Court"
 * at home or "@ Opponent 19:00 Court" away, blank when the team does not play that night; two games on one
 * night are joined with " / ".
 */
export function divisionsSeasonGrid(schedule) {
  const header = ["Division", "Team", ...schedule.nights.map((n) => dayIso(n.day))];
  const rows = [];
  for (const d of schedule.divisions) {
    for (const team of d.teams) {
      const cells = schedule.nights.map((night) => night.matches
        .filter((m) => m.division === d.name && (m.homeName === team || m.awayName === team))
        .map((m) => `${m.homeName === team ? "v " + m.awayName : "@ " + m.homeName}${m.time ? " " + m.time : ""} ${m.court}`)
        .join(" / "));
      rows.push([d.name, team, ...cells]);
    }
  }
  return { header, rows };
}

export function divisionsSeasonGridCsv(schedule) {
  const q = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  const { header, rows } = divisionsSeasonGrid(schedule);
  return [header, ...rows].map((r) => r.map(q).join(",")).join("\r\n") + "\r\n";
}

/**
 * Printable score sheets for a multi-division league: one page per playing night, matches grouped by
 * venue then ordered by time and court, each with its division and round, blank score boxes and a forfeit
 * tick. Self-contained HTML (no scripts, no external files); every name is escaped.
 */
export function divisionsScoreSheetsHtml(schedule, { title = "League score sheets" } = {}) {
  const t = htmlEsc(title);
  const withOfficial = schedule.nights.some((n) => n.matches.some((m) => m.official !== undefined));
  const pages = schedule.nights.map((night) => {
    const venues = [...new Set(night.matches.map((m) => m.venue))].sort();
    const tables = venues.map((v) => {
      const ms = night.matches.filter((m) => m.venue === v).sort((a, b) => String(a.time).localeCompare(String(b.time)) || String(a.court).localeCompare(String(b.court)));
      const rows = ms.map((m) => `<tr><td>${htmlEsc(m.time)}</td><td>${htmlEsc(m.court)}</td><td>${htmlEsc(m.division)} R${m.round + 1}</td><td class="n">${htmlEsc(m.homeName)}</td><td class="b"></td><td class="b"></td><td class="n">${htmlEsc(m.awayName)}</td><td class="f">&#9744;</td>${withOfficial ? `<td>${htmlEsc(m.official ?? "")}</td>` : ""}</tr>`);
      return `<h3>${htmlEsc(v)}</h3><table><thead><tr><th>Time</th><th>Court</th><th>Division</th><th>Home</th><th colspan="2">Score</th><th>Away</th><th>Forfeit</th>${withOfficial ? "<th>Official</th>" : ""}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
    }).join("");
    return `<section class="sheet"><h2>${htmlEsc(dayLabel(night.day))}</h2>${tables}<p class="sig">Scorekeeper: ____________________ &nbsp; Notes (injuries, protests, rainouts): ______________________________________</p></section>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0 auto;max-width:56rem;padding:1rem;color:#1a1a1a;background:#fff}table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:.5rem;text-align:left}td.b{width:3.5rem;height:2.4rem}td.n{font-weight:600}td.f{text-align:center;font-size:1.3rem}.sheet{page-break-after:always;margin-bottom:2rem}.sig{margin-top:1.5rem}@media(prefers-color-scheme:dark){body{background:#111;color:#eee}th,td{border-color:#666}}@media print{body{background:#fff;color:#000}}</style></head>
<body><h1>${t}</h1>
${pages}
</body></html>
`;
}

/**
 * An iCalendar file for the whole multi-division schedule, one division (`division`), or one team
 * (`team`, with `division` to tell apart teams that share a name). Times are floating local times;
 * `stamp` (YYYYMMDDTHHMMSSZ) is injectable for reproducible output; `minutes` is the game length.
 */
export function divisionsIcs(schedule, { division = null, team = null, stamp = null, minutes = 60, alarmMinutes = null } = {}) {
  const dtstamp = stamp || new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const compact = (day) => dayIso(day).replace(/-/g, "");
  const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}${String(min % 60).padStart(2, "0")}00`;
  const name = team !== null ? `${team} schedule` : division !== null ? `${division} schedule` : "League schedule";
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//league-schedule-generator//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${icsEscape(name)}`];
  for (const night of schedule.nights) {
    night.matches.forEach((m, i) => {
      if (division !== null && m.division !== division) return;
      if (team !== null && m.homeName !== team && m.awayName !== team) return;
      const summary = team !== null ? `${team} vs ${m.homeName === team ? m.awayName : m.homeName} (${m.homeName === team ? "home" : "away"})` : `[${m.division}] ${m.homeName} vs ${m.awayName}`;
      out.push("BEGIN:VEVENT", `UID:${m.division}-${m.homeName}-${m.awayName}-${compact(night.day)}-${i}@league-schedule-generator`.replace(/\s+/g, "_"), `DTSTAMP:${dtstamp}`);
      if (m.time) {
        const [hh, mm] = m.time.split(":").map(Number);
        const end = hh * 60 + mm + minutes;
        out.push(`DTSTART:${compact(night.day)}T${hhmm(hh * 60 + mm)}`, `DTEND:${compact(night.day + Math.floor(end / 1440))}T${hhmm(end % 1440)}`);
      } else out.push(`DTSTART;VALUE=DATE:${compact(night.day)}`, `DTEND;VALUE=DATE:${compact(night.day + 1)}`);
      out.push(`SUMMARY:${icsEscape(summary)}`, `LOCATION:${icsEscape(m.venue && m.venue !== m.court ? `${m.court}, ${m.venue}` : m.court)}`, `DESCRIPTION:${icsEscape(`${m.division}, round ${m.round + 1}${m.official ? `, official ${m.official}` : ""}`)}`);
      if (m.time) out.push(...icsAlarm(alarmMinutes, summary));
      out.push("END:VEVENT");
    });
  }
  out.push("END:VCALENDAR");
  return out.map(icsFold).join("\r\n") + "\r\n";
}

/**
 * One ready-to-paste note per team on a multi-division schedule: every match in date order with time, court,
 * venue and opponent, plus the division. Teams that share a name in two divisions get one note each.
 * Returns [{ division, team, matches, text }] in division order.
 */
export function divisionsTeamMessages(schedule) {
  const out = [];
  for (const d of schedule.divisions) {
    for (const team of d.teams) {
      const lines = [];
      for (const night of schedule.nights) {
        for (const m of night.matches) {
          if (m.division !== d.name || (m.homeName !== team && m.awayName !== team)) continue;
          const home = m.homeName === team;
          lines.push(`${dayLabel(night.day)}${m.time ? " " + m.time : ""}, ${m.court}${m.venue && m.venue !== m.court ? " (" + m.venue + ")" : ""}: ${home ? "vs" : "at"} ${home ? m.awayName : m.homeName}`);
        }
      }
      out.push({ division: d.name, team, matches: lines.length, text: [`Hi ${team} (${d.name}), your ${lines.length} fixtures:`, ...lines, "Check the dates before you plan around them."].join("\n") });
    }
  }
  return out;
}

/** One note per official (set by assignDivisionOfficials), in date order; officials with no match are left out. */
export function divisionsOfficialMessages(schedule) {
  const by = new Map();
  for (const night of schedule.nights) {
    for (const m of night.matches) {
      if (!m.official) continue;
      if (!by.has(m.official)) by.set(m.official, []);
      by.get(m.official).push(`${dayLabel(night.day)}${m.time ? " " + m.time : ""}, ${m.court}${m.venue && m.venue !== m.court ? " (" + m.venue + ")" : ""}: [${m.division}] ${m.homeName} vs ${m.awayName}`);
    }
  }
  return [...by].map(([official, lines]) => ({ official, matches: lines.length, text: [`Hi ${official}, the matches you are officiating (${lines.length}):`, ...lines, "Check the dates before you plan around them."].join("\n") }));
}

/** Plain-text read-out for a command line or a group chat. */
export function divisionsText(schedule) {
  const lines = [];
  for (const night of schedule.nights) {
    lines.push(dayIso(night.day));
    for (const m of night.matches) lines.push(`  ${m.time || "--"} ${m.court} [${m.division}] ${m.homeName} v ${m.awayName}${m.official ? ` (official: ${m.official})` : ""}`);
  }
  const s = schedule.stats;
  lines.push("", `${s.matches} matches over ${s.nights} nights, ${s.trips} venue changes${s.travelMinutes !== undefined ? ` (${s.travelMinutes} min of travel)` : ""}, ${s.clashes} linked-team clash(es), ${(s.utilisation * 100).toFixed(0)}% of court slots used.`);
  for (const c of schedule.conflicts) lines.push(`Conflict: ${c}`);
  return lines.join("\n") + "\n";
}

/** Form fields (text boxes) to a spec; mirrors readSpec in calc.mjs. */
export function readDivisionsSpec(f) {
  const errors = [];
  const d = parseDivisions(f.divisions);
  errors.push(...d.errors);
  const start = parseDate(f.start);
  if (start === null) errors.push("The season start date must be a real date, like 2026-10-06.");
  const w = parseWeekdays(f.weekdays);
  errors.push(...w.errors);
  if (!w.weekdays.length) errors.push("Pick at least one weekday to play on.");
  const skip = parseDateList(f.skip);
  errors.push(...skip.errors.map((e) => `Skip dates: ${e}`));
  const t = parseTimes(f.times);
  errors.push(...t.errors);
  const courts = parseNameList(f.courts);
  if (!courts.length) errors.push("Name the shared courts.");
  const l = parseDivisionLinks(f.links, d.divisions);
  errors.push(...l.errors);
  // "Court 1 @ Park" puts a court at a venue; plain names are their own venue
  const venues = {};
  const names = courts.map((c) => { const m = c.match(/^(.*?)\s*@\s*(.+)$/); if (!m) return c; venues[m[1].trim()] = m[2].trim(); return m[1].trim(); });
  const tr = parseTravel(f.travel, [...new Set(names.map((c) => venues[c] || c))]);
  errors.push(...tr.errors);
  const warnings = travelWarnings(tr.travel, [...new Set(names.map((c) => venues[c] || c))]);
  const cc = parseCourtClosures(f.courtClosures, names.length ? names : null);
  errors.push(...cc.errors);
  // venueFairness: "yes" evens venues out within the season; venueHistory: the JSON `carryVenueHistory` printed last season
  let venueHistory;
  if (f.venueHistory) {
    try { venueHistory = typeof f.venueHistory === "string" ? JSON.parse(f.venueHistory) : f.venueHistory; } catch { errors.push("Venue history is not valid JSON; paste what last season's run printed."); }
    if (venueHistory && (typeof venueHistory !== "object" || Array.isArray(venueHistory))) { errors.push("Venue history must be an object of Division/Team to venue counts."); venueHistory = undefined; }
  }
  const venueFairness = f.venueFairness === true || /^(1|true|yes|on)$/i.test(String(f.venueFairness || ""));
  const fw = String(f.fairnessWeight ?? "").trim();
  if (fw !== "" && !(Number.isFinite(Number(fw)) && Number(fw) >= 0 && Number(fw) <= 100)) errors.push("The fairness weight is a number from 0 to 100 (default 3).");
  return { errors, warnings, spec: { venueFairness, venueHistory, ...(fw !== "" && Number.isFinite(Number(fw)) ? { fairnessWeight: Number(fw) } : {}), divisions: d.divisions, courts: names, venues, times: t.times, start, weekdays: w.weekdays, skipDays: skip.days, courtClosures: cc.closures, links: l.groups, travel: tr.travel, seed: String(f.seed ?? "").trim() !== "" && Number.isFinite(Number(f.seed)) ? Math.trunc(Number(f.seed)) : 1, splitRounds: f.split === true || /^(1|true|yes|on)$/i.test(String(f.split || "")) } };
}

/** Form fields -> the options `applyDivisionRainouts` takes (the page's four make-up checkboxes; the CLI's spec JSON uses the same keys). */
export function rainoutOptions(f) {
  const on = (v) => v === true || /^(1|true|yes|on)$/i.test(String(v || ""));
  return { balance: on(f.balance), flip: on(f.flip), relocate: on(f.relocate), swapNights: on(f.swapNights) };
}

// node divisions.mjs spec.json  ->  text read-out (add --csv for the CSV, --grid for the season grid CSV, --history for next season's venueHistory, or --suggest-weight to pick fairnessWeight). spec.json holds the form fields.
if (typeof process !== "undefined" && process.argv && import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import("node:fs");
  const file = process.argv[2];
  if (!file) { console.error("usage: node divisions.mjs spec.json [--csv]"); process.exit(2); }
  const { spec, errors, warnings } = readDivisionsSpec(JSON.parse(readFileSync(file, "utf8")));
  for (const w of warnings) console.error(`Warning: ${w}`);
  if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
  if (process.argv.includes("--suggest-weight")) {
    const r = suggestFairnessWeight(spec);
    process.stdout.write(`Fairness weight by ${r.basis} (3 seasons, 4 seeds; travel kept within ${r.slack * 100}% of fairness off):\n` + r.rows.map((x) => `  ${String(x.weight).padStart(4)}  imbalance ${x.imbalance.toFixed(2)}  ${x.travel} ${r.basis}`).join("\n") + `\nSuggested fairnessWeight: ${r.weight} (${r.extraTravel >= 0 ? "+" : ""}${(r.extraTravel * 100).toFixed(0)}% ${r.basis}${r.overSlack ? ", more than the slack: nothing cheaper halves the imbalance" : ""})\n`);
    process.exit(0);
  }
  let s = buildDivisions(spec);
  const raw = JSON.parse(readFileSync(file, "utf8"));
  if (raw.blackouts) {
    const pb = parseDivisionBlackouts(raw.blackouts, spec.divisions);
    if (pb.errors.length) { console.error(pb.errors.join("\n")); process.exit(1); }
    const r = applyDivisionBlackouts(s, pb.blackouts, rainoutOptions(raw));
    for (const e of r.errors) console.error(`Unavailable: ${e}`);
    s = r.schedule;
  }
  const rainouts = raw.rainouts;
  if (rainouts) {
    const r = applyDivisionRainouts(s, rainouts, rainoutOptions(raw));
    for (const e of r.errors) console.error(`Rainout: ${e}`);
    s = r.schedule;
  }
  const v = validateDivisions(s);
  if (!v.ok) { console.error(v.errors.join("\n")); process.exit(1); }
  if (raw.officials) {
    const po = parseDivisionOfficials(raw.officials, spec.divisions);
    if (po.errors.length) { console.error(po.errors.join("\n")); process.exit(1); }
    const a = assignDivisionOfficials(s, po.officials);
    s = a.schedule;
    const oe = validateDivisionOfficials(s, po.officials);
    if (oe.length) { console.error(oe.join("\n")); process.exit(1); }
    for (const u of a.unfilled) console.error(`No official: ${dayIso(u.day)} ${u.time || ""} ${u.division} ${u.home} v ${u.away} (${u.reason})`);
  }
  if (process.argv.includes("--history")) { process.stdout.write(JSON.stringify(carryVenueHistory(s), null, 1) + "\n"); process.exit(0); }
  process.stdout.write(process.argv.includes("--grid") ? divisionsSeasonGridCsv(s) : process.argv.includes("--csv") ? divisionsCsv(s) : divisionsText(s));
}

// ---------------------------------------------------------------- share link

const SHARE_FIELDS = ["divisions", "courts", "times", "start", "weekdays", "skip", "courtClosures", "travel", "links", "blackouts", "rainouts", "officials", "split", "venueFairness", "venueHistory", "fairnessWeight", "balance", "flip", "relocate", "swapNights", "seed"];

/** Form fields -> URL-safe text for the `#` part of a link (`#d=...`). The fragment is never sent to a server. */
export function encodeDivisionFields(f) {
  const o = {};
  for (const k of SHARE_FIELDS) if (typeof f[k] === "string" ? f[k].trim() !== "" : f[k] !== undefined && f[k] !== null && f[k] !== "") o[k] = typeof f[k] === "object" ? JSON.stringify(f[k]) : String(f[k]);
  const bytes = new TextEncoder().encode(JSON.stringify(o));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Inverse of encodeDivisionFields. Takes `location.hash`; null for anything that is not a division share fragment. */
export function decodeDivisionFields(text) {
  try {
    const t = String(text || "").replace(/^#?d=/, "");
    if (!String(text || "").match(/^#?d=/) || !t || t.length > 20000 || !/^[A-Za-z0-9_-]+$/.test(t)) return null;
    const bin = atob(t.replace(/-/g, "+").replace(/_/g, "/"));
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const out = {};
    for (const k of SHARE_FIELDS) out[k] = typeof o[k] === "string" ? o[k] : "";
    if (!out.seed) out.seed = "1";
    return out;
  } catch { return null; }
}
