"""Milestone 5a, part 2: corridor-edge tacking, header-following and a clairvoyant DP, on observed CO-OPS wind.
For each station-month file (experiments/data/coops_wind_*.csv, 6-minute speed and direction), resample to 1 minute, cut
non-overlapping 24 h windows, set the mark bearing to the window's circular-mean wind direction, and score each controller as a
share of the bound (the better tack's progress each minute, no corridor, no tack cost). Polar: experiments/data/sail_polar_default.json
(from run_sail_polar.py; speed and best upwind angle at each wind speed). Corridor +-1.5 km. Tack loss tau in {0, 30, 60} s.
The header-follower margin is chosen on January (best median at tau = 30 s from {0.02, 0.05, 0.10, 0.20, 0.30, 0.50}) and reported on July.
Run: PYTHONPATH=src python3.13 experiments/run_sail_tack.py > experiments/results_sail_tack.txt   (about 10 min on 4 cores)"""
import csv, glob, json, multiprocessing as mp, os, statistics
import numpy as np
from marine_hull.tack import circ_mean, rates, bound, sim_corridor, sim_header, dp_clairvoyant, wrap

DT = 60.0
CORR = 1500.0
TAUS = (0.0, 30.0, 60.0)
MARGINS = (0.02, 0.05, 0.10, 0.20, 0.30, 0.50)
DWELL = 10

def polar():
    j = json.load(open("experiments/data/sail_polar_default.json"))
    xs = sorted(float(k) for k in j)
    v = [j[str(x)]["v"] for x in xs]; b = [j[str(x)]["twa"] for x in xs]
    return (lambda s: np.interp(s, xs, v)), (lambda s: np.interp(s, xs, b))

def load(path):
    t, s, d = [], [], []
    for r in csv.DictReader(open(path)):
        try:
            a, b, c = float(r["t_min"]), float(r["speed"]), float(r["dir"])
        except ValueError:
            continue
        t.append(a); s.append(b); d.append(c)
    t, s, d = np.array(t), np.array(s), np.array(d)
    tm = np.arange(0, t[-1] + 1)
    sx = np.interp(tm, t, s)
    ux, uy = np.interp(tm, t, np.sin(np.radians(d))), np.interp(tm, t, np.cos(np.radians(d)))
    dd = np.degrees(np.arctan2(ux, uy)) % 360
    return sx, dd, t, tm

def job(args):
    path, = args
    vf, bf = polar()
    s, d, t, tm = load(path)
    rows = []
    for w0 in range(0, len(s) - 1440, 1440):
        # skip windows with a gap in the raw series (a 1-minute grid interpolated across more than 30 min)
        raw = (t >= w0) & (t < w0 + 1440)
        if raw.sum() < 0.9 * 240:
            continue
        ss, dw = s[w0:w0 + 1440], d[w0:w0 + 1440]
        phi = circ_mean(dw)
        eps = wrap(dw - phi)
        p, c = rates(ss, eps, vf, bf)
        bd = bound(p, DT)
        if bd < 5000.0:      # becalmed day: under 5 km of bound progress
            continue
        rec = {"path": os.path.basename(path), "bound": bd}
        for tau in TAUS:
            rec[("A", tau)] = sim_corridor(p, c, DT, CORR, tau)[0] / bd
            for m in MARGINS:
                rec[("B", tau, m)] = sim_header(p, c, DT, CORR, tau, m, DWELL)[0] / bd
            rec[("DP", tau)] = dp_clairvoyant(p, c, DT, CORR, tau) / bd
            rec[("ntackA", tau)] = sim_corridor(p, c, DT, CORR, tau)[1]
        rows.append(rec)
    return rows

def med(x): return statistics.median(x) if x else float("nan")

def main():
    files = sorted(glob.glob("experiments/data/coops_wind_*.csv"))
    with mp.Pool(4) as pool:
        res = pool.map(job, [(f,) for f in files])
    allr = [r for rr in res for r in rr]
    jan = [r for r in allr if "_202401" in r["path"]]; jul = [r for r in allr if "_202407" in r["path"]]
    print(f"files {len(files)}, windows used: Jan {len(jan)}, Jul {len(jul)} (24 h, bound >= 5 km); corridor +-{CORR:.0f} m; dt {DT:.0f} s; dwell {DWELL} min")
    print("bound progress per window: median %.1f km (10th..90th %.1f..%.1f)" % (med([r["bound"] for r in allr]) / 1e3,
          np.percentile([r["bound"] for r in allr], 10) / 1e3, np.percentile([r["bound"] for r in allr], 90) / 1e3))
    best_m = max(MARGINS, key=lambda m: med([r[("B", 30.0, m)] for r in jan]))
    print(f"header margin chosen on January at tau 30 s: {best_m}")
    for m in MARGINS:
        print(f"  Jan median share, B margin {m}: " + ", ".join(f"tau {t:.0f}: {med([r[('B', t, m)] for r in jan]):.3f}" for t in TAUS))
    for name, rs in (("January", jan), ("July (holdout)", jul)):
        print(f"\n{name}: median share of the bound (10th..90th), n={len(rs)}")
        for tau in TAUS:
            a = [r[("A", tau)] for r in rs]; b = [r[("B", tau, best_m)] for r in rs]; dpv = [r[("DP", tau)] for r in rs]
            ba = [bb - aa for aa, bb in zip(a, b)]; db = [dd - bb for bb, dd in zip(b, dpv)]
            f = lambda x: f"{med(x):.3f} ({np.percentile(x,10):.3f}..{np.percentile(x,90):.3f})"
            print(f"  tau {tau:3.0f} s: corridor {f(a)}; header {f(b)}; clairvoyant {f(dpv)}; header minus corridor {100*med(ba):+.1f} pts; clairvoyant minus header {100*med(db):+.1f} pts; corridor tacks/day median {med([r[('ntackA', tau)] for r in rs]):.0f}")
    # per-station spread of header minus corridor, July holdout, tau 30
    by = {}
    for r in jul:
        by.setdefault(r["path"], []).append(r[("B", 30.0, best_m)] - r[("A", 30.0)])
    gains = {k: 100 * med(v) for k, v in by.items()}
    print("\nJuly header-minus-corridor gain at tau 30 s by station file (pts):", ", ".join(f"{k[11:18]}:{v:+.1f}" for k, v in sorted(gains.items())))
    print("stations with a positive median gain: %d of %d" % (sum(1 for v in gains.values() if v > 0), len(gains)))
    # sign test on window-level pairs
    dif = [r[("B", 30.0, best_m)] - r[("A", 30.0)] for r in jul]
    print("July windows where header beats corridor at tau 30 s: %d of %d" % (sum(1 for x in dif if x > 0), len(dif)))
    boot = np.random.default_rng(7)
    arr = np.array(dif); bs = [np.median(boot.choice(arr, len(arr))) for _ in range(2000)]
    print("July median gain, bootstrap 95%% interval over windows (treats windows as independent): %.2f..%.2f pts" % (100 * np.percentile(bs, 2.5), 100 * np.percentile(bs, 97.5)))

if __name__ == "__main__":
    main()
