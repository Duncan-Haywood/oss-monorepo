"""Milestone 5b: how much of the header-follower-to-clairvoyant gap does a wind forecast close?
Same windows, polar, corridor (+-1.5 km), tau = 30 s and bound as run_sail_tack.py (which this imports from). A receding-horizon
controller (tack.sim_mpc, replans every 5 min) is given one of these forecasts of the next H minutes of wind:
  persist   the mean wind of the last 10 minutes held constant (the no-skill forecast)
  smooth    the TRUE future wind smoothed with a centred 30-min moving mean (a forecast that is perfect on 30-min scales and
            knows nothing of gusts shorter than that); uses the future, so it bounds what a real forecast can do
  raw       the true future 1-min wind (perfect, gusts included) over the horizon only
Run: PYTHONPATH=src python3 experiments/run_sail_forecast.py > experiments/results_sail_forecast.txt"""
import glob, multiprocessing as mp, os, statistics
import numpy as np
from marine_hull.tack import circ_mean, rates, bound, sim_corridor, sim_header, dp_clairvoyant, sim_mpc, wrap
from run_sail_tack import polar, load, DT, CORR, DWELL

TAU = 30.0
MARGINS = (0.0, 0.1, 0.3)
VARIANTS = (("persist", 60), ("persist", 120), ("smooth", 30), ("smooth", 60), ("smooth", 120), ("raw", 60), ("raw", 120))

def smooth_wind(s, d, w=30):
    k = np.ones(w) / w
    sm = lambda x: np.convolve(np.pad(x, (w // 2, w - 1 - w // 2), mode="edge"), k, mode="valid")
    return sm(s), np.degrees(np.arctan2(sm(np.sin(np.radians(d))), sm(np.cos(np.radians(d))))) % 360

def job(path):
    vf, bf = polar()
    s, d, t, tm = load(path)
    rows = []
    for w0 in range(0, len(s) - 1440, 1440):
        raw = (t >= w0) & (t < w0 + 1440)
        if raw.sum() < 0.9 * 240:
            continue
        ss, dw = s[w0:w0 + 1440], d[w0:w0 + 1440]
        phi = circ_mean(dw)
        p, c = rates(ss, wrap(dw - phi), vf, bf)
        bd = bound(p, DT)
        if bd < 5000.0:
            continue
        ssm, dsm = smooth_wind(ss, dw)
        ps, cs = rates(ssm, wrap(dsm - phi), vf, bf)
        rec = {"path": os.path.basename(path), "A": sim_corridor(p, c, DT, CORR, TAU)[0] / bd,
               "B": sim_header(p, c, DT, CORR, TAU, 0.3, DWELL)[0] / bd, "DP": dp_clairvoyant(p, c, DT, CORR, TAU) / bd}
        for kind, H in VARIANTS:
            if kind == "persist":
                def fc(k, H=H):
                    lo = max(0, k - 10)
                    sm_, dm_ = ss[lo:k + 1].mean(), circ_mean(dw[lo:k + 1])
                    pp, cc = rates(np.full(H, sm_), np.full(H, wrap(dm_ - phi)), vf, bf)
                    return pp, cc
            elif kind == "smooth":
                fc = lambda k, H=H: (ps[:, k:k + H], cs[:, k:k + H])
            else:
                fc = lambda k, H=H: (p[:, k:k + H], c[:, k:k + H])
            for mg in MARGINS:
                rec[(kind, H, mg)] = sim_mpc(p, c, DT, CORR, TAU, H, fc, margin=mg)[0] / bd
        rows.append(rec)
    return rows

def med(x): return statistics.median(x)

def main():
    files = sorted(glob.glob("experiments/data/coops_wind_*.csv"))
    with mp.Pool(4) as pool:
        res = pool.map(job, files, chunksize=1)
    allr = [r for rr in res for r in rr]
    jan = [r for r in allr if "_202401" in r["path"]]; jul = [r for r in allr if "_202407" in r["path"]]
    print(f"windows used: Jan {len(jan)}, Jul {len(jul)}; tau {TAU:.0f} s; corridor +-{CORR:.0f} m; replan every 5 min, 5-min blocks, dy 50 m")
    rng = np.random.default_rng(11)
    best = {v: max(MARGINS, key=lambda m: med([r[v + (m,)] for r in jan])) for v in VARIANTS}
    for name, rs in (("January", jan), ("July", jul)):
        print(f"\n{name}: median share of the bound (10th..90th); gap closed = (variant - header) / (clairvoyant - header), medians of window ratios not used: ratio of medians")
        fm = lambda x: f"{med(x):.3f} ({np.percentile(x, 10):.3f}..{np.percentile(x, 90):.3f})"
        for key, lab in (("A", "corridor-edge tacking"), ("B", "header-following (margin 0.3)"), ("DP", "clairvoyant DP")):
            print(f"  {lab:34s} {fm([r[key] for r in rs])}")
        gap = med([r["DP"] for r in rs]) - med([r["B"] for r in rs])
        for v in VARIANTS:
            mg = best[v]
            x = [r[v + (mg,)] for r in rs]; dif = np.array([r[v + (mg,)] - r["B"] for r in rs])
            bs = [np.median(rng.choice(dif, len(dif))) for _ in range(1000)]
            print(f"  mpc {v[0]:8s} H={v[1]:3d} min, switch margin {mg} (chosen on January): {fm(x)}; minus header {100*med(list(dif)):+.1f} pts (boot 95% {100*np.percentile(bs,2.5):+.1f}..{100*np.percentile(bs,97.5):+.1f}); share of the {100*gap:.1f}-pt gap closed {(med(x)-med([r['B'] for r in rs]))/gap:.0%}")

if __name__ == "__main__":
    main()
