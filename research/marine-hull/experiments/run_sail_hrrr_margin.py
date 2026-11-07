"""Milestone 6zb (from 6za): does a switch margin (replan tacks only when the forecast gain beats margin x one step of progress) rescue HRRR at tau 240 s? 6z showed the synthetic
lead-decay forecast gains +6.7 to +11 points over the header-follower at tau 120 to 360 s. 5n (tau 30 s) found raw HRRR
(L = 1 and 3 h) at or below the header and bias-corrected HRRR level with it. Here the 5n windows, buoys and forecasts feed
tack.sim_replan_dead at tau in {120, 240, 360} s against the header (margin 0.5), corridor tacker and clairvoyant dead-time DP.
Run: PYTHONPATH=src:experiments python3 experiments/run_sail_hrrr_margin.py > experiments/results_sail_hrrr_margin.txt"""
import csv, datetime as dt, glob, multiprocessing as mp, os, statistics
import numpy as np
from marine_hull.tack import circ_mean, rates, bound, sim_header, sim_corridor, dp_clairvoyant_dead, sim_replan_dead, lead_forecast, smooth, wrap
from run_sail_tack import polar, load, DT, CORR, DWELL

TAUS, EVERY, MARGIN_B = (240.0,), 4, 0.5
MARGINS = (0.0, 0.5, 1.0, 2.0, 4.0, 8.0)
LATS = (1, 3)
# 5l: BUOY_Z = anemometer height in m; observed speeds are scaled to 10 m with the neutral log law (z0 = 1.5e-4 m, open sea). Unset = 5k (no correction).
BUOY_Z = float(os.environ.get("BUOY_Z", "0"))
Z0 = 1.5e-4
ZFAC = np.log(10.0 / Z0) / np.log(BUOY_Z / Z0) if BUOY_Z else 1.0
MONTH0 = {"202401": dt.datetime(2024, 1, 1), "202407": dt.datetime(2024, 7, 1)}
H = {}

def hrrr(ym):
    if ym not in H:
        d = {}
        for r in csv.DictReader(open(f"experiments/data/hrrr_buoyh_{ym}.csv")):
            d.setdefault((r["station"], r["cycle"]), []).append((int(r["fhr"]), float(r["u"]), float(r["v"])))
        H[ym] = {k: np.array(sorted(set(v))) for k, v in d.items()}
    return H[ym]

def cycle_for(t0, k0, lat):
    t = t0 + dt.timedelta(minutes=k0 - 60 * lat)
    return t.replace(minute=0)

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
        def fc(bc, lat):
            def f(k0):
                cyc = cycle_for(t0, k0, lat)
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
        rec = {"path": b}
        for tau in TAUS:
            m = int(round(tau / DT))
            rec[("B", tau)] = sim_header(p, c, DT, CORR, tau, MARGIN_B, DWELL)[0] / bd
            rec[("A", tau)] = sim_corridor(p, c, DT, CORR, tau)[0] / bd
            rec[("DP", tau)] = dp_clairvoyant_dead(p, c, DT, CORR, m) / bd
            for name, f in (("hrrr_L1", fc(False, 1)), ("hrrr_bc_L1", fc(True, 1)), ("T120", lambda k0: lead_forecast(p, c, k0, 120.0))):
                for mg in MARGINS:
                    x, n = sim_replan_dead(p, c, DT, CORR, m, f, every=60, margin=mg)
                    rec[(name, mg)] = x / bd; rec[("n", name, mg)] = n
        rows.append(rec)
    return rows, []

KEYS = ("hrrr_L1", "hrrr_bc_L1", "T120")

def main():
    files = sorted(glob.glob("experiments/data/ndbc_wind_*.csv"))
    with mp.Pool(4) as pool:
        res = pool.map(job, files, chunksize=1)
    allr = [r for rr, _ in res for r in rr]
    rng = np.random.default_rng(7)
    tau = TAUS[0]
    print(f"tau {tau:.0f} s; every {EVERY}th window; hourly replan; margin = voluntary tack only if forecast gain > margin x one step of best model progress; header margin {MARGIN_B}")
    ci = lambda dif: (lambda bs: f"{100*np.median(dif):+.1f} pts (boot 95% {100*np.percentile(bs,2.5):+.1f}..{100*np.percentile(bs,97.5):+.1f})")([np.median(rng.choice(dif, len(dif))) for _ in range(1000)])
    for name, tag in (("January", "_202401"), ("July", "_202407")):
        rs = [r for r in allr if tag in r["path"]]
        print(f"\n{name}: {len(rs)} windows from {len({r['path'] for r in rs})} stations")
        md = lambda k: statistics.median(r[k] for r in rs)
        print(f" corridor {md(('A', tau)):.3f}; header {md(('B', tau)):.3f}; clairvoyant {md(('DP', tau)):.3f}")
        for k in KEYS:
            for mg in MARGINS:
                dif = np.array([r[(k, mg)] - r[("B", tau)] for r in rs])
                print(f"   {k:10s} margin {mg:3.1f}: {md((k, mg)):.3f}; minus header {ci(dif)}; tacks/day {md(('n', k, mg)):.0f}")

if __name__ == "__main__":
    main()
