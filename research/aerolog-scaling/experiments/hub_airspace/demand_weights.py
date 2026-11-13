"""Milestone 11j: do census residents or jobs give a planner the closed form's layer split on paper? 11h's gas
integral with destinations weighted by where New Yorkers live (2020 Census) or work (LODES 2022), against the
uniform disc (gas_u), the land mask (gas_l), the closed form and the simulator's best, on 11g's 24 layouts.

11h: a gas-model grid integral with uniform service discs (gas_u) recovers about four fifths of the closed form's
gain over hub distance (median excess 2.6%); with the real destinations the same integral equals the closed form.
11i: a land mask (gas_l) closes about 0.7 of those 2.6 points and none of the pair-ranking error (median Pearson r
against the simulator 0.964 against gas_u's 0.967). Its reading: the missing demand information is the density of
customers on land, which a mask lacks. Its "Next": census-tract population or jobs as the destination density.

Methods (all public data a planner has without any traffic record; nyc_demand_100m.json, demand_extract.py):
  gas_p   destinations in proportion to 2020 residents: each block group's population at its population centroid's
          100 m cell, kept inside the operator's service disc.
  gas_j   destinations in proportion to jobs (LODES 8 WAC 2022, all jobs, C000) at each block's internal point.
  gas_pj  residents plus jobs (counts added; an origin-or-destination proxy with no fitted weight).
Each weights a cell's destination by its count over the disc's total and rasterises its ray from the hub exactly as
11i's gas_l (25 m steps); with every land cell weighted 1 it is gas_l (checked in tests). gas_u and gas_l are
recomputed. Everything else is 11h's: layouts, seeds, simulator, closed form (400,000 pairs), max-cut over the 127
non-trivial bipartitions on each method's weights, scoring on the fresh run.

Data check made before these predictions were written (demand_extract.py output, not a result): the 10 km window
holds 3.19 M of NYC's 8.80 M residents (2,264 cells) and 3.06 M of its 4.47 M jobs (6,638 cells). The destinations
are April 2014 Uber pickups (11a), which are known to be concentrated in Manhattan, as jobs are; this was the
reason for the predictions below, and no cell-level comparison with the pickups was made before they were written.

Predictions (written and committed before any gas_p, gas_j or gas_pj weight was computed):
 (1) median gas_j/cf <= 1.010 (gas_l 1.019, gas_u 1.026) (prior 55%).
 (2) gas_j within 5% of cf, out of sample, in at least 20 of 24 layouts (gas_l 17) (prior 55%).
 (3) jobs beat residents: median gas_j/cf < median gas_p/cf (prior 70%).
 (4) residents beat the land mask: gas_p strictly better than gas_l in more layouts than strictly worse (prior 55%).
 (5) gas_j pair weights against the in-sample simulator: median Pearson r >= 0.98 (gas_l 0.964) (prior 60%).
 (6) gas_j picks the oracle's partition in at least 14 of 24 layouts (gas_l 8, gas_u 11, cf 20) (prior 50%).
 (7) median total gas_j/cf between 0.8 and 1.25 (gas_l 0.741) (prior 55%).
 (8) gas_pj is no better than the better of gas_p and gas_j (median ratio to cf) (prior 65%).
 (9) gas_j takes less CPU per layout than the closed form (prior 85%).
Reported after the predictions, as diagnostics: Pearson r between each proxy's 100 m cell counts and the 20,000
pickups' (on land cells in the window), and a sign test of each proxy against gas_l.
Preliminary.

    python3 demand_weights.py > demand_weights_results.txt
"""
import importlib.util
import json
import math
import multiprocessing as mp
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("hub_airspace_land_weights_11j", os.path.join(HERE, "land_weights.py"))
lw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lw)
pw, rl, gp = lw.pw, lw.rl, lw.gp
H, M = lw.H, lw.M
LAM = pw.LAM
PROXIES = ("gas_p", "gas_j", "gas_pj")


def load_demand(path=os.path.join(HERE, "nyc_demand_100m.json")):
    """{"pop": {(i, j): n}, "jobs": {(i, j): n}, "pj": sum of both} on the global 100 m grid."""
    d = json.load(open(path))
    conv = lambda m: {tuple(int(v) for v in k.split(",")): n for k, n in m.items()}
    pop, job = conv(d["pop"]), conv(d["jobs"])
    pj = dict(pop)
    for c, n in job.items():
        pj[c] = pj.get(c, 0) + n
    return {"pop": pop, "jobs": job, "pj": pj}


def density_weighted(hub, r, counts, origin, h=H, step=pw.STEP):
    """{cell: l} for destinations at the cells of `counts` inside the disc, in proportion to the counts."""
    cells = [(c, counts[c]) for c in lw.disc_cells(hub, r, h) if counts.get(c, 0) > 0]
    tot = sum(n for _, n in cells)
    hx, hy = hub
    mix = [(n / tot, 0, hx, hy, (i + 0.5) * h, (j + 0.5) * h) for (i, j), n in cells]
    return pw.density_dest(mix, 0, 1.0, origin, h, step), tot


def run_layout(idx, n_flights=rl.N_FLIGHTS, cf_pairs=rl.CF_PAIRS):
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    fn = lambda kind, vx, vy, h: rl.base_layer("semi", kind, vx, vy, h)
    sim_in, h_in = gp.simulate_pairs(mix, speeds, LAM, fn, n_flights=n_flights, seed=7000 + idx)
    sim_fr, h_fr = gp.simulate_pairs(mix, speeds, LAM, fn, n_flights=n_flights, seed=8000 + idx)
    t0 = time.process_time()
    cf = gp.closed_form_pairs(mix, speeds, LAM, "semi", pairs=cf_pairs, seed=3 + idx)
    t_cf = time.process_time() - t0
    origin = pw.grid_bounds(hubs, radii)
    w = {"gas_u": pw.gas_weights([pw.density_uniform(hubs[k], radii[k], origin) for k in range(M)], hubs, speeds, shares, origin)}
    land = lw.load_land()
    w["gas_l"] = pw.gas_weights([lw.density_cells(hubs[k], radii[k], land, origin)[0] for k in range(M)], hubs, speeds, shares, origin)
    dem = load_demand()
    t = {}
    for name, key in zip(PROXIES, ("pop", "jobs", "pj")):
        t0 = time.process_time()
        w[name] = pw.gas_weights([density_weighted(hubs[k], radii[k], dem[key], origin)[0] for k in range(M)],
                                 hubs, speeds, shares, origin)
        t[name] = time.process_time() - t0
    dist, _, _ = rl.heuristics(pts, hubs, radii, shares)
    nontriv = gp.bipartitions()[1:]
    picks = {"cf": gp.best(nontriv, cf), "oracle": gp.best(nontriv, sim_in), "dist": gp.best(nontriv, dist)}
    picks.update({k: gp.best(nontriv, v) for k, v in w.items()})
    fl = h_fr * LAM
    fresh = {k: gp.score(sim_fr, p) / fl for k, p in picks.items()}
    cross = [(i, j) for i in range(M) for j in range(i + 1, M)]
    col = lambda x: [x.get((i, j, "enr"), 0.0) for i, j in cross]
    ws, wc = col(sim_in), col(cf)
    r_sim = {k: gp.pearson(col(v), ws) for k, v in w.items()}
    tot = {k: sum(col(v)) / sum(wc) for k, v in w.items()}
    return dict(idx=idx, picks=picks, fresh=fresh, t_cf=t_cf, t=t, r_sim=r_sim, tot=tot)


def cell_correlations():
    """Pearson r over land cells in the window: each proxy's counts against the 20,000 pickups' counts."""
    land = lw.load_land()
    pick = {}
    for x, y in rl.load_nyc(10000.0):
        c = (math.floor(x / H), math.floor(y / H))
        pick[c] = pick.get(c, 0) + 1
    dem = load_demand()
    cells = sorted(land)
    ys = [pick.get(c, 0) for c in cells]
    return {k: gp.pearson([dem[k].get(c, 0) for c in cells], ys) for k in ("pop", "jobs", "pj")}, len(cells)


def main():
    t0 = time.time()
    P = print
    P(f"# Milestone 11j: census-weighted paper weights on 11g's {rl.N_LAYOUTS} random eight-operator layouts; grid {H:.0f} m, ray step {pw.STEP:.0f} m.")
    P(f"# Lambda {LAM}/h, base rule semi + one group bit; {rl.N_FLIGHTS} flights per simulation, {rl.CF_PAIRS} closed-form pairs.")
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool:
        res = pool.map(run_layout, range(rl.N_LAYOUTS))
    meth = ("cf", "oracle", "dist", "gas_u", "gas_l") + PROXIES
    gas = ("gas_u", "gas_l") + PROXIES
    P("\n## Per layout (en-route conflicts per flight on the fresh run, then ratios to cf)")
    P("idx  " + "  ".join(f"{m:7s}" for m in meth) + " | " + " ".join(f"{m + '/cf':9s}" for m in meth[2:]))
    for s in res:
        f, c = s["fresh"], s["fresh"]["cf"]
        P(f"{s['idx']:3d}  " + "  ".join(f"{f[m]:.4f} " for m in meth) + " | " + " ".join(f"{f[m] / c:9.3f}" for m in meth[2:]))
    P("\n## Pair weights: Pearson r against the in-sample simulator | cross total / cf's")
    P("idx  " + " ".join(f"{m:7s}" for m in gas) + " | " + " ".join(f"{m:7s}" for m in gas))
    for s in res:
        P(f"{s['idx']:3d}  " + " ".join(f"{s['r_sim'][m]:.3f}  " for m in gas) + " | " + " ".join(f"{s['tot'][m]:.3f}  " for m in gas))
    P("\n## Partitions picked (operator 0 in group 0)")
    for s in res:
        P(f"{s['idx']:3d}  " + "  ".join(f"{m} {''.join(map(str, s['picks'][m]))}" for m in meth))
    ratio = {m: [s["fresh"][m] / s["fresh"]["cf"] for s in res] for m in meth}
    med = {m: rl.median(ratio[m]) for m in meth}
    P("\n## Summary")
    for m in meth[1:]:
        x = ratio[m]
        P(f"{m + '/cf':10s} median {med[m]:.3f}  mean {sum(x) / len(x):.3f}  max {max(x):.3f}  within 5% of cf {sum(v <= 1.05 for v in x)}/24  "
          f"same pick as cf {sum(s['picks'][m] == s['picks']['cf'] for s in res)}/24  same as oracle {sum(s['picks'][m] == s['picks']['oracle'] for s in res)}/24")
    for m in gas:
        r = [s["r_sim"][m] for s in res]
        tt = [s["tot"][m] for s in res]
        P(f"{m:7s} r(sim) median {rl.median(r):.3f} min {min(r):.3f} | total/cf median {rl.median(tt):.3f} min {min(tt):.3f} max {max(tt):.3f}")
    tcf = sum(s["t_cf"] for s in res) / len(res)
    tp = {m: sum(s["t"][m] for s in res) / len(res) for m in PROXIES}
    P(f"CPU seconds per layout: closed form {tcf:.2f}, " + ", ".join(f"{m} {tp[m]:.2f}" for m in PROXIES))
    P("\n## Against the land mask (sign test, two-sided, ties dropped)")
    for m in PROXIES:
        b = sum(a < l for a, l in zip(ratio[m], ratio["gas_l"]))
        wo = sum(a > l for a, l in zip(ratio[m], ratio["gas_l"]))
        n = b + wo
        p = min(1.0, 2 * sum(math.comb(n, k) for k in range(0, min(b, wo) + 1)) / 2 ** n) if n else 1.0
        P(f"{m:7s} better than gas_l in {b}, worse in {wo}, tied {24 - n}; p = {p:.3f}")
    rc, ncell = cell_correlations()
    P(f"\n## Diagnostic: Pearson r of 100 m cell counts against the pickups', over {ncell} land cells in the window")
    P("  " + "  ".join(f"{k} {v:.3f}" for k, v in rc.items()))
    P("\n## Prediction checks")
    P(f"(1) median gas_j/cf {med['gas_j']:.3f} <= 1.010: {med['gas_j'] <= 1.010}")
    n2 = sum(x <= 1.05 for x in ratio["gas_j"])
    P(f"(2) gas_j within 5% of cf in {n2}/24 (>= 20: {n2 >= 20})")
    P(f"(3) median gas_j/cf {med['gas_j']:.3f} < gas_p/cf {med['gas_p']:.3f}: {med['gas_j'] < med['gas_p']}")
    b = sum(a < l for a, l in zip(ratio["gas_p"], ratio["gas_l"]))
    wo = sum(a > l for a, l in zip(ratio["gas_p"], ratio["gas_l"]))
    P(f"(4) gas_p better than gas_l in {b}, worse in {wo}: {b > wo}")
    r5 = rl.median([s["r_sim"]["gas_j"] for s in res])
    P(f"(5) median Pearson(gas_j, sim) {r5:.3f} >= 0.98: {r5 >= 0.98}")
    n6 = sum(s["picks"]["gas_j"] == s["picks"]["oracle"] for s in res)
    P(f"(6) gas_j picks the oracle's partition in {n6}/24 (>= 14: {n6 >= 14})")
    t7 = rl.median([s["tot"]["gas_j"] for s in res])
    P(f"(7) median total gas_j/cf {t7:.3f} in [0.8, 1.25]: {0.8 <= t7 <= 1.25}")
    P(f"(8) median gas_pj/cf {med['gas_pj']:.3f} >= min(gas_p, gas_j) {min(med['gas_p'], med['gas_j']):.3f}: "
      f"{med['gas_pj'] >= min(med['gas_p'], med['gas_j'])}")
    P(f"(9) gas_j CPU {tp['gas_j']:.2f} s < closed form {tcf:.2f} s: {tp['gas_j'] < tcf}")
    P(f"\n# runtime {time.time() - t0:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
