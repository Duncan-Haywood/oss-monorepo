"""Experiments for free-f32shadow. Prints the tables that README.md quotes.

    PYTHONPATH=src python experiments/run.py > experiments/results.txt
"""
import math
import numpy as np
from free_f32shadow import model as m

F32, F64, F16 = np.float32, np.float64, np.float16
N = 200
CFG = {"lorenz": dict(t_div=60.0, t_stat=200.0, t_lyap=100.0), "rossler": dict(t_div=1200.0, t_stat=2000.0, t_lyap=1000.0)}
DELTAS = [1e-4, 1e-6, 1e-8, 1e-10, 1e-12]


def fit_line(x, y):
    x, y = np.asarray(x), np.asarray(y)
    A = np.vstack([x, np.ones_like(x)]).T
    (a, b), *_ = np.linalg.lstsq(A, y, rcond=None)
    return a, b


print("# free-f32shadow results. N = %d ensemble members per system; seeds fixed in code." % N)
for name in ("lorenz", "rossler"):
    cfg, sysc = CFG[name], m.SYSTEMS[name]
    thr = sysc["thr"]
    s0 = m.initial_states(name, N, seed=11).astype(F32).astype(F64)  # exactly representable in float32
    every = 5
    lam64 = m.lyapunov(name, s0[:50], cfg["t_lyap"], F64)
    lam32 = m.lyapunov(name, s0[:50], cfg["t_lyap"], F32)
    print("\n== 1. %s: largest Lyapunov exponent (Benettin, 50 members, t=%g, d0=1e-3)" % (name, cfg["t_lyap"]))
    print("float64 %.4f  (se %.4f)" % (lam64.mean(), lam64.std(ddof=1) / math.sqrt(50)))
    print("float32 %.4f  (se %.4f)" % (lam32.mean(), lam32.std(ddof=1) / math.sqrt(50)))
    lam = lam64.mean()

    ts, base = m.run(name, s0, cfg["t_div"], F64, every)
    _, a32 = m.run(name, s0, cfg["t_div"], F32, every)
    t32 = m.divergence_times(ts, a32, base, thr)
    print("\n== 2. %s: time until |state - float64 state| > %g (median over members; t_max %g)" % (name, thr, cfg["t_div"]))
    print("%-34s %10s %10s %10s %8s" % ("run vs float64 reference", "median", "q10", "q90", "censored"))
    def row(label, t):
        ok = t[~np.isnan(t)]
        print("%-34s %10.2f %10.2f %10.2f %8d" % (label, np.median(ok), np.quantile(ok, .1), np.quantile(ok, .9), int(np.isnan(t).sum())))
    row("float32 arithmetic", t32)
    xs, ys = [], []
    for d in DELTAS:
        _, p = m.run(name, m.perturbed(s0, d, 5), cfg["t_div"], F64, every)
        t = m.divergence_times(ts, p, base, thr)
        row("float64, start moved by %.0e" % d, t)
        if (~np.isnan(t)).all():
            xs.append(math.log(thr / d)); ys.append(np.median(t))
    slope, icpt = fit_line(xs, ys)
    print("\nfit  median T = %.3f + %.3f * ln(thr/delta0)   (1/lambda_float64 = %.3f)" % (icpt, slope, 1 / lam))
    med32 = np.nanmedian(t32)
    eff = thr * math.exp(-(med32 - icpt) / slope)
    print("float32 median T = %.2f  ->  equivalent initial error delta0 ~ %.1e  (float32 unit roundoff 6.0e-08)" % (med32, eff))

    print("\n== 3. %s: long-run time averages over t=%g (after a float64 burn-in); %d members" % (name, cfg["t_stat"], N))
    print("%-10s %-24s %12s %12s %12s" % ("precision", "statistic", "mean", "sd", "z vs f64"))
    ref = m.long_run_stats(name, s0, cfg["t_stat"], F64)
    ref2 = m.long_run_stats(name, m.perturbed(s0, 1e-12, 3), cfg["t_stat"], F64)
    labels = ["mean z", "fraction x>0", "x sign flips / time"]
    runs = [("float64", ref, None), ("f64 +1e-12", ref2, ref)]
    runs.append(("float32", m.long_run_stats(name, s0, cfg["t_stat"], F32), ref))
    for lab, st, rf in runs:
        for i, sl in enumerate(labels):
            z = "" if rf is None else "%.2f" % m.z_stat(st[i], rf[i])
            print("%-10s %-24s %12.5f %12.5f %12s" % (lab, sl, st[i].mean(), st[i].std(ddof=1), z))

print("\n== 4. float16 stress test (lorenz, 100 members, t=50 for time averages)")
s0 = m.initial_states("lorenz", 100, seed=11).astype(F16).astype(F64)
ref = m.long_run_stats("lorenz", s0, 50.0, F64)
h = m.long_run_stats("lorenz", s0, 50.0, F16)
for i, sl in enumerate(["mean z", "fraction x>0", "x sign flips / time"]):
    print("%-24s float64 %9.4f  float16 %9.4f  z %.2f" % (sl, ref[i].mean(), h[i].mean(), m.z_stat(h[i], ref[i])))
ts, base = m.run("lorenz", s0, 30.0, F64, 5)
_, a16 = m.run("lorenz", s0, 30.0, F16, 5)
t16 = m.divergence_times(ts, a16, base, 1.0)
print("float16 time to |state - float64 state| > 1: median %.2f  (members never diverging: %d)" % (np.nanmedian(t16), int(np.isnan(t16).sum())))

print("\n== 5. lorenz: does the float32 equivalent initial error depend on the step size? (100 members, t=40)")
print("%-8s %8s %12s %12s %14s" % ("dt", "steps/t", "T float32", "slope", "delta0 equiv"))
sysc = m.SYSTEMS["lorenz"]
dt_default = sysc["dt"]
s0 = m.initial_states("lorenz", 100, seed=11).astype(F32).astype(F64)
for dt in (0.02, 0.01, 0.005, 0.0025):
    sysc["dt"] = dt
    every = int(round(0.05 / dt))
    ts, base = m.run("lorenz", s0, 40.0, F64, every)
    _, a32 = m.run("lorenz", s0, 40.0, F32, every)
    t32 = np.nanmedian(m.divergence_times(ts, a32, base, 1.0))
    pts = []
    for d in (1e-4, 1e-6, 1e-8, 1e-10):
        _, p = m.run("lorenz", m.perturbed(s0, d, 5), 40.0, F64, every)
        pts.append((math.log(1.0 / d), np.nanmedian(m.divergence_times(ts, p, base, 1.0))))
    slope, icpt = fit_line([a for a, _ in pts], [b for _, b in pts])
    eff = math.exp(-(t32 - icpt) / slope)
    print("%-8g %8d %12.2f %12.3f %14.1e" % (dt, round(1 / dt), t32, slope, eff))
sysc["dt"] = dt_default
