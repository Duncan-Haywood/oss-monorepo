"""Milestone 6x: 5a's corridor / header / clairvoyant comparison at a measured tack cost, tau in {120, 240, 360} s.
6w measured an effective tack loss of 218 s (127 to 301) in fielded Saildrone blocks. Same windows, polar and
controllers as run_sail_tack.py (imported); only TAUS and the margin grid change. The margin is chosen on January
at tau 240 s and reported on July.
Run: PYTHONPATH=src python3 experiments/run_sail_tack_long.py > experiments/results_sail_tack_long.txt"""
import glob, multiprocessing as mp, os, statistics
import numpy as np
import run_sail_tack as base
from marine_hull.tack import circ_mean, rates, bound, sim_corridor, sim_header, dp_clairvoyant_dead, wrap

TAUS = (120.0, 240.0, 360.0)
MARGINS = (0.3, 0.5, 1.0, 2.0)

def job(args):
    path, = args
    vf, bf = base.polar()
    s, d, t, tm = base.load(path)
    rows = []
    for w0 in range(0, len(s) - 1440, 1440):
        raw = (t >= w0) & (t < w0 + 1440)
        if raw.sum() < 0.9 * 240:
            continue
        ss, dw = s[w0:w0 + 1440], d[w0:w0 + 1440]
        phi = circ_mean(dw); eps = wrap(dw - phi)
        p, c = rates(ss, eps, vf, bf)
        bd = bound(p, base.DT)
        if bd < 5000.0:
            continue
        rec = {"path": os.path.basename(path), "bound": bd}
        for tau in TAUS:
            a = sim_corridor(p, c, base.DT, base.CORR, tau)
            rec[("A", tau)] = a[0] / bd; rec[("ntackA", tau)] = a[1]
            for m in MARGINS:
                b = sim_header(p, c, base.DT, base.CORR, tau, m, base.DWELL)
                rec[("B", tau, m)] = b[0] / bd; rec[("ntackB", tau, m)] = b[1]
            rec[("DP", tau)] = dp_clairvoyant_dead(p, c, base.DT, base.CORR, int(round(tau / base.DT))) / bd
        rows.append(rec)
    return rows

med = base.med

def main():
    files = sorted(glob.glob("experiments/data/coops_wind_*.csv"))
    with mp.Pool(4) as pool:
        res = pool.map(job, [(f,) for f in files])
    allr = [r for rr in res for r in rr]
    jan = [r for r in allr if "_202401" in r["path"]]; jul = [r for r in allr if "_202407" in r["path"]]
    print(f"files {len(files)}, windows used: Jan {len(jan)}, Jul {len(jul)}; corridor +-{base.CORR:.0f} m; dt {base.DT:.0f} s; dwell {base.DWELL} min")
    for m in MARGINS:
        print(f"  Jan median share, B margin {m}: " + ", ".join(f"tau {t:.0f}: {med([r[('B', t, m)] for r in jan]):.3f}" for t in TAUS))
    best_m = max(MARGINS, key=lambda m: med([r[("B", 240.0, m)] for r in jan]))
    print(f"header margin chosen on January at tau 240 s: {best_m}")
    f = lambda x: f"{med(x):.3f} ({np.percentile(x,10):.3f}..{np.percentile(x,90):.3f})"
    for name, rs in (("January", jan), ("July (holdout)", jul)):
        print(f"\n{name}: median share of the bound (10th..90th), n={len(rs)}")
        for tau in TAUS:
            a = [r[("A", tau)] for r in rs]; b = [r[("B", tau, best_m)] for r in rs]; dpv = [r[("DP", tau)] for r in rs]
            ba = [y - x for x, y in zip(a, b)]; db = [x - y for y, x in zip(b, dpv)]
            print(f"  tau {tau:3.0f} s: corridor {f(a)}; header {f(b)}; clairvoyant {f(dpv)}; header minus corridor {100*med(ba):+.1f} pts; "
                  f"clairvoyant minus header {100*med(db):+.1f} pts; tacks/day median corridor {med([r[('ntackA', tau)] for r in rs]):.0f}, header {med([r[('ntackB', tau, best_m)] for r in rs]):.0f}")
    boot = np.random.default_rng(7)
    for tau in TAUS:
        dif = np.array([r[("B", tau, best_m)] - r[("A", tau)] for r in jul])
        bs = [np.median(boot.choice(dif, len(dif))) for _ in range(2000)]
        by = {}
        for r in jul:
            by.setdefault(r["path"], []).append(r[("B", tau, best_m)] - r[("A", tau)])
        pos = sum(1 for v in by.values() if med(v) > 0)
        print(f"July tau {tau:.0f} s: header beats corridor in {int((dif > 0).sum())} of {len(dif)} windows; median gain 95% bootstrap (windows independent) "
              f"{100*np.percentile(bs,2.5):.2f}..{100*np.percentile(bs,97.5):.2f} pts; stations with positive median gain {pos} of {len(by)}")

if __name__ == "__main__":
    main()
