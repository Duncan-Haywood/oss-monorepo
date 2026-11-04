"""Milestone 5e (copy of run_sail_lead.py with a switch margin): see LOG.md. Milestone 5d: how much of 5c's +5 point gain over the header-follower survives a forecast whose error grows with lead time?
Forecast at replan time k0 (hourly): a(L)*truth smoothed to 15 min + (1-a(L))*trailing-hour mean, a(L)=exp(-L/T), T in minutes
(T=inf is 5c's knowledge, T=0 persistence). Controller tack.sim_replan; same windows, polar, corridor and tau as 5c (every 4th).
Run: PYTHONPATH=src:experiments python3 experiments/run_sail_margin.py > experiments/results_sail_margin.txt"""
import glob, multiprocessing as mp, os, statistics
import numpy as np
from marine_hull.tack import circ_mean, rates, bound, sim_header, dp_values, sim_policy, smooth, wrap, sim_replan, lead_forecast
from run_sail_tack import polar, load, DT, CORR, DWELL

TAU, EVERY, TS, MS = 30.0, 8, (0.0, 30.0, 60.0, 120.0), (0.0, 0.5, 1.0, 2.0)

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
        rec = {"path": os.path.basename(path), "B": sim_header(p, c, DT, CORR, TAU, 0.3, DWELL)[0] / bd}
        ps, cs = smooth(p, 15), smooth(c, 15)
        g, V = dp_values(ps, cs, DT, CORR, TAU)
        rec["oneshot"] = sim_policy(p, c, ps, cs, DT, CORR, TAU, g, V)[0] / bd
        for T in TS:
            for m in MS:
                x, n = sim_replan(p, c, DT, CORR, TAU, lambda k0: lead_forecast(p, c, k0, T), every=60, margin=m)
                rec[(T, m)] = x / bd; rec[("n", T, m)] = n
        rows.append(rec)
    return rows

def main():
    files = sorted(glob.glob("experiments/data/coops_wind_*.csv"))
    with mp.Pool(4) as pool:
        allr = [r for rr in pool.map(job, files, chunksize=1) for r in rr]
    rng = np.random.default_rng(7)
    print(f"every {EVERY}th window; hourly replan; shares of the no-corridor no-tack-cost bound")
    for name, tag in (("January", "_202401"), ("July", "_202407")):
        rs = [r for r in allr if tag in r["path"]]
        B = statistics.median(r["B"] for r in rs); O = statistics.median(r["oneshot"] for r in rs)
        print(f"\n{name}: {len(rs)} windows; header {B:.3f}; 5c one-shot (15-min smoothed, whole day) {O:.3f}")
        for T in TS:
            for m in MS:
                dif = np.array([r[(T, m)] - r["B"] for r in rs])
                bs = [np.median(rng.choice(dif, len(dif))) for _ in range(1000)]
                mm = statistics.median(r[(T, m)] for r in rs)
                print(f"  T={T:4.0f} margin={m:3.1f}: {mm:.3f}; minus header {100*np.median(dif):+.1f} pts (boot 95% {100*np.percentile(bs,2.5):+.1f}..{100*np.percentile(bs,97.5):+.1f}); share of 5c gain kept {(mm-B)/(O-B):.0%}; tacks/day {statistics.median(r[('n', T, m)] for r in rs):.0f}")

if __name__ == "__main__":
    main()
