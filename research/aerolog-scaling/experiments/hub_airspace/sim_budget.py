"""Milestone 11l: how much simulation does a planner need to pick the altitude-layer split, and does the paper ranking
let them run less? Short simulations, alone or restricted to the residents-plus-jobs paper weight's top k splits, on
11g's 24 eight-operator layouts.

11k: no hedging rule beats the paper weight's argmax, but the in-sample simulator's best split (the "oracle", 200,000
flights) is in gas_pj's top 5 in 21 of 24 layouts. Its "Next": test rank-on-paper-then-simulate as a procedure,
priced in simulator seconds.

A short simulation of n flights is a noisy estimate of every pair weight; picking the best of 127 splits on it suffers
the winner's curse. Restricting the choice to the paper weight's top k trades that noise against the paper's bias.

Rules, each scored on 11g's fresh 200,000-flight run (seed 8000 + layout) as a ratio to the closed form's split:
  sim(n)        the best of all 127 splits on one simulation of n flights.
  top{k}(n)     the best of gas_pj's top k splits on the same simulation, k in {3, 5, 10}.
  gas_pj        11j's paper argmax (no simulation); cf: the closed form (400,000 pairs).
n in {5,000, 10,000, 20,000, 50,000} with 3 replicate seeds each (20000 + 1000 rep + 100 n_index + layout), and
200,000 = 11g's in-sample run (seed 7000 + layout; sim(200k) is the oracle), one replicate.
Cost: CPU seconds of each simulation are measured. In this simulator conflicts are pair-separable, so one run scores
every split; a simulator with conflict resolution (BlueSky) would need one run per candidate split, so cost there is
k (or 127) times the run. Both are reported.

Predictions (written and committed before any short simulation was run):
 (1) top5(200k) mean ratio to cf within 0.005 of the oracle's 1.000 (prior 70%; the oracle is in top 5 in 21 of 24).
 (2) at n = 20,000, top5 has a lower mean ratio than sim (prior 65%; the paper prior cuts the winner's curse).
 (3) top5(20k) mean ratio <= 1.020 (prior 50%).
 (4) sim(5k) mean ratio above gas_pj's 1.033: a 2.5% simulation is worse than paper alone (prior 45%).
 (5) the smallest n at which top5(n) has mean ratio <= 1.010 is at most 50,000 (prior 55%).
 (6) simulation CPU time is linear in n: time(200k) / time(20k) between 7 and 13 (prior 80%).
 (7) at every n < 200k, top5 is better than or equal to sim on the mean (prior 50%).
 (8) top3(20k) is better than top10(20k) on the mean (prior 45%).
Preliminary.

    python3 sim_budget.py > sim_budget_results.txt
"""
import importlib.util
import multiprocessing as mp
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("hub_airspace_robust_selection_11l", os.path.join(HERE, "robust_selection.py"))
rs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rs)
dw, lw, pw, rl, gp = rs.dw, rs.lw, rs.pw, rs.rl, rs.gp
M, LAM = rs.M, rs.LAM
NS = (5000, 10000, 20000, 50000)
REPS = 3
KS = (3, 5, 10)


def run_layout(idx, n_flights=rl.N_FLIGHTS, cf_pairs=rl.CF_PAIRS):
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    fn = lambda kind, vx, vy, h: rl.base_layer("semi", kind, vx, vy, h)
    t0 = time.process_time()
    sim_in, _ = gp.simulate_pairs(mix, speeds, LAM, fn, n_flights=n_flights, seed=7000 + idx)
    t_full = time.process_time() - t0
    sim_fr, h_fr = gp.simulate_pairs(mix, speeds, LAM, fn, n_flights=n_flights, seed=8000 + idx)
    cf = gp.closed_form_pairs(mix, speeds, LAM, "semi", pairs=cf_pairs, seed=3 + idx)
    origin = pw.grid_bounds(hubs, radii)
    dem = dw.load_demand()
    w_pj = pw.gas_weights([dw.density_weighted(hubs[k], radii[k], dem["pj"], origin)[0] for k in range(M)],
                          hubs, speeds, shares, origin)
    parts = gp.bipartitions()[1:]
    mk = rs.masks(parts)
    order, _ = rs.ranked(parts, rs.vec(w_pj), mk)
    top = {k: [parts[a] for a in order[:k]] for k in KS}
    fl = h_fr * LAM
    sc = lambda p: gp.score(sim_fr, p) / fl
    base = sc(gp.best(parts, cf))
    out = {"gas_pj": sc(parts[order[0]]) / base, "oracle_in_top5": gp.best(parts, sim_in) in top[5]}
    runs = [(n_flights, 0, sim_in, t_full)]
    for ni, n in enumerate(NS):
        for rep in range(REPS):
            t0 = time.process_time()
            s, _ = gp.simulate_pairs(mix, speeds, LAM, fn, n_flights=n, seed=20000 + 1000 * rep + 100 * ni + idx)
            runs.append((n, rep, s, time.process_time() - t0))
    ratio, cpu = {}, {}
    for n, rep, s, t in runs:
        ratio[("sim", n, rep)] = sc(gp.best(parts, s)) / base
        for k in KS:
            ratio[(f"top{k}", n, rep)] = sc(gp.best(top[k], s)) / base
        cpu.setdefault(n, []).append(t)
    return dict(idx=idx, ratio=ratio, cpu=cpu, out=out)


def main():
    t0 = time.time()
    P = print
    P(f"# Milestone 11l: simulation budget for the layer split, alone or restricted to gas_pj's top k; 11g's {rl.N_LAYOUTS} layouts.")
    P(f"# Short runs n = {NS} x {REPS} seeds; full run {rl.N_FLIGHTS} flights (11g's in-sample); scoring on the fresh {rl.N_FLIGHTS}-flight run.")
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool:
        res = pool.map(run_layout, range(rl.N_LAYOUTS))
    allns = NS + (rl.N_FLIGHTS,)
    rules = ("sim",) + tuple(f"top{k}" for k in KS)

    def vals(rule, n):
        reps = REPS if n != rl.N_FLIGHTS else 1
        return [s["ratio"][(rule, n, r)] for s in res for r in range(reps)]

    mean = lambda x: sum(x) / len(x)
    P("\n## Fresh ratio to cf, pooled over layouts and replicate seeds (24 x 3 runs per short n, 24 at 200k)")
    P(f"{'rule':7s} {'n':>7s}  {'mean':>6s} {'median':>6s} {'max':>6s}  within5%  cpu_s/run  cpu_s(one run per candidate)")
    cpu = {n: mean([t for s in res for t in s["cpu"][n]]) for n in allns}
    summ = {}
    for rule in rules:
        for n in allns:
            x = vals(rule, n)
            summ[(rule, n)] = mean(x)
            ncand = 127 if rule == "sim" else int(rule[3:])
            P(f"{rule:7s} {n:7d}  {mean(x):6.3f} {rl.median(x):6.3f} {max(x):6.3f}  {sum(v <= 1.05 for v in x):3d}/{len(x):3d}  "
              f"{cpu[n]:9.2f}  {ncand * cpu[n]:9.1f}")
    pj = [s["out"]["gas_pj"] for s in res]
    P(f"gas_pj  (paper, no simulation)  mean {mean(pj):.3f} median {rl.median(pj):.3f} max {max(pj):.3f} within5% {sum(v <= 1.05 for v in pj)}/24")
    P(f"oracle in gas_pj top 5: {sum(s['out']['oracle_in_top5'] for s in res)}/24")
    P("\n## Per layout: mean over replicate seeds of the fresh ratio to cf (sim | top5)")
    P("idx  gas_pj  " + "  ".join(f"{n:>6d}s {n:>6d}t5" for n in allns))
    for s in res:
        row = []
        for n in allns:
            reps = REPS if n != rl.N_FLIGHTS else 1
            row.append(f"{mean([s['ratio'][('sim', n, r)] for r in range(reps)]):7.3f} {mean([s['ratio'][('top5', n, r)] for r in range(reps)]):8.3f}")
        P(f"{s['idx']:3d}  {s['out']['gas_pj']:6.3f}  " + "  ".join(row))
    P("\n## top5 against sim at each n (per run, two-sided sign test, ties dropped)")
    for n in allns:
        lo, hi, p = rs.sign_test(vals("top5", n), vals("sim", n))
        P(f"n {n:7d}: top5 better in {lo:3d}, worse in {hi:3d}, p = {p:.3f}")
    P("\n## Prediction checks")
    a = summ[("top5", rl.N_FLIGHTS)]
    P(f"(1) top5(200k) mean {a:.3f} within 0.005 of oracle {summ[('sim', rl.N_FLIGHTS)]:.3f}: {abs(a - summ[('sim', rl.N_FLIGHTS)]) <= 0.005}")
    P(f"(2) top5(20k) mean {summ[('top5', 20000)]:.3f} < sim(20k) {summ[('sim', 20000)]:.3f}: {summ[('top5', 20000)] < summ[('sim', 20000)]}")
    P(f"(3) top5(20k) mean {summ[('top5', 20000)]:.3f} <= 1.020: {summ[('top5', 20000)] <= 1.020}")
    P(f"(4) sim(5k) mean {summ[('sim', 5000)]:.3f} > gas_pj {mean(pj):.3f}: {summ[('sim', 5000)] > mean(pj)}")
    hit = [n for n in allns if summ[("top5", n)] <= 1.010]
    P(f"(5) smallest n with top5 mean <= 1.010: {hit[0] if hit else None} (<= 50000: {bool(hit) and hit[0] <= 50000})")
    r6 = cpu[rl.N_FLIGHTS] / cpu[20000]
    P(f"(6) cpu(200k) / cpu(20k) = {r6:.2f} in [7, 13]: {7 <= r6 <= 13}")
    ok7 = all(summ[("top5", n)] <= summ[("sim", n)] for n in NS)
    P(f"(7) top5 <= sim on the mean at every n < 200k: {ok7}")
    P(f"(8) top3(20k) {summ[('top3', 20000)]:.3f} < top10(20k) {summ[('top10', 20000)]:.3f}: {summ[('top3', 20000)] < summ[('top10', 20000)]}")
    P(f"\n# runtime {time.time() - t0:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
