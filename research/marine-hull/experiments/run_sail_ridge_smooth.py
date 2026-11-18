"""Milestone 6zf (variant of 6ze, which it imports nothing from but copies): ridge fitted to the 18-minute-smoothed future wind, as a correction to the trailing 60-minute mean, shrunk by ALPHA (0.5, 1.0).
Original 6ze docstring: Milestone 6ze: does a ridge wind forecast fitted on real data (6zc, 6zd skill 4 to 8% over persistence) move the sail score?
Per station with both months in experiments/data/coops_wind_*: ridge correction to persistence on 6 lags of (u, v), leads 6 to 120 min,
fitted on January, applied in July windows (every 4th 24 h window, as 6z). At each hourly replan the forecast of wind at steps k0..
is built from the last 6 six-minute samples (linear interpolation in (u, v) between leads, 120 min value held after), turned into
model rates with the window's mean-direction bearing, and fed to tack.sim_replan_dead at tau 240 s. Baselines: hold last observation,
lead_forecast T=0 (6z's persistence), T=inf (perfect smoothed truth), header-follower margin 0.5. Only July is reported.
Run: PYTHONPATH=src:experiments python3 experiments/run_sail_ridge_smooth.py > experiments/results_sail_ridge_smooth.txt"""
import glob, multiprocessing as mp, os, re
import numpy as np
from marine_hull.tack import circ_mean, rates, bound, sim_header, sim_replan_dead, lead_forecast, wrap
from run_sail_tack import polar, load, DT, CORR, DWELL
import csv

LEADS = (1, 2, 3, 5, 10, 20)   # 6-min steps
NLAG, TAU, EVERY, MARGIN_B = 6, 240.0, 4, 0.5
NMEAN, NSM = 10, 3   # trailing mean over 10 six-minute samples (60 min); target mean over 3 samples centred on the lead
ALPHAS = (0.5, 1.0)

def series6(path):
    """six-minute (u, v) wind, NaN where missing (same as run_wind_pair_skill.series, which runs main() on import)."""
    t, u, v = [], [], []
    for r in csv.DictReader(open(path)):
        try:
            sp, dr, mn = float(r["speed"]), float(r["dir"]), float(r["t_min"])
        except ValueError:
            continue
        if sp > 60 or dr > 360:
            continue
        t.append(mn); u.append(-sp * np.sin(np.radians(dr))); v.append(-sp * np.cos(np.radians(dr)))
    k = np.rint(np.array(t) / 6).astype(int)
    n = k.max() + 1
    U = np.full(n, np.nan); V = np.full(n, np.nan)
    U[k], V[k] = u, v
    return U, V

def feats(U, V, i):
    return np.concatenate([U[i - NLAG + 1:i + 1], V[i - NLAG + 1:i + 1]])

def fit_station(path):
    U, V = series6(path)
    W = {}
    for lead in LEADS:
        X, Y, P = [], [], []
        for i in range(NMEAN - 1, len(U) - lead - 1):
            f = feats(U, V, i)
            y = (np.mean(U[i + lead - 1:i + lead + 2]), np.mean(V[i + lead - 1:i + lead + 2]))
            tm_ = (np.mean(U[i - NMEAN + 1:i + 1]), np.mean(V[i - NMEAN + 1:i + 1]))
            if np.isnan(f).any() or np.isnan(y).any() or np.isnan(tm_).any():
                continue
            X.append(f - np.array([tm_[0]] * NLAG + [tm_[1]] * NLAG)); Y.append(y); P.append(tm_)
        X, Y, P = map(np.array, (X, Y, P))
        lam = 10.0 * len(X) ** 0.5
        W[lead] = np.linalg.solve(X.T @ X + lam * np.eye(X.shape[1]), X.T @ (Y - P))
    return W

def ridge_wind(W, u6, v6, i6, n, alpha=1.0):
    """wind (u, v) for n 1-minute steps from index i6 of the six-minute series: step j is j minutes after the replan."""
    mu, mv = np.mean(u6[i6 - NMEAN + 1:i6 + 1]), np.mean(v6[i6 - NMEAN + 1:i6 + 1])
    f = np.concatenate([u6[i6 - NLAG + 1:i6 + 1] - mu, v6[i6 - NLAG + 1:i6 + 1] - mv])
    kn, uu, vv = [0], [mu], [mv]
    for lead in LEADS:
        c = f @ W[lead]
        kn.append(lead * 6); uu.append(mu + alpha * c[0]); vv.append(mv + alpha * c[1])
    j = np.arange(n)
    return np.interp(j, kn, uu), np.interp(j, kn, vv)

def to_rates(u, v, mean_dir, vf, bf):
    s = np.hypot(u, v)
    d = (np.degrees(np.arctan2(-u, -v))) % 360
    return rates(s, wrap(d - mean_dir), vf, bf)

def job(args):
    path, W = args
    vf, bf = polar()
    s, d, t, tm = load(path)
    U6, V6 = series6(path)
    rows = []
    for i, w0 in enumerate(range(0, len(s) - 1440, 1440)):
        raw = (t >= w0) & (t < w0 + 1440)
        if raw.sum() < 0.9 * 240 or i % EVERY:
            continue
        ss, dw = s[w0:w0 + 1440], d[w0:w0 + 1440]
        md = circ_mean(dw)
        p, c = rates(ss, wrap(dw - md), vf, bf)
        bd = bound(p, DT)
        if bd < 5000.0:
            continue
        m = int(round(TAU / DT))
        def mk_ridge(alpha):
            def ridge_fc(k0):
                i6 = (w0 + k0) // 6
                if i6 < NMEAN - 1 or np.isnan(U6[i6 - NMEAN + 1:i6 + 1]).any() or np.isnan(V6[i6 - NMEAN + 1:i6 + 1]).any():
                    return lead_forecast(p, c, k0, 0.0)
                return to_rates(*ridge_wind(W, U6, V6, i6, 1440 - k0, alpha), md, vf, bf)
            return ridge_fc
        def hold_fc(k0):
            i6 = (w0 + k0) // 6
            n = 1440 - k0
            u, v = U6[i6], V6[i6]
            if np.isnan(u) or np.isnan(v):
                return lead_forecast(p, c, k0, 0.0)
            return to_rates(np.full(n, u), np.full(n, v), md, vf, bf)
        rec = {"path": os.path.basename(path)}
        rec["header"] = sim_header(p, c, DT, CORR, TAU, MARGIN_B, DWELL)[0] / bd
        for name, fc in (("ridge1", mk_ridge(1.0)), ("ridge05", mk_ridge(0.5)), ("hold", hold_fc), ("T0", lambda k0: lead_forecast(p, c, k0, 0.0)),
                         ("Tinf", lambda k0: lead_forecast(p, c, k0, float("inf")))):
            x, n = sim_replan_dead(p, c, DT, CORR, m, fc, every=60)
            rec[name] = x / bd; rec["n_" + name] = n
        rows.append(rec)
    return rows

def main():
    files = sorted(glob.glob("experiments/data/coops_wind_*_202407.csv"))
    jobs = []
    for f in files:
        jan = f.replace("202407", "202401")
        if os.path.exists(jan):
            jobs.append((f, fit_station(jan)))
    with mp.Pool(4) as pool:
        allr = [r for rr in pool.map(job, jobs, chunksize=1) for r in rr]
    rng = np.random.default_rng(13)
    print(f"July holdout, tau {TAU:.0f} s, hourly replan, every {EVERY}th window; {len(jobs)} stations, {len(allr)} windows; shares of the no-corridor no-tack-cost bound")
    md = lambda k, rs: float(np.median([r[k] for r in rs]))
    def report(label, rs):
        print(f"\n{label}: {len(rs)} windows; header {md('header', rs):.3f}")
        for k in ("T0", "hold", "ridge05", "ridge1", "Tinf"):
            print(f"  {k:6s} {md(k, rs):.3f}; tacks/day {md('n_' + k, rs):.0f}")
        for a, b in (("ridge1", "T0"), ("ridge05", "T0"), ("ridge1", "ridge05"), ("Tinf", "T0")):
            dif = np.array([r[a] - r[b] for r in rs])
            # bootstrap by day-station window (windows are non-overlapping 24 h, so close to independent across days)
            bs = [np.median(rng.choice(dif, len(dif))) for _ in range(1000)]
            print(f"  {a} minus {b}: {100 * np.median(dif):+.1f} pts (mean {100 * dif.mean():+.1f}; boot 95% of median {100 * np.percentile(bs, 2.5):+.1f}..{100 * np.percentile(bs, 97.5):+.1f})")
    report("all stations", allr)
    for st, label in (("9414290", "San Francisco (best skill in 6zd)"), ("8729840", "Pensacola")):
        rs = [r for r in allr if st in r["path"]]
        if rs:
            report(label, rs)

if __name__ == "__main__":
    main()
