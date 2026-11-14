// Ranked-ballot counting engine: instant-runoff (IRV), single transferable
// vote (STV, Droop quota, weighted inclusive Gregory transfers) and the
// Schulze Condorcet method, with every round recorded so a result can be
// checked by hand. No dependencies, no network; runs in a browser or Node.
//
// Methods follow their published descriptions; no other implementation's
// code is copied:
// - IRV: eliminate the last-placed candidate until one holds a majority of
//   the ballots still in play.
// - STV: Droop quota floor(valid / (seats + 1)) + 1 (Droop 1881); a surplus
//   moves every paper the elected candidate holds at value surplus / total
//   (the weighted inclusive Gregory method, the transfer the Scottish Local
//   Government Elections Order 2007 uses), values truncated to 5 decimal
//   places. The precision and tie rules are this tool's own choices: it is a
//   faithful general count, not an implementation of any statute.
// - Schulze: M. Schulze, "A new monotonic, clone-independent, reversal
//   symmetric, and Condorcet-consistent single-winner election method",
//   Social Choice and Welfare 36 (2011) 267-303; winning-votes strength.

export const PAPERS = [
  { authors: "Markus Schulze", title: "A new monotonic, clone-independent, reversal symmetric, and Condorcet-consistent single-winner election method", venue: "Social Choice and Welfare 36(2), 267-303", year: 2011, doi: "10.1007/s00355-010-0475-4", url: "https://doi.org/10.1007/s00355-010-0475-4", implemented: "schulze(): winning-votes link strength, strongest paths by Floyd-Warshall widest path, ranking by the number of candidates each beats on strongest paths.", deviations: "A candidate a ballot does not rank is treated as ranked below every ranked one; ties in the final ranking are shown as ties, not broken." },
  { authors: "Henry Richmond Droop", title: "On methods of electing representatives", venue: "Journal of the Statistical Society of London 44(2), 141-202", year: 1881, doi: "10.2307/2339223", url: "https://doi.org/10.2307/2339223", implemented: "stv(): the quota floor(valid ballots / (seats + 1)) + 1.", deviations: "Surpluses move by the weighted inclusive Gregory method truncated to 5 decimal places, a later refinement, not Droop's own transfer rule." },
];

/** Ballot values are integers in units of 1/100000 of a vote. */
export const UNIT = 100000;

// ---------------------------------------------------------------- parsing

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
  "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth"];

/** A rank written as a cell or header: "1", "1st", "Rank 2", "3rd choice", "First preference", "Choice 4". */
export function parseRank(raw) {
  let s = String(raw ?? "").trim().toLowerCase();
  const br = s.match(/\[([^\]]*)\]\s*$/);
  if (br) s = br[1].trim();
  s = s.replace(/\b(?:rank(?:ed|ing)?|choice|preference|pref|place|option|no\.?|#)\b/g, " ").replace(/[\s:.#-]+/g, " ").trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,3})(?:st|nd|rd|th)?$/);
  if (m) return Number(m[1]) >= 1 ? Number(m[1]) : null;
  const i = ORDINALS.indexOf(s);
  return i >= 0 ? i + 1 : null;
}

/** RFC 4180-ish CSV (or tab/semicolon separated) to rows of trimmed cells. */
export function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const counts = { ",": 0, "\t": 0, ";": 0 };
  let q = false;
  for (const ch of firstLine) { if (ch === '"') q = !q; else if (!q && ch in counts) counts[ch]++; }
  const sep = counts["\t"] > counts[","] && counts["\t"] >= counts[";"] ? "\t" : counts[";"] > counts[","] ? ";" : ",";
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += ch;
    } else if (ch === '"' && cell.trim() === "") { cell = ""; quoted = true; }
    else if (ch === sep) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim()); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}

// Form-export columns that are never candidates, even when their cells are small numbers.
const META = /^(?:timestamp|time|date|submitted(?: at)?|email(?: address)?|name|voter(?: id)?|id|response(?: id)?|row|#|no\.?|ip(?: address)?)$/i;

const clean = (s) => String(s).replace(/\s+/g, " ").trim();

/**
 * Read ballots in any of three layouts:
 *  - preference lines: `A > B > C`, `B = C > A` (= is a tie), with an optional
 *    count prefix `12: A > B` or `12 * A > B`;
 *  - one row per ballot, cells in preference order (a header row of
 *    "Rank 1, Rank 2" or "Choice [1st]" columns picks those columns, in rank
 *    order, and ignores others such as a timestamp);
 *  - a grid: a header of candidate names (Google Forms' `Question [Name]` is
 *    read as Name) and a rank number in each cell; equal numbers are a tie,
 *    blanks are unranked.
 * Returns { candidates, ballots: [{ ranking: [[candidate index, ...], ...], count }], format, warnings }.
 */
export function parseBallots(text, options = {}) {
  const warnings = [];
  const names = [];
  const index = new Map();
  const id = (raw) => {
    const name = clean(raw);
    const key = name.toLowerCase();
    if (!index.has(key)) { index.set(key, names.length); names.push(name); }
    return index.get(key);
  };
  for (const c of options.candidates || []) if (clean(c)) id(c);
  const src = String(text ?? "").replace(/^﻿/, "");
  const lines = src.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const raw = []; // [{ groups: [[name, ...], ...], count, line }]
  let format;

  const prefLine = (l) => l.includes(">") || /^\d+\s*[:*x×]\s*\S/i.test(l);
  // Preference lines when the text uses them and either most lines do or there
  // is no CSV separator anywhere (a file where most voters rank one candidate).
  const usesPref = lines.some((l) => l.includes(">") || /^\d+\s*[:*]/.test(l));
  if (lines.length && usesPref && (lines.filter(prefLine).length * 2 >= lines.length || !/[,;\t]/.test(src))) {
    format = "preference lines";
    lines.forEach((line, n) => {
      let count = 1, body = line;
      const m = line.match(/^(\d+)\s*[:*x×]\s*(.*)$/i);
      if (m) { count = Number(m[1]); body = m[2]; }
      const groups = body.split(">").map((g) => g.split("=").map(clean).filter(Boolean)).filter((g) => g.length);
      raw.push({ groups, count, line: n + 1 });
    });
  } else {
    const rows = parseCsv(src);
    const header = rows[0] || [];
    const headerRanks = header.map(parseRank);
    const body = rows.slice(1);
    const rankCols = headerRanks.map((r, i) => (r ? i : -1)).filter((i) => i >= 0);
    const cellIsRank = (c) => c === "" || parseRank(c) !== null;
    // Grid: most header cells are names, and the columns under them hold ranks.
    const gridCols = header.map((h, i) => i).filter((i) => header[i] && headerRanks[i] === null && !META.test(header[i]) &&
      body.length && body.every((r) => cellIsRank(r[i] ?? "")) && body.some((r) => (r[i] ?? "") !== ""));
    if (rankCols.length >= 2 && rankCols.length >= gridCols.length) {
      format = "one row per ballot (rank columns)";
      const order = rankCols.slice().sort((a, b) => headerRanks[a] - headerRanks[b]);
      body.forEach((r, n) => raw.push({ groups: order.map((i) => r[i] ?? "").map((c) => (c ? [c] : [])), count: 1, line: n + 2 }));
    } else if (gridCols.length >= 2) {
      format = "grid (one column per candidate, rank in each cell)";
      const label = (h) => { const m = h.match(/\[([^\]]+)\]\s*$/); return m ? m[1] : h; };
      const ignored = header.filter((h, i) => h && !gridCols.includes(i));
      if (ignored.length) warnings.push(`Ignored column${ignored.length > 1 ? "s" : ""} that hold no ranks: ${ignored.join(", ")}.`);
      for (const i of gridCols) id(label(header[i]));
      body.forEach((r, n) => {
        const byRank = new Map();
        for (const i of gridCols) {
          const k = parseRank(r[i] ?? "");
          if (k === null) continue;
          if (!byRank.has(k)) byRank.set(k, []);
          byRank.get(k).push(label(header[i]));
        }
        const groups = [...byRank.keys()].sort((a, b) => a - b).map((k) => byRank.get(k));
        raw.push({ groups, count: 1, line: n + 2 });
      });
    } else {
      format = "one row per ballot (names in preference order)";
      const looksHeader = header.length && header.every((c) => !c || parseRank(c) !== null || META.test(c));
      (looksHeader ? body : rows).forEach((r, n) => raw.push({ groups: r.map((c) => (c ? [c] : [])), count: 1, line: n + (looksHeader ? 2 : 1) }));
    }
  }

  const ballots = [];
  let empty = 0, repeats = 0, ties = 0, skipped = 0;
  for (const b of raw) {
    if (!(b.count >= 1)) continue;
    const seen = new Set();
    const ranking = [];
    let gap = false;
    for (const g of b.groups) {
      if (!g.length) { gap = true; continue; }
      const ids = [];
      for (const n of g) {
        const c = id(n);
        if (seen.has(c)) { repeats += b.count; continue; }
        seen.add(c); ids.push(c);
      }
      if (!ids.length) continue;
      if (gap && ranking.length) skipped += b.count;
      gap = false;
      if (ids.length > 1) ties += b.count;
      ranking.push(ids);
    }
    if (!ranking.length) { empty += b.count; continue; }
    ballots.push({ ranking, count: b.count });
  }
  if (empty) warnings.push(`${empty} blank ballot${empty > 1 ? "s were" : " was"} left out of every count.`);
  if (repeats) warnings.push(`${repeats} ballot${repeats > 1 ? "s rank" : " ranks"} a candidate twice; only the highest ranking of each candidate is kept.`);
  if (skipped) warnings.push(`${skipped} ballot${skipped > 1 ? "s skip" : " skips"} a rank; the next ranked candidate moves up.`);
  if (ties) warnings.push(`${ties} ballot${ties > 1 ? "s give" : " gives"} two or more candidates the same rank. Schulze reads that as no preference between them; IRV and STV stop using a ballot when its next live choice is such a tie (it is exhausted, as most ranked-choice rules treat an overvote).`);
  const total = ballots.reduce((s, b) => s + b.count, 0);
  return { candidates: names, ballots, total, format: format || "none", warnings };
}

// ---------------------------------------------------------------- tie breaks

function rng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick one of `tied` (lowest when want = "low"): look back through earlier
 * rounds for the most recent one where their votes differed, else draw by lot.
 */
function breakTie(tied, history, want, lot, names) {
  let pool = tied.slice();
  for (let r = history.length - 1; r >= 0 && pool.length > 1; r--) {
    const v = pool.map((c) => history[r][c] ?? 0);
    const best = want === "low" ? Math.min(...v) : Math.max(...v);
    const next = pool.filter((c, i) => v[i] === best);
    if (next.length < pool.length) pool = next;
  }
  if (pool.length === 1) return { pick: pool[0], lot: false, how: `tie between ${tied.map((c) => names[c]).join(", ")} broken by earlier-round votes` };
  const pick = pool[Math.floor(lot() * pool.length)];
  return { pick, lot: true, how: `tie between ${pool.map((c) => names[c]).join(", ")} drawn by lot` };
}

/** The candidate the ballot now counts for, or -1 if exhausted (no live choice left, or a tie at its next live rank). */
function nextChoice(ranking, live) {
  for (const g of ranking) {
    const l = g.filter((c) => live[c]);
    if (l.length === 1) return l[0];
    if (l.length > 1) return -1;
  }
  return -1;
}

// ---------------------------------------------------------------- IRV

/** Instant-runoff (single winner). Votes are whole ballots. */
export function irv(parsed, options = {}) {
  const { candidates: names, ballots } = parsed;
  const n = names.length;
  const lot = rng(options.seed ?? 1);
  const live = Array(n).fill(true);
  const dead = ballots.map(() => false);
  const rounds = [];
  const history = [];
  let winner = -1;
  while (winner < 0) {
    const tally = Array(n).fill(0);
    let exhausted = 0;
    // A ballot that exhausts stays exhausted, even if the candidates it tied
    // are later eliminated: the same rule the STV count applies to a paper.
    ballots.forEach((b, i) => {
      const c = dead[i] ? -1 : nextChoice(b.ranking, live);
      if (c < 0) { dead[i] = true; exhausted += b.count; } else tally[c] += b.count;
    });
    const liveIds = [...Array(n).keys()].filter((c) => live[c]);
    const active = parsed.total - exhausted;
    const round = { votes: Object.fromEntries(liveIds.map((c) => [names[c], tally[c]])), exhausted, active };
    rounds.push(round);
    const top = liveIds.filter((c) => tally[c] * 2 > active);
    if (top.length) { winner = top[0]; round.action = `${names[winner]} has ${tally[winner]} of ${active} live ballots, a majority, and wins.`; break; }
    if (liveIds.length === 1) { winner = liveIds[0]; round.action = `${names[winner]} is the last candidate left and wins.`; break; }
    if (!liveIds.length) { round.action = "No ballots rank any candidate."; break; }
    const low = Math.min(...liveIds.map((c) => tally[c]));
    const tied = liveIds.filter((c) => tally[c] === low);
    let out = tied[0], note = "";
    if (tied.length > 1) { const t = breakTie(tied, history, "low", lot, names); out = t.pick; note = ` (${t.how})`; round.tie = t.how; round.byLot = t.lot; }
    history.push(tally.slice());
    live[out] = false;
    round.eliminated = names[out];
    round.action = `${names[out]} is last with ${low} and is eliminated${note}.`;
  }
  return { method: "irv", winner: winner >= 0 ? names[winner] : null, rounds };
}

// ---------------------------------------------------------------- STV

/** Single transferable vote, Droop quota, weighted inclusive Gregory transfers. */
export function stv(parsed, seats, options = {}) {
  const { candidates: names, ballots } = parsed;
  const n = names.length;
  seats = Math.max(1, Math.min(Math.floor(Number(seats) || 1), n || 1));
  const lot = rng(options.seed ?? 1);
  const quotaVotes = Math.floor(parsed.total / (seats + 1)) + 1;
  const quota = quotaVotes * UNIT;
  const status = Array(n).fill("hopeful"); // hopeful | elected | excluded
  const isLive = () => status.map((s) => s === "hopeful");
  const piles = Array.from({ length: n }, () => []); // parcels { b, value (per ballot), count }
  const votes = Array(n).fill(0);
  let exhausted = 0, lost = 0;
  const elected = [];
  const pending = []; // elected, surplus not yet moved
  const rounds = [];
  const history = [];

  const place = (parcel, live) => {
    const c = nextChoice(ballots[parcel.b].ranking, live);
    if (c < 0) { exhausted += parcel.value * parcel.count; return; }
    piles[c].push(parcel);
    votes[c] += parcel.value * parcel.count;
  };
  const live0 = isLive();
  ballots.forEach((b, i) => place({ b: i, value: UNIT, count: b.count }, live0));

  const snapshot = (action, extra = {}) => {
    rounds.push({
      votes: Object.fromEntries(names.map((name, c) => [name, votes[c]]).filter(([, v], c) => status[c] !== "excluded" || v)),
      status: Object.fromEntries(names.map((name, c) => [name, status[c]])),
      exhausted, lost, action, ...extra,
    });
    history.push(votes.slice());
  };
  snapshot(`First preferences counted. ${parsed.total} valid ballots, ${seats} seat${seats > 1 ? "s" : ""}: the quota is floor(${parsed.total} / ${seats + 1}) + 1 = ${quotaVotes}.`);

  let guard = 0;
  while (elected.length < seats && guard++ < 10 * (n + 2)) {
    // 1. Anyone at or over quota is elected, largest first.
    const reached = [...Array(n).keys()].filter((c) => status[c] === "hopeful" && votes[c] >= quota).sort((a, b) => votes[b] - votes[a]);
    if (reached.length) {
      for (const c of reached) { if (elected.length < seats) { status[c] = "elected"; elected.push(c); if (votes[c] > quota) pending.push(c); } }
      snapshot(`${reached.filter((c) => status[c] === "elected").map((c) => names[c]).join(", ")} reach${reached.length > 1 ? "" : "es"} the quota of ${quotaVotes} and ${reached.length > 1 ? "are" : "is"} elected.`, { elected: reached.map((c) => names[c]) });
      continue;
    }
    // 2. As many hopefuls as seats left: they are all elected.
    const hopefuls = [...Array(n).keys()].filter((c) => status[c] === "hopeful");
    if (hopefuls.length <= seats - elected.length) {
      const order = hopefuls.sort((a, b) => votes[b] - votes[a]);
      for (const c of order) { status[c] = "elected"; elected.push(c); }
      snapshot(`${order.map((c) => names[c]).join(", ")} ${order.length > 1 ? "fill" : "fills"} the remaining seat${order.length > 1 ? "s" : ""}: no more candidates than seats are left.`, { elected: order.map((c) => names[c]) });
      break;
    }
    // 3. Move the largest surplus.
    if (pending.length) {
      const big = Math.max(...pending.map((c) => votes[c]));
      const tied = pending.filter((c) => votes[c] === big);
      let c = tied[0], note = "";
      let byLot = false;
      if (tied.length > 1) { const t = breakTie(tied, history, "high", lot, names); c = t.pick; note = ` (${t.how})`; byLot = t.lot; }
      pending.splice(pending.indexOf(c), 1);
      const total = votes[c];
      const surplus = total - quota;
      const live = isLive();
      const before = exhausted;
      let moved = 0;
      // An elected candidate's papers never move again, so the pile is dropped.
      for (const p of piles[c]) {
        const value = Math.floor((p.value * surplus) / total);
        moved += value * p.count;
        if (value > 0) place({ b: p.b, value, count: p.count }, live);
      }
      piles[c] = [];
      const residue = surplus - moved;
      lost += residue;
      votes[c] = quota;
      snapshot(`${names[c]}'s surplus of ${fmt(surplus)} moves on: every paper they hold passes to its next hopeful choice at ${fmt(surplus)} / ${fmt(total)} of its value${note}.`,
        { byLot, transfer: { from: names[c], surplus, value: surplus / total, exhaustedNow: exhausted - before, lostToRounding: residue } });
      continue;
    }
    // 4. Exclude the lowest hopeful.
    const low = Math.min(...hopefuls.map((c) => votes[c]));
    const tied = hopefuls.filter((c) => votes[c] === low);
    let c = tied[0], note = "", byLot = false;
    if (tied.length > 1) { const t = breakTie(tied, history, "low", lot, names); c = t.pick; note = ` (${t.how})`; byLot = t.lot; }
    status[c] = "excluded";
    const live = isLive();
    const pile = piles[c];
    piles[c] = [];
    votes[c] = 0;
    for (const p of pile) place(p, live);
    snapshot(`${names[c]} is lowest with ${fmt(low)} and is excluded; their papers pass on at their current value${note}.`, { excluded: names[c], byLot, tie: note ? note.slice(2, -1) : undefined });
  }
  return { method: "stv", seats, quota: quotaVotes, elected: elected.map((c) => names[c]), rounds };
}

/** Format a value in vote units as a decimal number of votes. */
export function fmt(units) {
  const s = (units / UNIT).toFixed(5);
  return s.replace(/\.?0+$/, "");
}

// ---------------------------------------------------------------- Schulze

/** d[i][j] = ballots that rank i strictly above j (a ranked candidate is above every unranked one). */
export function pairwise(parsed) {
  const n = parsed.candidates.length;
  const d = Array.from({ length: n }, () => Array(n).fill(0));
  for (const b of parsed.ballots) {
    const rank = Array(n).fill(Infinity);
    b.ranking.forEach((g, k) => g.forEach((c) => { rank[c] = k; }));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (rank[i] < rank[j]) d[i][j] += b.count;
  }
  return d;
}

export function schulze(parsed) {
  const names = parsed.candidates;
  const n = names.length;
  const d = pairwise(parsed);
  const p = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i !== j && d[i][j] > d[j][i] ? d[i][j] : 0)));
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) if (i !== k) for (let j = 0; j < n; j++) {
    if (j !== i && j !== k) p[i][j] = Math.max(p[i][j], Math.min(p[i][k], p[k][j]));
  }
  const wins = names.map((_, i) => names.reduce((s, _, j) => s + (i !== j && p[i][j] > p[j][i] ? 1 : 0), 0));
  const order = [...Array(n).keys()].sort((a, b) => wins[b] - wins[a] || names[a].localeCompare(names[b]));
  const ranking = [];
  for (const c of order) {
    const last = ranking[ranking.length - 1];
    if (last && wins[last[0]] === wins[c]) last.push(c); else ranking.push([c]);
  }
  const winners = ranking.length ? ranking[0].map((c) => names[c]) : [];
  const cw = [...Array(n).keys()].find((i) => names.every((_, j) => i === j || d[i][j] > d[j][i]));
  return {
    method: "schulze",
    winners,
    ranking: ranking.map((g) => g.map((c) => names[c])),
    condorcetWinner: cw === undefined ? null : names[cw],
    pairwise: d,
    strongestPaths: p,
  };
}

// ---------------------------------------------------------------- one call

/**
 * Count a pasted set of ballots every supported way.
 * input: { ballots: text, seats = 1, seed = 1, candidates?: [names] }
 */
export function analyze(input = {}) {
  const parsed = parseBallots(input.ballots ?? "", { candidates: input.candidates });
  const seats = Math.max(1, Math.floor(Number(input.seats) || 1));
  const seed = input.seed ?? 1;
  const out = { parsed: { candidates: parsed.candidates, total: parsed.total, distinct: parsed.ballots.length, format: parsed.format }, warnings: parsed.warnings.slice() };
  if (!parsed.total || parsed.candidates.length < 2) {
    out.error = parsed.candidates.length < 2 && parsed.total ? "Only one candidate appears on the ballots; there is nothing to count." : "No ballots found. Paste one ballot per line (A > B > C) or a CSV export.";
    return out;
  }
  if (seats >= parsed.candidates.length) out.warnings.push(`${seats} seats for ${parsed.candidates.length} candidates: every candidate is elected.`);
  out.irv = irv(parsed, { seed });
  out.stv = stv(parsed, seats, { seed });
  out.schulze = schulze(parsed);
  out.seats = out.stv.seats;
  const firsts = Object.fromEntries(parsed.candidates.map((c) => [c, 0]));
  for (const b of parsed.ballots) if (b.ranking[0].length === 1) firsts[parsed.candidates[b.ranking[0][0]]] += b.count;
  out.firstPreferences = firsts;
  const plurality = Object.entries(firsts).sort((a, b) => b[1] - a[1]);
  out.plurality = plurality.filter(([, v]) => v === plurality[0][1]).map(([c]) => c);
  const cw = out.schulze.condorcetWinner;
  out.summary = `${parsed.total} ballots, ${parsed.candidates.length} candidates. Instant runoff elects ${out.irv.winner} after ${out.irv.rounds.length} round${out.irv.rounds.length > 1 ? "s" : ""}. ` +
    `STV for ${out.stv.seats} seat${out.stv.seats > 1 ? "s" : ""} (quota ${out.stv.quota}) elects ${out.stv.elected.join(", ")}. ` +
    `Schulze ranks ${out.schulze.ranking.map((g) => g.join(" = ")).join(" > ")}; ` +
    (cw ? `${cw} beats every other candidate head to head${cw === out.irv.winner ? "" : `, though instant runoff elects ${out.irv.winner}`}.` : "no candidate beats every other head to head.");
  if (out.stv.rounds.some((r) => r.byLot) || out.irv.rounds.some((r) => r.byLot)) {
    out.warnings.push(`A tie was decided by lot (seed ${seed}). Your rules may say how ties are broken; follow them and use this count only to see where the tie arose.`);
  }
  return out;
}

/** Round-by-round CSV of the IRV and STV counts and the pairwise matrix. */
export function reportCsv(result) {
  const q = (v) => { const s = String(v ?? ""); return /^[=+\-@\t\r]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const names = result.parsed.candidates;
  const lines = [];
  if (result.irv) {
    lines.push(["Instant runoff round", ...names, "Exhausted", "Action"].map(q).join(","));
    result.irv.rounds.forEach((r, i) => lines.push([i + 1, ...names.map((c) => r.votes[c] ?? ""), r.exhausted, r.action].map(q).join(",")));
    lines.push("");
  }
  if (result.stv) {
    lines.push([`STV stage (${result.stv.seats} seats, quota ${result.stv.quota})`, ...names, "Exhausted", "Lost to rounding", "Action"].map(q).join(","));
    result.stv.rounds.forEach((r, i) => lines.push([i + 1, ...names.map((c) => (r.votes[c] === undefined ? "" : fmt(r.votes[c]))), fmt(r.exhausted), fmt(r.lost), r.action].map(q).join(",")));
    lines.push("");
  }
  if (result.schulze) {
    lines.push(["Ballots ranking row over column", ...names].map(q).join(","));
    result.schulze.pairwise.forEach((row, i) => lines.push([names[i], ...row.map((v, j) => (i === j ? "" : v))].map(q).join(",")));
  }
  return lines.join("\n") + "\n";
}

export const EXAMPLE = {
  // The capital-city example used to explain IRV and Condorcet counts
  // (Wikipedia, "Instant-runoff voting" and "Condorcet method"): voters
  // rank four cities by distance from home.
  ballots: [
    "42: Memphis > Nashville > Chattanooga > Knoxville",
    "26: Nashville > Chattanooga > Knoxville > Memphis",
    "15: Chattanooga > Knoxville > Nashville > Memphis",
    "17: Knoxville > Chattanooga > Nashville > Memphis",
  ].join("\n"),
  seats: 1,
};
