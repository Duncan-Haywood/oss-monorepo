"""Milestone 5j (variant of run_sail_hrrr_bc.py, 5i): a station-specific bias learned from the other windows of the same station and month
(leave-one-window-out) against the 5i trailing-hour correction. Per window, speed ratio (mean observed / mean HRRR) and circular-mean direction offset over the
window using the cycle valid at the window start; the correction for a window is the median ratio and circular-mean offset over the other windows of that station-month.
Run: PYTHONPATH=src:experiments python3 experiments/run_sail_hrrr_learned.py > experiments/results_sail_hrrr_learned.txt"""

import csv, datetime as dt, glob, multiprocessing as mp, os, statistics
import numpy as np
from marine_hull.tack import circ_mean, rates, bound, sim_header, sim_replan, lead_forecast, smooth, wrap
from run_sail_tack import polar, load, DT, CORR, DWELL

TAU, EVERY, LAT = 30.0, 4, 3
MONTH0 = {"202401": dt.datetime(2024, 1, 1), "202407": dt.datetime(2024, 7, 1)}
H = {}

def hrrr(ym):
    if ym not in H:
        d = {}
        for r in csv.DictReader(open(f"experiments/data/hrrr_{ym}.csv")):
            d.setdefault((r["station"], r["cycle"]), []).append((int(r["fhr"]), float(r["u"]), float(r["v"])))
        H[ym] = {k: np.array(sorted(set(v))) for k, v in d.items()}
    return H[ym]

def cycle_for(t0, k0):
    t = t0 + dt.timedelta(minutes=k0 - 60 * LAT)
    return t.replace(hour=(t.hour // 6) * 6, minute=0)

def hrrr_wind(tab, st, cyc, t0, m):
    """u, v at minutes m (array, minutes from window start t0) from cycle cyc."""
    a = tab[(st, cyc.strftime("%Y%m%d%H"))]
    f = ((t0 - cyc).total_seconds() / 3600.0) + np.asarray(m) / 60.0
    return np.interp(f, a[:, 0], a[:, 1]), np.interp(f, a[:, 0], a[:, 2])

def sd(u, v):
    return np.hypot(u, v), np.degrees(np.arctan2(-u, -v)) % 360.0

def job(path):
    vf, bf = polar()
    b = os.path.basename(path); st, ym = b.split("_")[2], b.split("_")[3][:6]
    tab = hrrr(ym)
    s, d, t, tm = load(path)
    t0m = MONTH0[ym]
    wins = []
    for i, w0 in enumerate(range(0, len(s) - 1440, 1440)):
        raw = (t >= w0) & (t < w0 + 1440)
        if raw.sum() < 0.9 * 240 or i % EVERY:
            continue
        wins.append(w0)
    stats = {}
    for w0 in wins:
        t0 = t0m + dt.timedelta(minutes=w0)
        m = np.arange(0, 1440)
        u, v = hrrr_wind(tab, st, cycle_for(t0, 0), t0, m)
        so, do = sd(u, v)
        stats[w0] = (float(np.clip(s[w0:w0 + 1440].mean() / max(so.mean(), 0.3), 0.5, 2.0)),
                     wrap(circ_mean(d[w0:w0 + 1440]) - circ_mean(do)))
    rows = []
    for w0 in wins:
        t0 = t0m + dt.timedelta(minutes=w0)
        ss, dw = s[w0:w0 + 1440], d[w0:w0 + 1440]
        phi = circ_mean(dw)
        p, c = rates(ss, wrap(dw - phi), vf, bf)
        bd = bound(p, DT)
        if bd < 5000.0:
            continue
        oth = [stats[x] for x in wins if x != w0]
        if not oth:
            continue
        rL = float(np.median([a for a, _ in oth])); offL = float(circ_mean(np.array([o for _, o in oth])))
        def mk(mode):
            def f(k0):
                cyc = cycle_for(t0, k0)
                m = np.arange(k0, 1440)
                u, v = hrrr_wind(tab, st, cyc, t0, m)
                sp, di = sd(u, v)
                if mode == "learned":
                    return rates(sp * rL, wrap(di + offL - phi), vf, bf)
                j0 = max(0, w0 + k0 - 60)
                uo, vo = hrrr_wind(tab, st, cyc, t0, np.arange(j0 - w0, k0 + 1))
                so, do = sd(uo, vo)
                r = float(np.clip(s[j0:w0 + k0 + 1].mean() / max(so.mean(), 0.3), 0.5, 2.0))
                off = wrap(circ_mean(d[j0:w0 + k0 + 1]) - circ_mean(do))
                if mode == "both":  # learned scale, then trailing-hour residual correction on top is not separable here: use mean of the two
                    r, off = np.sqrt(r * rL), off + wrap(offL - off) * 0.5
                return rates(sp * r, wrap(di + off - phi), vf, bf)
            return f
        rec = {"path": b, "B": sim_header(p, c, DT, CORR, TAU, 0.3, DWELL)[0] / bd, "rL": rL, "offL": offL}
        for name, f in (("bc1h", mk("bc1h")), ("learned", mk("learned")), ("both", mk("both")),
                        ("T0", lambda k0: lead_forecast(p, c, k0, 0.0))):
            x, n = sim_replan(p, c, DT, CORR, TAU, f, every=60)
            rec[name] = x / bd; rec[("n", name)] = n
        rows.append(rec)
    return rows, []

def main():
    files = sorted(f for f in glob.glob("experiments/data/coops_wind_*.csv") if os.path.exists(f"experiments/data/hrrr_{f[-10:-4]}.csv"))
    with mp.Pool(4) as pool:
        res = pool.map(job, files, chunksize=1)
    allr = [r for rr, _ in res for r in rr]
    rng = np.random.default_rng(7)
    print(f"every {EVERY}th window; hourly replan; shares of the no-corridor no-tack-cost bound; correction for a window learned from the OTHER windows of the station-month")
    for name, tag in (("January", "_202401"), ("July", "_202407")):
        rs = [r for r in allr if tag in r["path"]]
        print(f"\n{name}: {len(rs)} windows from {len({r['path'] for r in rs})} stations; header {statistics.median(r['B'] for r in rs):.3f}; median learned ratio {statistics.median(r['rL'] for r in rs):.2f}, median |offset| {statistics.median(abs((r['offL']+180)%360-180) for r in rs):.0f} deg")
        for k in ("T0", "bc1h", "learned", "both"):
            dif = np.array([r[k] - r["B"] for r in rs])
            bs = [np.median(rng.choice(dif, len(dif))) for _ in range(1000)]
            print(f"  {k:8s}: {statistics.median(r[k] for r in rs):.3f}; minus header {100*np.median(dif):+.1f} pts (boot 95% {100*np.percentile(bs,2.5):+.1f}..{100*np.percentile(bs,97.5):+.1f}); tacks/day {statistics.median(r[('n',k)] for r in rs):.0f}")
        for a, b_ in (("learned", "bc1h"), ("both", "bc1h"), ("learned", "T0")):
            dif = np.array([r[a] - r[b_] for r in rs])
            bs = [np.median(rng.choice(dif, len(dif))) for _ in range(1000)]
            print(f"  {a} minus {b_}: {100*np.median(dif):+.1f} pts (boot 95% {100*np.percentile(bs,2.5):+.1f}..{100*np.percentile(bs,97.5):+.1f})")

if __name__ == "__main__":
    main()
