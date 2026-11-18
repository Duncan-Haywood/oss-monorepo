"""Milestone 11o: when can a planner stop asking operators for their real destination maps? Stopping rules for the
sequential disclosures of 11n, free (stop when the paper pick stops changing) or guarded by one short simulation.

11n: asking by traffic share puts 22 of 24 layouts within 5% of the closed form's split after one disclosure, and the
census-only influence order reaches all 24 after four; but some disclosures make the split worse before the next one
repairs it (6 under share order), so a planner who stops at an intermediate set without a check can be > 2% worse.
11l: in this pair-separable simulator a 20,000-flight run costs 0.31 CPU s and picks a split a mean 1.2% above the
closed form's when it chooses among all 127 splits.

Setup as 11n: 11g's 24 eight-operator layouts, census maps C and real maps R, every disclosure set's paper pick (the
argmax of the mixed gas weight); fresh 200,000-flight scoring as a ratio to the closed form's split. For an order o
(share or influence, as 11n), p_m is the paper pick after the first m disclosures (p_0 = gas_pj, p_8 = gas_d).
Rules:
  fixed(m)    p_m at a fixed m (11n's curves; share m = 1, influence m = 4 quoted).
  stable      stop at the first m >= 1 with p_m == p_{m-1}; choose p_m. No simulation. If never, m = 8.
  stable2     stop at the first m >= 2 with p_m == p_{m-1} == p_{m-2}; choose p_m.
  guard       stop as stable; choose the best of the distinct picks p_0..p_stop on one short simulation.
  guardall    disclose all eight; choose the best of the distinct picks p_0..p_8 on one short simulation.
  sim20k      the best of all 127 splits on the same short simulation (11l's rule; no disclosure).
Short simulations: 20,000 flights, 3 replicate seeds per layout (30000 + 1000 rep + layout), fresh relative to 11g's
in-sample (7000 +) and scoring (8000 +) runs and 11l's short runs (20000 +). Cost: disclosures used, and candidate
splits simulated (in a simulator with conflict resolution each candidate is a run; here one run scores them all).

Predictions (written and committed before any stopping rule or short simulation was computed):
 (1) stable(share) uses a mean <= 3 disclosures and has mean fresh ratio <= 1.015 (prior 50%).
 (2) stable(influence) has a mean fresh ratio <= stable(share)'s (prior 50%).
 (3) guard(share) mean fresh ratio <= 1.008, below sim20k's, with a mean <= 4 candidates (prior 45%).
 (4) guardall(influence) puts all 72 layout-replicates within 5% of cf (prior 60%).
 (5) under share order, stable stops in at least 2 layouts where a later prefix is > 2% better (prior 55%).
 (6) stable2 uses >= 1 more disclosure than stable on the mean and lowers the mean ratio by >= 0.003 (prior 40%).
 (7) the full share path has a mean <= 4 distinct picks p_0..p_8 (prior 55%).
Preliminary.

    python3 stopping.py > stopping_results.txt
"""
import importlib.util
import multiprocessing as mp
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("hub_airspace_disclosure_11o", os.path.join(HERE, "disclosure.py"))
dc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dc)
od, rs, dw, pw, rl, gp = dc.od, dc.rs, dc.dw, dc.pw, dc.rl, dc.gp
M, LAM, CROSS, SUBSETS = dc.M, dc.LAM, dc.CROSS, dc.SUBSETS
N_SHORT = 20000
REPS = 3
ORDERS = ("share", "influence")


def path_picks(pick, order):
    return [pick[frozenset(order[:m])] for m in range(M + 1)]


def stop_stable(path, run=1):
    """First m >= run with path[m-run..m] all equal; M if none."""
    for m in range(run, len(path)):
        if all(path[m - r] == path[m] for r in range(1, run + 1)):
            return m
    return len(path) - 1


def distinct(path):
    out = []
    for p in path:
        if p not in out:
            out.append(p)
    return out


def guard_choice(cands, short):
    return min(cands, key=lambda p: (gp.score(short, p), p))


def run_layout(idx, n_flights=rl.N_FLIGHTS, cf_pairs=rl.CF_PAIRS, n_short=N_SHORT, reps=REPS):
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
    base = gp.score(sim_fr, gp.best(parts, cf)) / fl
    fresh = lambda p: gp.score(sim_fr, p) / fl / base
    pick = {D: gp.best(parts, od.mixed(pairw, dc.src_of(D))) for D in SUBSETS}
    wc = od.mixed(pairw, "C" * M)
    infl = dc.influence(parts, wc, pick[frozenset()])
    orders = {"share": dc.order_by(shares), "influence": dc.order_by([infl[k] + 1e-9 * shares[k] for k in range(M)])}
    shorts = [gp.simulate_pairs(mix, speeds, LAM, fn, n_flights=n_short, seed=30000 + 1000 * rep + idx)[0]
              for rep in range(reps)]
    out = dict(idx=idx, sim20k=[fresh(gp.best(parts, s)) for s in shorts])
    for name, o in orders.items():
        path = path_picks(pick, o)
        fr = [fresh(p) for p in path]
        m1, m2 = stop_stable(path, 1), stop_stable(path, 2)
        cg, ca = distinct(path[:m1 + 1]), distinct(path)
        out[name] = dict(order=o, fr=fr, m1=m1, m2=m2, nd_stop=len(cg), nd_all=len(ca),
                         stable=fr[m1], stable2=fr[m2],
                         guard=[fresh(guard_choice(cg, s)) for s in shorts],
                         guardall=[fresh(guard_choice(ca, s)) for s in shorts],
                         later_better=min(fr[m1 + 1:], default=fr[m1]) < fr[m1] / 1.02)
    return out


def main():
    t0 = time.time()
    P = print
    P(f"# Milestone 11o: stopping rules for sequential disclosure of real destination maps; 11g's {rl.N_LAYOUTS} layouts.")
    P(f"# Fresh {rl.N_FLIGHTS}-flight scoring as a ratio to the closed form's split; guards use one {N_SHORT}-flight "
      f"simulation, {REPS} replicate seeds per layout.")
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool:
        res = pool.map(run_layout, range(rl.N_LAYOUTS))
    mean = lambda x: sum(x) / len(x)
    w5 = lambda x: sum(v <= 1.05 for v in x)

    P("\n## Rules (mean, max, within 5% of cf; disclosures used; candidate splits simulated per decision)")
    P(f"{'rule':22s} {'mean':>6s} {'max':>6s} {'within5%':>9s} {'discl':>6s} {'cands':>6s}")
    summ = {}

    def row(name, vals, discl, cands):
        summ[name] = mean(vals)
        P(f"{name:22s} {mean(vals):6.3f} {max(vals):6.3f} {w5(vals):4d}/{len(vals):<4d} {discl:6.2f} {cands:6.2f}")

    row("gas_pj (m=0)", [s["share"]["fr"][0] for s in res], 0, 0)
    row("fixed share m=1", [s["share"]["fr"][1] for s in res], 1, 0)
    row("fixed influence m=4", [s["influence"]["fr"][4] for s in res], 4, 0)
    row("gas_d (m=8)", [s["share"]["fr"][8] for s in res], 8, 0)
    row("sim20k (all 127)", [v for s in res for v in s["sim20k"]], 0, 127)
    for o in ORDERS:
        row(f"stable({o})", [s[o]["stable"] for s in res], mean([s[o]["m1"] for s in res]), 0)
        row(f"stable2({o})", [s[o]["stable2"] for s in res], mean([s[o]["m2"] for s in res]), 0)
        row(f"guard({o})", [v for s in res for v in s[o]["guard"]], mean([s[o]["m1"] for s in res]),
            mean([s[o]["nd_stop"] for s in res]))
        row(f"guardall({o})", [v for s in res for v in s[o]["guardall"]], 8, mean([s[o]["nd_all"] for s in res]))

    P("\n## Per layout: stop points and fresh ratios (guard: mean over replicates)")
    P("idx  order      m1 m2 nd  stable stable2  guard guardall   path p_0..p_8")
    for s in res:
        for o in ORDERS:
            d = s[o]
            P(f"{s['idx']:3d}  {o:9s} {d['m1']:3d} {d['m2']:2d} {d['nd_all']:2d}  {d['stable']:6.3f} {d['stable2']:7.3f} "
              f"{mean(d['guard']):6.3f} {mean(d['guardall']):8.3f}   " + " ".join(f"{x:.3f}" for x in d["fr"]))

    P("\n## Guard against sim20k per layout-replicate (two-sided sign test, ties dropped)")
    for o in ORDERS:
        for g in ("guard", "guardall"):
            a = [v for s in res for v in s[o][g]]
            b = [v for s in res for v in s["sim20k"]]
            lo, hi, p = rs.sign_test(a, b)
            P(f"{g}({o}) better in {lo}, worse in {hi}, p = {p:.3f}")

    P("\n## Prediction checks")
    ms = mean([s["share"]["m1"] for s in res])
    P(f"(1) stable(share) mean disclosures {ms:.2f} <= 3 and mean ratio {summ['stable(share)']:.3f} <= 1.015: "
      f"{ms <= 3 and summ['stable(share)'] <= 1.015}")
    P(f"(2) stable(influence) {summ['stable(influence)']:.3f} <= stable(share) {summ['stable(share)']:.3f}: "
      f"{summ['stable(influence)'] <= summ['stable(share)']}")
    nc = mean([s["share"]["nd_stop"] for s in res])
    P(f"(3) guard(share) {summ['guard(share)']:.3f} <= 1.008 and < sim20k {summ['sim20k (all 127)']:.3f}, "
      f"candidates {nc:.2f} <= 4: {summ['guard(share)'] <= 1.008 and summ['guard(share)'] < summ['sim20k (all 127)'] and nc <= 4}")
    ga = [v for s in res for v in s["influence"]["guardall"]]
    P(f"(4) guardall(influence) within 5%: {w5(ga)}/{len(ga)}: {w5(ga) == len(ga)}")
    lb = [s["idx"] for s in res if s["share"]["later_better"]]
    P(f"(5) share: stable stops where a later prefix is > 2% better in {len(lb)} layouts {lb}: {len(lb) >= 2}")
    dm = mean([s["share"]["m2"] for s in res]) - ms
    dr = summ["stable(share)"] - summ["stable2(share)"]
    P(f"(6) share: stable2 uses {dm:.2f} more disclosures and lowers the mean by {dr:.4f}: {dm >= 1 and dr >= 0.003}")
    nd = mean([s["share"]["nd_all"] for s in res])
    P(f"(7) share path mean distinct picks {nd:.2f} <= 4: {nd <= 4}")
    P(f"\n# runtime {time.time() - t0:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
