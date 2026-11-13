// Rating changes from a finished (or part-finished) event: Elo and Glicko-2.
// Pure functions, no DOM, no network. The whole event is one rating period:
// every game is scored against the ratings players brought into the event.
//
// Glicko-2 follows Mark Glickman, "Example of the Glicko-2 system" (Boston
// University, revised 2022-11-30, http://www.glicko.net/glicko/glicko2.pdf),
// steps 1 to 8, with the Illinois-method volatility search of step 5. The
// worked example in that paper is a test in ratings.test.mjs.
// Elo uses the logistic expectation E = 1 / (1 + 10^((Rb - Ra) / 400)).

const SCALE = 173.7178; // Glicko-2 scale factor, 400 / ln(10)
export const GLICKO_DEFAULTS = { rating: 1500, rd: 350, vol: 0.06, tau: 0.5 };
export const ELO_DEFAULTS = { k: 20, cap400: false };

// Games from Swiss rounds: [{ a, b, s }] where s is a's score (1, 0.5, 0).
// Byes are not games and are left out, as rating systems do.
export function gamesFromSwiss(rounds) {
  const out = [];
  for (const r of rounds ?? []) {
    for (const p of r.pairings ?? []) {
      if (!p.result || !p.a || !p.b) continue;
      out.push({ a: p.a, b: p.b, s: p.result === "a" ? 1 : p.result === "b" ? 0 : 0.5 });
    }
  }
  return out;
}

// Games from a resolved bracket (calc.mjs resolveBracket): every match played
// between two real players. byeId is the marker calc.mjs uses for a bye.
export function gamesFromBracket(bracket, resolved, byeId) {
  const out = [];
  for (const m of bracket.matches) {
    const st = resolved.states.get(m.id);
    if (!st || st.status !== "done") continue;
    if (!st.a || !st.b || st.a === byeId || st.b === byeId) continue;
    out.push({ a: st.a, b: st.b, s: st.winner === st.a ? 1 : 0 });
  }
  return out;
}

function tally(players, games) {
  const by = new Map(players.map((p) => [p.id, []]));
  for (const g of games) {
    if (!by.has(g.a) || !by.has(g.b) || g.a === g.b) continue;
    by.get(g.a).push({ opp: g.b, s: g.s });
    by.get(g.b).push({ opp: g.a, s: 1 - g.s });
  }
  return by;
}

export function eloExpected(ra, rb, cap400 = false) {
  let d = rb - ra;
  if (cap400) d = Math.max(-400, Math.min(400, d));
  return 1 / (1 + 10 ** (d / 400));
}

// players: [{ id, name, rating }] (rating null = unrated). opts: { k, cap400 }.
// Games against an unrated player are not rated for either side; the row says so.
export function eloRatings(players, games, opts = {}) {
  const k = Number.isFinite(opts.k) && opts.k > 0 ? opts.k : ELO_DEFAULTS.k;
  const cap400 = Boolean(opts.cap400);
  const byId = new Map(players.map((p) => [p.id, p]));
  const by = tally(players, games);
  return players.map((p) => {
    const list = by.get(p.id);
    const row = { id: p.id, name: p.name, before: p.rating ?? null, games: list.length, rated: 0, score: 0, expected: 0, change: 0, after: p.rating ?? null, skipped: 0 };
    for (const g of list) {
      row.score += g.s;
      const o = byId.get(g.opp).rating;
      if (p.rating == null || o == null) { row.skipped += 1; continue; }
      row.rated += 1;
      row.expected += eloExpected(p.rating, o, cap400);
    }
    if (p.rating != null) {
      const ratedScore = list.reduce((a, g) => a + (byId.get(g.opp).rating == null ? 0 : g.s), 0);
      row.change = k * (ratedScore - row.expected);
      row.ratedScore = ratedScore;
      row.after = p.rating + row.change;
    }
    return row;
  });
}

const g = (phi) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const E = (mu, muj, phij) => 1 / (1 + Math.exp(-g(phij) * (mu - muj)));

// Step 5 of Glickman's paper: the new volatility by the Illinois algorithm.
export function glickoVolatility(phi, sigma, delta, v, tau, eps = 1e-6) {
  const a = Math.log(sigma * sigma);
  const f = (x) => {
    const ex = Math.exp(x);
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) - (x - a) / (tau * tau);
  };
  let A = a;
  let B;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else {
    let k = 1;
    while (f(a - k * tau) < 0) k += 1;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  for (let guard = 0; Math.abs(B - A) > eps && guard < 200; guard++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = C; fB = fC;
  }
  return Math.exp(A / 2);
}

// One player's Glicko-2 update. me / opps: { rating, rd, vol }; scores: 1, 0.5, 0.
export function glicko2Update(me, opps, scores, tau = GLICKO_DEFAULTS.tau) {
  const mu = (me.rating - 1500) / SCALE;
  const phi = me.rd / SCALE;
  const sigma = me.vol;
  if (!opps.length) {
    // Step 6 only: a player with no games keeps the rating, and the RD grows.
    return { rating: me.rating, rd: Math.sqrt(phi * phi + sigma * sigma) * SCALE, vol: sigma };
  }
  const o = opps.map((x) => ({ mu: (x.rating - 1500) / SCALE, phi: x.rd / SCALE }));
  let vInv = 0;
  let sum = 0;
  o.forEach((x, i) => {
    const e = E(mu, x.mu, x.phi);
    vInv += g(x.phi) ** 2 * e * (1 - e);
    sum += g(x.phi) * (scores[i] - e);
  });
  const v = 1 / vInv;
  const delta = v * sum;
  const sigmaNew = glickoVolatility(phi, sigma, delta, v, tau);
  const phiStar = Math.sqrt(phi * phi + sigmaNew * sigmaNew);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * sum;
  return { rating: muNew * SCALE + 1500, rd: phiNew * SCALE, vol: sigmaNew };
}

// players: [{ id, name, rating, rd, vol }]. Missing values take the Glicko-2
// defaults for a new player (1500, RD 350, volatility 0.06), and the row says so.
export function glickoRatings(players, games, opts = {}) {
  const d = { ...GLICKO_DEFAULTS, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => Number.isFinite(v) && v > 0)) };
  const start = new Map(players.map((p) => [p.id, {
    rating: p.rating ?? d.rating,
    // A new (unrated) player always starts at RD 350; opts.rd only fills in a
    // rated player whose RD was not given.
    rd: Number.isFinite(p.rd) && p.rd > 0 ? p.rd : p.rating == null ? GLICKO_DEFAULTS.rd : d.rd,
    vol: Number.isFinite(p.vol) && p.vol > 0 ? p.vol : d.vol,
    assumed: p.rating == null,
  }]));
  const by = tally(players, games);
  return players.map((p) => {
    const me = start.get(p.id);
    const list = by.get(p.id);
    const opps = list.map((x) => start.get(x.opp));
    const scores = list.map((x) => x.s);
    const next = glicko2Update(me, opps, scores, d.tau);
    const expected = list.reduce((a, x) => {
      const q = start.get(x.opp);
      return a + E((me.rating - 1500) / SCALE, (q.rating - 1500) / SCALE, q.rd / SCALE);
    }, 0);
    return {
      id: p.id, name: p.name, assumed: me.assumed,
      before: me.rating, rdBefore: me.rd, volBefore: me.vol,
      games: list.length, score: scores.reduce((a, b) => a + b, 0), expected,
      after: next.rating, rdAfter: next.rd, volAfter: next.vol, change: next.rating - me.rating,
    };
  });
}

const csvCell = (v) => {
  const t = String(v ?? "");
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const r1 = (x) => (x == null ? "" : Math.round(x * 10) / 10);

export function ratingsCsv(rows, method) {
  if (method === "glicko2") {
    const head = ["Player", "Rating before", "RD before", "Volatility before", "Games", "Score", "Expected", "Change", "Rating after", "RD after", "Volatility after", "Starting values assumed"];
    const body = rows.map((r) => [r.name, r1(r.before), r1(r.rdBefore), r.volBefore.toFixed(6), r.games, r.score, r.expected.toFixed(2), r1(r.change), r1(r.after), r1(r.rdAfter), r.volAfter.toFixed(6), r.assumed ? "yes" : "no"]);
    return [head, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }
  const head = ["Player", "Rating before", "Games", "Rated games", "Score in rated games", "Expected", "Change", "Rating after"];
  const body = rows.map((r) => [r.name, r.before ?? "unrated", r.games, r.rated, r.ratedScore ?? "", r.before == null ? "" : r.expected.toFixed(2), r.before == null ? "" : r1(r.change), r.before == null ? "unrated" : r1(r.after)]);
  return [head, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
