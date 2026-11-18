"""Milestone 5c: is the 12-point clairvoyant gap a planner limit, an edge-rule artefact, or fine-scale information?
Pre-registered in LOG.md before this ran. Two changes to 5a/5b, same data (CO-OPS wind, Jan and Jul 2024), polar, corridor 1.5 km,
tau 30 s, 24 h windows:
 (1) the clairvoyant DP of 5a lets the boat sit on the corridor edge with no tack, while every simulated controller must tack
     there; `dp_values(edge_tack=True)` obeys the same rule ("DPe"). The old one is kept as "DP".
 (2) a full-day DP policy (no finite horizon, so no terminal-value problem) built on the wind rates smoothed by a centred
     moving average of w minutes (w = 1 is the exact wind), executed on the TRUE wind with the boat observing its own state.
     This is a controller that knows the wind's behaviour at scales above w exactly for the whole day and nothing faster.
The header-follower margin 0.3 is that of 5a (chosen on January). Every 2nd window of each month.
Run: PYTHONPATH=src:experiments python3 experiments/run_sail_policy.py > experiments/results_sail_policy.txt"""
import glob, multiprocessing as mp, os, statistics
import numpy as np
from marine_hull.tack import circ_mean, rates, bound, sim_corridor, sim_header, dp_clairvoyant, dp_values, sim_policy, smooth, wrap
from run_sail_tack import polar, load, DT, CORR, DWELL

TAU, WIDTHS, EVERY = 30.0, (1, 5, 15, 30, 60, 120), 2

def job(path):
    vf, bf = polar()
    s, d, t, tm = load(path)
    rows = []
    for i, w0 in enumerate(range(0, len(s) - 1440, 1440)):
        raw = (t >= w0) & (t < w0 + 1440)
        if raw.sum() < 0.9 * 240 or i % EVERY:
            continue
        ss, dw = s[w0:w0 + 1440], d[w0:w0 + 1440]
        phi = circ_mean(dw)
        p, c = rates(ss, wrap(dw - phi), vf, bf)
        bd = bound(p, DT)
        if bd < 5000.0:
            continue
        g, V = dp_values(p, c, DT, CORR, TAU)
        m = len(g) // 2
        rec = {"path": os.path.basename(path), "A": sim_corridor(p, c, DT, CORR, TAU)[0] / bd,
               "B": sim_header(p, c, DT, CORR, TAU, 0.3, DWELL)[0] / bd,
               "DP": dp_clairvoyant(p, c, DT, CORR, TAU) / bd, "DPe": max(V[0, :, m]) / bd}
        for w in WIDTHS:
            if w == 1:
                gv, Vw, ps, cs = g, V, p, c
            else:
                ps, cs = smooth(p, w), smooth(c, w)
                gv, Vw = dp_values(ps, cs, DT, CORR, TAU)
            x, n_t = sim_policy(p, c, ps, cs, DT, CORR, TAU, gv, Vw)
            rec[w] = x / bd; rec[("n", w)] = n_t
        rec[("n", "B")] = sim_header(p, c, DT, CORR, TAU, 0.3, DWELL)[1]
        rows.append(rec)
    return rows

def med(x): return statistics.median(x)

def main():
    files = sorted(glob.glob("experiments/data/coops_wind_*.csv"))
    with mp.Pool(4) as pool:
        res = pool.map(job, files, chunksize=1)
    allr = [r for rr in res for r in rr]
    rng = np.random.default_rng(7)
    print(f"every {EVERY}nd window; tau {TAU:.0f} s; corridor {CORR:.0f} m; shares of the no-corridor no-tack-cost bound")
    for name, tag in (("January", "_202401"), ("July", "_202407")):
        rs = [r for r in allr if tag in r["path"]]
        fm = lambda x: f"{med(x):.3f} ({np.percentile(x, 10):.3f}..{np.percentile(x, 90):.3f})"
        print(f"\n{name}: {len(rs)} windows; median share (10th..90th)")
        for key, lab in (("A", "corridor-edge tacking"), ("B", "header-following (margin 0.3)"), ("DP", "clairvoyant DP, edge unpenalised (5a)"), ("DPe", "clairvoyant DP, edge tack forced")):
            print(f"  {lab:40s} {fm([r[key] for r in rs])}")
        gap = med([r["DPe"] for r in rs]) - med([r["B"] for r in rs])
        print(f"  gap header -> DPe: {100*gap:.1f} pts (to old DP: {100*(med([r['DP'] for r in rs])-med([r['B'] for r in rs])):.1f})")
        for w in WIDTHS:
            x = [r[w] for r in rs]; dif = np.array([r[w] - r["B"] for r in rs])
            bs = [np.median(rng.choice(dif, len(dif))) for _ in range(1000)]
            nt = med([r[("n", w)] for r in rs])
            print(f"  DP policy on {w:3d}-min smoothed wind: {fm(x)}; minus header {100*med(list(dif)):+.1f} pts (boot 95% {100*np.percentile(bs,2.5):+.1f}..{100*np.percentile(bs,97.5):+.1f}); share of gap closed {(med(x)-med([r['B'] for r in rs]))/gap:.0%}; median tacks/day {nt:.0f} (header {med([r[('n','B')] for r in rs]):.0f})")

if __name__ == "__main__":
    main()
