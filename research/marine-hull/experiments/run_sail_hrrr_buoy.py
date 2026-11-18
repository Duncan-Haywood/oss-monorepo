"""Milestone 5k (open-water variant of run_sail_hrrr.py, 5h; NDBC buoys instead of CO-OPS piers; 10-minute series so the window-coverage test is 0.9 of 144 samples; variants hrrr, hrrr_bc, T0). Original 5h docstring: Milestone 5h: does 5d's value of forecast skill survive a real archived forecast? Replan hourly (tack.sim_replan) on the same
windows, polar, corridor and tau as 5c/5d (days 1, 5, 9, ... = every 4th window), with the forecast taken from archived HRRR
10 m winds at the nearest cell (experiments/data/hrrr_*.csv, fetch_hrrr_wind.py): newest long cycle issued at least 3 h before the
replan, 2-hourly forecast hours interpolated in time. Variants: hrrr (raw), hrrr_bc (speed ratio and direction offset estimated
over the trailing hour of observations and held for the whole forecast), plus the 5d rows persistence (T=0) and T=120 min
and the header-follower on the same windows. Also prints HRRR's own error against the observations by lead.
Run: PYTHONPATH=src:experiments python3 experiments/run_sail_hrrr_buoy.py > experiments/results_sail_hrrr_buoy.txt"""
import csv, datetime as dt, glob, multiprocessing as mp, os, statistics
import numpy as np
from marine_hull.tack import circ_mean, rates, bound, sim_header, sim_replan, lead_forecast, smooth, wrap
from run_sail_tack import polar, load, DT, CORR, DWELL

TAU, EVERY, LAT = 30.0, 4, 3
# 5l: BUOY_Z = anemometer height in m; observed speeds are scaled to 10 m with the neutral log law (z0 = 1.5e-4 m, open sea). Unset = 5k (no correction).
BUOY_Z = float(os.environ.get("BUOY_Z", "0"))
Z0 = 1.5e-4
ZFAC = np.log(10.0 / Z0) / np.log(BUOY_Z / Z0) if BUOY_Z else 1.0
MONTH0 = {"202401": dt.datetime(2024, 1, 1), "202407": dt.datetime(2024, 7, 1)}
H = {}

def hrrr(ym):
    if ym not in H:
        d = {}
        for r in csv.DictReader(open(f"experiments/data/hrrr_buoy_{ym}.csv")):
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
    s = s * ZFAC
    t0m = MONTH0[ym]
    rows, errs = [], []
    for i, w0 in enumerate(range(0, len(s) - 1440, 1440)):
        raw = (t >= w0) & (t < w0 + 1440)
        if raw.sum() < 0.9 * 144 or i % EVERY:
            continue
        t0 = t0m + dt.timedelta(minutes=w0)
        ss, dw = s[w0:w0 + 1440], d[w0:w0 + 1440]
        phi = circ_mean(dw)
        p, c = rates(ss, wrap(dw - phi), vf, bf)
        bd = bound(p, DT)
        if bd < 5000.0:
            continue
        def fc(bc):
            def f(k0):
                cyc = cycle_for(t0, k0)
                m = np.arange(k0, 1440)
                u, v = hrrr_wind(tab, st, cyc, t0, m)
                sp, di = sd(u, v)
                if bc:
                    j0 = max(0, w0 + k0 - 60)
                    mo = np.arange(j0 - w0, k0 + 1)
                    uo, vo = hrrr_wind(tab, st, cyc, t0, mo)
                    so, do = sd(uo, vo)
                    r = float(np.clip(s[j0:w0 + k0 + 1].mean() / max(so.mean(), 0.3), 0.5, 2.0))
                    off = wrap(circ_mean(d[j0:w0 + k0 + 1]) - circ_mean(do))
                    sp, di = sp * r, di + off
                return rates(sp, wrap(di - phi), vf, bf)
            return f
        rec = {"path": b, "B": sim_header(p, c, DT, CORR, TAU, 0.3, DWELL)[0] / bd}
        for name, f in (("hrrr", fc(False)), ("hrrr_bc", fc(True)),
                        ("T0", lambda k0: lead_forecast(p, c, k0, 0.0)), ("T120", lambda k0: lead_forecast(p, c, k0, 120.0))):
            x, n = sim_replan(p, c, DT, CORR, TAU, f, every=60)
            rec[name] = x / bd; rec[("n", name)] = n
        # HRRR error vs 15-min smoothed observation, by lead from the replan hour (replan at hours 0, 6, 12, 18)
        for H0 in (0, 6, 12, 18):
            k0 = 60 * H0
            u, v = hrrr_wind(tab, st, cycle_for(t0, k0), t0, np.arange(k0, 1440))
            sp, di = sd(u, v)
            so, do = smooth(ss[None, :], 15)[0][k0:], dw[k0:]
            for L, (a, e) in {"0-3h": (0, 180), "3-6h": (180, 360), "6-12h": (360, 720)}.items():
                if a < len(sp):
                    errs.append((L, float(np.mean(np.abs(sp[a:e] - so[a:e]))), float(np.mean(np.abs(wrap(di[a:e] - do[a:e])))), float(np.mean(sp[a:e] - so[a:e]))))
        rows.append(rec)
    return rows, errs

def main():
    files = sorted(f for f in glob.glob("experiments/data/ndbc_wind_*.csv"))
    with mp.Pool(4) as pool:
        res = pool.map(job, files, chunksize=1)
    allr = [r for rr, _ in res for r in rr]
    allr_e = [(os.path.basename(f), e) for f, (_, ee) in zip(files, res) for e in ee]
    rng = np.random.default_rng(7)
    print(f"anemometer height {BUOY_Z or 'uncorrected'} (speed factor {ZFAC:.3f})")
    print(f"every {EVERY}th window; hourly replan; shares of the no-corridor no-tack-cost bound; HRRR newest cycle issued >= {LAT} h before replan")
    for name, tag in (("January", "_202401"), ("July", "_202407")):
        rs = [r for r in allr if tag in r["path"]]
        print(f"\n{name}: {len(rs)} windows from {len({r['path'] for r in rs})} stations; header {statistics.median(r['B'] for r in rs):.3f}")
        for k in ("T0", "hrrr", "hrrr_bc", "T120"):
            dif = np.array([r[k] - r["B"] for r in rs])
            bs = [np.median(rng.choice(dif, len(dif))) for _ in range(1000)]
            print(f"  {k:8s}: {statistics.median(r[k] for r in rs):.3f}; minus header {100*np.median(dif):+.1f} pts (boot 95% {100*np.percentile(bs,2.5):+.1f}..{100*np.percentile(bs,97.5):+.1f}); tacks/day {statistics.median(r[('n',k)] for r in rs):.0f}")
        for a, b_ in (("hrrr", "T0"), ("hrrr_bc", "hrrr"), ("hrrr", "T120")):
            dif = np.array([r[a] - r[b_] for r in rs])
            bs = [np.median(rng.choice(dif, len(dif))) for _ in range(1000)]
            print(f"  {a} minus {b_}: {100*np.median(dif):+.1f} pts (boot 95% {100*np.percentile(bs,2.5):+.1f}..{100*np.percentile(bs,97.5):+.1f})")
        # per station
        for st in sorted({r["path"].split("_")[2] for r in rs}):
            q = [r for r in rs if r["path"].split("_")[2] == st]
            print(f"    {st}: n={len(q)} hrrr-header {100*statistics.median(r['hrrr']-r['B'] for r in q):+.1f}  bc-header {100*statistics.median(r['hrrr_bc']-r['B'] for r in q):+.1f}  T0-header {100*statistics.median(r['T0']-r['B'] for r in q):+.1f}")
    print("\nHRRR error against observation (mean absolute speed m/s, mean absolute direction deg, mean speed bias m/s), by lead:")
    for tag in ("_202401", "_202407"):
        for L in ("0-3h", "3-6h", "6-12h"):
            e = [x for f, x in allr_e if tag in f and x[0] == L]
            print(f"  {tag[1:]} {L}: |dspeed| {statistics.mean(x[1] for x in e):.2f}, |ddir| {statistics.mean(x[2] for x in e):.0f}, bias {statistics.mean(x[3] for x in e):+.2f} (n={len(e)})")

if __name__ == "__main__":
    main()
