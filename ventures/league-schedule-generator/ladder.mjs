// League schedule generator, ladder.mjs: Ladder leagues: challenge results and the ladder after them.
// Split out of calc.mjs on 2026-11-23 (quality audit round 87); calc.mjs re-exports every public name.

// ---------------------------------------------------------------- ladder

/**
 * Ladder results: one line per challenge, "Winner beat Loser" (also "def.", "defeated", "over"), oldest first.
 * Names match the player list case-insensitively. Returns { results: [{ winner, loser }], errors }.
 */
export function parseLadderResults(text, players) {
  const index = new Map(players.map((p, i) => [p.trim().toLowerCase(), i]));
  const results = [];
  const errors = [];
  const re = /^(.+?)\s+(?:beat|def\.?|defeated|over)\s+(.+)$/i;
  String(text || "").split(/\r?\n/).forEach((raw, ln) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = re.exec(line);
    if (!m) { errors.push(`Line ${ln + 1}: write it as "Ana beat Ben".`); return; }
    const w = index.get(m[1].trim().toLowerCase());
    const l = index.get(m[2].trim().toLowerCase());
    const bad = [[m[1], w], [m[2], l]].filter(([, id]) => id === undefined).map(([nm]) => `"${nm.trim()}"`);
    if (bad.length) { errors.push(`Line ${ln + 1}: ${bad.join(", ")} not in the player list.`); return; }
    if (w === l) { errors.push(`Line ${ln + 1}: a player cannot play themselves.`); return; }
    results.push({ winner: w, loser: l });
  });
  return { results, errors };
}

/**
 * Replay a challenge ladder. `players` is the starting order, top rung first. A challenger who beats someone
 * ranked above takes that rung and everyone from there down to the challenger's old rung drops one place
 * ("insert", the usual club rule); with { move: "swap" } only the two trade places. A win by the higher-ranked
 * player changes nothing. A challenge more than `reach` rungs up is still applied but listed in `outOfReach`
 * so the organiser can overrule it. Returns { order (player indexes, top first), moves, outOfReach, played }.
 */
export function ladderStandings(players, results, { reach = 3, move = "insert" } = {}) {
  if (!Array.isArray(players) || players.length < 2) throw new Error("A ladder needs at least 2 players.");
  const order = players.map((_, i) => i);
  const moves = [];
  const outOfReach = [];
  const played = new Array(players.length).fill(0);
  results.forEach((r, n) => {
    played[r.winner]++; played[r.loser]++;
    const from = order.indexOf(r.winner);
    const to = order.indexOf(r.loser);
    if (to < from - reach) outOfReach.push({ n: n + 1, winner: r.winner, loser: r.loser, rungs: from - to });
    if (from < to) { moves.push({ n: n + 1, winner: r.winner, loser: r.loser, from, to: from, held: true }); return; }
    if (move === "swap") { order[from] = r.loser; order[to] = r.winner; }
    else { order.splice(from, 1); order.splice(to, 0, r.winner); }
    moves.push({ n: n + 1, winner: r.winner, loser: r.loser, from, to, held: false });
  });
  return { order, moves, outOfReach, played };
}

/** Who each player may challenge now: the `reach` rungs directly above them. */
export function ladderChallenges(order, reach = 3) {
  return order.map((p, pos) => ({ player: p, rank: pos + 1, may: order.slice(Math.max(0, pos - reach), pos).reverse() }));
}

/** Plain-text ladder for a group chat: the rungs, who each player may challenge, and any overruled-looking challenge. */
export function ladderText(players, state, { reach = 3 } = {}) {
  const lines = ["Ladder"];
  state.order.forEach((p, i) => lines.push(`  ${i + 1}. ${players[p]}  (${state.played[p]} played)`));
  const ch = ladderChallenges(state.order, reach).filter((c) => c.may.length);
  if (ch.length) {
    lines.push("", `Who can challenge whom (up to ${reach} rung${reach === 1 ? "" : "s"} up)`);
    for (const c of ch) lines.push(`  ${players[c.player]} -> ${c.may.map((q) => players[q]).join(", ")}`);
  }
  if (state.outOfReach.length) {
    lines.push("", "Beyond the reach limit (applied anyway; overrule if your rules say so)");
    for (const o of state.outOfReach) lines.push(`  Result ${o.n}: ${players[o.winner]} beat ${players[o.loser]}, ${o.rungs} rungs up`);
  }
  return lines.join("\n");
}
