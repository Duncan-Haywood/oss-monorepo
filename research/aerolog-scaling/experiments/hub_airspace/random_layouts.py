"""Milestone 11g: when does the closed form earn its keep over hub distance? Graph-partition layer assignment on 24
random eight-operator layouts with mixed service radii, speeds and market shares.

11f found that in one layout (eight equal-radius operators at k-means sites) max-cut on s_i s_j / d_ij (market share
over hub separation, a number a planner has without any traffic model) lands within 2.2% of the simulator's best
two-group split, so the closed form's practical edge was small. Its "Next": a layout where distance and closed-form
weights disagree. Rather than hand-build one such layout (and pick the answer), this run draws 24 at random and asks
how often, and under what conditions, the distance heuristic loses.

Layout draw (one random.Random per layout, seed 1100 + index): 8 hubs at destinations drawn uniformly from the
20,000 NYC destinations within 7 km of 11a's hub, at least 800 m apart; service radius per operator log-uniform on
[1.5, 8] km; cruise speed uniform on [12, 28] m/s; market shares Dirichlet(1, ..., 1) (normalised Exp(1) draws).
A layout is redrawn if any operator serves fewer than 200 destinations. Each operator serves every destination
within its radius (11c's 5 km disc generalised). Speeds, shares and radii are swept, not sourced (as in 11d to 11f).

Model and simulator: 11f's (graph_partition.simulate_pairs, closed_form_pairs; straight legs, no wind, no
avoidance, R = 50 m, 250 m terminal radius, 60 s hover, Lambda = 240 flights/h). Base rule: semi (eastbound and
westbound tracks in different layers); one group bit on top (four layers). Per layout: an in-sample simulation
(seed 7000 + index, 200,000 flights) that picks the oracle, a fresh one (seed 8000 + index, 200,000 flights) that
scores every method's pick, and the closed form (400,000 leg pairs). 11f's exact decomposition (a conflict is kept
iff the base rule keeps it and both operators share a group) scores all 127 bipartitions from each run.

Methods (each picks one of the 127 non-trivial bipartitions by max-cut on its own pair weights):
  cf       closed-form en-route weights under semi (11f);
  oracle   in-sample simulator counts;
  dist     s_i s_j / d_ij (11f's heuristic; ignores radii and speeds);
  overlap  s_i s_j n_ij / sqrt(n_i n_j), n_ij destinations served by both (11f's);
  density  s_i s_j n_ij / (n_i n_j) (new: product of the two operators' flight densities over shared ground);
  mean     the mean over all 127 non-trivial bipartitions (an uninformed planner).
Feature: tau_w, Kendall tau between the dist and cf weights over the 28 cross pairs (how much distance and the
closed form disagree about which pairs matter).

Predictions (written and committed before any random layout was drawn, simulated or scored):
 (1) Out of sample, the cf bipartition leaves at most 5% more en-route conflicts than the oracle's in at least
     20 of the 24 layouts.
 (2) dist leaves at least 5% more en-route conflicts than cf, out of sample, in at least 8 of 24 layouts
     (prior 60%).
 (3) The median of dist/cf over layouts is at least 1.05 (prior 45%).
 (4) Median overlap/cf exceeds median dist/cf (overlap is the worse proxy, as in 11f; prior 60%).
 (5) density beats dist: median density/cf below median dist/cf (prior 55%).
 (6) Spearman correlation between dist/cf and tau_w is at most -0.4 (distance loses where it disagrees with
     the closed form; prior 65%).
 (7) Pair weights: Pearson r between closed-form and in-sample simulated cross-pair weights >= 0.9 in at least
     22 of 24 layouts.
 (8) cf leaves at most 75% of the mean bipartition's en-route conflicts in every layout.
Preliminary.

    python3 random_layouts.py > random_layouts_results.txt
"""
import importlib.util
import math
import multiprocessing as mp
import os
import random
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("hub_airspace_graph_partition_11g", os.path.join(HERE, "graph_partition.py"))
gp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gp)
load_nyc, base_layer, kendall = gp.load_nyc, gp.base_layer, gp.kendall

M = 8
N_LAYOUTS = 24
LAM = 240
N_FLIGHTS = 200000
CF_PAIRS = 400000
MIN_SEP, HUB_R, MIN_DEST = 800.0, 7000.0, 200
R_LO, R_HI, V_LO, V_HI = 1500.0, 8000.0, 12.0, 28.0


def draw_layout(pts, idx, m=M):
    """Hubs, radii, speeds and shares for layout idx (deterministic)."""
    rnd = random.Random(1100 + idx)
    cand = [p for p in pts if p[0] * p[0] + p[1] * p[1] <= HUB_R * HUB_R]
    while True:
        hubs = []
        while len(hubs) < m:
            p = rnd.choice(cand)
            if all(math.dist(p, h) >= MIN_SEP for h in hubs):
                hubs.append(p)
        radii = [math.exp(rnd.uniform(math.log(R_LO), math.log(R_HI))) for _ in range(m)]
        speeds = [rnd.uniform(V_LO, V_HI) for _ in range(m)]
        e = [rnd.expovariate(1.0) for _ in range(m)]
        shares = [x / sum(e) for x in e]
        n = [sum(0 < (x - h[0]) ** 2 + (y - h[1]) ** 2 <= r * r for x, y in pts) for h, r in zip(hubs, radii)]
        if min(n) >= MIN_DEST:
            return hubs, radii, speeds, shares


def mix_radii(pts, hubs, radii, shares):
    """Operator j serves every destination within radii[j] of its hub and gets share s_j of the flights."""
    out = []
    for j, ((hx, hy), r) in enumerate(zip(hubs, radii)):
        mine = [(x, y) for x, y in pts if 0 < (x - hx) ** 2 + (y - hy) ** 2 <= r * r]
        out += [(shares[j] / len(mine), j, hx, hy, x, y) for x, y in mine]
    return out


def heuristics(pts, hubs, radii, shares):
    inside = [[(x - h[0]) ** 2 + (y - h[1]) ** 2 <= r * r for x, y in pts] for h, r in zip(hubs, radii)]
    n = [sum(c) for c in inside]
    dist, over, dens = {}, {}, {}
    for i in range(len(hubs)):
        for j in range(i + 1, len(hubs)):
            k = (i, j, "enr")
            nij = sum(a and b for a, b in zip(inside[i], inside[j]))
            dist[k] = shares[i] * shares[j] / math.dist(hubs[i], hubs[j])
            over[k] = shares[i] * shares[j] * nij / math.sqrt(n[i] * n[j])
            dens[k] = shares[i] * shares[j] * nij / (n[i] * n[j])
    return dist, over, dens


def spearman(a, b):
    def ranks(x):
        order = sorted(range(len(x)), key=lambda i: x[i])
        r = [0.0] * len(x)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and x[order[j + 1]] == x[order[i]]:
                j += 1
            for k in range(i, j + 1):
                r[order[k]] = (i + j) / 2.0
            i = j + 1
        return r
    return gp.pearson(ranks(a), ranks(b))


def median(x):
    s = sorted(x)
    n = len(s)
    return s[n // 2] if n % 2 else 0.5 * (s[n // 2 - 1] + s[n // 2])


def run_layout(idx, n_flights=N_FLIGHTS, cf_pairs=CF_PAIRS):
    pts = load_nyc(10000.0)
    hubs, radii, speeds, shares = draw_layout(pts, idx)
    mix = mix_radii(pts, hubs, radii, shares)
    fn = lambda kind, vx, vy, h: base_layer("semi", kind, vx, vy, h)
    sim_in, h_in = gp.simulate_pairs(mix, speeds, LAM, fn, n_flights=n_flights, seed=7000 + idx)
    sim_fr, h_fr = gp.simulate_pairs(mix, speeds, LAM, fn, n_flights=n_flights, seed=8000 + idx)
    cf = gp.closed_form_pairs(mix, speeds, LAM, "semi", pairs=cf_pairs, seed=3 + idx)
    dist, over, dens = heuristics(pts, hubs, radii, shares)
    nontriv = gp.bipartitions()[1:]
    picks = {"cf": gp.best(nontriv, cf), "oracle": gp.best(nontriv, sim_in), "dist": gp.best(nontriv, dist),
             "overlap": gp.best(nontriv, over), "density": gp.best(nontriv, dens)}
    fl = h_fr * LAM
    fresh = {k: gp.score(sim_fr, p) / fl for k, p in picks.items()}
    fresh["mean"] = sum(gp.score(sim_fr, p) for p in nontriv) / len(nontriv) / fl
    one = (0,) * M
    cross = [(i, j) for i in range(M) for j in range(i + 1, M)]
    ws = [sim_in.get((i, j, "enr"), 0) for i, j in cross]
    wc = [cf.get((i, j, "enr"), 0.0) for i, j in cross]
    wd = [dist[(i, j, "enr")] for i, j in cross]
    return dict(idx=idx, hubs=hubs, radii=radii, speeds=speeds, shares=shares, picks=picks, fresh=fresh,
                semi=gp.score(sim_fr, one) / fl, semi_cf=gp.score(cf, one) / LAM, counts_fresh_semi=gp.score(sim_fr, one),
                r=gp.pearson(ws, wc), tot=sum(ws) / (h_in * LAM) / (sum(wc) / LAM), tau_w=kendall(wd, wc),
                cross_share=1 - sum(x for (i, j, z), x in sim_in.items() if z == "enr" and i == j) / gp.score(sim_in, one))


def main():
    t0 = time.time()
    P = print
    P(f"# Milestone 11g: {N_LAYOUTS} random eight-operator layouts; hubs >= {MIN_SEP:.0f} m apart within {HUB_R / 1000:.0f} km, "
      f"radii log-uniform {R_LO / 1000}-{R_HI / 1000} km, speeds U({V_LO:.0f}, {V_HI:.0f}) m/s, shares Dirichlet(1).")
    P(f"# Lambda {LAM}/h, R 50 m, base rule semi + one group bit; {N_FLIGHTS} flights per simulation, {CF_PAIRS} closed-form pairs.")
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool:
        res = pool.map(run_layout, range(N_LAYOUTS))
    meth = ("cf", "oracle", "dist", "overlap", "density")
    P("\n## Per layout (en-route conflicts per flight on the fresh run; ratios to cf)")
    P("idx  semi    cf      oracle  dist    overlap density mean   | cf/or dist/cf over/cf dens/cf mean/cf | r     tau_w  cross  radii km / speeds / shares")
    for s in res:
        f, c = s["fresh"], s["fresh"]["cf"]
        P(f"{s['idx']:3d}  {s['semi']:.4f}  " + "  ".join(f"{f[m]:.4f}" for m in meth + ("mean",)) +
          f" | {c / f['oracle']:.3f} {f['dist'] / c:.3f}   {f['overlap'] / c:.3f}   {f['density'] / c:.3f}   {f['mean'] / c:.3f}"
          f"   | {s['r']:.3f} {s['tau_w']:+.3f} {s['cross_share']:.3f}  "
          + " ".join(f"{r / 1000:.1f}" for r in s["radii"]) + " / " + " ".join(f"{v:.0f}" for v in s["speeds"])
          + " / " + " ".join(f"{x:.2f}" for x in s["shares"]))
    P("\n## Partitions picked (operator 0 in group 0)")
    for s in res:
        P(f"{s['idx']:3d}  " + "  ".join(f"{m} {''.join(map(str, s['picks'][m]))}" for m in meth))
    cf_or = [s["fresh"]["cf"] / s["fresh"]["oracle"] for s in res]
    d_cf = [s["fresh"]["dist"] / s["fresh"]["cf"] for s in res]
    o_cf = [s["fresh"]["overlap"] / s["fresh"]["cf"] for s in res]
    n_cf = [s["fresh"]["density"] / s["fresh"]["cf"] for s in res]
    m_cf = [s["fresh"]["cf"] / s["fresh"]["mean"] for s in res]
    taus = [s["tau_w"] for s in res]
    P("\n## Summary")
    for name, x in (("cf/oracle", cf_or), ("dist/cf", d_cf), ("overlap/cf", o_cf), ("density/cf", n_cf), ("cf/mean", m_cf)):
        P(f"{name:11s} median {median(x):.3f}  min {min(x):.3f}  max {max(x):.3f}")
    P(f"same pick as oracle: cf {sum(s['picks']['cf'] == s['picks']['oracle'] for s in res)}, dist "
      f"{sum(s['picks']['dist'] == s['picks']['oracle'] for s in res)}, density {sum(s['picks']['density'] == s['picks']['oracle'] for s in res)} of {len(res)}")
    P(f"cf/semi median {median([s['fresh']['cf'] / s['semi'] for s in res]):.3f}; dist/semi median "
      f"{median([s['fresh']['dist'] / s['semi'] for s in res]):.3f}; semi closed form / sim median {median([s['semi_cf'] / s['semi'] for s in res]):.3f}")
    rho = spearman(d_cf, taus)
    P("\n## Prediction checks")
    P(f"(1) cf within 5% of oracle in {sum(x <= 1.05 for x in cf_or)}/24 (>= 20: {sum(x <= 1.05 for x in cf_or) >= 20})")
    P(f"(2) dist >= 5% worse than cf in {sum(x >= 1.05 for x in d_cf)}/24 (>= 8: {sum(x >= 1.05 for x in d_cf) >= 8})")
    P(f"(3) median dist/cf {median(d_cf):.3f} >= 1.05: {median(d_cf) >= 1.05}")
    P(f"(4) median overlap/cf {median(o_cf):.3f} > median dist/cf {median(d_cf):.3f}: {median(o_cf) > median(d_cf)}")
    P(f"(5) median density/cf {median(n_cf):.3f} < median dist/cf {median(d_cf):.3f}: {median(n_cf) < median(d_cf)}")
    P(f"(6) Spearman(dist/cf, tau_w) {rho:+.3f} <= -0.4: {rho <= -0.4}")
    P(f"(7) Pearson r >= 0.9 in {sum(s['r'] >= 0.9 for s in res)}/24 (>= 22: {sum(s['r'] >= 0.9 for s in res) >= 22}); "
      f"cross total sim/cf median {median([s['tot'] for s in res]):.3f}")
    P(f"(8) cf/mean <= 0.75 in {sum(x <= 0.75 for x in m_cf)}/24 (all: {all(x <= 0.75 for x in m_cf)})")
    P(f"\n# runtime {time.time() - t0:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
