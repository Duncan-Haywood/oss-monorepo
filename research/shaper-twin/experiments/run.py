"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from shaper_twin.model import (Tank, shaper, shaped_time, residual, trajectory, bang_bang_residual, V, eps_tolerated, min_time,
                               null_tuned_time, band_design)

D, AMAX, TOL = 3.0, 0.5, 0.01
T_0 = Tank()
WM = T_0.w                                   # twin calibrated at full tank
T0 = min_time(D, AMAX)
A0 = 4 * D / T0 ** 2
print("Shaper twin: cart + slosh mode (M=80, m_full=20 kg, w_full=%.4f rad/s), move D=%g m, a_max=%g, tol=%g m; twin bang-bang T0=%.3f s" % (
    WM, D, AMAX, TOL, T0))

print("\n== 1. Shaped residual = V(eps) * unshaped residual (undamped, real fill 1, 0.5, 0.25, design w = full-tank w) ==")
print("fill  eps      kind  V closed   residual (exact)   V*unshaped   move time (s)")
for f in (1.0, 0.5, 0.25):
    t = T_0.with_fill(f)
    eps = t.w / WM - 1
    base = bang_bang_residual(t.mu, A0, t.w, T0)
    for kind in ("none", "zv", "zvd"):
        imps = shaper(kind, WM)
        r = residual(t, D, T0, imps)
        print("%.2f  %+.4f  %-4s  %.5f   %.6f           %.6f     %.3f" % (f, eps, kind, V(kind, eps), r, V(kind, eps) * base, shaped_time(T0, imps)))

print("\n== 2. Largest tolerated |eps| for tol (closed form, rho = tol/unshaped residual at that fill) vs actual eps ==")
print("fill  eps      unshaped R   rho     ZV tolerates  ZVD tolerates  ZV res    ZVD res   ZV ok  ZVD ok")
for f in (0.9, 0.75, 0.5, 0.25, 0.1):
    t = T_0.with_fill(f)
    eps = t.w / WM - 1
    R = bang_bang_residual(t.mu, A0, t.w, T0)
    rho = TOL / R
    rz, rd = residual(t, D, T0, shaper("zv", WM)), residual(t, D, T0, shaper("zvd", WM))
    print("%.2f  %+.4f  %.5f      %.3f   %.4f        %.4f         %.5f   %.5f   %-5s  %s" % (
        f, eps, R, rho, eps_tolerated("zv", rho), eps_tolerated("zvd", rho), rz, rd, rz <= TOL, rd <= TOL))

print("\n== 3. Time to a safe move at each fill, twin calibrated at full tank (slosh-twin: null-tuned 8 s to f=0.5, 28 s at f<=0.25) ==")
print("fill  ZV time  ZVD time  ZV safe  ZVD safe  null-tuned safe time  recalibrated null time")
for f in (1.0, 0.9, 0.75, 0.5, 0.25, 0.1):
    t = T_0.with_fill(f)
    nt = next((null_tuned_time(WM, n) for n in range(1, 13) if 4 * D / null_tuned_time(WM, n) ** 2 <= AMAX and
               residual(t, D, null_tuned_time(WM, n), shaper("none", WM)) <= TOL), math.inf)
    rc = next((null_tuned_time(t.w, n) for n in range(1, 13) if 4 * D / null_tuned_time(t.w, n) ** 2 <= AMAX), math.inf)
    print("%.2f  %.3f   %.3f     %-5s    %-5s     %8.3f              %8.3f" % (
        f, shaped_time(T0, shaper("zv", WM)), shaped_time(T0, shaper("zvd", WM)),
        residual(t, D, T0, shaper("zv", WM)) <= TOL, residual(t, D, T0, shaper("zvd", WM)) <= TOL, nt, rc))

print("\n== 4. Damping: real zeta = 0.05, full tank; undamped-design vs damped-design shapers ==")
t = Tank(zeta=0.05)
for kind in ("none", "zv", "zvd"):
    for zm in (0.0, 0.05):
        if kind == "none" and zm:
            continue
        imps = shaper(kind, t.w, zm)
        print("%-4s design zeta=%.2f  residual %.6f m  time %.3f s  weights %s" % (kind, zm, residual(t, D, T0, imps), shaped_time(T0, imps),
              ",".join("%.3f" % a for a, _ in imps)))
print("damped-ZV, real zeta=0.05, design w off by eps:")
for eps in (-0.05, -0.02, 0.02, 0.05):
    imps = shaper("zv", t.w / (1 + eps), 0.05)
    print("  eps=%+.2f  residual %.6f m" % (eps, residual(t, D, T0, imps)))

print("\n== 5. Fill-band robust design: worst case over fills in the band, design frequency searched (0.88..1.68 w_full, step 0.005) ==")
grid = [WM * (0.88 + 0.005 * i) for i in range(161)]
bands = {"[0.5,1]": (0.5, 0.75, 1.0), "[0.25,1]": (0.25, 0.5, 0.75, 1.0), "[0.1,1]": (0.1, 0.25, 0.5, 0.75, 1.0)}
print("band       family  best time (s)  design w/w_full   detail")
for name, fills in bands.items():
    for kind in ("null", "zv", "zvd"):
        T, wm, det = band_design(T_0, fills, D, AMAX, TOL, kind, grid)
        if wm is None:
            print("%-9s  %-5s   none found" % (name, kind))
        else:
            print("%-9s  %-5s   %8.3f       %.3f            %s" % (name, kind, T, wm / WM, ("order n=%d" % det) if kind == "null" else ("worst residual %.5f m" % det)))
