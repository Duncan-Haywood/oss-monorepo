// League schedule generator, officials.mjs: Officials (referees, umpires, scorers): parse the list, assign them to matches, check the assignment.
// Split out of calc.mjs on 2026-11-23 (quality audit round 87); calc.mjs re-exports every public name.

import { parseWeekdays, dayOfWeek } from "./dates.mjs";
import { teamIndex } from "./names.mjs";

// ---------------------------------------------------------------- officials (referees, umpires, scorers)

/**
 * Officials, one per line: `Name`, `Name (Hawks)` when they belong to a team (a coach, parent or player; they never
 * officiate that team's match), `Name: Tue, Thu` for the weekdays they can work, `Name (Hawks): Tue` for both, and an
 * optional trailing `max 6` to cap how many matches they take.
 */
export function parseOfficials(text, teams = []) {
  const officials = [];
  const errors = [];
  const seen = new Set();
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    let line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    let max = Infinity;
    const mx = line.match(/[\s,;]+max\s*(\d+)\s*$/i);
    if (mx) { max = Number(mx[1]); line = line.slice(0, mx.index).trim(); }
    const m = line.match(/^([^():]+?)\s*(?:\(([^)]*)\))?\s*(?::\s*(.*))?$/);
    if (!m || !m[1].trim()) { errors.push(`"${raw.trim()}": could not read this official.`); continue; }
    const name = m[1].trim();
    if (seen.has(name.toLowerCase())) { errors.push(`"${name}" is listed twice.`); continue; }
    seen.add(name.toLowerCase());
    let team = -1;
    if (m[2] && m[2].trim()) {
      team = teamIndex(teams, m[2]);
      if (team < 0) errors.push(`${name}: "${m[2].trim()}" is not one of the teams.`);
    }
    let days = null;
    if (m[3] && m[3].trim()) {
      const w = parseWeekdays(m[3]);
      errors.push(...w.errors.map((e) => `${name}: ${e}`));
      if (w.weekdays.length) days = w.weekdays;
    }
    if (!(max >= 1)) { errors.push(`${name}: max must be at least 1.`); max = Infinity; }
    officials.push({ name, team, days, max });
  }
  return { officials, errors };
}

/**
 * Give every match one official. Hard rules: the official can work that weekday, is not from either team in the match,
 * is on at most one match per time slot of a night, and is under their cap. Among those who qualify, the least-loaded
 * official takes the match, ties going to whoever has worked these two teams least, then to list order. Deterministic.
 * Returns a copy of the schedule with `match.official` set, who works how much, and the matches nobody could take.
 */
export function assignOfficials(schedule, officials) {
  const s = JSON.parse(JSON.stringify(schedule));
  const load = officials.map(() => 0);
  const seenTeam = officials.map(() => new Map());
  const unfilled = [];
  const busy = new Set();
  for (const r of s.rounds) {
    const wd = dayOfWeek(r.day);
    for (const m of r.matches) {
      const slot = `${r.day}|${m.time ?? ""}`;
      const why = { weekday: 0, team: 0, busy: 0, cap: 0 };
      const ok = [];
      officials.forEach((o, i) => {
        if (o.days && !o.days.includes(wd)) { why.weekday++; return; }
        if (o.team === m.home || o.team === m.away) { why.team++; return; }
        if (busy.has(`${i}|${slot}`)) { why.busy++; return; }
        if (load[i] >= o.max) { why.cap++; return; }
        ok.push(i);
      });
      if (!ok.length) {
        const reason = !officials.length ? "no officials were listed" : Object.entries({ "off that weekday": why.weekday, "belong to a team in this match": why.team, "already on another match at that time": why.busy, "at their match cap": why.cap }).filter(([, c]) => c).map(([t, c]) => `${c} ${t}`).join(", ");
        m.official = "";
        unfilled.push({ round: r.label, day: r.day, time: m.time, court: m.court, home: m.homeName, away: m.awayName, reason });
        continue;
      }
      const seen = (i) => (seenTeam[i].get(m.home) || 0) + (seenTeam[i].get(m.away) || 0);
      ok.sort((a, b) => load[a] - load[b] || seen(a) - seen(b) || a - b);
      const pick = ok[0];
      load[pick]++;
      busy.add(`${pick}|${slot}`);
      for (const t of [m.home, m.away]) seenTeam[pick].set(t, (seenTeam[pick].get(t) || 0) + 1);
      m.official = officials[pick].name;
    }
  }
  const total = load.reduce((a, b) => a + b, 0);
  return { schedule: s, loads: officials.map((o, i) => ({ name: o.name, matches: load[i] })), unfilled, total };
}

/** Independent re-check of the hard rules for a schedule carrying `match.official`. Empty list = clean. */
export function validateOfficials(schedule, officials) {
  const errors = [];
  const byName = new Map(officials.map((o) => [o.name, o]));
  const count = new Map();
  for (const r of schedule.rounds) {
    const used = new Set();
    for (const m of r.matches) {
      if (!m.official) continue;
      const o = byName.get(m.official);
      const tag = `${r.label}: ${m.homeName} v ${m.awayName}`;
      if (!o) { errors.push(`${tag}: ${m.official} is not a listed official.`); continue; }
      if (o.days && !o.days.includes(dayOfWeek(r.day))) errors.push(`${tag}: ${o.name} is off that weekday.`);
      if (o.team === m.home || o.team === m.away) errors.push(`${tag}: ${o.name} belongs to a team in the match.`);
      const key = `${o.name}|${m.time ?? ""}`;
      if (used.has(key)) errors.push(`${tag}: ${o.name} is on two matches at ${m.time || "the same time"}.`);
      used.add(key);
      count.set(o.name, (count.get(o.name) || 0) + 1);
    }
  }
  for (const o of officials) if ((count.get(o.name) || 0) > o.max) errors.push(`${o.name}: ${count.get(o.name)} matches is over their cap of ${o.max}.`);
  return errors;
}
