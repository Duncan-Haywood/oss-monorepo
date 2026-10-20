// Multi-division scheduling on shared venues: several divisions (U10, U12, Adult...) play their own
// round robin, but they share the same courts and time slots, so one solve decides which divisions
// play on which night and which match gets which court and time. The goals, in order:
//   1. no court is booked twice and no closed court is used (hard);
//   2. teams that share a coach or a player (`links`) are not in two places at the same time (soft,
//      penalised heavily; the ones that cannot be avoided are listed, never hidden);
//   3. a team plays at the same venue as on its previous night where it can (fewer trips).
// Each division keeps the circle-method round robin of calc.mjs (home/away balance and byes), so only
// the dates, courts and times are decided here.
import { roundRobin, mulberry32, parseDate, parseDateList, parseWeekdays, parseTimes, parseNameList, parseCourtClosures, dayIso, dayOfWeek, courtClosedOn } from "./calc.mjs";

const MAX_NIGHTS = 800;
const W_CLASH = 1000;
const W_TRIP = 5;

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
    const m = line.match(/^(.+?)\s*(?:-|–|<->)\s*(.+?)\s*:\s*(\d+(?:\.\d+)?)\s*(?:min\w*)?$/i);
    if (!m) { errors.push(`"${line}": write travel as "Park - School: 25" (minutes).`); continue; }
    const a = known.get(m[1].trim().toLowerCase()), b = known.get(m[2].trim().toLowerCase());
    if (!a || !b) { errors.push(`"${line}": ${!a ? m[1].trim() : m[2].trim()} is not a venue in the courts box (write a court as "Field 1 @ Park").`); continue; }
    if (a === b) { errors.push(`"${line}": a venue is not away from itself.`); continue; }
    const mins = Number(m[3]);
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
 *         weekdays[], skipDays[], courtClosures{court: days[]}, links:[[{d,t}...]], seed, optimize }
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

  const queues = divs.map((d) => ({ plan: roundRobin(d.teams.length, { double: Boolean(d.double) }), next: 0 }));
  const biggest = Math.max(...queues.flatMap((q) => q.plan.map((r) => r.matches.length)));
  if (biggest > courts.length * times.length) throw new Error(`A round of ${biggest} matches needs ${biggest} court slots, but ${courts.length} court(s) x ${times.length} time(s) give ${courts.length * times.length}.`);

  // team id -> [division, team]; linked partners per team
  const linkOf = new Map();
  for (const g of spec.links || []) for (const a of g) for (const b of g) if (a !== b && !(a.d === b.d && a.t === b.t)) {
    const k = `${a.d}/${a.t}`;
    if (!linkOf.has(k)) linkOf.set(k, new Set());
    linkOf.get(k).add(`${b.d}/${b.t}`);
  }
  const lastVenue = new Map(); // "d/t" -> venue of the previous match
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
      const r = queues[i].plan[queues[i].next];
      if (r.matches.length <= left) { left -= r.matches.length; todo.push({ i, r, idx: queues[i].next }); queues[i].next++; }
    }
    if (!todo.length) continue;
    const ms = todo.flatMap(({ i, r, idx }) => r.matches.map(([h, a]) => ({ div: i, home: h, away: a, round: idx })));

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
    const total = (cells) => cells.reduce((s, c, k) => s + W_TRIP * trip(ms[k], c) + clashCost(k, c, cells) / 2, 0);
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
    for (const { i, r, idx } of todo) out[i].rounds.push({ day, label: `Round ${idx + 1}`, matches: [] });
    ms.forEach((m, k) => {
      const cell = open[cellOf[k]];
      const court = courts[cell.ci];
      const rec = { division: out[m.div].name, home: m.home, away: m.away, homeName: out[m.div].teams[m.home], awayName: out[m.div].teams[m.away], court, time: times[cell.ti], venue: venueOf(court) };
      out[m.div].rounds[out[m.div].rounds.length - 1].matches.push(rec);
      night.matches.push({ ...rec, div: m.div, round: m.round });
      lastVenue.set(`${m.div}/${m.home}`, rec.venue);
      lastVenue.set(`${m.div}/${m.away}`, rec.venue);
    });
    night.matches.sort((a, b) => times.indexOf(a.time) - times.indexOf(b.time) || courts.indexOf(a.court) - courts.indexOf(b.court));
    nights.push(night);
  }
  if (queues.some((q) => q.next < q.plan.length)) throw new Error("Not enough playable nights in the next few years for every division. Add weekdays, courts or time slots.");
  const schedule = { divisions: out, nights, config: { weekdays: spec.weekdays, skipDays: spec.skipDays || [], courts, times, venues: Object.fromEntries(courts.map((c) => [c, venueOf(c)])), closures, start: spec.start, links: spec.links || [], travel: travel || {}, seed: spec.seed ?? 1 } };
  schedule.conflicts = linkConflicts(schedule);
  schedule.stats = divisionStats(schedule);
  return schedule;
}

/**
 * Rainouts across divisions, one per line: "2026-10-13" (the whole night), "2026-10-13 U10" (a division) or
 * "2026-10-13 U10/Hawks, U12/Owls" (those teams' matches), optionally ending "-> 2026-10-20" for a make-up date
 * you agreed. Each cancelled match moves to the earliest later play night where both teams are free and a court
 * is open, never double-booking a court or a team and, where a free slot allows it, keeping linked teams out of
 * the same time slot; a refusal says why and leaves the match where it was. Nothing else moves.
 * Returns { schedule, moves[{division, home, away, from, to, court, time}], errors[] }.
 */
export function applyDivisionRainouts(schedule, text) {
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
      for (const d of cand) {
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
        placed = { d, ...best };
        break;
      }
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
      moves.push({ division: mt.division, home: mt.homeName, away: mt.awayName, from: day, to: placed.d, court: rec.court, time: rec.time });
    }
  }
  for (const dv of s.divisions) { dv.rounds = dv.rounds.filter((r) => r.matches.length); dv.rounds.sort((a, b) => a.day - b.day); }
  s.nights = s.nights.filter((n) => n.matches.length).sort((a, b) => a.day - b.day);
  for (const n of s.nights) n.matches.sort((a, b) => cfg.times.indexOf(a.time) - cfg.times.indexOf(b.time) || cfg.courts.indexOf(a.court) - cfg.courts.indexOf(b.court));
  s.conflicts = linkConflicts(s);
  s.stats = divisionStats(s);
  return { schedule: s, moves, errors };
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

export function divisionStats(schedule) {
  let trips = 0, matches = 0, travelMinutes = 0;
  const travel = schedule.config.travel && Object.keys(schedule.config.travel).length ? schedule.config.travel : null;
  const travelMin = makeTravelMin(travel);
  const last = new Map();
  for (const night of schedule.nights) {
    for (const m of night.matches) {
      matches++;
      for (const t of [m.home, m.away]) {
        const k = `${m.div}/${t}`;
        if (last.has(k) && last.get(k) !== m.venue) { trips++; travelMinutes += travelMin(last.get(k), m.venue); }
        last.set(k, m.venue);
      }
    }
  }
  const cap = schedule.config.courts.length * schedule.config.times.length;
  return { nights: schedule.nights.length, matches, trips, ...(travel ? { travelMinutes } : {}), clashes: schedule.conflicts.length, utilisation: matches / (schedule.nights.length * cap), lastDay: schedule.nights.length ? schedule.nights[schedule.nights.length - 1].day : null };
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

export function divisionsCsv(schedule) {
  const q = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  const rows = [["Date", "Time", "Court", "Venue", "Division", "Round", "Home", "Away"]];
  for (const night of schedule.nights) for (const m of night.matches) rows.push([dayIso(night.day), m.time, m.court, m.venue, m.division, m.round + 1, m.homeName, m.awayName]);
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
}

/** Plain-text read-out for a command line or a group chat. */
export function divisionsText(schedule) {
  const lines = [];
  for (const night of schedule.nights) {
    lines.push(dayIso(night.day));
    for (const m of night.matches) lines.push(`  ${m.time || "--"} ${m.court} [${m.division}] ${m.homeName} v ${m.awayName}`);
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
  const skip = parseDateList(f.skip);
  errors.push(...skip.errors.map((e) => `Skip dates: ${e}`));
  const t = parseTimes(f.times);
  errors.push(...t.errors);
  const courts = parseNameList(f.courts);
  const l = parseDivisionLinks(f.links, d.divisions);
  errors.push(...l.errors);
  // "Court 1 @ Park" puts a court at a venue; plain names are their own venue
  const venues = {};
  const names = courts.map((c) => { const m = c.match(/^(.*?)\s*@\s*(.+)$/); if (!m) return c; venues[m[1].trim()] = m[2].trim(); return m[1].trim(); });
  const tr = parseTravel(f.travel, [...new Set(names.map((c) => venues[c] || c))]);
  errors.push(...tr.errors);
  const cc = parseCourtClosures(f.courtClosures, names.length ? names : null);
  errors.push(...cc.errors);
  return { errors, spec: { divisions: d.divisions, courts: names, venues, times: t.times, start, weekdays: w.weekdays, skipDays: skip.days, courtClosures: cc.closures, links: l.groups, travel: tr.travel, seed: Number.isFinite(Number(f.seed)) ? Math.trunc(Number(f.seed)) : 1 } };
}

// node divisions.mjs spec.json  ->  text read-out (add --csv for the CSV). spec.json holds the form fields.
if (typeof process !== "undefined" && process.argv && import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import("node:fs");
  const file = process.argv[2];
  if (!file) { console.error("usage: node divisions.mjs spec.json [--csv]"); process.exit(2); }
  const { spec, errors } = readDivisionsSpec(JSON.parse(readFileSync(file, "utf8")));
  if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
  let s = buildDivisions(spec);
  const rainouts = JSON.parse(readFileSync(file, "utf8")).rainouts;
  if (rainouts) {
    const r = applyDivisionRainouts(s, rainouts);
    for (const e of r.errors) console.error(`Rainout: ${e}`);
    s = r.schedule;
  }
  const v = validateDivisions(s);
  if (!v.ok) { console.error(v.errors.join("\n")); process.exit(1); }
  process.stdout.write(process.argv.includes("--csv") ? divisionsCsv(s) : divisionsText(s));
}

// ---------------------------------------------------------------- share link

const SHARE_FIELDS = ["divisions", "courts", "times", "start", "weekdays", "skip", "courtClosures", "travel", "links", "rainouts", "seed"];

/** Form fields -> URL-safe text for the `#` part of a link (`#d=...`). The fragment is never sent to a server. */
export function encodeDivisionFields(f) {
  const o = {};
  for (const k of SHARE_FIELDS) if (typeof f[k] === "string" ? f[k].trim() !== "" : f[k] !== undefined && f[k] !== null && f[k] !== "") o[k] = String(f[k]);
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
