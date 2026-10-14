"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from multipath_twin.model import (lobe_gain, mean_gain, detect_fraction, shift_disagreement, u_shift, r_crit, real_detect,
                                  freespace_detect, meangain_detect, cfs, indep_disagreement, brier_band, brier_freespace,
                                  brier_ensemble)

LAM, HR, HT, RFS = 0.03, 30.0, 100.0, 10000.0   # 10 GHz, radar 30 m, true target height 100 m, free-space detection range 10 km


def grid(lo, hi, n=20000):
    return [RFS * (lo + (hi - lo) * (i + 0.5) / n) for i in range(n)]


def frac(f, rs):
    return sum(1 for r in rs if f(r)) / len(rs)


print("Multipath twin: two-ray radar detection, lam=%g m, hr=%g m, ht=%g m, r_fs=%g m; detect iff 16 sin^4(u) >= (r/r_fs)^4, u = 2 pi hr ht/(lam r)" % (LAM, HR, HT, RFS))
print("lobes inside r_fs: u(r_fs)/pi = %.1f" % (2 * math.pi * HR * HT / (LAM * RFS) / math.pi))

print("\n== 1. Lobe statistics (exact) ==")
print("mean two-way power gain over a lobe period: %.6f (closed form 6); peak 16, null 0" % mean_gain())
print("   c=(r/r_fs)^4   range/r_fs   P(real detects) = 1-(2/pi) asin((c/16)^(1/4))")
for c in (0.25, 0.5, 1.0, 2.0, 4.0, 6.0, 10.0, 15.0, 16.0):
    print("   %6.2f         %5.3f        %.4f" % (c, c ** 0.25, detect_fraction(c)))

print("\n== 2. Detection rate by range band: real vs free-space twin vs lobe-mean-gain twin (r in units of r_fs) ==")
print("band          real    free-space twin   mean-gain twin   integral of closed form")
for lo, hi in ((0.5, 0.9), (0.9, 1.0), (1.0, 1.1), (1.1, 1.4), (1.4, 1.565), (1.565, 2.0)):
    rs = grid(lo, hi)
    pred = sum(detect_fraction(cfs(r, RFS)) for r in rs) / len(rs)
    print("%.3f-%.3f   %.3f   %.3f             %.3f            %.3f" % (
        lo, hi, frac(lambda r: real_detect(r, HR, HT, LAM, RFS), rs), frac(lambda r: freespace_detect(r, RFS), rs),
        frac(lambda r: meangain_detect(r, RFS), rs), pred))
rs = grid(0.25, 1.0)
print("real misses inside the free-space range (0.25-1.0 r_fs): %.3f of ranges" % (1 - frac(lambda r: real_detect(r, HR, HT, LAM, RFS), rs)))
rs = grid(1.0, 2.0)
print("real detects beyond the free-space range (1.0-2.0 r_fs): %.3f of ranges" % frac(lambda r: real_detect(r, HR, HT, LAM, RFS), rs))

print("\n== 3. Deterministic two-ray twin with target-height error dh: disagreement with the real detection map ==")
print("r_crit = 8 hr dh/lam is the range inside which the lobes move by > pi/4 (u units)")
print("band 0.95-1.05 r_fs (c ~ 1); closed form = band average of shift_disagreement(c(r), u_shift(r)); the band holds only ~2 lobes, so sim and closed form differ slightly")
print("   dh(m)   r_crit(m)  u-shift@r_fs  disagree (sim)  closed form    free-space twin   independent twin 2f(1-f)")
lo, hi = 0.95, 1.05
rs = grid(lo, hi, 40000)
fsd = frac(lambda r: freespace_detect(r, RFS) != real_detect(r, HR, HT, LAM, RFS), rs)
f1 = sum(detect_fraction(cfs(r, RFS)) for r in rs) / len(rs)
for dh in (0.02, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0):
    sim = frac(lambda r: real_detect(r, HR, HT + dh, LAM, RFS) != real_detect(r, HR, HT, LAM, RFS), rs)
    cf = sum(shift_disagreement(cfs(r, RFS), u_shift(r, HR, dh, LAM)) for r in rs) / len(rs)
    print("  %5.2f   %7.0f   %8.3f       %.3f           %.3f          %.3f            %.3f" % (
        dh, r_crit(HR, dh, LAM), u_shift(RFS, HR, dh, LAM), sim, cf, fsd, indep_disagreement(f1)))

print("\n== 4. Disagreement versus range for a fixed height error dh=0.5 m (bands of +-5%, sim) ==")
print("   range/r_fs  range(m)  u-shift   disagree(2-ray twin)  disagree(free-space)  disagree(mean-gain)")
dh = 0.5
for c in (0.2, 0.35, 0.5, 0.7, 0.85, 1.0, 1.2, 1.4):
    rs = grid(c * 0.95, c * 1.05, 20000)
    rc = c * RFS
    a = frac(lambda r: real_detect(r, HR, HT + dh, LAM, RFS) != real_detect(r, HR, HT, LAM, RFS), rs)
    b = frac(lambda r: freespace_detect(r, RFS) != real_detect(r, HR, HT, LAM, RFS), rs)
    g = frac(lambda r: meangain_detect(r, RFS) != real_detect(r, HR, HT, LAM, RFS), rs)
    print("   %.2f      %6.0f    %.3f         %.3f                 %.3f                 %.3f" % (c, rc, u_shift(rc, HR, dh, LAM), a, b, g))

print("\n== 5. Brier score against the real outcomes, band 0.9-1.1 r_fs, twin height = true + 0.5 m ==")
print("(Brier = mean squared error of the twin's detection probability; ensemble = 200 height draws ~ N(ht_twin, sigma^2))")
rs = [RFS * (0.9 + 0.2 * (i + 0.5) / 2000) for i in range(2000)]
fs = sum((float(freespace_detect(r, RFS)) - float(real_detect(r, HR, HT, LAM, RFS))) ** 2 for r in rs) / len(rs)
mg = sum((float(meangain_detect(r, RFS)) - float(real_detect(r, HR, HT, LAM, RFS))) ** 2 for r in rs) / len(rs)
print("free-space twin (deterministic): %.3f   mean-gain twin: %.3f" % (fs, mg))
print("closed form, band average of the c-dependent values: free-space %.3f, calibrated-ensemble f(1-f) %.3f" % (
    sum(brier_freespace(cfs(r, RFS)) for r in rs) / len(rs), sum(brier_ensemble(cfs(r, RFS)) for r in rs) / len(rs)))
print("   dh(m)   sigma=0     0.1      0.25     0.5      1.0      2.0      5.0")
for dh in (0.0, 0.1, 0.5, 1.0):
    row = [brier_band(rs, HR, HT, HT + dh, s, LAM, RFS, n=200, seed=3) for s in (0.0, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0)]
    print("  %4.1f   " % dh + "  ".join("%.3f  " % x for x in row))
