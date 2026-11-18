// Pairwise ranking: Bradley-Terry strengths from head-to-head results, with
// ties (Davidson 1970), a home or first-mover advantage (Davidson & Beaver
// 1977), standard errors from the observed information, simulated rank
// ranges, and Ford's (1957) check that the ranking exists at all.
//
// Pure functions, no DOM, no network, seeded randomness only. Implemented
// from the papers' mathematics; no third-party code was ported.
//
// The model. Each player i has a log-strength lambda_i. In a game between i
// (listed first) and j, with h = 1 when the first-listed side has the home or
// first-mover advantage and 0 otherwise:
//
//   u_i = lambda_i + alpha * h
//   u_j = lambda_j
//   u_t = delta + (u_i + u_j) / 2           (only when ties are modelled)
//
//   P(i wins) = e^u_i / S,  P(j wins) = e^u_j / S,  P(tie) = e^u_t / S,
//   S = e^u_i + e^u_j + e^u_t.
//
// With pi = e^lambda, H = e^alpha and nu = e^delta this is Davidson's (1970)
// tie model, P(i wins) = H pi_i / (H pi_i + pi_j + nu sqrt(H pi_i pi_j)), with
// a multiplicative order effect in the manner of Davidson & Beaver (1977).
// Without ties it is Bradley & Terry (1952). Written this way every
// probability is a softmax of utilities linear in the parameters, so the
// log-likelihood is concave and Newton's method converges from zero whenever
// the maximum exists (Hunter 2004 gives the existence condition: the
// "who beat whom" digraph is strongly connected, Ford 1957 / Zermelo 1929).

export const PAPERS = [
  { authors: "Ralph Allan Bradley, Milton E. Terry", title: "Rank Analysis of Incomplete Block Designs: I. The Method of Paired Comparisons", venue: "Biometrika 39(3/4), 324-345", year: 1952, doi: "10.2307/2334029", url: "https://doi.org/10.2307/2334029", implemented: "The paired-comparison model P(i beats j) = pi_i / (pi_i + pi_j), fitted by maximum likelihood.", deviations: "Fitted by Newton-Raphson on log-strengths rather than the paper's iterative tables." },
  { authors: "Ernst Zermelo", title: "Die Berechnung der Turnier-Ergebnisse als ein Maximumproblem der Wahrscheinlichkeitsrechnung", venue: "Mathematische Zeitschrift 29, 436-460", year: 1929, doi: "10.1007/BF01180541", url: "https://doi.org/10.1007/BF01180541", implemented: "The same model, proposed earlier for chess tournaments, and the fixed-point iteration that the MM algorithm generalises.", deviations: "None." },
  { authors: "Lester R. Ford, Jr.", title: "Solution of a Ranking Problem from Binary Comparisons", venue: "The American Mathematical Monthly 64(8), 28-33", year: 1957, doi: "10.1080/00029890.1957.11989117", url: "https://doi.org/10.1080/00029890.1957.11989117", implemented: "The existence condition: a finite maximum-likelihood ranking exists exactly when, however the players are split in two, someone in each part beat someone in the other. Checked with strongly connected components.", deviations: "Ties count as a result in both directions in the graph. With ties or a home term the condition is necessary but not sufficient (one win and one tie between two players still has its maximum at infinity), so the fit also checks for a parameter running off and then refits with a normal prior on every parameter, with a warning." },
  { authors: "Roger R. Davidson", title: "On Extending the Bradley-Terry Model to Accommodate Ties in Paired Comparison Experiments", venue: "Journal of the American Statistical Association 65(329), 317-328", year: 1970, doi: "10.1080/01621459.1970.10481082", url: "https://doi.org/10.1080/01621459.1970.10481082", implemented: "The tie model P(tie) = nu sqrt(pi_i pi_j) / (pi_i + pi_j + nu sqrt(pi_i pi_j)), with nu estimated.", deviations: "None." },
  { authors: "Roger R. Davidson, Robert J. Beaver", title: "On Extending the Bradley-Terry Model to Incorporate Within-Pair Order Effects", venue: "Biometrics 33(4), 693-702", year: 1977, doi: "10.2307/2529467", url: "https://doi.org/10.2307/2529467", implemented: "A multiplicative order (home) effect on the first-listed side, estimated jointly with the strengths and the tie parameter.", deviations: "The home factor multiplies the first side's strength inside the tie term too (geometric mean of the two home-adjusted strengths), which keeps the model a softmax with a concave log-likelihood." },
  { authors: "David R. Hunter", title: "MM Algorithms for Generalized Bradley-Terry Models", venue: "The Annals of Statistics 32(1), 384-406", year: 2004, doi: "10.1214/aos/1079120141", url: "https://doi.org/10.1214/aos/1079120141", implemented: "The MM algorithm for the plain model (exported as fitMM and used in the tests as a second, independent fit), and the statement of Ford's condition used for the existence check.", deviations: "Newton-Raphson is the default fitter because it also yields the information matrix for standard errors." },
  { authors: "Arpad E. Elo", title: "The Rating of Chessplayers, Past and Present", venue: "Arco Publishing, New York", year: 1978, url: "https://archive.org/details/ratingofchesspla00unse", implemented: "Only the display scale: rating = 1500 + 400 log10(pi), so a 400-point gap means 10 to 1 odds of winning between equals.", deviations: "The ratings are Bradley-Terry maximum-likelihood estimates from all games at once, not Elo's sequential updates." },
];

export const DEFAULTS = { ties: "auto", home: "auto", priorSd: 0, level: 0.95, draws: 4000, seed: 20261118, maxPlayers: 2000, maxRows: 200000 };

const ELO = 400 / Math.LN10;

// ---------- small numerics ----------

export function erfc(x) {
  // Series for erf below 2.5, Lentz's continued fraction above: about 1e-15.
  if (Number.isNaN(x)) return NaN;
  const z = Math.abs(x);
  let r;
  if (z < 2.5) {
    let term = z, sum = z;
    for (let k = 1; k < 200; k++) {
      term *= (-z * z) / k;
      const add = term / (2 * k + 1);
      sum += add;
      if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
    }
    r = 1 - (2 / Math.sqrt(Math.PI)) * sum;
  } else {
    // erfc(z) = exp(-z^2)/sqrt(pi) * 1/(z + 1/2/(z + 1/(z + 3/2/(z + ...))))
    const tiny = 1e-300;
    let f = z, C = z, D = 0;
    for (let k = 1; k < 500; k++) {
      const a = k / 2;
      D = z + a * D; D = Math.abs(D) < tiny ? tiny : D; D = 1 / D;
      C = z + a / C; C = Math.abs(C) < tiny ? tiny : C;
      const delta = C * D;
      f *= delta;
      if (Math.abs(delta - 1) < 1e-16) break;
    }
    r = Math.exp(-z * z) / Math.sqrt(Math.PI) / f;
  }
  return x >= 0 ? r : 2 - r;
}
export const normCdf = (x) => 0.5 * erfc(-x / Math.SQRT2);
export function normQuantile(p) {
  // Acklam's rational approximation, refined by one Newton step.
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  let x;
  if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p > 1 - 0.02425) { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else { const q = p - 0.5, r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  const e = normCdf(x) - p;
  return x - e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
}

function cholesky(A) {
  const n = A.length;
  const L = Array.from({ length: n }, () => new Float64Array(n));
  for (let j = 0; j < n; j++) {
    let s = A[j][j];
    for (let k = 0; k < j; k++) s -= L[j][k] * L[j][k];
    if (!(s > 0)) return null;
    const d = Math.sqrt(s);
    L[j][j] = d;
    for (let i = j + 1; i < n; i++) {
      let t = A[i][j];
      for (let k = 0; k < j; k++) t -= L[i][k] * L[j][k];
      L[i][j] = t / d;
    }
  }
  return L;
}
function cholSolve(L, b) {
  const n = L.length, y = new Float64Array(n), x = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  return x;
}
function cholInverse(L) {
  const n = L.length, inv = Array.from({ length: n }, () => new Float64Array(n));
  const e = new Float64Array(n);
  for (let j = 0; j < n; j++) { e.fill(0); e[j] = 1; const col = cholSolve(L, e); for (let i = 0; i < n; i++) inv[i][j] = col[i]; }
  return inv;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rand) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

// ---------- parsing ----------

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  const s = String(text ?? "").replace(/^\uFEFF/, "");
  const delim = (() => {
    const first = s.split(/\r?\n/).find((l) => l.trim()) || "";
    const counts = { ",": 0, ";": 0, "\t": 0 };
    for (const ch of first) if (ch in counts) counts[ch]++;
    return counts["\t"] > counts[","] && counts["\t"] >= counts[";"] ? "\t" : counts[";"] > counts[","] ? ";" : ",";
  })();
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === delim) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

const isNum = (v) => v !== "" && /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(v);
const HEADER_WORDS = /^(winner|loser|won|lost|home|away|player|team|item|option|first|second|left|right|p1|p2|player ?[12]|team ?[12]|item ?[12]|option ?[12]|result|outcome|score.*|goals.*|points.*|.*_score|.*_goals|date|time|round|week|count|times|weight|wins|draws|ties|.*name.*|competitor.*|contestant.*|ftr|fthg|ftag|hometeam|awayteam|preferred|chosen|picked|other|rejected)$/i;
const DATE_HEADER = /^(date|time|day|round|week|matchday|season|game|match|id|#|no\.?)$/i;
const DATE_VALUE = /^\d{4}-\d{1,2}-\d{1,2}|^\d{1,2}[/.]\d{1,2}[/.]\d{2,4}$/;
const WEIGHT_HEADER = /^(count|n|times|weight|freq|frequency|games)$/i;
const HOME_HEADER = /home|away|hometeam|awayteam/i;

function readResult(v, a, b) {
  if (v.trim() === a) return "i";
  if (v.trim() === b) return "j";
  const t = v.trim().toLowerCase();
  if (t === "1" || t === "1.0" || t === "w" || t === "win" || t === "won" || t === "h" || t === "home" || t === "first" || t === "left") return "i";
  if (t === "0" || t === "0.0" || t === "l" || t === "loss" || t === "lost" || t === "a" || t === "away" || t === "second" || t === "right") return "j";
  if (t === "0.5" || t === ".5" || t === "d" || t === "draw" || t === "tie" || t === "t" || t === "drawn" || t === "tied" || t === "=" || t === "1/2" || t === "½") return "tie";
  return null;
}

// Turn rows into games {a, b, outcome: "i"|"j"|"tie", w}. Returns
// {games, layout, homeHint, problems}.
export function readGames(rows) {
  const problems = [];
  if (!rows.length) return { games: [], layout: null, problems: ["No rows found. Paste one game per row: winner,loser, or a,b,result, or home,away,home_score,away_score."] };
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const first = rows[0];
  const header = first.some((c) => HEADER_WORDS.test(c)) && !first.every((c, k) => k > 1 && isNum(c));
  const names = header ? first.map((c, k) => c || `column ${k + 1}`) : Array.from({ length: width }, (_, k) => `column ${k + 1}`);
  const body = header ? rows.slice(1) : rows;
  if (!body.length) return { games: [], layout: null, problems: ["The file has a header but no results."] };
  const kind = names.map((nm, k) => {
    const vals = body.map((r) => r[k] ?? "").filter((v) => v !== "");
    if (DATE_HEADER.test(nm) || (vals.length && vals.every((v) => DATE_VALUE.test(v)))) return "skip";
    if (header && WEIGHT_HEADER.test(nm) && vals.every(isNum)) return "weight";
    if (vals.length && vals.every(isNum)) return "num";
    return "text";
  });
  const text = kind.flatMap((k, i) => (k === "text" ? [i] : []));
  const num = kind.flatMap((k, i) => (k === "num" ? [i] : []));
  const wcol = kind.indexOf("weight");
  if (text.length < 2) return { games: [], layout: null, problems: ["Need two columns of names (the two sides of each game), such as winner,loser or home,away,home_goals,away_goals."] };
  const [ca, cb] = text;
  let layout;
  if (num.length >= 2) layout = { type: "scores", a: ca, b: cb, sa: num[0], sb: num[1] };
  else if (text.length >= 3) layout = { type: "result", a: ca, b: cb, r: text[2] };
  else if (num.length === 1) layout = { type: "result", a: ca, b: cb, r: num[0] };
  else layout = { type: "winner-loser", a: ca, b: cb };
  layout.weight = wcol >= 0 ? wcol : null;
  layout.header = header;
  layout.names = names;
  const homeHint = header && (HOME_HEADER.test(names[ca]) || HOME_HEADER.test(names[cb]));
  const games = [];
  let skipped = 0, selfPlay = 0;
  body.forEach((r, idx) => {
    const line = idx + 1 + (header ? 1 : 0);
    const a = (r[ca] ?? "").trim(), b = (r[cb] ?? "").trim();
    if (!a || !b) { skipped++; if (problems.length < 8) problems.push(`Row ${line}: a name is missing; skipped.`); return; }
    if (a === b) { selfPlay++; return; }
    let w = 1;
    if (layout.weight != null) {
      w = Number(r[layout.weight]);
      if (!(w >= 0) || !Number.isFinite(w)) { skipped++; if (problems.length < 8) problems.push(`Row ${line}: count "${r[layout.weight]}" is not a non-negative number; skipped.`); return; }
      if (w === 0) return;
    }
    let outcome;
    if (layout.type === "winner-loser") outcome = "i";
    else if (layout.type === "scores") {
      const x = r[layout.sa], y = r[layout.sb];
      if (!isNum(x ?? "") || !isNum(y ?? "")) { skipped++; if (problems.length < 8) problems.push(`Row ${line}: score missing (not played yet?); skipped.`); return; }
      outcome = Number(x) > Number(y) ? "i" : Number(x) < Number(y) ? "j" : "tie";
    } else {
      outcome = readResult(r[layout.r] ?? "", a, b);
      if (!outcome) { skipped++; if (problems.length < 8) problems.push(`Row ${line}: result "${r[layout.r] ?? ""}" is not one of 1/0/0.5, W/L/D, H/A/D or a player's name; skipped.`); return; }
    }
    games.push({ a, b, outcome, w });
  });
  if (selfPlay) problems.push(`${selfPlay} row${selfPlay > 1 ? "s" : ""} had the same name on both sides; skipped.`);
  if (skipped > 8) problems.push(`${skipped} rows skipped in all.`);
  return { games, layout, homeHint, problems };
}

// ---------- existence (Ford 1957) ----------

// Strongly connected components of the "beat or tied" digraph (Tarjan,
// iterative). Returns arrays of player indices, in reverse topological
// order of the condensation (a component listed earlier can only lose to
// later ones... see `dominance` for the direction).
export function strongComponents(n, edges) {
  const adj = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) adj[u].push(v);
  const index = new Int32Array(n).fill(-1), low = new Int32Array(n), on = new Uint8Array(n);
  const stack = [], comps = [];
  let counter = 0;
  for (let s = 0; s < n; s++) {
    if (index[s] !== -1) continue;
    const work = [[s, 0]];
    index[s] = low[s] = counter++; stack.push(s); on[s] = 1;
    while (work.length) {
      const top = work[work.length - 1];
      const [v, k] = top;
      if (k < adj[v].length) {
        top[1]++;
        const w = adj[v][k];
        if (index[w] === -1) { index[w] = low[w] = counter++; stack.push(w); on[w] = 1; work.push([w, 0]); }
        else if (on[w]) low[v] = Math.min(low[v], index[w]);
      } else {
        work.pop();
        if (work.length) { const p = work[work.length - 1][0]; low[p] = Math.min(low[p], low[v]); }
        if (low[v] === index[v]) {
          const comp = [];
          let w;
          do { w = stack.pop(); on[w] = 0; comp.push(w); } while (w !== v);
          comps.push(comp);
        }
      }
    }
  }
  return comps;
}

function weakComponents(n, pairs) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (const [u, v] of pairs) parent[find(u)] = find(v);
  const groups = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
  return [...groups.values()];
}

// ---------- the model ----------

// Aggregate games into cells keyed by (first, second, home flag).
function buildCells(games, index, ties, homeOn) {
  const cells = new Map();
  for (const g of games) {
    const i = index.get(g.a), j = index.get(g.b);
    let wi = 0, wj = 0, wt = 0;
    if (g.outcome === "i") wi = g.w;
    else if (g.outcome === "j") wj = g.w;
    else if (ties === "davidson") wt = g.w;
    else if (ties === "half") { wi = g.w / 2; wj = g.w / 2; }
    else continue; // drop
    // Without a home effect the order inside a pair carries no meaning, so
    // pool (i, j) with (j, i).
    let key, c;
    if (!homeOn && i > j) { key = `${j},${i},0`; c = cells.get(key) || { i: j, j: i, h: 0, yi: 0, yj: 0, yt: 0 }; c.yi += wj; c.yj += wi; c.yt += wt; }
    else { key = `${i},${j},${homeOn ? 1 : 0}`; c = cells.get(key) || { i, j, h: homeOn ? 1 : 0, yi: 0, yj: 0, yt: 0 }; c.yi += wi; c.yj += wj; c.yt += wt; }
    cells.set(key, c);
  }
  return [...cells.values()].filter((c) => c.yi + c.yj + c.yt > 0);
}

// Log-likelihood, gradient and Hessian of the softmax model. theta layout:
// lambda[0..m-1] (m = n or n-1; when m = n-1 player n-1 is the reference at
// 0), then alpha if homeOn, then delta if tiesOn.
function evaluate(theta, spec) {
  const { n, m, cells, homeOn, tiesOn, priorSd, priorAll } = spec;
  const P = theta.length;
  const ia = homeOn ? m : -1, id = tiesOn ? m + (homeOn ? 1 : 0) : -1;
  const lam = (k) => (k < m ? theta[k] : 0);
  let ll = 0;
  const g = new Float64Array(P);
  const H = Array.from({ length: P }, () => new Float64Array(P));
  const alpha = homeOn ? theta[ia] : 0, delta = tiesOn ? theta[id] : 0;
  for (const c of cells) {
    const ui = lam(c.i) + alpha * c.h, uj = lam(c.j);
    const ut = tiesOn ? delta + (ui + uj) / 2 : -Infinity;
    const mx = Math.max(ui, uj, ut);
    const ei = Math.exp(ui - mx), ej = Math.exp(uj - mx), et = tiesOn ? Math.exp(ut - mx) : 0;
    const S = ei + ej + et, logS = mx + Math.log(S);
    const p = [ei / S, ej / S, et / S];
    const y = [c.yi, c.yj, c.yt];
    const N = y[0] + y[1] + y[2];
    ll += y[0] * (ui - logS) + y[1] * (uj - logS) + (y[2] ? y[2] * (ut - logS) : 0);
    // Sparse design rows: alternative -> [(param index, coefficient)].
    const X = [[], [], []];
    if (c.i < m) X[0].push([c.i, 1]);
    if (homeOn && c.h) X[0].push([ia, 1]);
    if (c.j < m) X[1].push([c.j, 1]);
    if (tiesOn) {
      X[2].push([id, 1]);
      if (c.i < m) X[2].push([c.i, 0.5]);
      if (c.j < m) X[2].push([c.j, 0.5]);
      if (homeOn && c.h) X[2].push([ia, 0.5]);
    }
    const K = tiesOn ? 3 : 2;
    for (let k = 0; k < K; k++) { const r = y[k] - N * p[k]; for (const [q, x] of X[k]) g[q] += r * x; }
    // H -= N * X^T (diag p - p p^T) X
    const xbar = new Map();
    for (let k = 0; k < K; k++) for (const [q, x] of X[k]) xbar.set(q, (xbar.get(q) || 0) + p[k] * x);
    for (let k = 0; k < K; k++) for (const [q, x] of X[k]) for (const [r, z] of X[k]) H[q][r] -= N * p[k] * x * z;
    for (const [q, a] of xbar) for (const [r, b] of xbar) H[q][r] += N * a * b;
  }
  if (priorSd > 0) {
    const t = 1 / (priorSd * priorSd);
    for (let k = 0; k < (priorAll ? P : m); k++) { ll -= 0.5 * t * theta[k] * theta[k]; g[k] -= t * theta[k]; H[k][k] -= t; }
  }
  return { ll, g, H };
}

function newton(spec, start) {
  const P = spec.m + (spec.homeOn ? 1 : 0) + (spec.tiesOn ? 1 : 0);
  let theta = start ? Float64Array.from(start) : new Float64Array(P);
  let cur = evaluate(theta, spec);
  let it = 0, converged = false;
  for (; it < 200; it++) {
    const negH = cur.H.map((row) => row.map((v) => -v));
    const L = cholesky(negH);
    if (!L) return { theta, ...cur, iterations: it, converged: false, singular: true };
    const step = cholSolve(L, cur.g);
    let t = 1, next, nt;
    for (let h = 0; h < 40; h++) {
      nt = theta.map((v, k) => v + t * step[k]);
      next = evaluate(nt, spec);
      if (next.ll >= cur.ll - 1e-12 * Math.abs(cur.ll)) break;
      t /= 2;
    }
    const moved = Math.max(...step.map((s) => Math.abs(s * t)));
    theta = nt; cur = next;
    if (moved < 1e-10 || Math.max(...cur.g.map(Math.abs)) < 1e-9) { converged = true; it++; break; }
  }
  return { theta, ...cur, iterations: it, converged };
}

// Fit the model to games. Returns strengths centred to mean zero, their
// covariance, and the home and tie parameters.
export function fit(games, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const players = [...new Set(games.flatMap((g) => [g.a, g.b]))].sort((x, y) => x.localeCompare(y));
  const index = new Map(players.map((p, k) => [p, k]));
  const n = players.length;
  const anyTie = games.some((g) => g.outcome === "tie");
  const ties = o.ties === "auto" ? (anyTie ? "davidson" : "none") : o.ties;
  const tiesOn = ties === "davidson" && anyTie;
  const homeOn = o.home === true || o.home === "yes";
  const priorSd = Number(o.priorSd) > 0 ? Number(o.priorSd) : 0;
  const cells = buildCells(games, index, ties === "none" ? "drop" : ties, homeOn);
  const m = priorSd > 0 ? n : n - 1;
  const priorAll = !!o.priorAll && priorSd > 0;
  const spec = { n, m, cells, homeOn, tiesOn, priorSd, priorAll };
  const r = newton(spec);
  const P = r.theta.length;
  const L = cholesky(r.H.map((row) => row.map((v) => -v)));
  const V = L ? cholInverse(L) : null;
  // Centre: lambda_full = A theta_lambda, centred = (I - J/n) lambda_full.
  const full = Array.from({ length: n }, (_, k) => (k < m ? r.theta[k] : 0));
  const mean = full.reduce((s, v) => s + v, 0) / n;
  const lambda = full.map((v) => v - mean);
  let cov = null;
  if (V) {
    // C (n x m): C[k][q] = [k == q] - 1/n.
    const Cq = (k, q) => (k === q ? 1 : 0) - 1 / n;
    const CV = Array.from({ length: n }, (_, k) => { const row = new Float64Array(m); for (let q = 0; q < m; q++) { let s = 0; for (let t = 0; t < m; t++) s += Cq(k, t) * V[t][q]; row[q] = s; } return row; });
    cov = Array.from({ length: n }, (_, k) => { const row = new Float64Array(n); for (let l = 0; l < n; l++) { let s = 0; for (let q = 0; q < m; q++) s += CV[k][q] * Cq(l, q); row[l] = s; } return row; });
  }
  const ia = homeOn ? m : -1, id = tiesOn ? m + (homeOn ? 1 : 0) : -1;
  const par = (k) => (k < 0 ? null : { est: r.theta[k], se: V ? Math.sqrt(V[k][k]) : null });
  return {
    players, index, n, lambda, cov, V, theta: Array.from(r.theta), m,
    alpha: par(ia), delta: par(id),
    ties, tiesOn, homeOn, priorSd, priorAll,
    loglik: r.ll, iterations: r.iterations, converged: r.converged && !!V, nParams: P, cells: cells.length,
  };
}

// Hunter's (2004) MM algorithm for the plain Bradley-Terry model (no ties,
// no home), on games with outcome "i" or "j". A second fitter, independent
// of Newton's method, used by the tests.
export function fitMM(games, { tol = 1e-12, maxIter = 100000 } = {}) {
  const players = [...new Set(games.flatMap((g) => [g.a, g.b]))].sort((x, y) => x.localeCompare(y));
  const index = new Map(players.map((p, k) => [p, k]));
  const n = players.length;
  const wins = new Float64Array(n);
  const pair = new Map();
  for (const g of games) {
    if (g.outcome === "tie") continue;
    const i = index.get(g.a), j = index.get(g.b);
    wins[g.outcome === "i" ? i : j] += g.w;
    const key = i < j ? `${i},${j}` : `${j},${i}`;
    pair.set(key, (pair.get(key) || 0) + g.w);
  }
  const N = [...pair].map(([k, v]) => { const [i, j] = k.split(",").map(Number); return [i, j, v]; });
  let pi = new Float64Array(n).fill(1);
  let it = 0;
  for (; it < maxIter; it++) {
    const den = new Float64Array(n);
    for (const [i, j, v] of N) { const t = v / (pi[i] + pi[j]); den[i] += t; den[j] += t; }
    const next = pi.map((_, k) => wins[k] / den[k]);
    const gm = Math.exp(next.reduce((s, v) => s + Math.log(v), 0) / n);
    let diff = 0;
    for (let k = 0; k < n; k++) { next[k] /= gm; diff = Math.max(diff, Math.abs(Math.log(next[k]) - Math.log(pi[k]))); }
    pi = next;
    if (diff < tol) break;
  }
  return { players, lambda: Array.from(pi, Math.log), iterations: it };
}

// Outcome probabilities from the two utilities (and the tie parameter, or null).
export function outcomeProbs(ui, uj, delta = null) {
  const ut = delta == null ? -Infinity : delta + (ui + uj) / 2;
  const mx = Math.max(ui, uj, ut);
  const ei = Math.exp(ui - mx), ej = Math.exp(uj - mx), et = delta == null ? 0 : Math.exp(ut - mx);
  const S = ei + ej + et;
  return { win: ei / S, tie: et / S, loss: ej / S };
}

// Outcome probabilities for a game between a (listed first) and b.
export function predict(model, a, b, { home = false } = {}) {
  const i = model.index.get(a), j = model.index.get(b);
  if (i == null || j == null) return null;
  const h = !!(model.homeOn && home);
  const p = outcomeProbs(model.lambda[i] + (h ? model.alpha.est : 0), model.lambda[j], model.tiesOn ? model.delta.est : null);
  return { a, b, home: h, ...p };
}

// ---------- the whole analysis ----------

export const fmt = (x, d = 2) => (x == null || !Number.isFinite(x) ? "—" : x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (x, d = 0) => `${fmt(100 * x, d)}%`;
const plural = (k, s, p = `${s}s`) => `${k.toLocaleString("en-US")} ${k === 1 ? s : p}`;

export function analyze(input = {}) {
  const o = { ...DEFAULTS, ...input };
  const level = Number(o.level);
  if (!(level > 0.5 && level < 0.9999)) return { error: "The confidence level must be between 0.5 and 0.9999 (for example 0.95)." };
  if (!["auto", "davidson", "half", "drop"].includes(o.ties)) return { error: `ties must be auto, davidson, half or drop, not "${o.ties}".` };
  if (!["auto", "yes", "no", true, false].includes(o.home)) return { error: `home must be auto, yes or no, not "${o.home}".` };
  const priorSd = Number(o.priorSd) || 0;
  if (priorSd < 0 || !Number.isFinite(priorSd)) return { error: "The prior standard deviation must be zero (none) or positive." };
  let games, problems = [], layout = null, homeHint = false;
  if (Array.isArray(input.games)) {
    games = input.games.map((g) => ({ a: String(g.a), b: String(g.b), outcome: g.outcome, w: g.w == null ? 1 : Number(g.w) }));
    const bad = games.findIndex((g) => !["i", "j", "tie"].includes(g.outcome) || !(g.w >= 0) || g.a === g.b);
    if (bad >= 0) return { error: `games[${bad}] needs a and b (different), outcome "i", "j" or "tie", and a non-negative w.` };
  } else {
    const rows = parseCsv(input.csv ?? input.text ?? "");
    if (rows.length > o.maxRows) return { error: `That is ${rows.length.toLocaleString("en-US")} rows; the limit is ${o.maxRows.toLocaleString("en-US")}.` };
    ({ games, problems, layout, homeHint } = readGames(rows));
  }
  if (!games.length) return { error: problems[0] || "No results found. Paste one game per row: winner,loser, or a,b,result, or home,away,home_score,away_score." };
  const homeOn = o.home === "yes" || o.home === true || (o.home === "auto" && homeHint);
  const anyTie = games.some((g) => g.outcome === "tie");
  const ties = o.ties === "auto" ? (anyTie ? "davidson" : "none") : o.ties;
  const used = ties === "drop" ? games.filter((g) => g.outcome !== "tie") : games;
  if (!used.length) return { error: "Every result is a tie, so nobody can be ranked above anybody." };
  if (ties === "davidson" && !used.some((g) => g.outcome !== "tie")) return { error: "Every result is a tie, so nobody can be ranked above anybody." };
  const players = [...new Set(used.flatMap((g) => [g.a, g.b]))];
  if (players.length < 2) return { error: "Need at least two players." };
  if (players.length > o.maxPlayers) return { error: `That is ${players.length} players; the limit is ${o.maxPlayers}.` };

  const warnings = [...problems];
  // Ford's condition on the result graph actually used.
  const sorted = [...players].sort((x, y) => x.localeCompare(y));
  const idx = new Map(sorted.map((p, k) => [p, k]));
  const edges = [], pairs = [];
  for (const g of used) {
    const i = idx.get(g.a), j = idx.get(g.b);
    pairs.push([i, j]);
    if (g.outcome === "i" || g.outcome === "tie" || ties === "half") edges.push([i, j]);
    if (g.outcome === "j" || g.outcome === "tie" || ties === "half") edges.push([j, i]);
  }
  const weak = weakComponents(sorted.length, pairs);
  const strong = strongComponents(sorted.length, edges);
  let prior = priorSd;
  const existence = { exists: strong.length === 1, components: strong.length, disconnected: weak.length > 1 };
  if (weak.length > 1) {
    warnings.push(`The players fall into ${weak.length} groups that never played each other (${weak.map((c) => c.length).sort((a, b) => b - a).join(", ")} players). Strengths cannot be compared across groups; ${prior ? "the prior" : "a prior with standard deviation 1.5"} only pulls each group towards the middle.`);
  }
  if (strong.length > 1 && !prior) {
    prior = 1.5;
    // Describe the dominance: a component none of whose members ever lost to (or tied with) anyone outside.
    const comp = new Int32Array(sorted.length);
    strong.forEach((c, k) => c.forEach((v) => { comp[v] = k; }));
    const losesOut = new Uint8Array(strong.length);
    for (const [u, v] of edges) if (comp[u] !== comp[v]) losesOut[comp[v]] = 1;
    const unbeaten = strong.filter((_, k) => !losesOut[k]).map((c) => c.map((v) => sorted[v]));
    const ex = unbeaten.slice(0, 3).map((c) => c.slice(0, 4).join(", ") + (c.length > 4 ? ` and ${c.length - 4} more` : "")).join("; ");
    warnings.push(`No finite ranking exists from these results alone (Ford 1957): ${ex} never lost to anyone outside their group, so the likelihood keeps rising as they are pushed infinitely far ahead. The strengths shown use a normal prior with standard deviation 1.5 on the log scale (penalised likelihood), which keeps them finite; treat their gaps and intervals as dependent on that choice.`);
  }
  const tieMode = ties === "none" ? "drop" : ties;
  let model = fit(used, { ties: tieMode, home: homeOn, priorSd: prior });
  // Ford's condition covers the strengths alone. With a home or tie term the
  // maximum can still be at infinity (the home side won every game, say),
  // which shows up as a parameter running off towards it.
  const runaway = (mdl) => !mdl.converged || mdl.theta.some((v) => Math.abs(v) > 12);
  let priorAll = false;
  if (runaway(model)) {
    priorAll = true;
    prior = prior || 1.5;
    model = fit(used, { ties: tieMode, home: homeOn, priorSd: prior, priorAll: true });
    existence.exists = false;
    warnings.push(`No finite estimate exists from these results alone: a parameter runs off to infinity${homeOn ? " (often because the first-listed side won every game it could, so the home advantage is unbounded)" : ""}. The estimates shown use a normal prior with standard deviation ${fmt(prior, 1)} on every log-scale parameter${homeOn ? ", home advantage included" : ""}; treat them as dependent on that choice${homeOn ? ", or turn home advantage off" : ""}.`);
    if (!model.converged) return { error: "The fit did not converge, even with a prior. Check that the result columns are what you think they are." };
  }

  const z = normQuantile(0.5 + level / 2);
  const n = model.n;
  const se = model.cov ? model.cov.map((row, k) => Math.sqrt(Math.max(0, row[k]))) : model.lambda.map(() => null);

  // Records.
  const rec = model.players.map(() => ({ games: 0, wins: 0, ties: 0, losses: 0, expected: 0, actual: 0 }));
  for (const g of used) {
    const i = model.index.get(g.a), j = model.index.get(g.b);
    rec[i].games += g.w; rec[j].games += g.w;
    if (g.outcome === "i") { rec[i].wins += g.w; rec[j].losses += g.w; }
    else if (g.outcome === "j") { rec[j].wins += g.w; rec[i].losses += g.w; }
    else { rec[i].ties += g.w; rec[j].ties += g.w; }
    const p = predict(model, g.a, g.b, { home: model.homeOn });
    rec[i].expected += g.w * (p.win + p.tie / 2);
    rec[j].expected += g.w * (p.loss + p.tie / 2);
    rec[i].actual += g.w * (g.outcome === "i" ? 1 : g.outcome === "tie" ? 0.5 : 0);
    rec[j].actual += g.w * (g.outcome === "j" ? 1 : g.outcome === "tie" ? 0.5 : 0);
  }

  // Rank ranges by simulation from the normal approximation.
  const draws = Math.max(0, Math.min(20000, Math.floor(Number(o.draws) || 0)));
  const rankLo = new Array(n).fill(null), rankHi = new Array(n).fill(null), pTop = new Array(n).fill(null);
  let simulated = 0;
  if (draws && model.cov) {
    const Lc = cholesky(model.cov.map((row, k) => row.map((v, l) => v + (k === l ? 1e-12 : 0))));
    if (Lc) {
      const rand = mulberry32(Number(o.seed) >>> 0);
      const ranks = Array.from({ length: n }, () => new Int32Array(draws));
      const top = new Int32Array(n);
      const zv = new Float64Array(n), x = new Float64Array(n);
      const order = Array.from({ length: n }, (_, k) => k);
      for (let s = 0; s < draws; s++) {
        for (let k = 0; k < n; k++) zv[k] = gaussian(rand);
        for (let k = 0; k < n; k++) { let t = model.lambda[k]; for (let l = 0; l <= k; l++) t += Lc[k][l] * zv[l]; x[k] = t; }
        order.sort((p, q) => x[q] - x[p]);
        for (let r = 0; r < n; r++) ranks[order[r]][s] = r + 1;
        top[order[0]]++;
      }
      const lo = (1 - level) / 2;
      for (let k = 0; k < n; k++) {
        const a = Array.from(ranks[k]).sort((p, q) => p - q);
        rankLo[k] = a[Math.floor(lo * (draws - 1))];
        rankHi[k] = a[Math.ceil((1 - lo) * (draws - 1))];
        pTop[k] = top[k] / draws;
      }
      simulated = draws;
    }
  }

  const order = model.players.map((_, k) => k).sort((p, q) => model.lambda[q] - model.lambda[p] || model.players[p].localeCompare(model.players[q]));
  const rows = order.map((k, r) => ({
    rank: r + 1,
    player: model.players[k],
    strength: model.lambda[k],
    se: se[k],
    lower: se[k] == null ? null : model.lambda[k] - z * se[k],
    upper: se[k] == null ? null : model.lambda[k] + z * se[k],
    rating: 1500 + ELO * model.lambda[k],
    ratingSe: se[k] == null ? null : ELO * se[k],
    games: rec[k].games, wins: rec[k].wins, ties: rec[k].ties, losses: rec[k].losses,
    expectedScore: rec[k].expected, actualScore: rec[k].actual,
    vsAverage: outcomeProbs(model.lambda[k], 0, model.tiesOn ? model.delta.est : null),
    rankLow: rankLo[k], rankHigh: rankHi[k], pTop: pTop[k],
  }));

  // Head-to-head: P(row ahead of column) in strength, and game probabilities.
  const aheadProb = (k, l) => {
    if (!model.cov) return null;
    const v = model.cov[k][k] + model.cov[l][l] - 2 * model.cov[k][l];
    return v > 0 ? normCdf((model.lambda[k] - model.lambda[l]) / Math.sqrt(v)) : (model.lambda[k] > model.lambda[l] ? 1 : 0);
  };
  const shown = order.slice(0, Math.min(n, 30));
  const matrix = {
    players: shown.map((k) => model.players[k]),
    win: shown.map((k) => shown.map((l) => (k === l ? null : predict(model, model.players[k], model.players[l])))),
  };

  // Home advantage: estimate, interval, the likelihood-ratio test.
  let home = null;
  if (model.homeOn) {
    const a = model.alpha;
    const without = fit(used, { ties: model.ties, home: false, priorSd: prior, priorAll });
    const lr = Math.max(0, 2 * (model.loglik - without.loglik));
    const even = outcomeProbs(a.est, 0, model.tiesOn ? model.delta.est : null);
    home = {
      alpha: a.est, se: a.se, lower: a.est - z * a.se, upper: a.est + z * a.se,
      factor: Math.exp(a.est), ratingPoints: ELO * a.est,
      lr, p: erfc(Math.sqrt(lr / 2)),
      evenGame: even,
    };
  }
  let tiesOut = null;
  if (model.tiesOn) {
    const d = model.delta;
    const nu = Math.exp(d.est);
    tiesOut = { nu, lower: Math.exp(d.est - z * d.se), upper: Math.exp(d.est + z * d.se), delta: d.est, se: d.se, evenTie: nu / (2 + nu) };
  }
  const tieCount = games.filter((g) => g.outcome === "tie").reduce((s, g) => s + g.w, 0);
  const gameCount = used.reduce((s, g) => s + g.w, 0);

  // Plain-language summary.
  const best = rows[0], second = rows[1];
  const pAhead = aheadProb(order[0], order[1]);
  const parts = [];
  parts.push(`${plural(n, "player")}, ${plural(gameCount, "game")}${tieCount && ties !== "drop" ? ` (${plural(tieCount, "tie")})` : ""}.`);
  parts.push(`${best.player} is strongest (rating ${fmt(best.rating, 0)}${best.ratingSe != null ? ` ± ${fmt(best.ratingSe, 0)}` : ""}), ahead of ${second.player} (${fmt(second.rating, 0)})${pAhead != null ? `; the chance ${best.player} is really the stronger of the two is ${pct(pAhead)}` : ""}.`);
  if (best.rankHigh != null && n > 2) parts.push(`${best.player}'s ${pct(level)} rank range is ${best.rankLow === best.rankHigh ? `exactly ${best.rankLow}` : `${best.rankLow} to ${best.rankHigh}`}, and ${pct(best.pTop)} of simulated seasons put it top.`);
  if (home) parts.push(`Playing at home (first-listed) is worth ${fmt(home.ratingPoints, 0)} rating points, a factor of ${fmt(home.factor, 2)} on the odds (${pct(level)} interval ${fmt(Math.exp(home.lower), 2)} to ${fmt(Math.exp(home.upper), 2)}; likelihood-ratio p = ${home.p < 0.0001 ? "< 0.0001" : fmt(home.p, 4)}). Between equal sides the home side wins ${pct(home.evenGame.win)}${model.tiesOn ? `, draws ${pct(home.evenGame.tie)}` : ""} and loses ${pct(home.evenGame.loss)}.`);
  if (tiesOut) parts.push(`Ties: nu = ${fmt(tiesOut.nu, 3)}, so two equal sides tie ${pct(tiesOut.evenTie)} of the time on neutral ground (Davidson 1970).`);
  else if (ties === "half" && tieCount) parts.push("Ties were counted as half a win for each side.");
  else if (ties === "drop" && tieCount) parts.push(`${plural(tieCount, "tie")} left out.`);
  if (!existence.exists) parts.push("No finite ranking exists from these results alone; see the warning.");

  return {
    summary: parts.join(" "),
    warnings,
    layout: layout && { type: layout.type, columns: [layout.a, layout.b, layout.sa ?? layout.r, layout.sb].filter((c) => c != null).map((c) => layout.names[c]), header: layout.header, weight: layout.weight != null ? layout.names[layout.weight] : null },
    settings: { ties, home: model.homeOn, priorSd: prior, priorOnAll: priorAll, level, draws: simulated, seed: Number(o.seed) >>> 0 },
    existence,
    players: rows,
    home,
    ties: tiesOut,
    matrix,
    aheadTopTwo: pAhead,
    fit: { loglik: model.loglik, iterations: model.iterations, parameters: model.nParams, cells: model.cells, games: gameCount },
    model: { players: model.players, lambda: model.lambda, alpha: model.alpha?.est ?? null, delta: model.delta?.est ?? null },
  };
}

// Probabilities for one fixture from an analyze() result.
export function predictFromResult(result, a, b, { home = false } = {}) {
  const M = result.model;
  const i = M.players.indexOf(a), j = M.players.indexOf(b);
  if (i < 0 || j < 0) return null;
  const h = !!(home && M.alpha != null);
  return { a, b, home: h, ...outcomeProbs(M.lambda[i] + (h ? M.alpha : 0), M.lambda[j], M.delta) };
}

const csvCell = (v) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(result) {
  const head = ["rank", "player", "rating", "rating_se", "log_strength", "se", "lower", "upper", "rank_low", "rank_high", "p_top", "games", "wins", "ties", "losses", "actual_score", "expected_score"];
  const lines = [head.join(",")];
  for (const r of result.players) {
    lines.push([r.rank, r.player, r.rating.toFixed(1), r.ratingSe?.toFixed(1), r.strength.toFixed(6), r.se?.toFixed(6), r.lower?.toFixed(6), r.upper?.toFixed(6), r.rankLow, r.rankHigh, r.pTop?.toFixed(4), r.games, r.wins, r.ties, r.losses, r.actualScore, r.expectedScore.toFixed(3)].map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}
