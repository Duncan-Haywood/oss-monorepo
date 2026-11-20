// Referees for a weekend tournament built by tournament.mjs. Every game gets a crew (a referee, and
// assistants where a division asks for them) from a list of volunteers and paid officials, each with
// the hours they can work, the divisions they may take, the club they belong to (never their own
// club's game), the team they play for themselves (never during its games), and caps on games a day
// and in a row.
//
// The schedule's times and fields are fixed; only the names change. The search is a randomized
// greedy pass in kick-off order (each slot goes to the eligible official with the lightest load,
// staying on the same field where possible), followed by a repair step that frees an official for
// an empty slot by moving one of their games to someone else, and the best of many shuffled passes
// is kept: fewest empty slots, then the fewest knockout games where an official's club could still
// be playing, then the most even load, then the fewest walks between fields.
//
// Knockout games are assigned before anyone knows who plays in them. refereesAfterResults
// re-checks those games once results fill the bracket and names a free official (or a swap
// between two games at the same time) for any official whose own club made it through.
// validateReferees re-checks every hard rule from the output alone.

import { parseTime, mulberry32, csvCell } from "./calc.mjs";
import { dayRef, resolveTeams, hhmm } from "./tournament.mjs";

const DAY = 1440;
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const low = (s) => norm(s).toLowerCase();
const minutesOf = (t) => { const s = parseTime(t); return s ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : null; };
const TIME = "\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?";
const SPAN = new RegExp(`^(.+?)(?:\\s+(${TIME})\\s*(?:-|–|—|to)\\s*(${TIME}))?$`, "i");

/** "U14 Boys: 3" or "all: 2" per line -> { crews: { divisionName: n }, errors }. Default 1. */
export function parseCrews(text, divisions) {
  const crews = Object.fromEntries(divisions.map((d) => [d.name, 1]));
  const errors = [];
  const lines = String(text ?? "").split(/\r?\n/).map(norm).filter(Boolean);
  // "all" first, so a named division on a later line overrides it whatever the order.
  lines.sort((a, b) => (/^all\b/i.test(b) ? 1 : 0) - (/^all\b/i.test(a) ? 1 : 0));
  for (const raw of lines) {
    const m = raw.match(/^(.+?)\s*:\s*(\d+)(?:\s*(?:officials?|refs?|referees?))?$/i);
    if (!m) { errors.push(`"${raw}": write a crew like "U14 Boys: 3" (a referee and two assistants).`); continue; }
    const n = Number(m[2]);
    if (n < 1 || n > 4) { errors.push(`"${raw}": a crew is 1 to 4 officials.`); continue; }
    if (low(m[1]) === "all") { for (const d of divisions) crews[d.name] = n; continue; }
    const d = divisions.find((x) => low(x.name) === low(m[1]));
    if (!d) { errors.push(`"${raw}": ${m[1]} is not one of the divisions.`); continue; }
    crews[d.name] = n;
  }
  return { crews, errors };
}

export const roleName = (i) => (i === 0 ? "Referee" : `Assistant ${i}`);

/**
 * Officials, one per line: a name, optionally the club in brackets, then clauses after a colon,
 * separated by semicolons, in any order:
 *   Sam Ortiz (North Hills Hawks): Sat 08:00-13:00, Sun; U10 Girls, U12 Boys, U14 Boys assistant; max 4 a day; max 2 in a row; plays U14 Boys/Valley United
 * - hours: days with optional hours ("Sat", "Sun 08:00-12:00", "day 2"); none means every hour.
 * - divisions they may take (none means all); a division followed by "assistant" means only as an
 *   assistant there; the clause "assistant only" means only assistant slots anywhere.
 * - "max N a day", "max N" (the whole weekend), "max N in a row" (games with under the break
 *   between them count as one run).
 * - "plays TEAM": a youth referee's own team; they are kept off while it plays, with turnover.
 * The club (in brackets) is a team name, or a division/team; every team of that name in any
 * division is theirs, and they never officiate its games.
 * -> { officials: [{ name, clubs, plays, hours, divs, assistantOnly, maxDay, maxTotal, maxRun }], errors }
 */
export function parseReferees(text, days, divisions) {
  const officials = [], errors = [];
  const seen = new Set();
  for (const raw0 of String(text ?? "").split(/\r?\n/)) {
    const raw = norm(raw0);
    if (!raw) continue;
    const m = raw.match(/^([^():]+?)\s*(?:\(([^)]*)\))?\s*(?::\s*(.*))?$/);
    if (!m || !m[1].trim()) { errors.push(`"${raw}": could not read this official (write "Name (Club): Sat; max 4 a day").`); continue; }
    const name = m[1].trim();
    if (seen.has(name.toLowerCase())) { errors.push(`"${name}" is listed twice.`); continue; }
    seen.add(name.toLowerCase());
    const o = { name, clubs: [], plays: [], hours: null, divs: null, assistantOnly: false, maxDay: Infinity, maxTotal: Infinity, maxRun: null };
    if (m[2] && m[2].trim()) {
      for (const part of m[2].split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
        const keys = resolveTeams(part, divisions);
        if (!keys.length) errors.push(`${name}: no team is called ${part} (the club in brackets should be a team name).`);
        o.clubs.push(...keys);
      }
    }
    for (const clause of (m[3] || "").split(";").map(norm).filter(Boolean)) {
      let k;
      if ((k = clause.match(/^max\s+(\d+)(?:\s+games?)?\s+(?:a|per)\s+day$/i))) o.maxDay = Number(k[1]);
      else if ((k = clause.match(/^max\s+(\d+)(?:\s+games?)?\s+in\s+a\s+row$/i))) o.maxRun = Number(k[1]);
      else if ((k = clause.match(/^max\s+(\d+)(?:\s+games?)?(?:\s+(?:in\s+all|total|all\s+weekend))?$/i))) o.maxTotal = Number(k[1]);
      else if (/^(assistant|ar|linesman|line)\s+only$/i.test(clause)) o.assistantOnly = true;
      else if ((k = clause.match(/^plays?\s+(?:for\s+)?(.+)$/i))) {
        for (const part of k[1].split(",").map((s) => s.trim()).filter(Boolean)) {
          const keys = resolveTeams(part, divisions);
          if (!keys.length) errors.push(`${name}: no team is called ${part}.`);
          o.plays.push(...keys);
        }
      } else if (clause.split(",").every((p) => dayRef(SPAN.exec(p.trim())?.[1] ?? "", days) >= 0)) {
        o.hours ||= [];
        for (const p of clause.split(",").map((s) => s.trim())) {
          const s = SPAN.exec(p);
          const di = dayRef(s[1], days);
          const from = s[2] ? minutesOf(s[2]) : 0, to = s[3] ? minutesOf(s[3]) : DAY;
          if (from === null || to === null || to <= from) { errors.push(`${name}: "${p}" has hours that run backwards.`); continue; }
          o.hours.push({ start: di * DAY + from, end: di * DAY + to });
        }
      } else {
        const divs = {};
        let ok = true;
        for (const p of clause.split(",").map((s) => s.trim()).filter(Boolean)) {
          const a = p.match(/^(.+?)\s+(?:as\s+)?(?:assistant|ar|ars|lines?)$/i);
          const dn = a ? a[1] : p;
          const d = divisions.find((x) => low(x.name) === low(dn));
          if (!d) { ok = false; break; }
          divs[d.name] = a ? "assistant" : "any";
        }
        if (!ok) { errors.push(`${name}: "${clause}" is not hours ("Sat 08:00-13:00"), divisions, "max 4 a day", "max 2 in a row", "assistant only" or "plays TEAM".`); continue; }
        o.divs = { ...(o.divs || {}), ...divs };
      }
    }
    for (const [label, v] of [["a day", o.maxDay], ["in all", o.maxTotal], ["in a row", o.maxRun ?? 1]]) if (!(v >= 1)) errors.push(`${name}: max ${label} must be at least 1.`);
    officials.push(o);
  }
  return { officials, errors };
}

/** The division-team keys a knockout slot could hold: every team in the division (unknown yet). */
const divisionKeys = (t, division) => (t.divisions.find((d) => d.name === division)?.teams || []).map((x) => `${division}/${x}`);

/**
 * Assign crews. `t` is buildTournament's output, `officials` parseReferees's, options:
 *   crews ({ division: n }, default 1 each), breakMinutes (a gap shorter than this keeps a run of
 *   games going, default 30), maxRun (default most games in a row for anyone without their own, 3),
 *   tries (shuffled passes, default 80), seed.
 * Returns { games: [{ ...game, crew: [{ role, name }] }], unfilled: [{ game id, division, stage,
 *   day, start, field, role, why }], loads: [{ name, games, minutes, perDay, moves, first, last }],
 *   koRisk: [{ id, name }] (knockout slots whose official has a team in that division), score }.
 */
export function assignReferees(t, officials, { crews = {}, breakMinutes = 30, maxRun = 3, tries = 80, seed = 1 } = {}) {
  const buffer = t.buffer ?? 10;
  const games = [...t.games].sort((a, b) => a.startAbs - b.startAbs || a.id - b.id);
  const slots = [];
  for (const g of games) for (let r = 0; r < (crews[g.division] ?? 1); r++) slots.push({ g, role: r });
  // Time each official's own team plays (plus turnover either side): they cannot officiate then.
  const playing = officials.map((o) => t.games.filter((g) => g.teams.some((k) => o.plays.includes(k))).map((g) => ({ start: g.startAbs - buffer, end: g.endAbs + buffer })));
  const runCap = officials.map((o) => o.maxRun ?? maxRun);

  /** Why official i cannot take slot s, or null. `mine` is their slots, in any order. */
  function why(i, s, mine) {
    const o = officials[i], g = s.g;
    if (o.assistantOnly && s.role === 0) return "assistant only";
    if (o.divs) {
      const d = o.divs[g.division];
      if (!d) return "not down for this division";
      if (d === "assistant" && s.role === 0) return "only an assistant in this division";
    }
    if (o.hours && !o.hours.some((h) => h.start <= g.startAbs && g.endAbs <= h.end)) return "not there at that time";
    if (!g.knockout && g.teams.some((k) => o.clubs.includes(k))) return "from a club in this game";
    if (playing[i].some((p) => g.startAbs < p.end && p.start < g.endAbs)) return "playing at that time";
    if (mine.length >= o.maxTotal) return "at their weekend cap";
    let today = 0;
    for (const x of mine) {
      const h = x.g;
      if (h.dayIndex === g.dayIndex) today++;
      const gap = h.field === g.field ? 0 : buffer;
      if (g.startAbs < h.endAbs + gap && h.startAbs < g.endAbs + gap) return h.id === g.id ? "holding another place on this game" : "on another game then";
    }
    if (today >= o.maxDay) return "at their daily cap";
    // Games in a row: chain this game with theirs that day where the gap is under the break.
    const day = mine.map((x) => x.g).filter((h) => h.dayIndex === g.dayIndex).concat([g]).sort((a, b) => a.startAbs - b.startAbs);
    let run = 1;
    for (let k = 1; k < day.length; k++) {
      run = day[k].startAbs - day[k - 1].endAbs < breakMinutes ? run + 1 : 1;
      if (run > runCap[i]) return `would be over ${runCap[i]} in a row`;
    }
    return null;
  }
  const risky = (i, s) => s.g.knockout && officials[i].clubs.some((k) => divisionKeys(t, s.g.division).includes(k));

  const rng = mulberry32(seed * 104729 + 3);
  function pass(jitter) {
    const holder = slots.map(() => -1);
    const mine = officials.map(() => []);
    const minutes = officials.map(() => 0);
    // Kick-off order; slots of one start time shuffled, referee slots before assistants.
    const order = slots.map((_, i) => i).sort((a, b) => slots[a].g.startAbs - slots[b].g.startAbs || slots[a].role - slots[b].role || (jitter ? rng() - 0.5 : a - b));
    const lastField = officials.map(() => null);
    const take = (i, si) => { holder[si] = i; mine[i].push(slots[si]); minutes[i] += slots[si].g.endAbs - slots[si].g.startAbs; lastField[i] = slots[si].g.field; };
    const drop = (i, si) => { holder[si] = -1; mine[i] = mine[i].filter((x) => x !== slots[si]); minutes[i] -= slots[si].g.endAbs - slots[si].g.startAbs; };
    for (const si of order) {
      const s = slots[si];
      let best = -1, bestKey = null;
      for (let i = 0; i < officials.length; i++) {
        if (why(i, s, mine[i])) continue;
        const key = [risky(i, s) ? 1 : 0, minutes[i] + (lastField[i] === s.g.field ? -15 : 0) + (jitter ? jitter * rng() * 60 : 0)];
        if (best < 0 || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) { best = i; bestKey = key; }
      }
      if (best >= 0) take(best, si);
    }
    // Repair: an ejection chain for each empty slot. Official i takes it by giving up one of their
    // games x, which goes to an official free for it, or in turn to one who gives up another
    // game, up to `depth` hand-overs. Nothing changes unless the whole chain fits.
    const index = new Map(slots.map((s, si) => [s, si]));
    function place(si, depth, used) {
      const s = slots[si];
      for (let i = 0; i < officials.length; i++) if (!used.has(i) && !why(i, s, mine[i])) { take(i, si); return true; }
      if (!depth) return false;
      for (let i = 0; i < officials.length; i++) {
        if (used.has(i)) continue;
        for (const x of [...mine[i]]) {
          if (why(i, s, mine[i].filter((y) => y !== x))) continue;
          const xi = index.get(x);
          drop(i, xi); take(i, si);
          if (place(xi, depth - 1, new Set([...used, i]))) return true;
          drop(i, si); take(i, xi);
        }
      }
      return false;
    }
    for (let si = 0; si < slots.length; si++) if (holder[si] < 0) place(si, 3, new Set());
    return { holder, mine, minutes };
  }
  const scoreOf = (r) => {
    const empty = r.holder.filter((h) => h < 0).length;
    const risk = r.holder.reduce((n, h, si) => n + (h >= 0 && risky(h, slots[si]) ? 1 : 0), 0);
    const spread = r.minutes.reduce((s, m) => s + m * m, 0);
    let moves = 0;
    for (const list of r.mine) {
      const sorted = [...list].sort((a, b) => a.g.startAbs - b.g.startAbs);
      for (let k = 1; k < sorted.length; k++) if (sorted[k].g.dayIndex === sorted[k - 1].g.dayIndex && sorted[k].g.field !== sorted[k - 1].g.field) moves++;
    }
    return [empty, risk, spread, moves];
  };
  const better = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
  let best = pass(0), bestScore = scoreOf(best), triesRun = 1;
  for (let k = 1; k < tries; k++, triesRun++) {
    const r = pass(k < tries / 3 ? 0.5 : 1.5);
    const s = scoreOf(r);
    if (better(s, bestScore)) { best = r; bestScore = s; }
  }

  const crewOf = new Map(games.map((g) => [g.id, Array.from({ length: crews[g.division] ?? 1 }, (_, r) => ({ role: roleName(r), name: "" }))]));
  slots.forEach((s, si) => { if (best.holder[si] >= 0) crewOf.get(s.g.id)[s.role].name = officials[best.holder[si]].name; });
  const unfilled = [];
  slots.forEach((s, si) => {
    if (best.holder[si] >= 0) return;
    const counts = {};
    officials.forEach((_, i) => { const w = why(i, s, best.mine[i]); if (w) counts[w] = (counts[w] || 0) + 1; });
    const reason = officials.length ? Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([w, c]) => `${c} ${w}`).join(", ") : "no officials were listed";
    unfilled.push({ id: s.g.id, division: s.g.division, stage: s.g.stage, home: s.g.home, away: s.g.away, day: s.g.dayLabel, start: s.g.start, field: s.g.field, role: roleName(s.role), why: reason });
  });
  const koRisk = [];
  slots.forEach((s, si) => { const h = best.holder[si]; if (h >= 0 && risky(h, s)) koRisk.push({ id: s.g.id, name: officials[h].name, division: s.g.division, stage: s.g.stage }); });
  const out = games.map((g) => ({ ...g, crew: crewOf.get(g.id) }));
  return { games: out, unfilled, koRisk, loads: refereeLoads(t, out, officials), crews, breakMinutes, maxRun, triesRun, score: { empty: bestScore[0], koRisk: bestScore[1], moves: bestScore[3] } };
}

/** Per official: games, minutes, per day, walks between fields, first and last game. */
export function refereeLoads(t, games, officials) {
  return officials.map((o) => {
    const mine = games.filter((g) => g.crew.some((c) => c.name === o.name)).sort((a, b) => a.startAbs - b.startAbs);
    let moves = 0;
    for (let k = 1; k < mine.length; k++) if (mine[k].dayIndex === mine[k - 1].dayIndex && mine[k].field !== mine[k - 1].field) moves++;
    const centre = mine.filter((g) => g.crew[0]?.name === o.name).length;
    return { name: o.name, games: mine.length, centre, assistant: mine.length - centre, minutes: mine.reduce((s, g) => s + g.endAbs - g.startAbs, 0), perDay: t.days.map((_, di) => mine.filter((g) => g.dayIndex === di).length), moves,
      first: mine[0] ? `${mine[0].dayLabel.slice(0, 3)} ${mine[0].start}` : null, last: mine.length ? `${mine[mine.length - 1].dayLabel.slice(0, 3)} ${mine[mine.length - 1].end}` : null };
  });
}

/**
 * Re-check every hard rule from the assignment alone (independent of the search). `games` carry
 * `crew`; knockout games are checked against clubs once their teams are named (pass the
 * playTournament games, or leave the slot labels and they are skipped). Empty list = clean.
 */
export function validateReferees(t, games, officials, { breakMinutes = 30, maxRun = 3 } = {}) {
  const bad = [];
  const buffer = t.buffer ?? 10;
  const by = new Map(officials.map((o) => [o.name, o]));
  const per = new Map(officials.map((o) => [o.name, []]));
  for (const g of games) {
    const names = g.crew.map((c) => c.name).filter(Boolean);
    if (new Set(names).size !== names.length) bad.push(`${g.division} ${g.stage} ${g.dayLabel} ${g.start}: one official holds two places`);
    g.crew.forEach((c, r) => {
      if (!c.name) return;
      const o = by.get(c.name);
      const tag = `${c.name} on ${g.division} ${g.stage} ${g.dayLabel.slice(0, 3)} ${g.start}`;
      if (!o) { bad.push(`${tag}: not a listed official`); return; }
      per.get(o.name).push(g);
      if (o.assistantOnly && r === 0) bad.push(`${tag}: assistant only, but refereeing`);
      if (o.divs && !o.divs[g.division]) bad.push(`${tag}: not down for ${g.division}`);
      if (o.divs && o.divs[g.division] === "assistant" && r === 0) bad.push(`${tag}: only an assistant in ${g.division}`);
      if (o.hours && !o.hours.some((h) => h.start <= g.startAbs && g.endAbs <= h.end)) bad.push(`${tag}: outside their hours`);
      const teams = g.knockout ? [`${g.division}/${g.home}`, `${g.division}/${g.away}`] : g.teams;
      if (teams.some((k) => o.clubs.includes(k))) bad.push(`${tag}: their club is playing`);
      for (const p of t.games.filter((x) => x.teams.some((k) => o.plays.includes(k)))) if (g.startAbs < p.endAbs + buffer && p.startAbs < g.endAbs + buffer) bad.push(`${tag}: their own team plays at ${p.start}`);
    });
  }
  for (const [name, list] of per) {
    const o = by.get(name);
    list.sort((a, b) => a.startAbs - b.startAbs);
    if (list.length > o.maxTotal) bad.push(`${name}: ${list.length} games, over their cap of ${o.maxTotal}`);
    t.days.forEach((d, di) => {
      const day = list.filter((g) => g.dayIndex === di);
      if (day.length > o.maxDay) bad.push(`${name}: ${day.length} games on ${d.label}, over ${o.maxDay}`);
      let run = 1;
      const cap = o.maxRun ?? maxRun;
      for (let k = 1; k < day.length; k++) {
        const gap = day[k].startAbs - day[k - 1].endAbs;
        const need = day[k].field === day[k - 1].field ? 0 : buffer;
        if (gap < need) bad.push(`${name}: ${day[k - 1].start} on ${day[k - 1].field} and ${day[k].start} on ${day[k].field} on ${d.label} leave under ${need} minutes`);
        run = gap < breakMinutes ? run + 1 : 1;
        if (run > cap) bad.push(`${name}: over ${cap} games in a row on ${d.label} at ${day[k].start}`);
      }
    });
  }
  return bad;
}

/**
 * Once results name the knockout teams: knockout games where an official's club now plays, each
 * with a fix: a free official who can take the place, or a swap with an official on another game at
 * the same time. `played` is playTournament(t, ...).games. -> [{ id, division, stage, day, start,
 * field, role, name, club, fix: { kind: "replace"|"swap"|null, text } }]
 */
export function refereesAfterResults(t, assignment, played, officials, opts = {}) {
  const { breakMinutes = assignment.breakMinutes ?? 30, maxRun = assignment.maxRun ?? 3 } = opts;
  const named = new Map(played.map((g) => [g.id, g]));
  const games = assignment.games.map((g) => {
    const p = named.get(g.id);
    return p && g.knockout ? { ...g, home: p.home, away: p.away } : g;
  });
  const out = [];
  const by = new Map(officials.map((o) => [o.name, o]));
  // The same rules validateReferees checks, asked of one official on one game, with the others fixed.
  const fits = (gs, name) => !validateReferees(t, gs, officials, { breakMinutes, maxRun }).some((e) => e.startsWith(`${name} on `) || e.startsWith(`${name}: `));
  for (const g of games) {
    if (!g.knockout) continue;
    const d = t.divisions.find((x) => x.name === g.division);
    if (!d.teams.includes(g.home) && !d.teams.includes(g.away)) continue;
    g.crew.forEach((c, r) => {
      if (!c.name) return;
      const o = by.get(c.name);
      const club = [g.home, g.away].find((x) => o?.clubs.includes(`${g.division}/${x}`));
      if (!club) return;
      const row = { id: g.id, division: g.division, stage: g.stage, day: g.dayLabel, start: g.start, field: g.field, role: c.role, name: c.name, club, fix: { kind: null, text: "nobody free can take it: ask a parent or a coach from a club not playing" } };
      const swapIn = (gs, gid, role, name) => gs.map((x) => (x.id === gid ? { ...x, crew: x.crew.map((cc, k) => (k === role ? { ...cc, name } : cc)) } : x));
      const cand = officials.filter((x) => x.name !== c.name && !g.crew.some((cc) => cc.name === x.name));
      const free = cand.find((x) => fits(swapIn(games, g.id, r, x.name), x.name));
      if (free) row.fix = { kind: "replace", with: free.name, text: `${free.name} is free and can take it` };
      else for (const h of games.filter((x) => x.id !== g.id && x.startAbs === g.startAbs)) {
        const k = h.crew.findIndex((cc) => cc.name && cc.name !== c.name && !g.crew.some((q) => q.name === cc.name));
        if (k < 0) continue;
        const other = h.crew[k].name;
        const gs = swapIn(swapIn(games, g.id, r, other), h.id, k, c.name);
        if (fits(gs, other) && fits(gs, c.name)) { row.fix = { kind: "swap", with: other, game: h.id, text: `swap with ${other} on ${h.field} (${h.division} ${h.stage})` }; break; }
      }
      out.push(row);
    });
  }
  return out;
}

/** Each official's own sheet: their games in order, with field, role and the teams. */
export function refereeSheets(t, games, officials) {
  return officials.map((o) => {
    const mine = games.filter((g) => g.crew.some((c) => c.name === o.name)).sort((a, b) => a.startAbs - b.startAbs);
    return { name: o.name, games: mine.map((g) => ({ day: g.dayLabel, start: g.start, end: g.end, field: g.field, division: g.division, stage: g.stage, home: g.home, away: g.away, role: g.crew.find((c) => c.name === o.name).role })) };
  });
}

export function refereesText(t, games, officials) {
  const out = [];
  for (const s of refereeSheets(t, games, officials)) {
    out.push(`${s.name}: ${s.games.length} game${s.games.length === 1 ? "" : "s"}`);
    let day = null;
    for (const g of s.games) {
      if (g.day !== day) { out.push(`  ${g.day}`); day = g.day; }
      out.push(`    ${g.start}-${g.end}  ${g.field.padEnd(10)}  ${g.role.padEnd(11)}  ${g.division} ${g.stage}: ${g.home} v ${g.away}`);
    }
    out.push("");
  }
  return out.join("\n").trim() + "\n";
}

/** The schedule with a column per crew place. Cells go through csvCell (formula-injection guard). */
export function refereesCsv(t, games, name = null) {
  const width = Math.max(1, ...games.map((g) => g.crew.length));
  const cols = ["Date", "Day", "Start", "End", "Field", "Division", "Stage", "Home", "Away", ...Array.from({ length: width }, (_, i) => roleName(i))];
  const rows = games.filter((g) => !name || g.crew.some((c) => c.name === name))
    .map((g) => [g.date, g.dayLabel.slice(0, 3), g.start, g.end, g.field, g.division, g.stage, g.home, g.away, ...Array.from({ length: width }, (_, i) => g.crew[i]?.name ?? "")]);
  return [cols, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export const SAMPLE_REFEREES = {
  referees: `Dana Price: Sat, Sun
Marcus Lee: Sat 08:00-14:00, Sun; max 4 a day
Priya Shah (Riverside Rapids): Sat, Sun; max 2 in a row
Tom Becker (North Hills Hawks): Sat, Sun; U12 Boys, U14 Boys
Elena Ruiz: Sat 12:00-18:00, Sun
Jamal Ortiz (Valley United): Sat, Sun
Ava Chen: Sat, Sun 08:00-12:00; U10 Girls, U12 Boys assistant; plays U14 Boys/Summit Strikers
Noah Kim: Sat, Sun; assistant only; max 5 a day
Grace Okafor (Harbor City FC): Sat, Sun
Leo Martin: Sun; U14 Boys`,
  crews: "U14 Boys: 3",
};

// CLI: node tournament-referees.mjs spec.json [--csv]  (tournament keys as tournamentFromText, plus
// "referees" and "crews"; with no file, the tournament sample with the sample officials).
if (typeof process !== "undefined" && import.meta.url === `file://${process.argv?.[1]}`) {
  const { readFileSync } = await import("node:fs");
  const { tournamentFromText, SAMPLE } = await import("./tournament.mjs");
  const spec = process.argv[2] && !process.argv[2].startsWith("--") ? JSON.parse(readFileSync(process.argv[2], "utf8")) : { ...SAMPLE, ...SAMPLE_REFEREES };
  const t = tournamentFromText(spec);
  if (t.errors) { console.error(t.errors.join("\n")); process.exit(1); }
  const r = parseReferees(spec.referees, t.days, t.divisions);
  const c = parseCrews(spec.crews, t.divisions);
  if (r.errors.length || c.errors.length) { console.error([...r.errors, ...c.errors].join("\n")); process.exit(1); }
  const a = assignReferees(t, r.officials, { crews: c.crews });
  process.stdout.write(process.argv.includes("--csv") ? refereesCsv(t, a.games) : refereesText(t, a.games, r.officials));
  for (const u of a.unfilled) console.error(`empty: ${u.day} ${u.start} ${u.field} ${u.division} ${u.stage} ${u.role} (${u.why})`);
  const v = validateReferees(t, a.games, r.officials, a);
  console.error(`${a.games.reduce((n, g) => n + g.crew.filter((x) => x.name).length, 0)} places filled, ${a.unfilled.length} empty, ${a.koRisk.length} knockout places where the official's club may play; check: ${v.length ? v.join("; ") : "clean"}`);
}

export { hhmm };
