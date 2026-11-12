"""Milestone 11h: how much of the closed form's layer split can a planner get on paper? A gas-model grid integral
with uniform service discs, against the closed form, the simulator's best and hub distance, on 11g's 24 layouts.

11g found that max-cut on the closed form's pair weights lands within sampling noise of the simulator's best
two-group operator split in 24 of 24 random eight-operator layouts, while hub distance s_i s_j / d_ij leaves a
median 14% more en-route conflicts. But the closed form is a Monte Carlo over 400,000 leg pairs drawn from the real
destination list. Its "Next": a weight that adds radius and speed to distance, to see how much of the closed form
a planner can get without traffic data.

Model. Every flight of operator i flies straight out from its hub and back, so at a point x all of i's legs move
along the unit vector u_i(x) from the hub to x: outbound at +v_i u_i, inbound at -v_i u_i. Let l_i(x) be the
expected one-leg path length per unit area per flight (1/m). Then i's outbound and inbound aircraft densities are
both lam_i l_i(x) / v_i, and the kinetic-gas rate of losses of separation R between two straight flows is
2 R |v_a - v_b| n_a n_b per unit area (the continuum form of 11d's crossing window 2 R |v_a - v_b| / |v_a x v_b|).
Under semi (eastbound and westbound in different layers) only the same-layer combinations of out/in count. So

    w_ij = 2 R lam_i lam_j / (v_i v_j) * sum over cells of h^2 l_i l_j sum_{a, b in {o, i}, same layer} |v_a - v_b|.

Two versions of l_i:
  gas_u   uniform destinations in the service disc: l_i(rho) = (1 - rho^2 / r_i^2) / (2 pi rho), rho < r_i
          (rho floored at h / 2). Inputs: hub sites, radii, speeds, shares. No destination data, no sampling.
  gas_d   the real destination list rasterised: each destination's ray from the hub, stepped every 25 m, adds its
          share-weighted length to the cells it crosses. Same inputs as the closed form; a check that the gas
          integral is the closed form's continuum limit, so that gas_u's misses can be put on the uniform-disc
          assumption alone.
  distv   s_i s_j sqrt(v_i^2 + v_j^2) / (v_i v_j d_ij): hub distance corrected by the gas model's speed factor
          (densities scale as 1/v, relative speed for random bearings roughly as sqrt(v_i^2 + v_j^2)). A scalar.
Grid h = 100 m over the union of the service discs.

Layouts, simulator and scoring: exactly 11g's (random_layouts.run_layout: seeds 1100 + idx for the layout, 7000 + idx
in-sample, 8000 + idx fresh, 200,000 flights each, closed form 400,000 pairs). Every method picks one of the 127
non-trivial bipartitions by max-cut on its own weights and is scored on the fresh run. 11g's cf, oracle and dist
picks are recomputed here, and must match 11g's results file.

Predictions (written and committed before any gas weight was computed for a random layout):
 (1) gas_d against the closed form, over the 28 cross pairs: Pearson r >= 0.95 in at least 22 of 24 layouts.
 (2) gas_d's pick leaves at most 5% more en-route conflicts than cf's, out of sample, in at least 22 of 24.
 (3) gas_u: median gas_u/cf <= 1.05 (prior 55%).
 (4) gas_u beats hub distance: median gas_u/cf below median dist/cf (prior 75%).
 (5) gas_u within 5% of cf in at least 16 of 24 layouts (prior 50%).
 (6) distv beats dist: median distv/cf below median dist/cf (prior 60%).
 (7) gas_u pair weights against the in-sample simulator: Pearson r >= 0.8 in at least 18 of 24 layouts.
 (8) gas_u takes under a tenth of the closed form's compute time per layout (prior 80%).
Preliminary.

    python3 paper_weights.py > paper_weights_results.txt
"""
import importlib.util
import math
import multiprocessing as mp
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("hub_airspace_random_layouts_11h", os.path.join(HERE, "random_layouts.py"))
rl = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rl)
gp = rl.gp

H = 100.0
STEP = 25.0
R_SEP = 50.0
LAM = rl.LAM


def _layer_semi(vx, vy):
    return 0 if (vx > 0 or (vx == 0 and vy > 0)) else 1


def grid_bounds(hubs, radii, h=H):
    x0 = min(hx - r for (hx, _), r in zip(hubs, radii))
    y0 = min(hy - r for (_, hy), r in zip(hubs, radii))
    return math.floor(x0 / h) * h, math.floor(y0 / h) * h


def density_uniform(hub, r, origin, h=H):
    """{cell: l} for uniform destinations in a disc of radius r: (1 - rho^2 / r^2) / (2 pi rho)."""
    hx, hy = hub
    x0, y0 = origin
    out = {}
    i_lo, i_hi = int(math.floor((hx - r - x0) / h)), int(math.ceil((hx + r - x0) / h))
    j_lo, j_hi = int(math.floor((hy - r - y0) / h)), int(math.ceil((hy + r - y0) / h))
    for i in range(i_lo, i_hi + 1):
        cx = x0 + (i + 0.5) * h
        for j in range(j_lo, j_hi + 1):
            cy = y0 + (j + 0.5) * h
            rho = math.hypot(cx - hx, cy - hy)
            if rho < r:
                rho_e = max(rho, h / 2)
                out[(i, j)] = (1 - rho * rho / (r * r)) / (2 * math.pi * rho_e)
    return out


def density_dest(mix, op, share, origin, h=H, step=STEP):
    """{cell: l} from operator op's destinations: each ray hub -> destination, weight w / share, stepped every step m."""
    x0, y0 = origin
    out = {}
    a = h * h
    for w, j, hx, hy, x, y in mix:
        if j != op:
            continue
        d = math.hypot(x - hx, y - hy)
        n = max(1, int(round(d / step)))
        ds = d / n
        f = w / share * ds / a
        for k in range(n):
            t = (k + 0.5) / n
            c = (int(math.floor((hx + t * (x - hx) - x0) / h)), int(math.floor((hy + t * (y - hy) - y0) / h)))
            out[c] = out.get(c, 0.0) + f
    return out


def gas_pair(la, lb, hub_a, hub_b, va, vb, sa, sb, origin, h=H, R=R_SEP, lam_h=LAM):
    """Gas-model en-route conflicts per hour between operators a and b under semi."""
    x0, y0 = origin
    lam = lam_h / 3600.0
    if len(lb) < len(la):
        la, lb, hub_a, hub_b, va, vb, sa, sb = lb, la, hub_b, hub_a, vb, va, sb, sa
    acc = 0.0
    for c, l1 in la.items():
        l2 = lb.get(c)
        if not l2:
            continue
        cx, cy = x0 + (c[0] + 0.5) * h, y0 + (c[1] + 0.5) * h
        ra, rb = math.hypot(cx - hub_a[0], cy - hub_a[1]), math.hypot(cx - hub_b[0], cy - hub_b[1])
        if ra == 0 or rb == 0:
            continue
        ua = ((cx - hub_a[0]) / ra * va, (cy - hub_a[1]) / ra * va)
        ub = ((cx - hub_b[0]) / rb * vb, (cy - hub_b[1]) / rb * vb)
        g = 0.0
        for pa in (1, -1):
            wa = (pa * ua[0], pa * ua[1])
            for pb in (1, -1):
                wb = (pb * ub[0], pb * ub[1])
                if _layer_semi(*wa) == _layer_semi(*wb):
                    g += math.hypot(wa[0] - wb[0], wa[1] - wb[1])
        acc += l1 * l2 * g
    na, nb = lam * sa / va, lam * sb / vb
    return 2 * R * na * nb * acc * h * h * 3600.0


def gas_weights(lmaps, hubs, speeds, shares, origin):
    m = len(hubs)
    return {(i, j, "enr"): gas_pair(lmaps[i], lmaps[j], hubs[i], hubs[j], speeds[i], speeds[j], shares[i], shares[j], origin)
            for i in range(m) for j in range(i + 1, m)}


def distv_weights(hubs, speeds, shares):
    m = len(hubs)
    return {(i, j, "enr"): shares[i] * shares[j] * math.hypot(speeds[i], speeds[j]) / (speeds[i] * speeds[j] * math.dist(hubs[i], hubs[j]))
            for i in range(m) for j in range(i + 1, m)}


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
    origin = grid_bounds(hubs, radii)
    t0 = time.process_time()
    gu = gas_weights([density_uniform(hubs[k], radii[k], origin) for k in range(rl.M)], hubs, speeds, shares, origin)
    t_gu = time.process_time() - t0
    t0 = time.process_time()
    gd = gas_weights([density_dest(mix, k, shares[k], origin) for k in range(rl.M)], hubs, speeds, shares, origin)
    t_gd = time.process_time() - t0
    dist, _, _ = rl.heuristics(pts, hubs, radii, shares)
    dv = distv_weights(hubs, speeds, shares)
    nontriv = gp.bipartitions()[1:]
    picks = {"cf": gp.best(nontriv, cf), "oracle": gp.best(nontriv, sim_in), "dist": gp.best(nontriv, dist),
             "distv": gp.best(nontriv, dv), "gas_u": gp.best(nontriv, gu), "gas_d": gp.best(nontriv, gd)}
    fl = h_fr * LAM
    fresh = {k: gp.score(sim_fr, p) / fl for k, p in picks.items()}
    cross = [(i, j) for i in range(rl.M) for j in range(i + 1, rl.M)]
    col = lambda w: [w.get((i, j, "enr"), 0.0) for i, j in cross]
    ws, wc, wu, wd = col(sim_in), col(cf), col(gu), col(gd)
    return dict(idx=idx, picks=picks, fresh=fresh, t_cf=t_cf, t_gu=t_gu, t_gd=t_gd,
                r_gd_cf=gp.pearson(wd, wc), r_gu_sim=gp.pearson(wu, ws), r_cf_sim=gp.pearson(wc, ws), r_gd_sim=gp.pearson(wd, ws),
                tot_gd_cf=sum(wd) / sum(wc), tot_gu_cf=sum(wu) / sum(wc), tot_sim_cf=sum(ws) / h_in / sum(wc))


def main():
    t0 = time.time()
    P = print
    P(f"# Milestone 11h: paper weights on 11g's {rl.N_LAYOUTS} random eight-operator layouts; grid {H:.0f} m, ray step {STEP:.0f} m.")
    P(f"# Lambda {LAM}/h, R {R_SEP:.0f} m, base rule semi + one group bit; {rl.N_FLIGHTS} flights per simulation, {rl.CF_PAIRS} closed-form pairs.")
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool:
        res = pool.map(run_layout, range(rl.N_LAYOUTS))
    meth = ("cf", "oracle", "dist", "distv", "gas_u", "gas_d")
    P("\n## Per layout (en-route conflicts per flight on the fresh run; ratios to cf)")
    P("idx  " + "  ".join(f"{m:7s}" for m in meth) + " | dist/cf distv/cf gas_u/cf gas_d/cf | r(gd,cf) r(gu,sim) r(cf,sim) | gu/cf gd/cf sim/cf totals")
    for s in res:
        f, c = s["fresh"], s["fresh"]["cf"]
        P(f"{s['idx']:3d}  " + "  ".join(f"{f[m]:.4f} " for m in meth) +
          f" | {f['dist'] / c:.3f}   {f['distv'] / c:.3f}    {f['gas_u'] / c:.3f}    {f['gas_d'] / c:.3f}   "
          f" | {s['r_gd_cf']:.3f}    {s['r_gu_sim']:.3f}     {s['r_cf_sim']:.3f}    | {s['tot_gu_cf']:.3f} {s['tot_gd_cf']:.3f} {s['tot_sim_cf']:.3f}")
    P("\n## Partitions picked (operator 0 in group 0)")
    for s in res:
        P(f"{s['idx']:3d}  " + "  ".join(f"{m} {''.join(map(str, s['picks'][m]))}" for m in meth))
    ratio = {m: [s["fresh"][m] / s["fresh"]["cf"] for s in res] for m in meth}
    P("\n## Summary")
    for m in ("oracle", "dist", "distv", "gas_u", "gas_d"):
        x = ratio[m]
        P(f"{m + '/cf':9s} median {rl.median(x):.3f}  min {min(x):.3f}  max {max(x):.3f}  within 5% of cf {sum(v <= 1.05 for v in x)}/24  "
          f"same pick as cf {sum(s['picks'][m] == s['picks']['cf'] for s in res)}/24  same as oracle {sum(s['picks'][m] == s['picks']['oracle'] for s in res)}/24")
    for name in ("r_gd_cf", "r_gu_sim", "r_cf_sim", "r_gd_sim", "tot_gu_cf", "tot_gd_cf", "tot_sim_cf"):
        x = [s[name] for s in res]
        P(f"{name:10s} median {rl.median(x):.3f}  min {min(x):.3f}  max {max(x):.3f}")
    tcf, tgu, tgd = (sum(s[k] for s in res) / len(res) for k in ("t_cf", "t_gu", "t_gd"))
    P(f"CPU seconds per layout: closed form {tcf:.2f}, gas_u {tgu:.2f}, gas_d {tgd:.2f}")
    P("\n## Prediction checks")
    n1 = sum(s["r_gd_cf"] >= 0.95 for s in res)
    P(f"(1) Pearson(gas_d, cf) >= 0.95 in {n1}/24 (>= 22: {n1 >= 22})")
    n2 = sum(x <= 1.05 for x in ratio["gas_d"])
    P(f"(2) gas_d within 5% of cf in {n2}/24 (>= 22: {n2 >= 22})")
    P(f"(3) median gas_u/cf {rl.median(ratio['gas_u']):.3f} <= 1.05: {rl.median(ratio['gas_u']) <= 1.05}")
    P(f"(4) median gas_u/cf {rl.median(ratio['gas_u']):.3f} < median dist/cf {rl.median(ratio['dist']):.3f}: {rl.median(ratio['gas_u']) < rl.median(ratio['dist'])}")
    n5 = sum(x <= 1.05 for x in ratio["gas_u"])
    P(f"(5) gas_u within 5% of cf in {n5}/24 (>= 16: {n5 >= 16})")
    P(f"(6) median distv/cf {rl.median(ratio['distv']):.3f} < median dist/cf {rl.median(ratio['dist']):.3f}: {rl.median(ratio['distv']) < rl.median(ratio['dist'])}")
    n7 = sum(s["r_gu_sim"] >= 0.8 for s in res)
    P(f"(7) Pearson(gas_u, sim) >= 0.8 in {n7}/24 (>= 18: {n7 >= 18})")
    P(f"(8) gas_u CPU {tgu:.2f} s < closed form {tcf:.2f} s / 10: {tgu < tcf / 10}")
    P(f"\n# runtime {time.time() - t0:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
