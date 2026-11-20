// Results for a weekend tournament built by tournament.mjs: scores typed on the day fill each
// pool's table, the finished pools fill the knockout slots ("1st Pool A", "Best 3rd-placed"), and
// knockout results carry the winners (and the losers, for a third-place game) through to the
// champion. The schedule's times and fields never move; only the names in its slots and the
// scores change, so the results survive "Try another order".
//
// One game per line, any order: "Hawks 2 - 1 Owls", "Owls lost to Hawks 1-2", "Hawks w/o Owls",
// and for a knockout game a level score needs its winner: "Hawks 1 - 1 Owls (Hawks on penalties)".
// A team name used in two divisions needs the division first ("U12 Boys: Hawks 2-1 Owls") or a
// line with only the division's name above a block of its results.

import { parseResults, readPlayoffLine, playBracket, standings, tieBreakNotes, parsePointSystem, csvCell } from "./calc.mjs";
import { divisionGames } from "./tournament.mjs";

const norm = (s) => String(s).replace(/\s+/g, " ").trim().toLowerCase();
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th")}`;

/** A score with the margin cut to `cap` goals (winner's goals = loser's + cap), for tie-breaks only. */
function capped(r, cap) {
  if (!cap || Math.abs(r.ga - r.gb) <= cap) return r;
  return r.ga > r.gb ? { ...r, ga: r.gb + cap } : { ...r, gb: r.ga + cap };
}

/** Which divisions a line can belong to: [{ di, body }] (body without a "Division:" prefix). */
function divisionsFor(line, divisions, context) {
  const m = line.match(/^([^:]+):\s*(.+)$/);
  if (m) {
    const di = divisions.findIndex((d) => norm(d.name) === norm(m[1]));
    if (di >= 0) return { only: true, cands: [{ di, body: m[2] }] };
  }
  if (context !== null) return { only: true, cands: [{ di: context, body: line }] };
  return { only: false, cands: divisions.map((_, di) => ({ di, body: line })) };
}

/** Both team names of a result line read against a division's teams, or null. */
function pairIn(body, teams) {
  const pr = parseResults(body, teams);
  if (!pr.errors.length && pr.results.length === 1) return pr.results[0];
  const k = readPlayoffLine(body, teams);
  return k.error ? null : { a: k.a, b: k.b, knockoutOnly: true };
}

/**
 * Play a built tournament forward from typed results.
 * `t` is buildTournament's output; `text` the results box; options:
 *   points "3-1-0" (win-draw-loss), headToHead (true: teams level on points are split by the games
 *   among them first), gdCap (null or N: a margin counts at most N goals in goal difference and
 *   goals for, the usual youth-tournament rule against running up scores).
 * Returns { divisions: [{ name, pools: [{ name, teams, rows, played, total, complete, notes }],
 *   seeds: [{ label, team }], bracket, champion, runnerUp, third, notes }],
 *   games (t.games with home/away named where known, plus slotHome/slotAway, result, winner),
 *   next (games with both teams known and no result, in time order), played, total, errors, warnings }.
 */
export function playTournament(t, text, { points = "3-1-0", headToHead = true, gdCap = null } = {}) {
  const ps = parsePointSystem(points);
  const errors = ps.error ? [ps.error] : [];
  const cap = gdCap === null || gdCap === "" || gdCap === undefined ? null : Number(gdCap);
  if (cap !== null && !(Number.isInteger(cap) && cap >= 1)) errors.push("Goal-difference cap must be a whole number of goals, 1 or more (or blank for none).");
  const capN = cap !== null && Number.isInteger(cap) && cap >= 1 ? cap : null;
  const divisions = t.divisions;
  const perDiv = divisions.map((d, di) => divisionGames(d, di));
  const raw = String(text ?? "").split(/\r?\n/);

  // 1. Each line to a division (a heading line sets the division for the lines below it).
  const linesOf = divisions.map(() => []);
  let context = null;
  raw.forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    const head = divisions.findIndex((d) => norm(d.name) === norm(line.replace(/:$/, "")));
    if (head >= 0) { context = head; return; }
    const { only, cands } = divisionsFor(line, divisions, context);
    const hits = cands.map((c) => ({ ...c, pair: pairIn(c.body, divisions[c.di].teams) })).filter((c) => c.pair);
    if (!hits.length) {
      if (only) {
        const pr = parseResults(cands[0].body, divisions[cands[0].di].teams);
        const why = pr.errors.length ? pr.errors[0].replace(/^Result line \d+: /, "") : 'write it like "Hawks 3 - 2 Owls".';
        errors.push(`Result line ${i + 1} (${divisions[cands[0].di].name}): ${why}`);
      } else errors.push(`Result line ${i + 1}: no division has both teams. Write it like "Hawks 3 - 2 Owls", with the names as entered${divisions.length > 1 ? ', or start it with the division ("' + divisions[0].name + ': ...")' : ""}.`);
      return;
    }
    if (hits.length > 1) { errors.push(`Result line ${i + 1}: both teams are in ${hits.map((h) => divisions[h.di].name).join(" and ")}; start the line with the division, like "${divisions[hits[0].di].name}: ${line}", or put the division's name on a line above its results.`); return; }
    linesOf[hits[0].di].push({ n: i + 1, body: hits[0].body, pair: hits[0].pair });
  });

  const outDivs = [];
  const gameInfo = new Map(); // game key (pool: div|pool|a|b; knockout: div#id) -> { homeTeam, awayTeam, result, winner }
  const warnings = [];
  divisions.forEach((d, di) => {
    const { pools, bracket, seeds } = perDiv[di];
    const poolOf = new Map();
    pools.forEach((p, pi) => p.teams.forEach((name) => poolOf.set(name, pi)));
    const poolResults = pools.map(() => []);
    const played = pools.map(() => new Map()); // "a|b" sorted -> result
    const koLines = [];
    for (const l of linesOf[di]) {
      const A = d.teams[l.pair.a], B = d.teams[l.pair.b];
      const pa = poolOf.get(A), pb = poolOf.get(B);
      const key = [A, B].sort().join("|");
      if (!l.pair.knockoutOnly && pa === pb && !played[pa].has(key)) {
        const ia = pools[pa].teams.indexOf(A), ib = pools[pa].teams.indexOf(B);
        const r = { a: ia, b: ib, ga: l.pair.ga, gb: l.pair.gb, walkover: !!l.pair.walkover, n: l.n };
        played[pa].set(key, r);
        poolResults[pa].push(r);
        continue;
      }
      koLines.push(l);
    }
    const poolsOut = pools.map((p, pi) => {
      const total = p.teams.length * (p.teams.length - 1) / 2;
      const rows = standings(p.teams, poolResults[pi].map((r) => capped(r, capN)), { win: ps.win, draw: ps.draw, loss: ps.loss, headToHead });
      const complete = poolResults[pi].length === total;
      const notes = complete ? tieBreakNotes(rows).map((x) => x.text) : [];
      return { name: p.name, teams: p.teams, rows, played: poolResults[pi].length, total, complete, notes, results: poolResults[pi].map((r) => ({ home: p.teams[r.a], away: p.teams[r.b], ga: r.ga, gb: r.gb, walkover: r.walkover })) };
    });
    for (const [pi, p] of poolsOut.entries()) for (const r of p.results) {
      const k = `${di}|${pi}|${[r.home, r.away].sort().join("|")}`;
      gameInfo.set(k, { first: r.home, ga: r.ga, gb: r.gb, walkover: r.walkover });
    }

    // 2. Seed labels to teams, once the pools they read from are finished.
    const letterIdx = (L) => pools.findIndex((p) => p.name === `Pool ${L}`);
    const divNotes = [];
    const allDone = poolsOut.every((p) => p.complete);
    const bestOf = {};
    const resolveLabel = (label) => {
      let m = label.match(/^(\d+)(?:st|nd|rd|th) Pool (\S+)$/);
      if (m) { const p = poolsOut[letterIdx(m[2])]; return p && p.complete ? p.rows[Number(m[1]) - 1]?.name ?? null : null; }
      if (pools.length === 1 && (m = label.match(/^(\d+)(?:st|nd|rd|th)$/))) { const p = poolsOut[0]; return p.complete ? p.rows[Number(m[1]) - 1]?.name ?? null : null; }
      m = label.match(/^(?:Best|(\d+)(?:st|nd|rd|th)-best) (\d+)(?:st|nd|rd|th)-placed$/);
      if (m) {
        if (!allDone) return null;
        const place = Number(m[2]), rank = m[1] ? Number(m[1]) : 1;
        if (!bestOf[place]) {
          // Across pools of different sizes, per game: points, then goal difference, then goals for.
          const list = poolsOut.map((p, pi) => ({ row: p.rows[place - 1], pi, g: p.rows[place - 1]?.played || 1 })).filter((x) => x.row)
            .map((x) => ({ name: x.row.name, pool: pools[x.pi].name, key: [x.row.points / x.g, x.row.gd / x.g, x.row.gf / x.g], pi: x.pi }))
            .sort((x, y) => y.key[0] - x.key[0] || y.key[1] - x.key[1] || y.key[2] - x.key[2] || x.pi - y.pi);
          for (let i = 0; i + 1 < list.length; i++) if (list[i].key.join() === list[i + 1].key.join())
            divNotes.push(`${list[i].name} (${list[i].pool}) and ${list[i + 1].name} (${list[i + 1].pool}) are level as ${ordinal(place)}-placed teams on points, goal difference and goals for per game; listed in pool order. Decide it by your tournament's rule (a coin toss or penalties) if it decides who goes through.`);
          bestOf[place] = list;
        }
        return bestOf[place][rank - 1]?.name ?? null;
      }
      return null;
    };
    const seedsOut = seeds.map((label) => ({ label, team: resolveLabel(label) }));
    for (const p of poolsOut) for (const note of p.notes) if (/Still level/.test(note)) divNotes.push(`${p.name}: ${note}`);

    let played_ = null;
    if (bracket) {
      const named = Object.fromEntries(seedsOut.map((s) => [s.label, s.team]));
      const filled = { ...bracket, rounds: bracket.rounds.map((r) => ({ ...r, matches: r.matches.map((m) => ({ ...m, a: m.a && m.a.name && named[m.a.name] ? { ...m.a, name: named[m.a.name], label: m.a.name } : m.a, b: m.b && m.b.name && named[m.b.name] ? { ...m.b, name: named[m.b.name], label: m.b.name } : m.b })) })) };
      const known = new Set(seedsOut.filter((s) => s.team).map((s) => norm(s.team)));
      const kept = [];
      for (const l of koLines) {
        const A = d.teams[l.pair.a], B = d.teams[l.pair.b];
        const out = [A, B].filter((x) => !known.has(norm(x)));
        if (out.length) {
          const pending = poolsOut.filter((p) => !p.complete).map((p) => p.name);
          const samePool = poolOf.get(A) === poolOf.get(B);
          const met = samePool && played[poolOf.get(A)].has([A, B].sort().join("|"));
          const lead = samePool ? (met ? `${A} and ${B} have already played their pool game, so this would be a knockout game, but ` : "")
            : pools.length > 1 ? `${A} (${pools[poolOf.get(A)].name}) and ${B} (${pools[poolOf.get(B)].name}) are in different pools, so this would be a knockout game, but ` : "";
          const tail = pending.length ? `${out.join(" and ")} ${out.length === 1 ? "is" : "are"} not in the knockouts yet (${pending.join(", ")} still ${pending.length === 1 ? "has" : "have"} games to play).`
            : `${out.join(" and ")} did not go through to the knockouts.`;
          errors.push(`Result line ${l.n} (${d.name}): ${lead}${tail}`);
          continue;
        }
        kept.push(l);
      }
      const ktext = [];
      for (const l of kept) ktext[l.n - 1] = l.body;
      played_ = playBracket(filled, Array.from(ktext, (x) => x ?? "").join("\n"));
      for (const e of played_.errors) errors.push(e.replace(/^Play-off line (\d+):/, `Result line $1 (${d.name}):`));
      for (const r of played_.rounds) for (const m of r.matches) {
        if (m.bye) continue;
        gameInfo.set(`${d.name}#${m.id}`, { teams: m.teams || [null, null], winner: m.winner ? m.winner.name : null, loser: m.loser ? m.loser.name : null, score: m.score || null, skipped: !!m.skipped });
      }
    }
    outDivs.push({ name: d.name, pools: poolsOut, seeds: seedsOut, bracket: played_, notes: divNotes,
      champion: played_?.champion?.name ?? null, runnerUp: played_?.runnerUp?.name ?? null, third: played_?.third?.name ?? null });
  });

  // 3. The schedule with names and scores.
  const divIndex = new Map(divisions.map((d, i) => [d.name, i]));
  const games = t.games.map((g) => {
    const di = divIndex.get(g.division);
    const out = { ...g, slotHome: g.home, slotAway: g.away, result: null, winner: null };
    if (!g.knockout) {
      const pi = perDiv[di].pools.findIndex((p) => p.name === g.stage);
      const info = gameInfo.get(`${di}|${pi}|${[g.home, g.away].sort().join("|")}`);
      if (info) {
        const [h, a] = info.first === g.home ? [info.ga, info.gb] : [info.gb, info.ga];
        out.result = info.walkover ? (h > a ? `${g.home} w/o` : `${g.away} w/o`) : `${h} - ${a}`;
        out.winner = h > a ? g.home : a > h ? g.away : null;
      }
      return out;
    }
    const info = gameInfo.get(g.key);
    if (!info) return out;
    if (info.teams[0]) out.home = info.teams[0].name;
    if (info.teams[1]) out.away = info.teams[1].name;
    if (info.skipped) out.result = "not needed";
    else if (info.winner) {
      out.winner = info.winner;
      out.result = info.score === null ? `${info.winner} won` : info.score === "w/o" ? `${info.winner} w/o` : info.score;
    }
    return out;
  });
  const isTeam = (g) => { const d = divisions[divIndex.get(g.division)]; return d.teams.includes(g.home) && d.teams.includes(g.away); };
  const next = games.filter((g) => !g.result && isTeam(g));
  const lineNo = (e) => Number((e.match(/^Result line (\d+)/) || [0, 0])[1]);
  errors.sort((x, y) => lineNo(x) - lineNo(y));
  return { divisions: outDivs, games, next, played: games.filter((g) => g.result).length, total: games.length, errors, warnings };
}

/** Plain text: every pool table, the seeds, the bracket's state and the champion, per division. */
export function tournamentResultsText(r) {
  const out = [];
  for (const d of r.divisions) {
    out.push(d.name.toUpperCase());
    for (const p of d.pools) {
      out.push(`${p.name} (${p.played} of ${p.total} played${p.complete ? ", final" : ""})`);
      for (const row of p.rows) out.push(`  ${String(row.rank).padStart(2)}. ${row.name.padEnd(24)} P${row.played} W${row.won} D${row.drawn} L${row.lost} GD ${row.gd >= 0 ? "+" : ""}${row.gd} Pts ${row.points}`);
    }
    if (d.seeds.length) out.push("Knockout places: " + d.seeds.map((s) => `${s.label} = ${s.team ?? "?"}`).join("; "));
    if (d.bracket) for (const round of d.bracket.rounds) for (const m of round.matches) {
      if (m.bye || m.dead) continue;
      const g = r.games.find((x) => x.key === `${d.name}#${m.id}`);
      if (!g) continue;
      out.push(`  ${g.stage}: ${g.home} v ${g.away}${g.result ? ` - ${g.result}` : ""}`);
    }
    if (d.champion) out.push(`Champion: ${d.champion}.${d.runnerUp ? ` Runner-up: ${d.runnerUp}.` : ""}${d.third ? ` Third: ${d.third}.` : ""}`);
    for (const n of d.notes) out.push(`Note: ${n}`);
    out.push("");
  }
  if (r.next.length) {
    out.push("Next up:");
    for (const g of r.next.slice(0, 12)) out.push(`  ${g.dayLabel.slice(0, 3)} ${g.start} ${g.field}: ${g.division} ${g.stage}, ${g.home} v ${g.away}`);
  }
  return out.join("\n").trim() + "\n";
}

/** The schedule CSV with the teams filled in and a Result column. Every cell goes through csvCell
 * (calc.mjs), the formula-injection guard: a cell starting =, +, -, @, tab or CR gets an apostrophe. */
export function tournamentResultsCsv(r, team = null) {
  const cols = ["Date", "Day", "Start", "End", "Field", "Division", "Stage", "Home", "Away", "Result"];
  const rows = r.games.filter((g) => !team || g.teams.includes(team) || [`${g.division}/${g.home}`, `${g.division}/${g.away}`].includes(team))
    .map((g) => [g.date, g.dayLabel.slice(0, 3), g.start, g.end, g.field, g.division, g.stage, g.home, g.away, g.result ?? ""]);
  return [cols, ...rows].map((x) => x.map(csvCell).join(",")).join("\n") + "\n";
}
