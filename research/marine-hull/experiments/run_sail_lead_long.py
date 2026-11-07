"""Milestone 6z: does forecast lead time pay more at a measured tack cost? 5d's hourly-replan controller (tack.sim_replan) with a
forecast of skill T, rerun at tau = 240 s with dead time carried across steps (tack.sim_replan_dead, dp_values_dead). Same windows
(every 4th), polar, corridor and DT as 5d (run_sail_lead.py). Header margin 0.5 (6x's January choice at 240 s). Clairvoyant = dp_clairvoyant_dead.
Run: PYTHONPATH=src:experiments python3 experiments/run_sail_lead_long.py > experiments/results_sail_lead_long.txt"""
import glob, multiprocessing as mp, os, statistics, sys
import numpy as np
from marine_hull.tack import circ_mean, rates, bound, sim_corridor, sim_header, dp_clairvoyant_dead, sim_replan_dead, lead_forecast, wrap
from run_sail_tack import polar, load, DT, CORR, DWELL

TAU, EVERY, TS, MARGIN = 240.0, 4, (0.0, 30.0, 120.0, float("inf")), 0.5

def job(path):
    vf, bf = polar()
    s, d, t, tm = load(path)
    m = int(round(TAU / DT)); rows = []
    for i, w0 in enumerate(range(0, len(s) - 1440, 1440)):
        raw = (t >= w0) & (t < w0 + 1440)
        if raw.sum() < 0.9 * 240 or i % EVERY:
            continue
        ss, dw = s[w0:w0 + 1440], d[w0:w0 + 1440]
        p, c = rates(ss, wrap(dw - circ_mean(dw)), vf, bf)
        bd = bound(p, DT)
        if bd < 5000.0:
            continue
        rec = {"path": os.path.basename(path), "A": sim_corridor(p, c, DT, CORR, TAU)[0] / bd,
               "B": sim_header(p, c, DT, CORR, TAU, MARGIN, DWELL)[0] / bd, "DP": dp_clairvoyant_dead(p, c, DT, CORR, m) / bd}
        for T in TS:
            x, n = sim_replan_dead(p, c, DT, CORR, m, lambda k0: lead_forecast(p, c, k0, T), every=60)
            rec[T] = x / bd; rec[("n", T)] = n
        rows.append(rec)
    return rows

def main():
    files = sorted(glob.glob("experiments/data/coops_wind_*.csv"))
    with mp.Pool(4) as pool:
        allr = [r for rr in pool.map(job, files, chunksize=1) for r in rr]
    rng = np.random.default_rng(7)
    print(f"tau {TAU:.0f} s dead time; every {EVERY}th window; hourly replan; header margin {MARGIN}; shares of the no-corridor no-tack-cost bound")
    for name, tag in (("January", "_202401"), ("July", "_202407")):
        rs = [r for r in allr if tag in r["path"]]
        med = lambda k: statistics.median(r[k] for r in rs)
        print(f"\n{name}: {len(rs)} windows; corridor {med('A'):.3f}; header {med('B'):.3f}; clairvoyant {med('DP'):.3f}")
        for T in TS:
            dif = np.array([r[T] - r["B"] for r in rs])
            bs = [np.median(rng.choice(dif, len(dif))) for _ in range(1000)]
            print(f"  T={T:5.0f} min: {med(T):.3f}; minus header {100*np.median(dif):+.1f} pts (boot 95% {100*np.percentile(bs,2.5):+.1f}..{100*np.percentile(bs,97.5):+.1f}); tacks/day {statistics.median(r[('n',T)] for r in rs):.0f}")

if __name__ == "__main__":
    main()
