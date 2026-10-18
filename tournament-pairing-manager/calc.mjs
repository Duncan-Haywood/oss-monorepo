// Tournament pairing manager: Swiss pairings with tiebreak standings, and single or
// double elimination brackets driven by results. Pure functions, no DOM, no network.

export const BYE = "BYE";

// ---------- players ----------

// One player per line. "Name", "Name, 1850" or "Name (1850)". A rating is optional;
// when any rating is present, players are seeded by rating, otherwise by list order.
export function parsePlayers(text) {
  const errors = [];
  const players = [];
  const seen = new Set();
  const lines = String(text ?? "").split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    let name = line;
    let rating = null;
    const m = line.match(/^(.*?)[\s,;\t]*[\(\[]?\s*(-?\d{1,5}(?:\.\d+)?)\s*[\)\]]?$/);
    if (m && m[1].trim()) {
      name = m[1].trim();
      rating = Number(m[2]);
    }
    name = name.replace(/\s+/g, " ");
    const key = name.toLowerCase();
    if (seen.has(key)) {
      errors.push(`Line ${i + 1}: "${name}" is listed twice; names must be different.`);
      return;
    }
    seen.add(key);
    players.push({ id: `p${players.length + 1}`, name, rating, order: players.length });
  });
  return { players, errors };
}

// Seed order: highest rating first, ties and unrated players keep list order.
export function seedPlayers(players) {
  return [...players].sort((a, b) => {
    const ra = a.rating ?? -Infinity;
    const rb = b.rating ?? -Infinity;
    if (ra !== rb) return rb - ra;
    return a.order - b.order;
  });
}

export function recommendedSwissRounds(n) {
  return n < 2 ? 0 : Math.ceil(Math.log2(n));
}

// ---------- Swiss ----------
// rounds: [{ pairings: [{ a, b, result }], byes: [playerId] }]
// result: "a" | "b" | "draw" | null (not played yet). In colour mode a is White/home.

export const DEFAULTS = { win: 1, draw: 0.5, bye: 1 };

function pointsFor(opts) {
  return { win: opts?.win ?? DEFAULTS.win, draw: opts?.draw ?? DEFAULTS.draw, bye: opts?.bye ?? DEFAULTS.bye };
}

export function swissStandings(players, rounds, opts = {}) {
  const pts = pointsFor(opts);
  const stat = new Map();
  for (const p of players) {
    stat.set(p.id, { id: p.id, name: p.name, rating: p.rating, order: p.order, score: 0, wins: 0, draws: 0, losses: 0, byes: 0, played: 0, opps: [], results: [], whites: 0, blacks: 0, progressive: 0 });
  }
  for (const r of rounds) {
    for (const bye of r.byes ?? []) {
      const s = stat.get(bye);
      if (!s) continue;
      s.score += pts.bye;
      s.byes += 1;
      s.results.push({ opp: null, pts: pts.bye });
    }
    for (const pr of r.pairings) {
      const sa = stat.get(pr.a);
      const sb = stat.get(pr.b);
      if (!sa || !sb) continue;
      sa.whites += 1;
      sb.blacks += 1;
      if (!pr.result) continue;
      sa.played += 1;
      sb.played += 1;
      sa.opps.push(pr.b);
      sb.opps.push(pr.a);
      let pa = 0;
      let pb = 0;
      if (pr.result === "a") { pa = pts.win; sa.wins += 1; sb.losses += 1; }
      else if (pr.result === "b") { pb = pts.win; sb.wins += 1; sa.losses += 1; }
      else { pa = pts.draw; pb = pts.draw; sa.draws += 1; sb.draws += 1; }
      sa.score += pa; sb.score += pb;
      sa.results.push({ opp: pr.b, pts: pa });
      sb.results.push({ opp: pr.a, pts: pb });
    }
    // progressive score = running total after each round, summed
    for (const s of stat.values()) s.progressive += s.score;
  }
  const rows = [...stat.values()];
  const score = (id) => stat.get(id)?.score ?? 0;
  for (const s of rows) {
    const oppScores = s.opps.map(score).sort((x, y) => x - y);
    s.buchholz = oppScores.reduce((a, b) => a + b, 0);
    s.buchholzCut1 = oppScores.length ? s.buchholz - oppScores[0] : 0;
    s.sonnebornBerger = s.results.reduce((a, r) => a + (r.opp ? r.pts * score(r.opp) : 0), 0);
  }
  const order = opts.tiebreaks ?? ["buchholz", "buchholzCut1", "sonnebornBerger", "wins", "progressive"];
  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    for (const key of order) if (b[key] !== a[key]) return b[key] - a[key];
    const ra = a.rating ?? -Infinity;
    const rb = b.rating ?? -Infinity;
    if (ra !== rb) return rb - ra;
    return a.order - b.order;
  });
  let rank = 0;
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    const tied = prev && prev.score === r.score && order.every((k) => prev[k] === r[k]);
    r.rank = tied ? prev.rank : i + 1;
    r.tied = false;
    rank = r.rank;
  });
  for (let i = 0; i < rows.length; i++) rows[i].tied = rows.some((x, j) => j !== i && x.rank === rows[i].rank);
  return rows;
}

function colourHistory(rounds) {
  const h = new Map();
  for (const r of rounds) {
    for (const pr of r.pairings) {
      for (const [id, c] of [[pr.a, "W"], [pr.b, "B"]]) {
        if (!h.has(id)) h.set(id, []);
        h.get(id).push(c);
      }
    }
  }
  return h;
}

// Choose the pairings for the next round.
// opts: { colours, withdrawn: [ids], win, draw, bye }
// Returns { pairings: [{a,b}], byes: [id], notes: [] }
export function pairSwissRound(players, rounds, opts = {}) {
  const withdrawn = new Set(opts.withdrawn ?? []);
  const active = players.filter((p) => !withdrawn.has(p.id));
  const notes = [];
  if (active.length < 2) return { pairings: [], byes: [], notes: ["Fewer than two active players."] };
  const standings = swissStandings(players, rounds, opts);
  const info = new Map(standings.map((s) => [s.id, s]));
  const seedRank = new Map(seedPlayers(players).map((p, i) => [p.id, i]));
  const ranked = active
    .map((p) => info.get(p.id))
    .sort((a, b) => b.score - a.score || seedRank.get(a.id) - seedRank.get(b.id));
  const pos = new Map(ranked.map((s, i) => [s.id, i]));
  const met = new Set();
  const hadBye = new Set();
  for (const r of rounds) {
    for (const pr of r.pairings) { met.add(`${pr.a}|${pr.b}`); met.add(`${pr.b}|${pr.a}`); }
    for (const b of r.byes ?? []) hadBye.add(b);
  }
  const colours = colourHistory(rounds);
  const useColours = Boolean(opts.colours);

  // Round 1 (nothing played): classic top half v bottom half.
  const noGames = rounds.length === 0;

  function colourPref(id) {
    const h = colours.get(id) ?? [];
    const w = h.filter((c) => c === "W").length;
    const b = h.length - w;
    const last2 = h.slice(-2);
    return { diff: w - b, run: last2.length === 2 && last2[0] === last2[1] ? last2[1] : null };
  }
  // Returns [aId, bId, penalty] with a getting the colour (White / home) it is owed.
  function orient(p, q) {
    if (!useColours) return [p, q, 0];
    const cp = colourPref(p);
    const cq = colourPref(q);
    let first = p;
    let second = q;
    if (cp.diff !== cq.diff) { if (cp.diff > cq.diff) { first = q; second = p; } }
    else if (cp.run || cq.run) { if (cp.run === "W" && cq.run !== "W") { first = q; second = p; } }
    else if (pos.get(q) < pos.get(p)) { /* equal need: higher ranked keeps White only on odd rounds */ if (rounds.length % 2 === 0) { first = q; second = p; } }
    const a = colourPref(first);
    const b = colourPref(second);
    let pen = 0;
    if (a.diff > 0) pen += a.diff * 6;
    if (b.diff < 0) pen += -b.diff * 6;
    if (a.run === "W") pen += 400;
    if (b.run === "B") pen += 400;
    return [first, second, pen];
  }

  function pairCost(p, q, groupHalf) {
    const sp = info.get(p).score;
    const sq = info.get(q).score;
    let cost = Math.round((sp - sq) * (sp - sq) * 400) + Math.round(Math.abs(sp - sq) * 50);
    if (met.has(`${p}|${q}`)) cost += 1_000_000;
    cost += Math.abs(pos.get(q) - pos.get(p) - groupHalf) * 3;
    cost += orient(p, q)[2];
    return cost;
  }

  function bestMatching(ids) {
    // ids sorted by rank. Branch and bound over "pair the first free player with someone".
    const half = Math.ceil(ids.length / 2);
    let best = { cost: Infinity, pairs: null };
    let budget = 400_000;
    const used = new Array(ids.length).fill(false);
    const cur = [];
    function go(cost) {
      if (cost >= best.cost || budget-- <= 0) return;
      let i = 0;
      while (i < ids.length && used[i]) i++;
      if (i === ids.length) { best = { cost, pairs: cur.slice() }; return; }
      used[i] = true;
      const cands = [];
      for (let j = i + 1; j < ids.length; j++) if (!used[j]) cands.push([pairCost(ids[i], ids[j], noGames ? half : Math.ceil(groupSize(ids[i]) / 2)), j]);
      cands.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      for (const [c, j] of cands) {
        used[j] = true;
        cur.push([ids[i], ids[j]]);
        go(cost + c);
        cur.pop();
        used[j] = false;
        if (budget <= 0) break;
      }
      used[i] = false;
    }
    go(0);
    return best;
  }
  const groupSizes = new Map();
  for (const s of ranked) groupSizes.set(s.score, (groupSizes.get(s.score) ?? 0) + 1);
  const groupSize = (id) => groupSizes.get(info.get(id).score);

  let ids = ranked.map((s) => s.id);
  const byes = [];
  if (ids.length % 2 === 1) {
    // Bye goes to the lowest-ranked player without one; try each until a matching exists.
    const order = [...ids].reverse();
    const pool = order.filter((id) => !hadBye.has(id));
    const candidates = pool.length ? pool : order;
    if (!pool.length) notes.push("Everyone has already had a bye, so the lowest-ranked player gets a second one.");
    let chosen = null;
    let chosenMatch = null;
    for (const c of candidates.slice(0, 8)) {
      const rest = ids.filter((id) => id !== c);
      const m = bestMatching(rest);
      if (m.pairs && m.cost < 1_000_000) { chosen = c; chosenMatch = m; break; }
      if (!chosenMatch || (m.pairs && m.cost < chosenMatch.cost)) { chosen = c; chosenMatch = m; }
    }
    byes.push(chosen);
    ids = ids.filter((id) => id !== chosen);
    var match = chosenMatch;
  } else {
    var match = bestMatching(ids);
  }
  if (!match.pairs) return { pairings: [], byes: [], notes: ["No pairing could be found."] };
  if (match.cost >= 1_000_000) notes.push("Some players have already met every available opponent, so at least one rematch was unavoidable. Consider ending the event here.");
  const pairings = match.pairs.map(([p, q]) => {
    const [a, b] = orient(p, q);
    return { a, b };
  });
  pairings.sort((x, y) => Math.min(pos.get(x.a), pos.get(x.b)) - Math.min(pos.get(y.a), pos.get(y.b)));
  return { pairings, byes, notes };
}

export function validateSwiss(players, rounds) {
  const errors = [];
  const ids = new Set(players.map((p) => p.id));
  const met = new Set();
  const byes = new Map();
  rounds.forEach((r, i) => {
    const seen = new Set();
    for (const pr of r.pairings) {
      for (const id of [pr.a, pr.b]) {
        if (!ids.has(id)) errors.push(`Round ${i + 1}: unknown player ${id}.`);
        if (seen.has(id)) errors.push(`Round ${i + 1}: ${id} appears twice.`);
        seen.add(id);
      }
      if (pr.a === pr.b) errors.push(`Round ${i + 1}: ${pr.a} plays themselves.`);
      const key = [pr.a, pr.b].sort().join("|");
      if (met.has(key)) errors.push(`Round ${i + 1}: rematch ${key}.`);
      met.add(key);
    }
    for (const b of r.byes ?? []) {
      if (seen.has(b)) errors.push(`Round ${i + 1}: ${b} has a bye and a game.`);
      seen.add(b);
      byes.set(b, (byes.get(b) ?? 0) + 1);
    }
  });
  return { ok: errors.length === 0, errors, byes };
}

export function describeTiebreak(key) {
  return {
    buchholz: "Buchholz (sum of opponents' scores)",
    buchholzCut1: "Buchholz cut 1 (drop the weakest opponent)",
    sonnebornBerger: "Sonneborn-Berger (points scored against each opponent, weighted by that opponent's score)",
    wins: "Number of wins",
    progressive: "Progressive score (running totals added up)",
  }[key] ?? key;
}

// ---------- elimination brackets ----------

export function seedPositions(size) {
  let order = [1, 2];
  while (order.length < size) {
    const m = order.length * 2;
    order = order.flatMap((x) => [x, m + 1 - x]);
  }
  return order.slice(0, size);
}

const nextPow2 = (n) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

// format: "single" | "double". Seeds are 1..n; any seed above n is a bye.
export function buildBracket(n, { format = "single", thirdPlace = false, reset = true } = {}) {
  if (!Number.isInteger(n) || n < 2) throw new Error("A bracket needs at least 2 players.");
  if (format === "double" && n < 3) throw new Error("A double-elimination bracket needs at least 3 players.");
  const P = nextPow2(n);
  const k = Math.log2(P);
  const order = seedPositions(P);
  const seedSrc = (s) => ({ seed: s <= n ? s : 0 });
  const matches = [];
  const add = (m) => { matches.push(m); return m; };
  const W = [];
  for (let r = 1; r <= k; r++) {
    W[r] = [];
    for (let i = 0; i < P / 2 ** r; i++) {
      const a = r === 1 ? seedSrc(order[2 * i]) : { winner: W[r - 1][2 * i].id };
      const b = r === 1 ? seedSrc(order[2 * i + 1]) : { winner: W[r - 1][2 * i + 1].id };
      W[r][i] = add({ id: `W${r}-${i + 1}`, bracket: "W", round: r, index: i, a, b });
    }
  }
  let champSrc = { winner: W[k][0].id };
  if (format === "double") {
    const L = [];
    let lr = 0;
    for (let j = 1; j <= k - 1; j++) {
      const m = P / 2 ** (j + 1);
      // round A
      lr += 1;
      L[lr] = [];
      for (let i = 0; i < m; i++) {
        const a = j === 1 ? { loser: W[1][2 * i].id } : { winner: L[lr - 1][2 * i].id };
        const b = j === 1 ? { loser: W[1][2 * i + 1].id } : { winner: L[lr - 1][2 * i + 1].id };
        L[lr][i] = add({ id: `L${lr}-${i + 1}`, bracket: "L", round: lr, index: i, a, b });
      }
      // round B: drop-ins from the winners bracket, reversed to delay rematches
      lr += 1;
      L[lr] = [];
      for (let i = 0; i < m; i++) {
        L[lr][i] = add({ id: `L${lr}-${i + 1}`, bracket: "L", round: lr, index: i, a: { winner: L[lr - 1][i].id }, b: { loser: W[j + 1][m - 1 - i].id } });
      }
    }
    const lbFinal = L[lr][0];
    const gf = add({ id: "GF", bracket: "GF", round: 1, index: 0, a: { winner: W[k][0].id }, b: { winner: lbFinal.id } });
    champSrc = { winner: gf.id };
    if (reset) {
      add({ id: "GF2", bracket: "GF", round: 2, index: 0, a: { gfSide: "a" }, b: { gfSide: "b" }, resetOf: gf.id });
      champSrc = { champion: true };
    }
  } else if (thirdPlace && k >= 2) {
    add({ id: "3RD", bracket: "3RD", round: k, index: 0, a: { loser: W[k - 1][0].id }, b: { loser: W[k - 1][1].id } });
  }
  return { n, size: P, rounds: k, format, matches, champion: champSrc };
}

export function roundName(bracket, m) {
  const k = bracket.rounds;
  if (m.bracket === "GF") return m.id === "GF" ? "Grand final" : "Grand final reset";
  if (m.bracket === "3RD") return "Third place";
  if (m.bracket === "L") return `Losers round ${m.round}`;
  const left = k - m.round;
  if (left === 0) return bracket.format === "double" ? "Winners final" : "Final";
  if (left === 1) return "Semifinal";
  if (left === 2) return "Quarterfinal";
  return `Round of ${2 ** (left + 1)}`;
}

// results: { [matchId]: playerId } the winner. seeded: players in seed order (index 0 = seed 1).
export function resolveBracket(bracket, seeded, results = {}) {
  const byId = new Map(bracket.matches.map((m) => [m.id, m]));
  const memo = new Map();
  function state(id) {
    if (memo.has(id)) return memo.get(id);
    const m = byId.get(id);
    const s = { id, a: null, b: null, winner: null, loser: null, status: "pending" };
    memo.set(id, s);
    if (m.resetOf) {
      const g = state(m.resetOf);
      s.a = g.a; s.b = g.b;
      if (g.status !== "done") { s.status = "pending"; return s; }
      if (g.winner === g.a) { s.status = "skipped"; s.winner = null; return s; }
      // the losers-bracket player won, so both sides have one loss: play again
      const w = results[id];
      if (w && (w === s.a || w === s.b)) { s.winner = w; s.loser = w === s.a ? s.b : s.a; s.status = "done"; }
      else s.status = "ready";
      return s;
    }
    s.a = slot(m.a);
    s.b = slot(m.b);
    const aBye = s.a === BYE;
    const bBye = s.b === BYE;
    if (aBye || bBye) {
      s.loser = BYE;
      if (aBye && bBye) { s.winner = BYE; s.status = "void"; }
      else {
        const other = aBye ? s.b : s.a;
        if (other) { s.winner = other; s.status = "bye"; }
      }
      return s;
    }
    if (!s.a || !s.b) return s;
    const w = results[id];
    if (w && (w === s.a || w === s.b)) { s.winner = w; s.loser = w === s.a ? s.b : s.a; s.status = "done"; }
    else s.status = "ready";
    return s;
  }
  function slot(src) {
    if (src.seed !== undefined) return src.seed === 0 ? BYE : seeded[src.seed - 1]?.id ?? BYE;
    if (src.winner) return state(src.winner).winner;
    if (src.loser) return state(src.loser).loser;
    return null;
  }
  const out = new Map();
  for (const m of bracket.matches) out.set(m.id, state(m.id));
  let champion = null;
  if (bracket.champion.champion) {
    const g2 = out.get("GF2");
    const g1 = out.get("GF");
    if (g2.status === "skipped") champion = g1.winner;
    else if (g2.status === "done") champion = g2.winner;
  } else if (bracket.champion.winner) champion = out.get(bracket.champion.winner).winner;
  if (champion === BYE) champion = null;
  const playable = bracket.matches.filter((m) => ["ready", "done"].includes(out.get(m.id).status));
  return {
    states: out,
    champion,
    playable: playable.length,
    played: playable.filter((m) => out.get(m.id).status === "done").length,
    ready: bracket.matches.filter((m) => out.get(m.id).status === "ready").map((m) => m.id),
  };
}

// Results that no longer fit (a changed upstream result) are dropped from the map.
export function pruneResults(bracket, seeded, results) {
  let cur = { ...results };
  for (let guard = 0; guard < bracket.matches.length + 2; guard++) {
    const res = resolveBracket(bracket, seeded, cur);
    const bad = Object.keys(cur).filter((id) => {
      const s = res.states.get(id);
      return !s || (s.status !== "done");
    });
    if (!bad.length) return cur;
    for (const id of bad) delete cur[id];
  }
  return cur;
}

export function bracketText(bracket, seeded, results = {}, nameOf = (id) => id) {
  const res = resolveBracket(bracket, seeded, results);
  const name = (v) => (v === BYE ? "bye" : v ? nameOf(v) : "TBD");
  const lines = [];
  let lastKey = "";
  for (const m of bracket.matches) {
    const s = res.states.get(m.id);
    if (s.status === "void" || s.status === "skipped") continue;
    const key = `${m.bracket}${m.round}`;
    if (key !== lastKey) { lines.push("", roundName(bracket, m).toUpperCase()); lastKey = key; }
    const mark = s.status === "done" ? ` -> ${name(s.winner)}` : s.status === "bye" ? " (bye)" : "";
    lines.push(`  ${m.id}: ${name(s.a)} v ${name(s.b)}${mark}`);
  }
  if (res.champion) lines.push("", `CHAMPION: ${name(res.champion)}`);
  return lines.join("\n").trim();
}

// ---------- exports and saved state ----------

const csvCell = (v) => {
  const t = String(v ?? "");
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export function standingsCsv(rows) {
  const head = ["Rank", "Player", "Rating", "Played", "Wins", "Draws", "Losses", "Byes", "Score", "Buchholz", "Buchholz cut 1", "Sonneborn-Berger"];
  const body = rows.map((r) => [r.rank, r.name, r.rating ?? "", r.played, r.wins, r.draws, r.losses, r.byes, r.score, r.buchholz, r.buchholzCut1, r.sonnebornBerger]);
  return [head, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function pairingsText(players, round, roundNo, colours) {
  const name = new Map(players.map((p) => [p.id, p.name]));
  const lines = [`Round ${roundNo}`];
  round.pairings.forEach((p, i) => {
    const res = p.result === "a" ? "1-0" : p.result === "b" ? "0-1" : p.result === "draw" ? "1/2-1/2" : "";
    lines.push(`Board ${i + 1}: ${name.get(p.a)} ${colours ? "(W) " : ""}v ${name.get(p.b)}${colours ? " (B)" : ""}${res ? "  " + res : ""}`);
  });
  for (const b of round.byes ?? []) lines.push(`Bye: ${name.get(b)}`);
  return lines.join("\n");
}

export function serializeState(state) {
  return JSON.stringify({ app: "tournament-pairing-manager", version: 1, ...state });
}

export function parseState(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { error: "That is not a saved tournament file." }; }
  if (!data || data.app !== "tournament-pairing-manager" || data.version !== 1) return { error: "That is not a saved tournament file." };
  if (!Array.isArray(data.players) || !data.players.every((p) => p && typeof p.id === "string" && typeof p.name === "string")) return { error: "The saved file has no valid player list." };
  data.players = data.players.map((p, i) => ({ id: p.id, name: p.name, rating: typeof p.rating === "number" ? p.rating : null, order: i }));
  data.rounds = Array.isArray(data.rounds) ? data.rounds : [];
  data.results = data.results && typeof data.results === "object" ? data.results : {};
  return { state: data };
}

export function sampleFields() {
  return {
    players: ["Maya Okafor, 1720", "Ben Lindqvist, 1655", "Ana Souza, 1610", "Jonas Weber, 1580", "Priya Nair, 1540", "Tom Hale, 1490", "Lena Fischer, 1455", "Sam Duarte, 1400"].join("\n"),
  };
}
