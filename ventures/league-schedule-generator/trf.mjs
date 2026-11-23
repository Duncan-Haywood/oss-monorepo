// FIDE Tournament Report File (TRF-16, with the TRF(x)/TRF(bx) extensions bbpPairings and JaVaFo
// read) for the Swiss pairer. Pure functions, no imports.
//
// A TRF is what arbiters send to FIDE's rating officers and what every endorsed pairing program
// (Swiss-Manager, Vega, JaVaFo, bbpPairings) reads and writes. Reading one lets a club carry on an
// event started elsewhere; writing one lets it check a round against an endorsed engine
// (`bbpPairings --dutch event.trf -p`) or send the event for rating.
//
// Player lines ("001") are fixed columns (0-based offsets, as bbpPairings's reader uses them):
//   0-2 "001", 4-7 start rank, 9 sex, 10-12 title, 14-46 name, 48-51 rating, 53-55 federation,
//   57-67 FIDE id, 69-78 birth date, 80-83 points, 85-88 rank, then one 10-column block per round
//   from 91: opponent's start rank (4, "0000" for none), colour (w, b or -), result.
// Results: 1 = 0 played win, draw, loss; W D L the same, unrated; + - forfeit win, loss; U the
// pairing-allocated bye; F H Z full-point, half-point, zero-point bye (requested or absent); a
// blank block is a round not paired (no points). "XXR n" gives the number of rounds.

const RESULT = /^[10=WDL+\-UFHZ ]$/;

/**
 * Read a TRF. Returns { name, totalRounds, players: [{ id, name, rating, title, sex, federation,
 * fideId, birth, points, rounds: [{ opponent, colour, result } | null] }], errors }. Players are
 * in start-rank order; `opponent` is the opponent's index in that list or null.
 */
export function parseTrf(text) {
  const errors = [];
  const players = [];
  let name = "";
  let totalRounds = null;
  let initialColour = null;
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.replace(/\s+$/, "");
    const code = line.slice(0, 3);
    if (code === "012") { name = line.slice(4).trim(); continue; }
    if (code === "XXR") { const r = parseInt(line.slice(3).trim(), 10); if (r > 0) totalRounds = r; continue; }
    // "XXC white1" / "XXC black1" (the bbpPairings/JaVaFo extension): the initial colour, the
    // colour drawn for the top seed in round 1.
    if (code === "XXC") { const m = /\b(white|black)1\b/i.exec(line); if (m) initialColour = m[1].toLowerCase() === "white" ? "W" : "B"; continue; }
    if (code !== "001") continue;
    if (line.length < 84) { errors.push(`TRF line ${i + 1}: a player line is shorter than the 84 columns its points need.`); continue; }
    const id = parseInt(line.slice(4, 8), 10);
    if (!(id > 0)) { errors.push(`TRF line ${i + 1}: no start rank in columns 5-8.`); continue; }
    const rounds = [];
    let bad = false;
    for (let s = 91; s < line.length; s += 10) {
      const opp = line.slice(s, s + 4);
      const colour = line[s + 5] ?? " ";
      const result = (line[s + 7] ?? " ").toUpperCase();
      if (!RESULT.test(result) || !/^[wb\- ]$/.test(colour)) { errors.push(`TRF line ${i + 1}: round ${rounds.length + 1} reads "${line.slice(s, s + 8)}", not a TRF result.`); bad = true; break; }
      if (!opp.trim() && colour === " " && result === " ") { rounds.push(null); continue; }
      const oppId = opp.trim() && opp !== "0000" ? parseInt(opp, 10) : null;
      rounds.push({ opponentId: oppId, colour: colour === "w" ? "W" : colour === "b" ? "B" : null, result });
    }
    if (bad) continue;
    while (rounds.length && rounds[rounds.length - 1] === null) rounds.pop();
    players.push({
      id,
      name: line.slice(14, 47).trim() || `Player ${id}`,
      rating: parseInt(line.slice(48, 52), 10) || null,
      title: line.slice(10, 13).trim(),
      sex: line.slice(9, 10).trim(),
      federation: line.slice(53, 56).trim(),
      fideId: line.slice(57, 68).trim(),
      birth: line.slice(69, 79).trim(),
      points: Number(line.slice(80, 84).trim()) || 0,
      rounds,
    });
  }
  players.sort((a, b) => a.id - b.id);
  const indexOf = new Map(players.map((p, k) => [p.id, k]));
  if (indexOf.size !== players.length) errors.push("Two player lines share a start rank.");
  for (const p of players) for (const [r, b] of p.rounds.entries()) {
    if (!b) continue;
    b.opponent = b.opponentId == null ? null : indexOf.get(b.opponentId) ?? null;
    if (b.opponentId != null && b.opponent == null) errors.push(`${p.name} meets start rank ${b.opponentId} in round ${r + 1}, who has no player line.`);
    delete b.opponentId;
  }
  return { name, totalRounds, initialColour, players, errors };
}

/**
 * The initial colour (FIDE C.04.3 E.5) a parsed TRF was paired with: its XXC line, else read off
 * round 1's played games (the higher-ranked player took the initial colour on an odd start rank,
 * the other colour on an even one; the majority of boards decides), else null.
 */
export function trfInitialColour(trf) {
  if (trf.initialColour) return trf.initialColour;
  let w = 0, b = 0;
  for (const [i, p] of trf.players.entries()) {
    const g = p.rounds[0];
    if (!g || g.opponent == null || g.opponent < i || !g.colour || /[+\-]/.test(g.result)) continue;
    const oddRank = p.id % 2 === 1;
    if ((g.colour === "W") === oddRank) w++; else b++;
  }
  return w === b ? null : w > b ? "W" : "B";
}

/** Names the results box can read back: unique, and not ending in a word the parser treats as a command. */
export function trfNames(players) {
  const seen = new Set();
  return players.map((p) => {
    let n = p.name.replace(/\s+/g, " ").trim();
    if (seen.has(n.toLowerCase()) || /\s(?:out|bye|absent|withdrawn|withdraws)$/i.test(n) || /\s\d+\s*-\s*\d+\s/.test(` ${n} `)) n = `${n} (${p.id})`;
    seen.add(n.toLowerCase());
    return n;
  });
}

/**
 * A TRF as the page's two boxes: `players` (seed order) and `results` in the results syntax that
 * parseSwissResults reads, one round after another. Rounds a player was not paired in before the
 * last round played are written `absent`, so every later round stays in step; requested byes
 * already entered for the next round are written last.
 */
export function trfToResults(trf) {
  const names = trfNames(trf.players);
  const errors = [];
  let done = 0;
  for (const p of trf.players) p.rounds.forEach((b, r) => { if (b && (b.opponent != null || b.result === "U" || b.result === "+")) done = Math.max(done, r + 1); });
  const lines = [];
  const pre = [];
  for (let r = 0; r < done; r++) {
    lines.push(`# Round ${r + 1}`);
    for (const [k, p] of trf.players.entries()) {
      const b = p.rounds[r] ?? null;
      const me = names[k];
      if (!b) { lines.push(`${me} absent`); continue; }
      if (b.opponent != null) {
        const q = trf.players[b.opponent].rounds[r];
        if (!q || q.opponent !== k) { errors.push(`Round ${r + 1}: ${p.name} meets ${trf.players[b.opponent].name}, whose line does not say so.`); continue; }
        if (b.result === "+" || b.result === "-") {
          if (b.result === "+") lines.push(`${names[b.opponent]} forfeits to ${me}`);
          else if (q.result === "-" && k < b.opponent) lines.push(`${me} absent`, `${names[b.opponent]} absent`);
          continue;
        }
        if (b.colour !== "W") continue; // each game once, from white's line
        const s = { 1: [1, 0], W: [1, 0], 0: [0, 1], L: [0, 1], "=": [1, 1], D: [1, 1] }[b.result];
        if (!s) { errors.push(`Round ${r + 1}: ${p.name} has result "${b.result}" against a player.`); continue; }
        lines.push(`${me} ${s[0]} - ${s[1]} ${names[b.opponent]}`);
        continue;
      }
      lines.push(`${me} ${{ U: "bye", "+": "bye", F: "full bye", H: "half bye", Z: "zero bye", "-": "zero bye", " ": "absent" }[b.result] ?? "absent"}`);
    }
  }
  for (const [k, p] of trf.players.entries()) {
    const b = p.rounds[done];
    if (!b) continue;
    const kind = { F: "full bye", H: "half bye", Z: "zero bye", "-": "zero bye" }[b.result];
    if (b.opponent == null && kind) pre.push(`${names[k]} ${kind}`);
    if (p.rounds.length > done + 1) errors.push(`${p.name} has entries more than one round past round ${done}.`);
  }
  if (pre.length) lines.push(`# Round ${done + 1}: sitting out`, ...pre);
  return { players: names, results: lines.join("\n"), rounds: done, totalRounds: trf.totalRounds, errors };
}

const pad = (v, n, right = true) => { const s = String(v ?? "").slice(0, n); return right ? s.padStart(n) : s.padEnd(n); };

/**
 * Write a TRF from the page's players and parseSwissResults output. `info` may give each player a
 * rating, title, federation or FIDE id (by index) and the event's name and number of rounds.
 */
export function swissToTrf(players, parsed, { name = "Swiss event", totalRounds = null, info = [], standings = null, initialColour = null } = {}) {
  const blocks = players.map(() => []);
  const set = (p, r, s) => { blocks[p][r] = s; };
  for (const e of parsed.events) {
    const r = e.round;
    if (e.kind === "game") {
      const [ra, rb] = e.ga > e.gb ? ["1", "0"] : e.ga < e.gb ? ["0", "1"] : ["=", "="];
      set(e.a, r, `${pad(e.b + 1, 4)} w ${ra}`);
      set(e.b, r, `${pad(e.a + 1, 4)} b ${rb}`);
    } else if (e.kind === "forfeit") {
      // Colours of an unplayed game carry no meaning; the lower start rank is written as white.
      const [w, b] = e.winner < e.loser ? [e.winner, e.loser] : [e.loser, e.winner];
      set(w, r, `${pad(b + 1, 4)} w ${w === e.winner ? "+" : "-"}`);
      set(b, r, `${pad(w + 1, 4)} b ${b === e.winner ? "+" : "-"}`);
    } else if (e.kind === "bye") set(e.player, r, "0000 - U");
    else set(e.player, r, `0000 - ${{ half: "H", full: "F", zero: "Z" }[e.kind]}`);
  }
  const points = players.map((_, i) => parsed.extra?.[i] ?? 0);
  for (const g of parsed.games) {
    if (g.ga > g.gb) points[g.a] += 1; else if (g.ga < g.gb) points[g.b] += 1; else { points[g.a] += 0.5; points[g.b] += 0.5; }
  }
  for (const i of parsed.byes) points[i] += 1;
  const rank = new Map((standings ?? []).map((r) => [r.index, r.rank]));
  const order = players.map((_, i) => i).sort((x, y) => points[y] - points[x] || x - y);
  order.forEach((i, k) => { if (!rank.has(i)) rank.set(i, k + 1); });
  const lines = [`012 ${name}`];
  for (const [i, n] of players.entries()) {
    const o = info[i] ?? {};
    let line = `001 ${pad(i + 1, 4)} ${pad(o.sex ?? "", 1, false)}${pad(o.title ?? "", 3)} ${pad(n, 33, false)} ${pad(o.rating ?? "", 4)} ${pad(o.federation ?? "", 3, false)} ${pad(o.fideId ?? "", 11)} ${pad(o.birth ?? "", 10, false)} ${pad(points[i].toFixed(1), 4)} ${pad(rank.get(i), 4)}`;
    const rounds = Math.max(blocks[i].length, 0);
    for (let r = 0; r < rounds; r++) line += `  ${blocks[i][r] ?? "        "}`;
    lines.push(line.replace(/\s+$/, ""));
  }
  if (totalRounds) lines.push(`XXR ${totalRounds}`);
  if (initialColour === "W" || initialColour === "B") lines.push(`XXC ${initialColour === "W" ? "white1" : "black1"}`);
  return lines.join("\n") + "\n";
}

/** A round in bbpPairings's output format: the number of boards, then "white black" start ranks, "n 0" for the bye. */
export function pairingsList(round) {
  const rows = round.pairs.map((p) => `${p.white + 1} ${p.black + 1}`);
  if (round.bye !== null) rows.push(`${round.bye + 1} 0`);
  return `${rows.length}\n${rows.join("\n")}\n`;
}
