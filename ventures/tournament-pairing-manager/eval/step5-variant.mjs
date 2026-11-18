// What changes if step 5's f(x) squares the player's rating mu where Glickman's
// paper squares the rating deviation phi? That substitution is what the source of
// the PyPI package glicko2 2.1.0 reads (glicko2/glicko2.py, Player._f uses
// self.__rating**2). This script does not run that package: it re-implements the
// one-line variant here and compares it with ratings.mjs on seeded random players.
// Run: node eval/step5-variant.mjs
import { glicko2Update } from "../ratings.mjs";

const S = 173.7178;
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

function variant(me, opps, scores, tau, useMu) {
  const mu = (me.rating - 1500) / S, phi = me.rd / S, sigma = me.vol;
  const g = (p) => 1 / Math.sqrt(1 + 3 * p * p / Math.PI ** 2);
  let vInv = 0, sum = 0;
  opps.forEach((o, i) => {
    const pj = o.rd / S, e = 1 / (1 + Math.exp(-g(pj) * (mu - (o.rating - 1500) / S)));
    vInv += g(pj) ** 2 * e * (1 - e); sum += g(pj) * (scores[i] - e);
  });
  const v = 1 / vInv, delta = v * sum, a = Math.log(sigma * sigma);
  const q = useMu ? mu : phi; // the only difference
  const f = (x) => { const ex = Math.exp(x); return ex * (delta * delta - q * q - v - ex) / (2 * (q * q + v + ex) ** 2) - (x - a) / (tau * tau); };
  let A = a, B;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else { let k = 1; while (f(a - k * tau) < 0) k++; B = a - k * tau; }
  let fA = f(A), fB = f(B);
  for (let i = 0; Math.abs(B - A) > 1e-6 && i < 500; i++) {
    const C = A + (A - B) * fA / (fB - fA), fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = C; fB = fC;
  }
  const s2 = Math.exp(A / 2), ps = Math.sqrt(phi * phi + s2 * s2), pn = 1 / Math.sqrt(1 / (ps * ps) + 1 / v);
  return { rating: (mu + pn * pn * sum) * S + 1500, rd: pn * S, vol: s2 };
}

const r = rng(2026);
const bands = [[1450, 1550], [1300, 1700], [1000, 2000], [2000, 2800]];
const rows = [];
for (const [lo, hi] of bands) {
  const dv = [], dr = [], drd = [];
  let sanity = 0;
  for (let i = 0; i < 5000; i++) {
    const me = { rating: lo + r() * (hi - lo), rd: 50 + r() * 300, vol: 0.06 };
    const n = 3 + Math.floor(r() * 6);
    const opps = Array.from({ length: n }, () => ({ rating: me.rating + (r() - 0.5) * 600, rd: 40 + r() * 250 }));
    const scores = opps.map(() => [0, 0.5, 1][Math.floor(r() * 3)]);
    const paper = glicko2Update(me, opps, scores, 0.5);
    const same = variant(me, opps, scores, 0.5, false);
    sanity = Math.max(sanity, Math.abs(same.rating - paper.rating));
    const alt = variant(me, opps, scores, 0.5, true);
    dv.push(Math.abs(alt.vol - paper.vol)); dr.push(Math.abs(alt.rating - paper.rating)); drd.push(Math.abs(alt.rd - paper.rd));
  }
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  rows.push({ band: `${lo}-${hi}`, sanity_max_rating_gap: sanity, vol_median: q(dv, 0.5), vol_p99: q(dv, 0.99), vol_max: q(dv, 1), rating_median: q(dr, 0.5), rating_p99: q(dr, 0.99), rating_max: q(dr, 1), rd_max: q(drd, 1) });
}
const one = variant({ rating: 1500, rd: 200, vol: 0.06 }, [{ rating: 1400, rd: 30 }, { rating: 1550, rd: 100 }, { rating: 1700, rd: 300 }], [1, 0, 0], 0.5, true);
console.log(JSON.stringify({ glickman_example_with_mu_variant: one, bands: rows }, null, 1));
