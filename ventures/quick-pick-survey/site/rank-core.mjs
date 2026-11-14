// The rank page's logic, pure and DOM-free so node --test can run it
// (rank-core.test.mjs). The model is the app's own: site/engine/ is generated
// from src/lib/btRefit.ts and favouriteSet.ts by scripts/build-rank-engine.mjs.
import { refitRatings, cholesky } from "./engine/btRefit.mjs";
import { favouriteSet } from "./engine/favouriteSet.mjs";

export const MAX_ITEMS = 60;
export const MIN_ITEMS = 3;
export const MAX_ITEM_LENGTH = 120;
/**
 * Stop asking once orderConfidence reaches this. Measured on simulated
 * respondents (docs/RANK-PAGE.md): at 0.9 the shown order's true Spearman
 * with the respondent's real order was about 0.94 for ordinary noise.
 */
export const STOP_CONFIDENCE = 0.9;
export const RANK_DRAWS = 1500;

/**
 * One option per line; blank lines, list bullets and repeats dropped.
 * Idempotent (parseList(parseList(x).join("\n")) is parseList(x)): a shared
 * link is parsed again on the respondent's side, and any change there gives
 * a different listId, so the creator would refuse every respondent's code.
 * Hence every leading bullet goes, the cut is by code point (no half emoji)
 * and the trim comes after the cut.
 */
export function parseList(text) {
  const seen = new Set();
  const items = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const stripped = raw.replace(/^\s*(?:(?:[-*•]|\d+[.)])\s+)+/, "").trim();
    const line = Array.from(stripped).slice(0, MAX_ITEM_LENGTH).join("").trim();
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(line);
    if (items.length === MAX_ITEMS) break;
  }
  return items;
}

/** Short, stable fingerprint of a list (FNV-1a over the items), so codes from different lists are never merged. */
export function listId(items) {
  let h = 0x811c9dc5;
  for (const ch of items.join("\n")) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** The list (and an optional question) as a URL fragment: the fragment never reaches a server. */
export function encodeList({ title = "", items }) {
  return toBase64Url(JSON.stringify({ v: 1, t: title, i: items }));
}
export function decodeList(fragment) {
  try {
    const d = JSON.parse(fromBase64Url(String(fragment).replace(/^#/, "")));
    if (!d || d.v !== 1 || !Array.isArray(d.i)) return null;
    const items = parseList(d.i.map(String).join("\n"));
    if (items.length < MIN_ITEMS) return null;
    return { title: String(d.t || "").slice(0, 200), items };
  } catch {
    return null;
  }
}

/**
 * Answers are [winnerIndex, loserIndex, tie] triples. A result code carries
 * them with the list's fingerprint and an optional name: "QP1." + base64url.
 */
export function encodeAnswers({ items, answers, name = "" }) {
  const a = answers.map(([w, l, t]) => `${w.toString(36)}.${l.toString(36)}${t ? "=" : ""}`).join(",");
  return "QP1." + toBase64Url(JSON.stringify({ l: listId(items), n: String(name).slice(0, 60), a }));
}
export function decodeAnswers(code, items) {
  const m = /^QP1\.([A-Za-z0-9_-]+)$/.exec(String(code).trim());
  if (!m) return { error: "not a Quick Pick result code" };
  let d;
  try {
    d = JSON.parse(fromBase64Url(m[1]));
  } catch {
    return { error: "the code is damaged (copy it again in full)" };
  }
  if (d.l !== listId(items)) return { error: "this code is for a different list" };
  const answers = [];
  for (const part of String(d.a || "").split(",").filter(Boolean)) {
    const pm = /^([0-9a-z]+)\.([0-9a-z]+)(=?)$/.exec(part);
    if (!pm) return { error: "the code is damaged (copy it again in full)" };
    const w = parseInt(pm[1], 36), l = parseInt(pm[2], 36);
    if (w >= items.length || l >= items.length || w === l) return { error: "the code is damaged (copy it again in full)" };
    answers.push([w, l, pm[3] === "="]);
  }
  return { name: String(d.n || ""), answers };
}

const ids = (n) => Array.from({ length: n }, (_, i) => String(i));

/** The refit over the answers: posterior mode and covariance on the logit scale. */
export function fit(n, answers) {
  const r = refitRatings(ids(n), answers.map(([w, l, t]) => ({ winner: String(w), loser: String(l), tie: !!t })));
  return { mu: r.mu, cov: r.cov, n };
}

const normalCdf = (z) => {
  // Abramowitz-Stegun 7.1.26 on erf; error under 1.5e-7, plenty for a progress bar.
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
};

export function diffVar({ cov, n }, i, j) {
  return Math.max(cov[i * n + i] + cov[j * n + j] - 2 * cov[i * n + j], 1e-12);
}

/** Chance item i is above item j under the posterior. */
export function chanceAbove(f, i, j) {
  return normalCdf((f.mu[i] - f.mu[j]) / Math.sqrt(diffVar(f, i, j)));
}

/** Items in posterior-mode order, best first (index breaks ties so the order is stable). */
export function order(f) {
  return f.mu.map((m, i) => [m, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => i);
}

/** A soft cap on questions, about 2 n log2 n, so a list with near-ties still ends. */
export function suggestedMax(n) {
  return Math.max(6, Math.ceil(2 * n * Math.log2(n)));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The next pair to ask: the one whose answer is expected to tell the most
 * about the order, scored as p(1 - p) times the posterior variance of the
 * difference (the expected drop in that variance from one logistic answer,
 * to first order). In "favourite" mode only items that could still be the
 * favourite (99% set) are paired. The last pair asked is never repeated, and
 * which option sits on the left is a coin flip, so screen position cannot
 * build up into the ranking. Returns [left, right] indices.
 */
export function nextPair(f, answers, { mode = "order", seed = 1 } = {}) {
  const n = f.n;
  let pool = Array.from({ length: n }, (_, i) => i);
  if (mode === "favourite") {
    const fav = favouriteSet(f.mu, f.cov, { level: 0.99, draws: 1000, seed: 0x5eed + answers.length });
    if (fav.members.length >= 2) pool = fav.members;
  }
  const last = answers.at(-1);
  const asked = new Map();
  for (const [w, l] of answers) {
    const k = w < l ? `${w},${l}` : `${l},${w}`;
    asked.set(k, (asked.get(k) || 0) + 1);
  }
  const rand = mulberry32(seed * 2654435761 + answers.length);
  let best = null, bestScore = -Infinity;
  for (let a = 0; a < pool.length; a++) {
    for (let b = a + 1; b < pool.length; b++) {
      const i = pool[a], j = pool[b];
      if (last && ((last[0] === i && last[1] === j) || (last[0] === j && last[1] === i)) && pool.length > 2) continue;
      const v = diffVar(f, i, j);
      const p = 1 / (1 + Math.exp(-(f.mu[i] - f.mu[j])));
      // A small penalty per repeat spreads questions; jitter breaks exact ties without bias.
      const score = (p * (1 - p) * v) / (1 + 0.5 * (asked.get(`${i},${j}`) || 0)) * (1 + 1e-6 * rand());
      if (score > bestScore) { bestScore = score; best = [i, j]; }
    }
  }
  return rand() < 0.5 ? best : [best[1], best[0]];
}

/**
 * Draws orders from the Gaussian posterior: ranks[item][draw] (1 = top) and
 * how often each item came first. Fixed seed, so the same answers always
 * give the same table.
 */
export function sampleRanks(f, { draws = RANK_DRAWS, seed = 0x51ce } = {}) {
  const n = f.n;
  const l = cholesky(Float64Array.from(f.cov, (x, k) => x + (k % (n + 1) === 0 ? 1e-9 : 0)), n);
  const rand = mulberry32(seed);
  const ranks = Array.from({ length: n }, () => new Uint16Array(draws));
  const top = new Array(n).fill(0);
  const z = new Float64Array(n), s = new Float64Array(n);
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let d = 0; d < draws; d++) {
    for (let a = 0; a < n; a += 2) {
      const u = 1 - rand(), v = rand();
      const r = Math.sqrt(-2 * Math.log(u));
      z[a] = r * Math.cos(2 * Math.PI * v);
      if (a + 1 < n) z[a + 1] = r * Math.sin(2 * Math.PI * v);
    }
    for (let a = 0; a < n; a++) {
      let x = f.mu[a];
      for (let b = 0; b <= a; b++) x += l[a * n + b] * z[b];
      s[a] = x;
    }
    idx.sort((p, q) => s[q] - s[p]);
    idx.forEach((item, r) => (ranks[item][d] = r + 1));
    top[idx[0]]++;
  }
  return { ranks, top, draws };
}

/**
 * Rank ranges: for each item, the middle 90% of its rank over the posterior
 * draws, and its chance of being the favourite, in posterior-mode order.
 */
export function rankTable(f, options = {}) {
  const { ranks, top, draws } = sampleRanks(f, options);
  const lo = Math.floor(0.05 * draws), hi = Math.min(draws - 1, Math.ceil(0.95 * draws) - 1);
  return order(f).map((i, k) => {
    const sorted = Array.from(ranks[i]).sort((a, b) => a - b);
    return { item: i, rank: k + 1, low: sorted[lo], high: sorted[hi], favourite: top[i] / draws, score: f.mu[i] };
  });
}

/**
 * How settled the order is: the posterior mean of the Spearman correlation
 * between a plausible order (a draw) and the order shown (the mode). 1 means
 * every order the answers allow is the one shown; an unseen list reads near 0.
 * Two options a person genuinely finds close cost little here (one swapped
 * neighbour is a small Spearman loss), so unlike a "every neighbour settled"
 * rule it can be reached by a respondent who answers with ordinary noise.
 */
export function orderConfidence(f, { draws = 400, seed = 0xc0f1 } = {}) {
  const n = f.n;
  if (n < 2) return 1;
  const { ranks } = sampleRanks(f, { draws, seed });
  const shown = new Array(n);
  order(f).forEach((item, k) => (shown[item] = k + 1));
  let sum = 0;
  for (let d = 0; d < draws; d++) {
    let d2 = 0;
    for (let i = 0; i < n; i++) d2 += (ranks[i][d] - shown[i]) ** 2;
    sum += 1 - (6 * d2) / (n * (n * n - 1));
  }
  return sum / draws;
}

/** Scores on a 0-100 scale for display: the chance the item beats an average item on the list. */
export function displayScore(f, i) {
  const mean = f.mu.reduce((a, b) => a + b, 0) / f.n;
  return Math.round(100 / (1 + Math.exp(-(f.mu[i] - mean))));
}

/** The results as CSV, for a spreadsheet. */
/**
 * One quoted CSV cell. An option typed as "=HYPERLINK(...)" or "+1 call" would
 * run as a formula when the file is opened in a spreadsheet, so a cell that
 * starts with =, +, -, @, tab or CR (and is not a plain number) gets a leading
 * apostrophe, the usual guard against formula injection.
 */
export function csvCell(c) {
  let s = String(c);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function resultsCsv(items, f, table) {
  const q = csvCell;
  const rows = [["rank", "option", "rank_range_90", "chance_favourite", "score_0_100"].join(",")];
  for (const r of table) rows.push([r.rank, q(items[r.item]), q(r.low === r.high ? `${r.low}` : `${r.low}-${r.high}`), r.favourite.toFixed(3), displayScore(f, r.item)].join(","));
  return rows.join("\n") + "\n";
}

/**
 * A team's combined order from several people's codes. Each person's answers
 * are refit alone, then the team score of an item is the mean of the
 * people's centred scores, so a person who answered more does not count more
 * than one who answered less. `agreement` is the mean pairwise Spearman
 * correlation between people's orders (1 = everyone agrees).
 */
export function combine(items, people) {
  const n = items.length;
  const fits = people.map((p) => fit(n, p.answers));
  const centred = fits.map((f) => {
    const m = f.mu.reduce((a, b) => a + b, 0) / n;
    return f.mu.map((x) => x - m);
  });
  const team = Array.from({ length: n }, (_, i) => centred.reduce((a, c) => a + c[i], 0) / Math.max(1, centred.length));
  const teamOrder = team.map((m, i) => [m, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => i);
  const rankOf = (f) => {
    const r = new Array(n);
    order(f).forEach((item, k) => (r[item] = k));
    return r;
  };
  const ranks = fits.map(rankOf);
  let sum = 0, pairs = 0;
  for (let a = 0; a < ranks.length; a++) for (let b = a + 1; b < ranks.length; b++) {
    let d2 = 0;
    for (let i = 0; i < n; i++) d2 += (ranks[a][i] - ranks[b][i]) ** 2;
    sum += 1 - (6 * d2) / (n * (n * n - 1));
    pairs++;
  }
  // Where people disagree most: the spread of each item's rank across people.
  const spread = Array.from({ length: n }, (_, i) => {
    const r = ranks.map((x) => x[i] + 1);
    return { item: i, best: Math.min(...r), worst: Math.max(...r) };
  });
  return {
    order: teamOrder.map((i, k) => ({ item: i, rank: k + 1, score: team[i], best: spread[i].best, worst: spread[i].worst, firsts: ranks.filter((r) => r[i] === 0).length })),
    agreement: pairs ? sum / pairs : null,
    people: people.length,
  };
}
