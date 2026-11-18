"""Milestone 5i (variant of run_sail_hrrr.py, 5h): bias-correction window and fade with lead. Original 5h docstring: Milestone 5h: does 5d's value of forecast skill survive a real archived forecast? Replan hourly (tack.sim_replan) on the same
windows, polar, corridor and tau as 5c/5d (days 1, 5, 9, ... = every 4th window), with the forecast taken from archived HRRR
10 m winds at the nearest cell (experiments/data/hrrr_*.csv, fetch_hrrr_wind.py): newest long cycle issued at least 3 h before the
replan, 2-hourly forecast hours interpolated in time. Variants: hrrr (raw), hrrr_bc (speed ratio and direction offset estimated
over the trailing hour of observations and held for the whole forecast), plus the 5d rows persistence (T=0) and T=120 min
and the header-follower on the same windows. Also prints HRRR's own error against the observations by lead.
Run: PYTHONPATH=src:experiments python3 experiments/run_sail_hrrr_bc.py > experiments/results_sail_hrrr_bc.txt"""
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
    rows, errs = [], []
    for i, w0 in enumerate(range(0, len(s) - 1440, 1440)):
        raw = (t >= w0) & (t < w0 + 1440)
        if raw.sum() < 0.9 * 240 or i % EVERY:
            continue
        t0 = t0m + dt.timedelta(minutes=w0)
        ss, dw = s[w0:w0 + 1440], d[w0:w0 + 1440]
        phi = circ_mean(dw)
        p, c = rates(ss, wrap(dw - phi), vf, bf)
        bd = bound(p, DT)
        if bd < 5000.0:
            continue
        def fc(win, fade):
            """Bias-corrected HRRR. win: trailing minutes used for the speed ratio and direction offset. fade: None, or (short window, e-fold
            in minutes): correction from the short window decays toward the long-window correction with lead."""
            def corr(cyc, k0, wmin):
                j0 = max(0, w0 + k0 - wmin)
                mo = np.arange(j0 - w0, k0 + 1)
                uo, vo = hrrr_wind(tab, st, cyc, t0, mo)
                so, do = sd(uo, vo)
                r = float(np.clip(s[j0:w0 + k0 + 1].mean() / max(so.mean(), 0.3), 0.5, 2.0))
                return r, wrap(circ_mean(d[j0:w0 + k0 + 1]) - circ_mean(do))
            def f(k0):
                cyc = cycle_for(t0, k0)
                m = np.arange(k0, 1440)
                u, v = hrrr_wind(tab, st, cyc, t0, m)
                sp, di = sd(u, v)
                r, off = corr(cyc, k0, win)
                if fade:
                    r0, off0 = corr(cyc, k0, fade[0])
                    wgt = np.exp(-(m - k0) / fade[1])
                    sp, di = sp * (r + (r0 - r) * wgt), di + off + wrap(off0 - off) * wgt
                else:
                    sp, di = sp * r, di + off
                return rates(sp, wrap(di - phi), vf, bf)
            return f
        rec = {"path": b, "B": sim_header(p, c, DT, CORR, TAU, 0.3, DWELL)[0] / bd}
        for name, f in (("bc1h", fc(60, None)), ("bc3h", fc(180, None)), ("fade", fc(180, (15, 120.0))),
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
    print(f"every {EVERY}th window; hourly replan; shares of the no-corridor no-tack-cost bound; HRRR newest cycle issued >= {LAT} h before replan")
    for name, tag in (("January", "_202401"), ("July", "_202407")):
        rs = [r for r in allr if tag in r["path"]]
        print(f"\n{name}: {len(rs)} windows from {len({r['path'] for r in rs})} stations; header {statistics.median(r['B'] for r in rs):.3f}")
        for k in ("T0", "bc1h", "bc3h", "fade"):
            dif = np.array([r[k] - r["B"] for r in rs])
            bs = [np.median(rng.choice(dif, len(dif))) for _ in range(1000)]
            print(f"  {k:8s}: {statistics.median(r[k] for r in rs):.3f}; minus header {100*np.median(dif):+.1f} pts (boot 95% {100*np.percentile(bs,2.5):+.1f}..{100*np.percentile(bs,97.5):+.1f}); tacks/day {statistics.median(r[('n',k)] for r in rs):.0f}")
        for a, b_ in (("bc1h", "T0"), ("bc3h", "bc1h"), ("fade", "bc1h"), ("fade", "bc3h")):
            dif = np.array([r[a] - r[b_] for r in rs])
            bs = [np.median(rng.choice(dif, len(dif))) for _ in range(1000)]
            print(f"  {a} minus {b_}: {100*np.median(dif):+.1f} pts (boot 95% {100*np.percentile(bs,2.5):+.1f}..{100*np.percentile(bs,97.5):+.1f})")
        # per station
        for st in sorted({r["path"].split("_")[2] for r in rs}):
            q = [r for r in rs if r["path"].split("_")[2] == st]
            print(f"    {st}: n={len(q)} bc1h-header {100*statistics.median(r['bc1h']-r['B'] for r in q):+.1f}  bc3h-header {100*statistics.median(r['bc3h']-r['B'] for r in q):+.1f}  T0-header {100*statistics.median(r['T0']-r['B'] for r in q):+.1f}")

if __name__ == "__main__":
    main()
