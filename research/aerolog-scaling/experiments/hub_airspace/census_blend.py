"""Milestone 11w: a fitted blend of residents and jobs, validated out of sample by layout. 11v found that jobs
over-weight the start term's delivery part (1.165 of exact) and residents under-weight everything (0.632), with the
raw residents-plus-jobs sum in between (0.834). This milestone fits the mix of the two census maps that brings the
paper weights to the exact level, holding each layout out of its own fit.

Why. 11v's first "Next": a fitted blend of residents and jobs for the start term (jobs overshoot deliveries, residents
undershoot), validated out of sample by layout. 11v also found that most of the remaining census error is in the flux
term (gas_pj 0.879 of exact against gas_d's 0.933), so the same blend is fitted for the flux term too.

The blend is exact and cheap. Each operator's census destination distribution in its disc is a mixture
    q_k(a) = (1 - a) q_k^p + a q_k^j,
of its residents distribution q^p and its jobs distribution q^j, each normalised over the disc (so a = 0 is 11v's
start_p, a = 1 is start_j; 11v's raw sum pj is a mixture with an operator-dependent a). The one-leg path density
l_k (paper_weights.density_dest) is linear in the destination weights, the start term (grid_start) is linear in l_A
and in B's delivery mass, and the gas flux weight (gas_pair) is linear in l_A and in l_B. So with the four
combinations of maps computed once per layout,
    start(a_l, a_m) = sum_{x,y in p,j} w_x(a_l) w_y(a_m) S[x, y]     (S[x, y]: l maps from x, delivery masses from y)
    gas(b)          = sum_{x,y in p,j} w_x(b) w_y(b) G[x, y]         (G[x, y]: operator i's l from x, j's from y)
with w_p(a) = 1 - a, w_j(a) = a, every blend is a weighted sum (tested against a direct computation on blended maps).

Fits (a, a_l, a_m, b on a 0.01 grid over [0, 1]; scale factors in closed form). Objective: the sum over layouts of
(ln(total / exact total))^2 for the cross-operator total of that term.
  start_a     one blend for the start term (a_l = a_m = a), target 11t's exact cross start term (both zones).
  start_lm    separate blends for the path-density map (hub and delivery lookups) and the delivery masses.
  start_k     11v's start_pj times a fitted scalar k (exp of the mean log ratio): a level calibration with no blend.
  gas_b       one blend for the flux term, target the exact estimator's cross en-route total minus 11t's exact
              en-route start term (the flux part, by 11s's Steiner identity).
  gas_k       11j's gas_pj times a fitted scalar.
  comb        gas_b + start_a (en-route); combk = gas_k + start_k.
Out of sample: leave one layout out (fit on 23, evaluate on the 24th), and report the in-sample fit on all 24.

Layouts and references as 11v: 11g's 24 random layouts, semi, R = 50 m, Lambda = 240/h, 100 m grid; 11t's exact
start term (start_term.start_terms); 11s's exact estimator (steiner_bias.estimate, 400,000 ordered pairs, seeds
110000 + idx); cf+ = cf + exact start as the split reference.

Experiments.
 E1 Start term: in-sample a*, (a_l*, a_m*), k*; LOO per-layout ratios to exact for start_a, start_lm, start_k and
    11v's start_pj: pooled ratio, median |ln ratio|, layouts within 5%, median Pearson r over the 28 cross pairs.
 E2 Flux term: in-sample b*, k*; LOO per-layout ratios of gas_b, gas_k and gas_pj to the exact flux part, and r.
 E3 Level: LOO comb and combk against the exact cross en-route total, with 11v's gas_pj+ and gas_d+ for reference.
 E4 Splits: best two-layer split (127 bipartitions) under LOO comb, gas_b, gas_pj+ and gas_d+, scored on the
    pooled exact weights, ratio to cf+'s split. (combk scales both terms and so can differ from gas_pj+.)
 E5 Stability: the spread of the 24 LOO fits of a and b.
Reproduction (not a prediction): S[p, p], S[j, j] reproduce 11v's pooled start_p and start_j ratios (0.6319, 1.0557)
and G[p, p], G[j, j] its median gas_p and gas_j levels (0.7285, 0.9374) to the printed digits.

Predictions (written and committed before the experiment ran; before committing, only the unit tests in
tests/test_census_blend.py had run, on synthetic operators and synthetic count maps; no layout was evaluated):
 (1) E1: in-sample a* in [0.55, 0.90]: jobs carry the level (start_j 1.056) but over-shoot, so the best blend leans
     to jobs (prior 60%).
 (2) E1: LOO start_a pooled ratio in [0.95, 1.05] and within 5% of exact in >= 8 of 24 layouts (start_j 6,
     start_pj 5) (prior 55%).
 (3) E1: in-sample a_l* > a_m* (jobs for the path density, which sets the hub part, 0.889 under jobs; fewer jobs for
     the delivery masses, 1.165 under jobs) (prior 70%).
 (4) E1: LOO median |ln ratio| of start_lm below start_a's (prior 50%).
 (5) E1: LOO median |ln ratio| of start_a below start_k's: the blend fixes more than the level (prior 50%).
 (6) E1: median pair r(start_a, exact) >= 0.9876 (start_pj's) (prior 55%).
 (7) E2: in-sample b* in [0.50, 0.95] (prior 55%).
 (8) E3: LOO comb median level in [0.97, 1.03] of exact and within 5% in >= 10 of 24 layouts (gas_pj+ 8) (prior 50%).
 (9) E4: LOO comb's mean split score ratio <= gas_pj+'s (prior 50%).
 (10) E5: the 24 LOO fits of a span at most 0.10, and of b at most 0.10 (prior 65%).
Preliminary.

    python3 census_blend_run.py > census_blend_results.txt
"""
import importlib.util
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


cs = _load("hub_airspace_census_start_11w", "census_start.py")
gs, dw, pw = cs.gs, cs.dw, cs.pw
XY = (("p", "p"), ("p", "j"), ("j", "p"), ("j", "j"))
GRID = [i / 100.0 for i in range(101)]


def w(x, a):
    return 1.0 - a if x == "p" else a


def combos(counts_p, counts_j, hubs, radii, speeds, shares, origin, R=50.0):
    """Per layout: l maps and masses from each census map, the four start combos S[x, y] and flux combos G[x, y].

    S[(x, y)] is grid_start's result with l maps from map x and delivery masses from map y.
    G[(x, y)][(i, j, 'enr')] is gas_pair with operator i's l map from x and j's from y."""
    m = len(hubs)
    cnt = {"p": counts_p, "j": counts_j}
    L = {x: [dw.density_weighted(hubs[k], radii[k], cnt[x], origin)[0] for k in range(m)] for x in cnt}
    Ms = {x: [cs.census_mass(hubs[k], radii[k], cnt[x], shares[k]) for k in range(m)] for x in cnt}
    S = {(x, y): gs.grid_start(L[x], Ms[y], hubs, speeds, shares, origin, R=R) for x, y in XY}
    G = {(x, y): {(i, j, "enr"): pw.gas_pair(L[x][i], L[y][j], hubs[i], hubs[j], speeds[i], speeds[j], shares[i],
                                              shares[j], origin)
                  for i in range(m) for j in range(i + 1, m)} for x, y in XY}
    return S, G, L, Ms


def mix(parts, coef):
    """sum_k coef[k] * parts[k] over dicts of floats."""
    out = {}
    for k, c in coef.items():
        if c:
            for key, v in parts[k].items():
                out[key] = out.get(key, 0.0) + c * v
    return out


def start_blend(S, al, am):
    return mix({xy: S[xy]["start"] for xy in XY}, {(x, y): w(x, al) * w(y, am) for x, y in XY})


def start_parts(S, al, am):
    """(hub, delivery) pooled parts of the blended start term."""
    c = {(x, y): w(x, al) * w(y, am) for x, y in XY}
    return sum(c[xy] * S[xy]["hub"] for xy in XY), sum(c[xy] * S[xy]["deliv"] for xy in XY)


def gas_blend(G, b):
    return mix(G, {(x, y): w(x, b) * w(y, b) for x, y in XY})


def fit_grid(totals, target, idx, two=False):
    """Grid fit minimising sum over layouts in idx of ln(total/target)^2.

    totals[n][(x, y)]: layout n's cross total of combo (x, y) (start: x = l map, y = masses; gas: x, y operators).
    One parameter: a = a_l = a_m. Two: (a_l, a_m). Returns the best tuple."""
    def loss(al, am):
        s = 0.0
        for n in idx:
            t = sum(w(x, al) * w(y, am) * totals[n][(x, y)] for x, y in XY)
            s += math.log(t / target[n]) ** 2
        return s
    if two:
        return min(((al, am) for al in GRID for am in GRID), key=lambda p: loss(*p))
    return min(((a, a) for a in GRID), key=lambda p: loss(*p))


def fit_scale(vals, target, idx):
    """Scalar k with mean ln(k val / target) = 0 over idx."""
    return math.exp(sum(math.log(target[n] / vals[n]) for n in idx) / len(idx))
