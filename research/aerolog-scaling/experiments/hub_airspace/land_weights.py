"""Milestone 11i: does a land mask close the rest of the paper weight's gap? 11h's gas integral with destinations
uniform over the service disc clipped to the 10 km study window, and over that clipped to New York City's land.

11h found that a gas-model integral with uniform service discs (gas_u: hub sites, radii, speeds and shares only)
recovers about four fifths of the closed form's gain over hub distance (median excess 2.6% against 13.6%), and that
with the real destinations the same integral equals the closed form (gas_d). Its "Next": gas_u with a land mask,
the cheapest demand information a planner has. This run splits gas_u's assumption into two parts a planner knows
without traffic data:

  gas_w   destinations uniform over the disc clipped to the 10 km window around 11a's hub that the destination
          file (and so every operator's real service area) is cut to. Removes gas_u's flights to places no
          operator in this study serves, a property of the study, not of the city.
  gas_l   destinations uniform over that, clipped to New York City's land (nyc_land_100m.json, from the city's
          shoreline-clipped borough boundaries; land_extract.py). Removes the rivers, the harbour and New Jersey.
          A city-licensed operator's service area is the city's land; the mask carries no demand density.

Both put one destination at each 100 m mask-cell centre inside the disc (weight 1 / count) and rasterise its ray
from the hub exactly as 11h's gas_d (25 m steps), so with no mask they reproduce gas_u's analytic field
(checked in tests). Everything else is 11h's: the 24 layouts of 11g, seeds, simulator, closed form (400,000 pairs),
max-cut over the 127 non-trivial bipartitions on each method's weights, scoring on the fresh run.

Data check made before these predictions were written (land_extract.py output, not a result): 19,754 of the
20,000 destinations (98.8%) sit in land cells; most of the rest are in Jersey City. The mask covers 49.7% of
the 10 km disc.

Predictions (written and committed before any gas_w or gas_l weight was computed):
 (1) gas_l within 5% of cf, out of sample, in at least 18 of 24 layouts (11h's gas_u: 13) (prior 55%).
 (2) median gas_l/cf <= 1.015 (gas_u 1.026) (prior 60%).
 (3) gas_l beats gas_u: it is strictly better than gas_u (lower fresh conflicts) in more layouts than it is
     strictly worse (prior 75%).
 (4) gas_l pair weights against the in-sample simulator: median Pearson r >= 0.98 (gas_u 0.967) (prior 65%).
 (5) median total gas_l/cf between 0.75 and 1.25 (gas_u 0.54: the mask removes the empty water and window) (prior 60%).
 (6) the window alone does less than half the work: median gas_w/cf - 1 >= half of median gas_u/cf - 1 (prior 50%).
 (7) gas_l picks the oracle's partition in at least 15 of 24 layouts (gas_u 11, cf 20) (prior 55%).
 (8) gas_l takes less CPU per layout than the closed form (prior 70%).
Preliminary.

    python3 land_weights.py > land_weights_results.txt
"""
import importlib.util
import json
import math
import multiprocessing as mp
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("hub_airspace_paper_weights_11i", os.path.join(HERE, "paper_weights.py"))
pw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pw)
rl, gp = pw.rl, pw.gp

H, STEP, LAM, M = pw.H, pw.STEP, pw.LAM, pw.rl.M
WINDOW = 10000.0


def load_land(path=os.path.join(HERE, "nyc_land_100m.json")):
    """Set of global 100 m cells (i, j) that are NYC land, centre within 10 km of the hub."""
    d = json.load(open(path))
    return {(i, int(j)) for j, runs in d["rows"].items() for a, b in runs for i in range(a, b + 1)}


def window_cells(h=H, keep=WINDOW):
    n = int(math.ceil(keep / h))
    return {(i, j) for i in range(-n, n) for j in range(-n, n) if ((i + 0.5) * h) ** 2 + ((j + 0.5) * h) ** 2 <= keep * keep}


def disc_cells(hub, r, h=H):
    hx, hy = hub
    out = []
    for i in range(int(math.floor((hx - r) / h)), int(math.ceil((hx + r) / h)) + 1):
        for j in range(int(math.floor((hy - r) / h)), int(math.ceil((hy + r) / h)) + 1):
            cx, cy = (i + 0.5) * h, (j + 0.5) * h
            if 0 < (cx - hx) ** 2 + (cy - hy) ** 2 <= r * r:
                out.append((i, j))
    return out


def density_cells(hub, r, mask, origin, h=H, step=STEP):
    """{cell: l} for destinations uniform over the mask cells (global 100 m indices) inside the disc; None = no mask.
    Cells are in paper_weights' grid relative to origin (a multiple of h)."""
    cells = [c for c in disc_cells(hub, r, h) if mask is None or c in mask]
    hx, hy = hub
    mix = [(1.0 / len(cells), 0, hx, hy, (i + 0.5) * h, (j + 0.5) * h) for i, j in cells]
    return pw.density_dest(mix, 0, 1.0, origin, h, step), len(cells)


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
    gu = pw.gas_weights([pw.density_uniform(hubs[k], radii[k], origin) for k in range(M)], hubs, speeds, shares, origin)
    win, land = window_cells(), load_land()
    t0 = time.process_time()
    lw = [density_cells(hubs[k], radii[k], win, origin) for k in range(M)]
    gw = pw.gas_weights([x[0] for x in lw], hubs, speeds, shares, origin)
    t_gw = time.process_time() - t0
    t0 = time.process_time()
    ll = [density_cells(hubs[k], radii[k], land, origin) for k in range(M)]
    gl = pw.gas_weights([x[0] for x in ll], hubs, speeds, shares, origin)
    t_gl = time.process_time() - t0
    full = [len(disc_cells(hubs[k], radii[k])) for k in range(M)]
    dist, _, _ = rl.heuristics(pts, hubs, radii, shares)
    nontriv = gp.bipartitions()[1:]
    picks = {"cf": gp.best(nontriv, cf), "oracle": gp.best(nontriv, sim_in), "dist": gp.best(nontriv, dist),
             "gas_u": gp.best(nontriv, gu), "gas_w": gp.best(nontriv, gw), "gas_l": gp.best(nontriv, gl)}
    fl = h_fr * LAM
    fresh = {k: gp.score(sim_fr, p) / fl for k, p in picks.items()}
    cross = [(i, j) for i in range(M) for j in range(i + 1, M)]
    col = lambda w: [w.get((i, j, "enr"), 0.0) for i, j in cross]
    ws, wc, wu, ww, wl = col(sim_in), col(cf), col(gu), col(gw), col(gl)
    return dict(idx=idx, picks=picks, fresh=fresh, t_cf=t_cf, t_gw=t_gw, t_gl=t_gl,
                frac_w=sum(x[1] for x in lw) / sum(full), frac_l=sum(x[1] for x in ll) / sum(full),
                r_gu_sim=gp.pearson(wu, ws), r_gw_sim=gp.pearson(ww, ws), r_gl_sim=gp.pearson(wl, ws),
                r_gl_cf=gp.pearson(wl, wc), tot_gu_cf=sum(wu) / sum(wc), tot_gw_cf=sum(ww) / sum(wc),
                tot_gl_cf=sum(wl) / sum(wc))


def main():
    t0 = time.time()
    P = print
    P(f"# Milestone 11i: land-masked paper weights on 11g's {rl.N_LAYOUTS} random eight-operator layouts; grid {H:.0f} m, ray step {STEP:.0f} m.")
    P(f"# Lambda {LAM}/h, base rule semi + one group bit; {rl.N_FLIGHTS} flights per simulation, {rl.CF_PAIRS} closed-form pairs.")
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool:
        res = pool.map(run_layout, range(rl.N_LAYOUTS))
    meth = ("cf", "oracle", "dist", "gas_u", "gas_w", "gas_l")
    P("\n## Per layout (en-route conflicts per flight on the fresh run; ratios to cf; disc cell fractions kept)")
    P("idx  " + "  ".join(f"{m:7s}" for m in meth) + " | dist/cf gas_u/cf gas_w/cf gas_l/cf | r(gu,sim) r(gw,sim) r(gl,sim) | tot gu gw gl /cf | kept w   l")
    for s in res:
        f, c = s["fresh"], s["fresh"]["cf"]
        P(f"{s['idx']:3d}  " + "  ".join(f"{f[m]:.4f} " for m in meth) +
          f" | {f['dist'] / c:.3f}   {f['gas_u'] / c:.3f}    {f['gas_w'] / c:.3f}    {f['gas_l'] / c:.3f}   "
          f" | {s['r_gu_sim']:.3f}     {s['r_gw_sim']:.3f}     {s['r_gl_sim']:.3f}    "
          f" | {s['tot_gu_cf']:.3f} {s['tot_gw_cf']:.3f} {s['tot_gl_cf']:.3f} | {s['frac_w']:.3f} {s['frac_l']:.3f}")
    P("\n## Partitions picked (operator 0 in group 0)")
    for s in res:
        P(f"{s['idx']:3d}  " + "  ".join(f"{m} {''.join(map(str, s['picks'][m]))}" for m in meth))
    ratio = {m: [s["fresh"][m] / s["fresh"]["cf"] for s in res] for m in meth}
    P("\n## Summary")
    for m in ("oracle", "dist", "gas_u", "gas_w", "gas_l"):
        x = ratio[m]
        P(f"{m + '/cf':9s} median {rl.median(x):.3f}  mean {sum(x) / len(x):.3f}  max {max(x):.3f}  within 5% of cf {sum(v <= 1.05 for v in x)}/24  "
          f"same pick as cf {sum(s['picks'][m] == s['picks']['cf'] for s in res)}/24  same as oracle {sum(s['picks'][m] == s['picks']['oracle'] for s in res)}/24")
    for name in ("r_gu_sim", "r_gw_sim", "r_gl_sim", "r_gl_cf", "tot_gu_cf", "tot_gw_cf", "tot_gl_cf", "frac_w", "frac_l"):
        x = [s[name] for s in res]
        P(f"{name:10s} median {rl.median(x):.3f}  min {min(x):.3f}  max {max(x):.3f}")
    tcf, tgw, tgl = (sum(s[k] for s in res) / len(res) for k in ("t_cf", "t_gw", "t_gl"))
    P(f"CPU seconds per layout: closed form {tcf:.2f}, gas_w {tgw:.2f}, gas_l {tgl:.2f}")
    better = sum(a < b for a, b in zip(ratio["gas_l"], ratio["gas_u"]))
    worse = sum(a > b for a, b in zip(ratio["gas_l"], ratio["gas_u"]))
    mu, mw, ml = (rl.median(ratio[m]) for m in ("gas_u", "gas_w", "gas_l"))
    P("\n## Prediction checks")
    n1 = sum(x <= 1.05 for x in ratio["gas_l"])
    P(f"(1) gas_l within 5% of cf in {n1}/24 (>= 18: {n1 >= 18})")
    P(f"(2) median gas_l/cf {ml:.3f} <= 1.015: {ml <= 1.015}")
    P(f"(3) gas_l better than gas_u in {better}, worse in {worse}: {better > worse}")
    r4 = rl.median([s["r_gl_sim"] for s in res])
    P(f"(4) median Pearson(gas_l, sim) {r4:.3f} >= 0.98: {r4 >= 0.98}")
    t5 = rl.median([s["tot_gl_cf"] for s in res])
    P(f"(5) median total gas_l/cf {t5:.3f} in [0.75, 1.25]: {0.75 <= t5 <= 1.25}")
    P(f"(6) median gas_w/cf - 1 = {mw - 1:.3f} >= half of gas_u's {mu - 1:.3f}: {mw - 1 >= (mu - 1) / 2}")
    n7 = sum(s["picks"]["gas_l"] == s["picks"]["oracle"] for s in res)
    P(f"(7) gas_l picks the oracle's partition in {n7}/24 (>= 15: {n7 >= 15})")
    P(f"(8) gas_l CPU {tgl:.2f} s < closed form {tcf:.2f} s: {tgl < tcf}")
    P(f"\n# runtime {time.time() - t0:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
