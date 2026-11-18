"""Milestone 11n: if a planner can ask operators for their real destination distributions one at a time, whose should
they ask for first, and how many disclosures reach the closed form's layer split? Plus 11m's open diagnostic: does
census-against-real mass in the lens where two discs meet say which pair weight is wrong?

11m: the census paper weight's misses are local (one pair carries 81% and 100% of the decision error in layouts 0 and
17) and one operator's real map fixes 5 of the 6 missed layouts, but in 9 of 24 layouts one withheld map breaks the
real-map pick by > 2%, so partial disclosure is not safe in general. Whole-disc summaries (leg length, TV) did not say
whose pair weights are wrong (Spearman -0.15, 0.19).

Setup as 11m: 11g's 24 eight-operator layouts, census maps C (residents + jobs, 11j) and real maps R (11h), every mixed
weight vector from four per-pair gas integrals. A disclosure set D gives operator k map R if k in D, else C. For each
layout every one of the 256 subsets is scored on 11g's fresh 200,000-flight run as a ratio to the closed form's split.
Orders (m = 0..8 disclosures, the first m of the order):
  share      largest traffic share first (a planner knows the shares).
  influence  computed from the census weights alone: for operator k, scale its seven pair weights by 2 and by 1/2,
             and take the larger relative census-score regret of the census pick under the perturbed weights; largest
             first (ties by share). It asks "whose error could move the pick", not "whose error is large".
  random     mean over 200 seeded random orders.
  oracle     the best subset of size m on the fresh run (an upper bound; not a planner's procedure).
Lens diagnostic, per cross pair (i, j) whose discs meet: m_i^C, m_i^R = operator i's census and real destination mass
inside disc j (and likewise for j inside disc i); lens error = |log((m_i^C m_j^C) / (m_i^R m_j^R))| over pairs with
all four masses positive, compared with the pair's |log| weight error of gas_pj against gas_d (11m's lerr).

Predictions (written and committed before any disclosure subset or lens mass was computed):
 (1) oracle mean fresh ratio <= 1.005 at m = 2 (prior 60%).
 (2) share order mean at m = 2 <= 1.023, at least 0.01 below gas_pj's 1.033 (prior 55%).
 (3) influence order has a lower mean than random at both m = 2 and m = 3 (prior 50%).
 (4) under share order, some layout is > 2% worse after a disclosure than before it (prior 60%).
 (5) share order needs m >= 5 before all 24 layouts are within 5% of cf (prior 50%).
 (6) Spearman(lens error, pair log weight error) >= 0.5 across the pairs with all masses positive (prior 45%).
 (7) in layout 0 pair (6,7) and in layout 17 pair (0,4) has the largest lens error of its layout (prior 40%).
 (8) random order mean at m = 4 <= 1.015 (prior 50%).
Preliminary.

    python3 disclosure.py > disclosure_results.txt
"""
import importlib.util
import itertools
import math
import multiprocessing as mp
import os
import random
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("hub_airspace_operator_demand_11n", os.path.join(HERE, "operator_demand.py"))
od = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(od)
rs, dw, pw, rl, gp = od.rs, od.dw, od.pw, od.rl, od.gp
M, LAM, CROSS = od.M, od.LAM, od.CROSS
N_RANDOM = 200
SUBSETS = [frozenset(c) for m in range(M + 1) for c in itertools.combinations(range(M), m)]


def src_of(D):
    return "".join("R" if k in D else "C" for k in range(M))


def influence(parts, wc, pick):
    """Per operator, the larger relative census-score regret of the census pick when k's pairs are scaled by 2 or 1/2."""
    out = []
    for k in range(M):
        worst = 0.0
        for f in (2.0, 0.5):
            wp = {key: (x * f if k in key[:2] else x) for key, x in wc.items()}
            b = gp.score(wp, gp.best(parts, wp))
            worst = max(worst, (gp.score(wp, pick) - b) / b if b > 0 else 0.0)
        out.append(worst)
    return out


def lens_mass(dests, hub, r):
    return sum(w for w, x, y in dests if math.hypot(x - hub[0], y - hub[1]) <= r)


def run_layout(idx, n_flights=rl.N_FLIGHTS, cf_pairs=rl.CF_PAIRS):
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    fn = lambda kind, vx, vy, h: rl.base_layer("semi", kind, vx, vy, h)
    sim_fr, h_fr = gp.simulate_pairs(mix, speeds, LAM, fn, n_flights=n_flights, seed=8000 + idx)
    cf = gp.closed_form_pairs(mix, speeds, LAM, "semi", pairs=cf_pairs, seed=3 + idx)
    origin = pw.grid_bounds(hubs, radii)
    dem = dw.load_demand()
    maps = {"C": [dw.density_weighted(hubs[k], radii[k], dem["pj"], origin)[0] for k in range(M)],
            "R": [pw.density_dest(mix, k, shares[k], origin) for k in range(M)]}
    pairw = {}
    for i, j in CROSS:
        for a in "CR":
            for b in "CR":
                pairw[(i, j, a + b)] = pw.gas_pair(maps[a][i], maps[b][j], hubs[i], hubs[j], speeds[i], speeds[j],
                                                   shares[i], shares[j], origin)
    parts = gp.bipartitions()[1:]
    fl = h_fr * LAM
    pcf = gp.best(parts, cf)
    base = gp.score(sim_fr, pcf) / fl
    ratio = {}
    for D in SUBSETS:
        p = gp.best(parts, od.mixed(pairw, src_of(D)))
        ratio[D] = gp.score(sim_fr, p) / fl / base
    wc = od.mixed(pairw, "C" * M)
    infl = influence(parts, wc, gp.best(parts, wc))
    # lens diagnostic
    cd = [od.census_dests(hubs[k], radii[k], dem["pj"]) for k in range(M)]
    rd = [od.real_dests(mix, k, shares[k]) for k in range(M)]
    vpj, vd = od.norm(rs.vec(wc)), od.norm(rs.vec(od.mixed(pairw, "R" * M)))
    lens = {}
    for (i, j), a, b in zip(CROSS, vpj, vd):
        mc = (lens_mass(cd[i], hubs[j], radii[j]), lens_mass(cd[j], hubs[i], radii[i]))
        mr = (lens_mass(rd[i], hubs[j], radii[j]), lens_mass(rd[j], hubs[i], radii[i]))
        le = abs(math.log(mc[0] * mc[1] / (mr[0] * mr[1]))) if min(mc + mr) > 0 else float("nan")
        we = abs(math.log(a / b)) if a > 0 and b > 0 else float("nan")
        lens[(i, j)] = (le, we)
    return dict(idx=idx, ratio=ratio, shares=shares, infl=infl, lens=lens)


def order_by(keys):
    return sorted(range(M), key=lambda k: (-keys[k], k))


def curve(ratio, order):
    return [ratio[frozenset(order[:m])] for m in range(M + 1)]


def main():
    t0 = time.time()
    P = print
    P(f"# Milestone 11n: disclosure order (real destination maps one operator at a time) and the lens diagnostic; "
      f"11g's {rl.N_LAYOUTS} layouts.")
    P(f"# Every one of the 256 disclosure subsets scored on the fresh {rl.N_FLIGHTS}-flight run as a ratio to the "
      f"closed form's split ({rl.CF_PAIRS} pairs).")
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool:
        res = pool.map(run_layout, range(rl.N_LAYOUTS))
    mean = lambda x: sum(x) / len(x)
    rng = random.Random(11)
    rand_orders = [rng.sample(range(M), M) for _ in range(N_RANDOM)]
    curves = {"share": [], "influence": [], "random": [], "oracle": []}
    for s in res:
        r = s["ratio"]
        curves["share"].append(curve(r, order_by([s["shares"][k] + 0 for k in range(M)])))
        curves["influence"].append(curve(r, order_by([s["infl"][k] + 1e-9 * s["shares"][k] for k in range(M)])))
        rc = [curve(r, o) for o in rand_orders]
        curves["random"].append([mean([c[m] for c in rc]) for m in range(M + 1)])
        curves["oracle"].append([min(v for D, v in r.items() if len(D) == m) for m in range(M + 1)])
        s["rand_within5"] = [mean([c[m] <= 1.05 for c in rc]) for m in range(M + 1)]

    P("\n## Mean fresh ratio to cf after m disclosures (m = 0 is gas_pj, m = 8 is gas_d)")
    P("order      " + " ".join(f"  m={m} " for m in range(M + 1)))
    for name, cs in curves.items():
        P(f"{name:10s} " + " ".join(f"{mean([c[m] for c in cs]):6.3f}" for m in range(M + 1)))
    P("\n## Layouts within 5% of cf after m disclosures (random: expected count)")
    for name, cs in curves.items():
        if name == "random":
            P(f"{name:10s} " + " ".join(f"{sum(s['rand_within5'][m] for s in res):6.1f}" for m in range(M + 1)))
        else:
            P(f"{name:10s} " + " ".join(f"{sum(c[m] <= 1.05 for c in cs):6d}" for m in range(M + 1)))
    P("\n## Layouts within 1% of cf after m disclosures")
    for name, cs in curves.items():
        if name != "random":
            P(f"{name:10s} " + " ".join(f"{sum(c[m] <= 1.01 for c in cs):6d}" for m in range(M + 1)))

    P("\n## Per layout: ratio after m disclosures, share and influence orders")
    P("idx  order      " + " ".join(f"  m={m} " for m in range(M + 1)) + "  order")
    for s, cs, ci in zip(res, curves["share"], curves["influence"]):
        o_s = order_by(s["shares"])
        o_i = order_by([s["infl"][k] + 1e-9 * s["shares"][k] for k in range(M)])
        P(f"{s['idx']:3d}  share      " + " ".join(f"{x:6.3f}" for x in cs) + "  " + "".join(map(str, o_s)))
        P(f"     influence  " + " ".join(f"{x:6.3f}" for x in ci) + "  " + "".join(map(str, o_i)))

    worsen = {name: [(s["idx"], m, c[m - 1], c[m]) for s, c in zip(res, curves[name]) for m in range(1, M + 1)
                     if c[m] > c[m - 1] * 1.02] for name in ("share", "influence")}
    for name, w in worsen.items():
        P(f"\n{name}: disclosures that make a layout > 2% worse: {len(w)}" +
          ("; " + ", ".join(f"layout {i} m={m} {a:.3f}->{b:.3f}" for i, m, a, b in w) if w else ""))
    nonmono = sum(any(min(v for D, v in s["ratio"].items() if D <= E) < s["ratio"][E] / 1.02 for E in SUBSETS)
                  for s in res)
    P(f"layouts where some subset is > 2% worse than one of its own subsets: {nonmono}/24")

    P("\n## Lens diagnostic across pairs")
    pairs = [(s["idx"], p, le, we) for s in res for p, (le, we) in s["lens"].items() if le == le and we == we]
    allp = sum(len(s["lens"]) for s in res)
    P(f"pairs with all four lens masses positive and both weights positive: {len(pairs)} of {allp}")
    sp = rs.spearman([x[2] for x in pairs], [x[3] for x in pairs])
    P(f"Spearman(lens error, pair log weight error) = {sp:.3f}")
    top = {}
    for i in (0, 17):
        pl = [(le, p) for j, p, le, we in pairs if j == i]
        pl.sort(reverse=True)
        top[i] = pl
        P(f"layout {i}: largest lens errors " + ", ".join(f"{p} {le:.2f}" for le, p in pl[:5]))

    P("\n## Prediction checks")
    mc = {name: [mean([c[m] for c in cs]) for m in range(M + 1)] for name, cs in curves.items()}
    P(f"(1) oracle mean at m=2 {mc['oracle'][2]:.3f} <= 1.005: {mc['oracle'][2] <= 1.005}")
    P(f"(2) share mean at m=2 {mc['share'][2]:.3f} <= 1.023: {mc['share'][2] <= 1.023}")
    P(f"(3) influence < random at m=2 ({mc['influence'][2]:.3f} vs {mc['random'][2]:.3f}) and m=3 "
      f"({mc['influence'][3]:.3f} vs {mc['random'][3]:.3f}): {mc['influence'][2] < mc['random'][2] and mc['influence'][3] < mc['random'][3]}")
    P(f"(4) share order makes some layout > 2% worse: {len(worsen['share'])} disclosures: {len(worsen['share']) > 0}")
    allin = [m for m in range(M + 1) if all(c[m] <= 1.05 for c in curves["share"])]
    first = allin[0] if allin else None
    P(f"(5) share order first m with all 24 within 5%: {first}; >= 5: {first is not None and first >= 5}")
    P(f"(6) Spearman {sp:.3f} >= 0.5: {sp >= 0.5}")
    t0p = top[0][0][1] if top[0] else None
    t17 = top[17][0][1] if top[17] else None
    P(f"(7) top lens pair layout 0 {t0p} (want (6, 7)), layout 17 {t17} (want (0, 4)): {t0p == (6, 7) and t17 == (0, 4)}")
    P(f"(8) random mean at m=4 {mc['random'][4]:.3f} <= 1.015: {mc['random'][4] <= 1.015}")
    P(f"\n# runtime {time.time() - t0:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
