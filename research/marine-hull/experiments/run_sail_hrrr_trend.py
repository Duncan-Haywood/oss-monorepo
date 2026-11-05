"""Milestone 5l: nowcast blend on archived HRRR at open-water buoys. Forecast at replan minute k0 = the trailing 30-minute mean
observed wind vector (persistence, as T0) plus w times the HRRR change since k0, H(t) - H(k0), so the model supplies only the trend and the
buoy supplies the level (no pier/cell or height mismatch). Variants: trend1 (w = 1), trend05 (w = 0.5), trendfade (w = 1 decaying with
lead, e-fold 120 min). References: T0, hrrr_bc (5k), header-follower. Same windows, polar, corridor, tau, 3 h latency as 5k.
Run: PYTHONPATH=src:experiments python3 experiments/run_sail_hrrr_trend.py > experiments/results_sail_hrrr_trend.txt"""
import datetime as dt, glob, multiprocessing as mp, os, statistics
import numpy as np
from marine_hull.tack import circ_mean, rates, bound, sim_header, sim_replan, lead_forecast, wrap
from run_sail_tack import polar, load, DT, CORR, DWELL
from run_sail_hrrr_buoy import TAU, EVERY, MONTH0, hrrr, cycle_for, hrrr_wind, sd

def uv(s, d):
    r = np.radians(d)
    return -s * np.sin(r), -s * np.cos(r)

def job(path):
    vf, bf = polar()
    b = os.path.basename(path); st, ym = b.split("_")[2], b.split("_")[3][:6]
    tab = hrrr(ym)
    s, d, t, tm = load(path)
    t0m = MONTH0[ym]
    rows = []
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
        uo, vo = uv(s[w0:w0 + 1440], d[w0:w0 + 1440])
        def fc(w, efold):
            def f(k0):
                cyc = cycle_for(t0, k0)
                m = np.arange(k0, 1440)
                u, v = hrrr_wind(tab, st, cyc, t0, m)
                u0, v0 = hrrr_wind(tab, st, cyc, t0, np.array([k0]))
                j0 = max(0, k0 - 30)
                bu, bv = uo[j0:k0 + 1].mean(), vo[j0:k0 + 1].mean()
                wt = w * (np.exp(-(m - k0) / efold) if efold else 1.0)
                sp, di = sd(bu + wt * (u - u0[0]), bv + wt * (v - v0[0]))
                return rates(sp, wrap(di - phi), vf, bf)
            return f
        rec = {"path": b, "B": sim_header(p, c, DT, CORR, TAU, 0.3, DWELL)[0] / bd}
        for name, f in (("trend1", fc(1.0, None)), ("trend05", fc(0.5, None)), ("trendfade", fc(1.0, 120.0)),
                        ("T0", lambda k0: lead_forecast(p, c, k0, 0.0))):
            x, n = sim_replan(p, c, DT, CORR, TAU, f, every=60)
            rec[name] = x / bd; rec[("n", name)] = n
        rows.append(rec)
    return rows

def main():
    files = sorted(glob.glob("experiments/data/ndbc_wind_*.csv"))
    with mp.Pool(4) as pool:
        allr = [r for rr in pool.map(job, files, chunksize=1) for r in rr]
    rng = np.random.default_rng(7)
    def boot(dif):
        bs = [np.median(rng.choice(dif, len(dif))) for _ in range(1000)]
        return f"{100*np.median(dif):+.1f} pts (boot 95% {100*np.percentile(bs,2.5):+.1f}..{100*np.percentile(bs,97.5):+.1f})"
    print(f"every {EVERY}th window; hourly replan; shares of the bound; trend = HRRR change since replan added to trailing-30-min observed wind")
    for name, tag in (("January", "_202401"), ("July", "_202407")):
        rs = [r for r in allr if tag in r["path"]]
        print(f"\n{name}: {len(rs)} windows from {len({r['path'] for r in rs})} stations; header {statistics.median(r['B'] for r in rs):.3f}")
        for k in ("T0", "trend1", "trend05", "trendfade"):
            print(f"  {k:9s}: {statistics.median(r[k] for r in rs):.3f}; minus header {boot(np.array([r[k]-r['B'] for r in rs]))}; tacks/day {statistics.median(r[('n',k)] for r in rs):.0f}")
        for k in ("trend1", "trend05", "trendfade"):
            print(f"  {k} minus T0: {boot(np.array([r[k]-r['T0'] for r in rs]))}")

if __name__ == "__main__":
    main()
