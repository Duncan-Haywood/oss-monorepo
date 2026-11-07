"""Milestone 6z: does forecast value (5d) rise or fall when a tack costs the fielded 120 to 360 s (6w, 6x)?
5d: hourly replans with a forecast a(L)*truth(15-min smoothed) + (1-a(L))*trailing mean, a = exp(-L/T), priced a tack at 30 s.
Here the same forecasts feed tack.sim_replan_dead (tack = whole steps of dead time) at tau in {120, 240, 360} s, against the
header-follower (margin 0.5, 6x's January choice at 240 s), the corridor tacker and the clairvoyant dead-time DP.
Same windows (every 4th), polar, corridor as 5d.
Run: PYTHONPATH=src:experiments python3 experiments/run_sail_lead_dead.py > experiments/results_sail_lead_dead.txt"""
import glob, multiprocessing as mp, os, statistics
import numpy as np
from marine_hull.tack import circ_mean, rates, bound, sim_corridor, sim_header, dp_clairvoyant_dead, sim_replan_dead, lead_forecast, wrap
from run_sail_tack import polar, load, DT, CORR, DWELL

TAUS, EVERY, TS, MARGIN_B = (120.0, 240.0, 360.0), 4, (0.0, 60.0, 240.0, float("inf")), 0.5

def job(path):
    vf, bf = polar()
    s, d, t, tm = load(path)
    rows = []
    for i, w0 in enumerate(range(0, len(s) - 1440, 1440)):
        raw = (t >= w0) & (t < w0 + 1440)
        if raw.sum() < 0.9 * 240 or i % EVERY:
            continue
        ss, dw = s[w0:w0 + 1440], d[w0:w0 + 1440]
        p, c = rates(ss, wrap(dw - circ_mean(dw)), vf, bf)
        bd = bound(p, DT)
        if bd < 5000.0:
            continue
        rec = {"path": os.path.basename(path)}
        for tau in TAUS:
            m = int(round(tau / DT))
            rec[("A", tau)] = sim_corridor(p, c, DT, CORR, tau)[0] / bd
            rec[("B", tau)] = sim_header(p, c, DT, CORR, tau, MARGIN_B, DWELL)[0] / bd
            rec[("DP", tau)] = dp_clairvoyant_dead(p, c, DT, CORR, m) / bd
            for T in TS:
                x, n = sim_replan_dead(p, c, DT, CORR, m, lambda k0: lead_forecast(p, c, k0, T), every=60)
                rec[(T, tau)] = x / bd; rec[("n", T, tau)] = n
        rows.append(rec)
    return rows

def main():
    files = sorted(glob.glob("experiments/data/coops_wind_*.csv"))
    with mp.Pool(4) as pool:
        allr = [r for rr in pool.map(job, files, chunksize=1) for r in rr]
    rng = np.random.default_rng(13)
    print(f"every {EVERY}th window; hourly replan; shares of the no-corridor no-tack-cost bound; header margin {MARGIN_B}")
    for name, tag in (("January", "_202401"), ("July (holdout)", "_202407")):
        rs = [r for r in allr if tag in r["path"]]
        print(f"\n{name}: {len(rs)} windows")
        for tau in TAUS:
            md = lambda k: statistics.median(r[k] for r in rs)
            print(f" tau {tau:.0f} s: corridor {md(('A', tau)):.3f}; header {md(('B', tau)):.3f}; clairvoyant {md(('DP', tau)):.3f}")
            for T in TS:
                dif = np.array([r[(T, tau)] - r[("B", tau)] for r in rs])
                bs = [np.median(rng.choice(dif, len(dif))) for _ in range(1000)]
                print(f"   T={T:5.0f} min: {md((T, tau)):.3f}; minus header {100*np.median(dif):+.1f} pts (boot 95% {100*np.percentile(bs,2.5):+.1f}..{100*np.percentile(bs,97.5):+.1f}); tacks/day {statistics.median(r[('n', T, tau)] for r in rs):.0f}")

if __name__ == "__main__":
    main()
