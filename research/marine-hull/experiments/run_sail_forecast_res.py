"""Milestone 5b, part 2: 5b part 1 found that perfect 5-minute-block forecasts, over 60 or 120 minutes, add nothing to the
header-follower, and that the horizon changes nothing. Hypothesis: what the clairvoyant exploits is not look-ahead but the
time resolution of the wind it sees. Test: the controller gets the TRUE future 1-min wind for 30 minutes (so a perfect forecast
at that horizon) but plans and replans on blocks of `step` minutes, step in {1, 3, 10, 30}. Every 3rd window of each month
(about a third of the sample); switch margin in {0, 0.3} chosen on January. Same polar, corridor and tau as run_sail_tack.py.
Run: PYTHONPATH=src:experiments python3 experiments/run_sail_forecast_res.py > experiments/results_sail_forecast_res.txt"""
import glob, multiprocessing as mp, os, statistics
import numpy as np
from marine_hull.tack import circ_mean, rates, bound, sim_corridor, sim_header, dp_clairvoyant, sim_mpc, wrap
from run_sail_tack import polar, load, DT, CORR, DWELL

TAU, H, STEPS, MARGINS = 30.0, 30, (1, 3, 10, 30), (0.0, 0.3)

def job(path):
    vf, bf = polar()
    s, d, t, tm = load(path)
    rows = []
    for i, w0 in enumerate(range(0, len(s) - 1440, 1440)):
        raw = (t >= w0) & (t < w0 + 1440)
        if raw.sum() < 0.9 * 240 or i % 3:
            continue
        ss, dw = s[w0:w0 + 1440], d[w0:w0 + 1440]
        phi = circ_mean(dw)
        p, c = rates(ss, wrap(dw - phi), vf, bf)
        bd = bound(p, DT)
        if bd < 5000.0:
            continue
        rec = {"path": os.path.basename(path), "A": sim_corridor(p, c, DT, CORR, TAU)[0] / bd,
               "B": sim_header(p, c, DT, CORR, TAU, 0.3, DWELL)[0] / bd, "DP": dp_clairvoyant(p, c, DT, CORR, TAU) / bd}
        fc = lambda k: (p[:, k:k + H], c[:, k:k + H])
        for st in STEPS:
            for mg in MARGINS:
                rec[(st, mg)] = sim_mpc(p, c, DT, CORR, TAU, H, fc, step=st, margin=mg)[0] / bd
        rows.append(rec)
    return rows

def med(x): return statistics.median(x)

def main():
    files = sorted(glob.glob("experiments/data/coops_wind_*.csv"))
    with mp.Pool(4) as pool:
        res = pool.map(job, files, chunksize=1)
    allr = [r for rr in res for r in rr]
    jan = [r for r in allr if "_202401" in r["path"]]; jul = [r for r in allr if "_202407" in r["path"]]
    print(f"every 3rd window: Jan {len(jan)}, Jul {len(jul)}; tau {TAU:.0f} s; perfect 1-min forecast for {H} min; planning block = step minutes")
    rng = np.random.default_rng(5)
    best = {st: max(MARGINS, key=lambda m: med([r[(st, m)] for r in jan])) for st in STEPS}
    for name, rs in (("January", jan), ("July", jul)):
        fm = lambda x: f"{med(x):.3f} ({np.percentile(x, 10):.3f}..{np.percentile(x, 90):.3f})"
        print(f"\n{name}: median share of the bound (10th..90th)")
        for key, lab in (("A", "corridor-edge tacking"), ("B", "header-following (margin 0.3)"), ("DP", "clairvoyant DP")):
            print(f"  {lab:34s} {fm([r[key] for r in rs])}")
        gap = med([r["DP"] for r in rs]) - med([r["B"] for r in rs])
        for st in STEPS:
            mg = best[st]; x = [r[(st, mg)] for r in rs]; dif = np.array([r[(st, mg)] - r["B"] for r in rs])
            bs = [np.median(rng.choice(dif, len(dif))) for _ in range(1000)]
            print(f"  mpc step {st:2d} min, margin {mg} (Jan): {fm(x)}; minus header {100*med(list(dif)):+.1f} pts (boot 95% {100*np.percentile(bs,2.5):+.1f}..{100*np.percentile(bs,97.5):+.1f}); share of the {100*gap:.1f}-pt gap closed {(med(x)-med([r['B'] for r in rs]))/gap:.0%}")

if __name__ == "__main__":
    main()
