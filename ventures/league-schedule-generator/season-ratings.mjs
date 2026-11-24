// League schedule generator, season-ratings.mjs: player (or team) ratings over a whole season.
//
// What a club pays a rating service for: one number per player that moves with every result,
// says how sure it is, and predicts who beats whom, so boxes, divisions and balanced teams can be
// drawn from it. Pure functions, no DOM, no network.
//
// - Glicko-2 (Mark Glickman, "Example of the Glicko-2 system", Boston University, revised
//   2022-11-30, http://www.glicko.net/glicko/glicko2.pdf), steps 1 to 8 with the Illinois
//   volatility search. Each league night, week or month is one rating period; a player who sits
//   out k periods has their RD grown k times (step 6 once per missed period), so a returning
//   player's rating moves faster and the table says it is less certain.
// - Doubles (pickleball, padel, Americano nights, mixed teams): the composite-opponent method.
//   Each player is scored as if they had played one virtual opponent whose rating makes the
//   one-on-one gap equal to the gap between the two sides' average ratings, so a strong partner
//   lowers what a win is worth. The virtual opponent's RD carries the partner's and opponents'.
// - Score margin (optional, `margin` 0..1): the outcome is (1 - margin) x win + margin x the
//   share of points won. 11-9 is then a smaller win than 11-2. margin 0 is plain win/loss.
// - Home advantage (optional, rating points) for leagues with home and away games.
// - Elo (logistic, K-factor) kept as the simple baseline the eval compares against.

const SCALE = 173.7178; // 400 / ln(10)
export const RATING_DEFAULTS = { rating: 1500, rd: 350, vol: 0.06, tau: 0.5, margin: 0, home: 0, maxRd: 350 };

const g = (phi) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const expect = (mu, muJ, phiJ) => 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/** Glicko-2 volatility, step 5 (Illinois method). */
function newVolatility(phi, sigma, v, delta, tau) {
  const a = Math.log(sigma * sigma);
  const eps = 1e-6;
  const f = (x) => {
    const ex = Math.exp(x);
    const d = phi * phi + v + ex;
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * d * d) - (x - a) / (tau * tau);
  };
  let A = a;
  let B;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else {
    let k = 1;
    while (f(a - k * tau) < 0 && k < 200) k++;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  for (let it = 0; Math.abs(B - A) > eps && it < 100; it++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = C; fB = fC;
  }
  return Math.exp(A / 2);
}

/**
 * One Glicko-2 update for one player over one rating period (paper steps 2 to 8).
 * opps: [{ mu, phi, s }] on the Glicko-2 scale. Returns { mu, phi, sigma }.
 */
export function glicko2Update(mu, phi, sigma, opps, tau = RATING_DEFAULTS.tau) {
  if (!opps.length) return { mu, phi: Math.sqrt(phi * phi + sigma * sigma), sigma };
  let vInv = 0;
  let sum = 0;
  for (const o of opps) {
    const gj = g(o.phi);
    const e = expect(mu, o.mu, o.phi);
    vInv += gj * gj * e * (1 - e);
    sum += gj * (o.s - e);
  }
  const v = 1 / vInv;
  const delta = v * sum;
  const sigma2 = newVolatility(phi, sigma, v, delta, tau);
  const phiStar = Math.sqrt(phi * phi + sigma2 * sigma2);
  const phi2 = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  return { mu: mu + phi2 * phi2 * sum, phi: phi2, sigma: sigma2 };
}

/** The outcome for side A in [0, 1]: win/draw/loss blended with the share of points won. */
export function outcome(sa, sb, margin = 0) {
  const win = sa > sb ? 1 : sa < sb ? 0 : 0.5;
  if (!margin || !(sa + sb > 0)) return win;
  return (1 - margin) * win + margin * (sa / (sa + sb));
}

const names = (side) => side.map((n) => String(n).trim()).filter(Boolean);

/** Period key for a game: "game" (every game its own period), "date", "week" (ISO week), "month". */
export function periodKey(date, game, period) {
  if (period === "game" || !date) return `g${game}`;
  if (period === "date") return date;
  if (period === "month") return date.slice(0, 7);
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday 0
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this ISO week
  const y = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const week = 1 + Math.round(((d - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(week).padStart(2, "0")}`;
}

/**
 * A rating state that games can be fed into in date order. Use it when ratings must be read
 * between periods (the eval predicts every game from the ratings before its period).
 * opts: { tau, margin, home, rating, rd, vol, maxRd, initial: { name: { rating, rd, vol } } }
 */
export function createRater(opts = {}) {
  const o = { ...RATING_DEFAULTS, ...opts };
  const players = new Map(); // name -> { mu, phi, sigma, last, games, wins, losses, draws }
  let periodIndex = 0;
  const get = (name) => {
    let p = players.get(name);
    if (!p) {
      const init = o.initial?.[name] ?? {};
      p = {
        mu: ((init.rating ?? o.rating) - 1500) / SCALE,
        phi: (init.rd ?? o.rd) / SCALE,
        sigma: init.vol ?? o.vol,
        last: null, games: 0, wins: 0, losses: 0, draws: 0,
      };
      players.set(name, p);
    }
    return p;
  };
  const maxPhi = o.maxRd / SCALE;
  // RD grown for the periods a player sat out (step 6 once per missed period).
  const aged = (p, at = periodIndex) => {
    if (p.last === null) return p.phi;
    const k = Math.max(0, at - p.last - 1);
    return Math.min(maxPhi, Math.sqrt(p.phi * p.phi + k * p.sigma * p.sigma));
  };
  const homeMu = o.home / SCALE;

  /** Win chance of side a over side b now (names; one or more per side), home = side a at home. */
  function predict(a, b, { home = false } = {}) {
    const A = names(a).map(get);
    const B = names(b).map(get);
    const mean = (xs) => xs.reduce((t, p) => t + p.mu, 0) / xs.length;
    const phi = Math.sqrt([...A, ...B].reduce((t, p) => t + aged(p, periodIndex + 1) ** 2, 0) / Math.max(A.length, B.length) ** 2);
    return expect(mean(A) + (home ? homeMu : 0), mean(B), phi);
  }

  /** Feed one rating period: games [{ a: [names], b: [names], sa, sb, home }]. */
  function period(games) {
    const opps = new Map();
    const touch = (name) => { if (!opps.has(name)) opps.set(name, []); return opps.get(name); };
    for (const gm of games) {
      const A = names(gm.a);
      const B = names(gm.b);
      if (!A.length || !B.length) continue;
      const s = outcome(gm.sa, gm.sb, o.margin);
      const hAdv = gm.home ? homeMu : 0;
      const sides = [[A, B, s, hAdv], [B, A, 1 - s, -hAdv]];
      for (const [mine, theirs, sMine, adv] of sides) {
        const n = Math.max(mine.length, theirs.length);
        const meanTheirs = theirs.reduce((t, x) => t + get(x).mu, 0) / theirs.length;
        const meanMine = mine.reduce((t, x) => t + get(x).mu, 0) / mine.length;
        for (const name of mine) {
          const p = get(name);
          // Virtual opponent: p.mu - muV = (meanMine + adv) - meanTheirs.
          const muV = p.mu - (meanMine + adv - meanTheirs);
          let phi2 = theirs.reduce((t, x) => t + aged(get(x)) ** 2, 0);
          for (const x of mine) if (x !== name) phi2 += aged(get(x)) ** 2;
          touch(name).push({ mu: muV, phi: Math.sqrt(phi2) / n, s: sMine });
          p.games++;
          if (sMine > 0.5 && gm.sa !== gm.sb) p.wins++;
          else if (gm.sa === gm.sb) p.draws++;
          else p.losses++;
        }
      }
    }
    const next = new Map();
    for (const [name, list] of opps) {
      const p = get(name);
      const up = glicko2Update(p.mu, aged(p), p.sigma, list, o.tau);
      next.set(name, { ...up, phi: Math.min(maxPhi, up.phi) });
    }
    for (const [name, up] of next) Object.assign(players.get(name), up, { last: periodIndex });
    periodIndex++;
  }

  /** The table now, strongest first: { name, rating, rd, vol, games, wins, losses, draws, provisional }. */
  function table({ provisionalRd = 110 } = {}) {
    return [...players.entries()].map(([name, p]) => {
      const rd = aged(p) * SCALE;
      return {
        name,
        rating: 1500 + p.mu * SCALE,
        rd,
        vol: p.sigma,
        games: p.games, wins: p.wins, losses: p.losses, draws: p.draws,
        provisional: rd > provisionalRd,
      };
    }).sort((x, y) => y.rating - x.rating || x.name.localeCompare(y.name));
  }

  return { period, predict, table, get periodIndex() { return periodIndex; }, players };
}

/**
 * Rate a whole season: games [{ date, a, b, sa, sb, home }], grouped into periods.
 * Returns { table, rater }.
 */
export function rateSeason(games, opts = {}) {
  const period = opts.period ?? "week";
  const rater = createRater(opts);
  const order = games.map((gm, i) => ({ gm, i })).sort((x, y) => String(x.gm.date ?? "").localeCompare(String(y.gm.date ?? "")) || x.i - y.i);
  let key = null;
  let batch = [];
  for (const { gm, i } of order) {
    const k = periodKey(gm.date, i, period);
    if (k !== key && batch.length) { rater.period(batch); batch = []; }
    key = k;
    batch.push(gm);
  }
  if (batch.length) rater.period(batch);
  return { table: rater.table(opts), rater };
}

/**
 * Whole-season fit: every game at once, for one season where levels barely move.
 * Doubles Bradley-Terry on side averages (the same logistic scale as Elo, 400 points = 10:1),
 * fitted as a MAP estimate with a normal prior (mean `rating`, sd `prior`) by Newton steps.
 * Outcomes are fractional when `margin` > 0 (as in createRater). The ± is the Laplace RD:
 * 1 / sqrt(curvature), from the full Hessian; provisional above RD 200 (a doubles game carries a
 * quarter of a singles game's information about one player). Order of games does not matter.
 * initial: { name: { rating, rd } } sets that player's prior (rd defaults to `prior`).
 * games: [{ a, b, sa, sb, home }]. Returns the same table shape as createRater().table().
 */
export function fitSeason(games, { margin = 0, prior = 300, rating = 1500, home = 0, iterations = 50, provisionalRd = 200, initial = {} } = {}) {
  const idx = new Map();
  const list = [];
  const id = (n) => { if (!idx.has(n)) { idx.set(n, list.length); list.push({ name: n, games: 0, wins: 0, losses: 0, draws: 0 }); } return idx.get(n); };
  const G = [];
  for (const gm of games) {
    const A = names(gm.a).map(id);
    const B = names(gm.b).map(id);
    if (!A.length || !B.length) continue;
    const s = outcome(gm.sa, gm.sb, margin);
    G.push({ A, B, s, h: gm.home ? home : 0 });
    for (const [side, mine] of [[A, s], [B, 1 - s]]) for (const i of side) {
      list[i].games++;
      if (gm.sa === gm.sb) list[i].draws++; else if (mine > 0.5) list[i].wins++; else list[i].losses++;
    }
  }
  const n = list.length;
  const c = Math.LN10 / 400;
  const r = new Float64Array(n).fill(rating);
  const pMean = list.map((p) => initial[p.name]?.rating ?? rating);
  const pLam = list.map((p) => 1 / (initial[p.name]?.rd ?? prior) ** 2);
  for (let i = 0; i < n; i++) r[i] = pMean[i];
  let H = null;
  for (let it = 0; it < iterations; it++) {
    const grad = new Float64Array(n);
    H = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) { grad[i] = -pLam[i] * (r[i] - pMean[i]); H[i][i] = pLam[i]; }
    for (const { A, B, s, h } of G) {
      const mA = A.reduce((t, i) => t + r[i], 0) / A.length;
      const mB = B.reduce((t, i) => t + r[i], 0) / B.length;
      const p = 1 / (1 + Math.exp(-c * (mA + h - mB)));
      const w = c * c * p * (1 - p);
      const coef = [...A.map((i) => [i, 1 / A.length]), ...B.map((i) => [i, -1 / B.length])];
      for (const [i, ai] of coef) {
        grad[i] += c * (s - p) * ai;
        for (const [j, aj] of coef) H[i][j] += w * ai * aj;
      }
    }
    const step = solve(H, grad);
    let big = 0;
    for (let i = 0; i < n; i++) { const d = Math.max(-200, Math.min(200, step[i])); r[i] += d; big = Math.max(big, Math.abs(d)); }
    if (big < 1e-6) break;
  }
  const cov = H ? invert(H) : [];
  return list.map((p, i) => {
    const rd = Math.sqrt(Math.max(0, cov[i][i]));
    return { ...p, rating: r[i], rd, vol: 0, provisional: rd > provisionalRd };
  }).sort((x, y) => y.rating - x.rating || x.name.localeCompare(y.name));
}

/** Win chance of side a over side b from a fitted table (fitSeason); unknown names at `rating`. */
export function fittedChance(table, a, b, { rating = 1500, home = 0, atHome = false } = {}) {
  const r = new Map(table.map((t) => [t.name, t.rating]));
  const mean = (side) => { const xs = names(side); return xs.reduce((t, x) => t + (r.get(x) ?? rating), 0) / xs.length; };
  return 1 / (1 + 10 ** (-(mean(a) + (atHome ? home : 0) - mean(b)) / 400));
}

// Gaussian elimination with partial pivoting (H is symmetric positive definite here).
function solve(H, g) {
  const n = g.length;
  const M = H.map((row, i) => [...row, g[i]]);
  for (let k = 0; k < n; k++) {
    let piv = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[piv][k])) piv = i;
    [M[k], M[piv]] = [M[piv], M[k]];
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / M[k][k];
      if (f) for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
    }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let t = M[i][n]; for (let j = i + 1; j < n; j++) t -= M[i][j] * x[j]; x[i] = t / M[i][i]; }
  return x;
}
function invert(H) {
  const n = H.length;
  return Array.from({ length: n }, (_, j) => { const e = new Float64Array(n); e[j] = 1; return solve(H, e); })
    .reduce((cols, col, j) => { col.forEach((v, i) => { cols[i][j] = v; }); return cols; }, Array.from({ length: n }, () => new Float64Array(n)));
}

/** Elo baseline: { predict, game } with K, home advantage and an optional goal-margin multiplier. */
export function createElo({ k = 20, home = 0, rating = 1500, marginMultiplier = null } = {}) {
  const r = new Map();
  const get = (n) => r.get(n) ?? rating;
  const predict = (a, b, { home: atHome = false } = {}) => 1 / (1 + 10 ** ((get(b) - get(a) - (atHome ? home : 0)) / 400));
  function game(a, b, sa, sb, { home: atHome = false, kScale = 1 } = {}) {
    const e = predict(a, b, { home: atHome });
    const s = sa > sb ? 1 : sa < sb ? 0 : 0.5;
    const mult = marginMultiplier ? marginMultiplier(Math.abs(sa - sb)) : 1;
    const d = k * kScale * mult * (s - e);
    r.set(a, get(a) + d);
    r.set(b, get(b) - d);
  }
  return { predict, game, ratings: r };
}

/** World Football Elo's goal-difference multiplier (eloratings.net, "About the ratings"). */
export const eloratingsMargin = (n) => (n <= 1 ? 1 : n === 2 ? 1.5 : (11 + n) / 8);

// ---------------------------------------------------------------- the page's text format

const SCORE = /^(.*?)\s+(\d+)\s*[-–:]\s*(\d+)\s+(.*)$/;
const BEAT = /^(.+?)\s+(?:beat|beats|def\.?|defeated|over)\s+(.+)$/i;
const DATE = /^(\d{4}-\d{2}-\d{2})(?:[\s,;|]+(.*))?$/;

/**
 * Results log, one game per line, oldest first. A date at the start (YYYY-MM-DD) sets the
 * rating period; a line with no date takes the last date given. Sides are one name or a pair
 * joined with "&", "/" or " and ". Scores: "Ana & Ben 11-7 Cy & Dee" or "Ana 3-1 Cy";
 * no score: "Ana beat Cy". Lines starting with # are comments.
 * Returns { games: [{ date, a, b, sa, sb, line }], errors }.
 */
export function parseRatingLog(text) {
  const games = [];
  const errors = [];
  let date = null;
  const side = (s) => s.split(/\s*(?:&|\/|\+|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean);
  String(text || "").split(/\r?\n/).forEach((raw, ln) => {
    let line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const dm = DATE.exec(line);
    if (dm) { date = dm[1]; line = (dm[2] ?? "").trim(); if (!line) return; }
    let m = SCORE.exec(line);
    let a; let b; let sa; let sb;
    if (m) { a = side(m[1]); sa = +m[2]; sb = +m[3]; b = side(m[4]); }
    else if ((m = BEAT.exec(line))) { a = side(m[1]); b = side(m[2]); sa = 1; sb = 0; }
    else { errors.push(`Line ${ln + 1}: write it as "Ana & Ben 11-7 Cy & Dee" or "Ana beat Cy".`); return; }
    if (!a.length || !b.length) { errors.push(`Line ${ln + 1}: a side has no names.`); return; }
    const all = [...a, ...b].map((x) => x.toLowerCase());
    if (new Set(all).size !== all.length) { errors.push(`Line ${ln + 1}: a player is on the court twice.`); return; }
    games.push({ date, a, b, sa, sb, line: ln + 1 });
  });
  return { games, errors };
}

/** Plain-text table for a group chat or notice board. */
export function ratingsText(table, { title = "Ratings" } = {}) {
  const lines = [title];
  table.forEach((r, i) => {
    const rec = `${r.wins}-${r.losses}${r.draws ? `-${r.draws}` : ""}`;
    lines.push(`${i + 1}. ${r.name}  ${Math.round(r.rating)} ±${Math.round(2 * r.rd)}  (${rec})${r.provisional ? "  provisional" : ""}`);
  });
  return lines.join("\n");
}

/** CSV of the table. */
export function ratingsCsv(table) {
  const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = ["rank,name,rating,rd,volatility,games,wins,losses,draws,provisional"];
  table.forEach((r, i) => rows.push([i + 1, q(r.name), r.rating.toFixed(1), r.rd.toFixed(1), r.vol.toFixed(4), r.games, r.wins, r.losses, r.draws, r.provisional ? "yes" : "no"].join(",")));
  return rows.join("\n");
}
