"""Experiments for free-f32bounce. Prints the tables that README.md quotes.

    PYTHONPATH=src python experiments/run.py > experiments/results.txt
"""
import numpy as np
from free_f32bounce import model as m

F32, F64 = np.float32, np.float64
N, K = 1000, 2000
DELTAS = [1e-4, 1e-6, 1e-8, 1e-10, 1e-12]
THR = 0.1


def med(x):
    x = np.asarray(x)
    return "%5.1f (q10-q90 %4.1f-%4.1f, never %.0f%%)" % (np.nanmedian(x), np.nanquantile(x, .1), np.nanquantile(x, .9), 100 * np.isnan(x).mean()) if (~np.isnan(x)).any() else "never"


def welch(a, b):
    return (a.mean() - b.mean()) / np.sqrt(a.var(ddof=1) / len(a) + b.var(ddof=1) / len(b))


print("# free-f32bounce results. Sinai billiard (unit square, circle radius %.2f), N = %d members, %d collisions each; seeds fixed in code." % (m.R, N, K))
p0, d0 = m.initial_states(N, seed=11)
p0, d0 = p0.astype(F32).astype(F64), d0.astype(F32).astype(F64)  # exactly representable in float32
ref = m.run(p0, d0, K, F64)
f32 = m.run(p0, d0, K, F32)
ctrl = {}
for i, dl in enumerate(DELTAS):
    ctrl[dl] = m.run(m.perturbed(p0, dl, 100 + i), d0, K, F64)

print("\n== 1. collisions until a twin leaves the float64 reference (position differs by > %g)" % THR)
rows = []
for dl in DELTAS:
    n = m.departure_index(ref["pos"], ctrl[dl]["pos"], THR)
    rows.append((np.log(1 / dl), np.nanmedian(n)))
    print("float64, start moved by %-8g %s" % (dl, med(n)))
n32 = m.departure_index(ref["pos"], f32["pos"], THR)
print("float32 arithmetic            %s" % med(n32))
x, y = np.array(rows).T
b, a = np.polyfit(x, y, 1)
print("fit: collisions = %.2f + %.2f * ln(1/delta0)  (so lambda = %.3f per collision)" % (a, b, 1 / b))
eq = float(np.exp(-(np.nanmedian(n32) - a) / b))
print("float32 matches a float64 start error of %.2e (float32 unit roundoff 6.0e-08, ratio %.0f)" % (eq, eq / 6.0e-8))

print("\n== 2. collisions until the event order changes (first different surface hit)")
for dl in DELTAS:
    print("float64, start moved by %-8g %s" % (dl, med(m.surface_departure(ref["surf"], ctrl[dl]["surf"]))))
s32 = m.surface_departure(ref["surf"], f32["surf"])
print("float32 arithmetic            %s" % med(s32))

print("\n== 3. long-run statistics over %d collisions (per-member means; Welch z of the difference from float64)" % K)
exact = m.mean_free_path_exact()
mfp = {"float64": ref, "float32": f32, "float64 start moved 1e-12": ctrl[1e-12]}
for name, r in mfp.items():
    mf = r["path"].mean(axis=0)
    cf = (r["surf"] == 4).mean(axis=0)
    sp = np.sqrt((r["d"] ** 2).sum(axis=1))
    esc = int(((r["pos"] < -1e-6) | (r["pos"] > 1 + 1e-6)).any(axis=(0, 2)).sum())
    zm = "" if name == "float64" else "  z(mfp)=%5.2f z(circle)=%5.2f" % (welch(mf, ref["path"].mean(axis=0)), welch(cf, (ref["surf"] == 4).mean(axis=0)))
    print("%-26s mfp %.5f  circle share %.4f  |d| %.7f..%.7f  escapes %d%s" % (name, mf.mean(), cf.mean(), sp.min(), sp.max(), esc, zm))
print("Cauchy mean free path pi*(1-pi r^2)/(4+2 pi r) = %.5f" % exact)
z64 = (ref["path"].mean(axis=0).mean() - exact) / (ref["path"].mean(axis=0).std(ddof=1) / np.sqrt(N))
z32 = (f32["path"].mean(axis=0).mean() - exact) / (f32["path"].mean(axis=0).std(ddof=1) / np.sqrt(N))
print("z against the exact value: float64 %.2f, float32 %.2f" % (z64, z32))

print("\n== 4. drift of the direction vector length |d| in float32 (no renormalisation)")
for k in (100, 500, 2000):
    r = m.run(p0[:200], d0[:200], k, F32)
    sp = np.sqrt((r["d"] ** 2).sum(axis=1))
    print("after %4d collisions: mean |d|-1 = %+.2e, sd %.2e" % (k, sp.mean() - 1, sp.std()))
