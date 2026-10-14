"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from compass_twin.model import (error, hard_peak, soft_peak, closure_first_order, square_closure, fit_offset, swing_points,
                                offset_error_rms, wrap, range_to_fail)

D = math.degrees
sweep = lambda **kw: [error(2 * math.pi * i / 7200, **kw) for i in range(7200)]
print("Compass twin: real = 2-D magnetometer with hard-iron offset beta and/or soft-iron axis scale r; twin = ideal (beta=0, r=1).")

print("\n== 1. Hard-iron: peak heading error, swept numerically vs asin(beta/B); rms over heading = (beta/B)/sqrt(2) ==")
print("beta/B   numeric peak(deg)   asin(beta/B)(deg)   first-order beta/B(deg)   rms(deg)")
for b in (0.02, 0.05, 0.1, 0.2, 0.4, 0.8):
    e = sweep(beta=b, phi=0.7)
    print("%6.2f   %16.3f   %16.3f   %20.3f   %8.3f" % (b, D(max(abs(x) for x in e)), D(hard_peak(b)), D(b),
          D(math.sqrt(sum(x * x for x in e) / len(e)))))

print("\n== 2. Soft-iron: peak error vs asin(|1-r|/(1+r)); error is twice-per-turn ==")
print("    r   numeric peak(deg)   closed form(deg)   ~|1-r|/2 (deg)")
for r in (0.95, 0.9, 0.8, 0.6, 1.25):
    print("%5.2f   %15.3f   %15.3f   %13.3f" % (r, D(max(abs(x) for x in sweep(r=r))), D(soft_peak(r)), D(abs(1 - r) / 2)))
print("hard-iron-only calibration (offset removed exactly) leaves soft-iron r=0.8 error unchanged: peak %.3f deg (beta=0.2 removed)" %
      D(max(abs(wrap(math.atan2(0.8 * math.sin(2 * math.pi * i / 7200), math.cos(2 * math.pi * i / 7200)) - 2 * math.pi * i / 7200))
              for i in range(7200))))

print("\n== 3. Loop closure of a compass-held square (4 legs of L=100 m): twin predicts 0; real = 2 L beta/B to first order ==")
print("beta/B   phi(deg)   closure(m)   2L beta/B (m)   true-heading tracking (m)")
for b in (0.01, 0.03, 0.1, 0.3):
    for phi in (0.0, 0.9, 2.5):
        print("%6.2f   %8.0f   %10.3f   %13.3f   %.1e" % (b, D(phi), square_closure(100, beta=b, phi=phi), closure_first_order(100, b),
              square_closure(100, compass_held=False, beta=b, phi=phi)))

print("\n== 4. Straight compass-held leg: distance to reach 1 m cross-track error at the worst heading (tol/(beta/B) to first order) ==")
for b in (0.02, 0.05, 0.1):
    print("beta/B=%.2f: %.1f m  (exact tol/sin(asin(beta/B)) = %.1f m)" % (b, range_to_fail(1.0, b), 1.0 / math.sin(hard_peak(b))))

print("\n== 5. Swing calibration (circle fit), hard-iron B=1, offset (0.2,-0.1), 400 trials: RMS offset error ==")
print("sigma=0.02 per axis. Full turn: theory 2 sigma/sqrt(n) (Euclidean RMS of the fitted offset, in units of B)")
rng = random.Random(5)
print("   n   full-turn MC   2s/sqrt(n)")
for n in (25, 100, 400):
    print("%4d   %12.5f   %10.5f" % (n, offset_error_rms(n, 2 * math.pi, 0.02, 400, rng), 2 * 0.02 / math.sqrt(n)))
print("\nArc coverage (n=100, sigma=0.02):  arc(deg)  RMS offset err   ratio to full turn")
full = offset_error_rms(100, 2 * math.pi, 0.02, 400, rng)
for arc in (360, 270, 180, 120, 90, 60, 30):
    v = offset_error_rms(100, math.radians(arc), 0.02, 400, rng)
    print("  %8d  %14.5f   %10.1f" % (arc, v, v / full))
print("\nPeak heading error after calibration from an arc (median and 90th percentile over 200 draws, n=100, sigma=0.02; asin of offset error):")
for arc in (360, 180, 90, 60):
    out = []
    for _ in range(200):
        c = fit_offset(swing_points(100, math.radians(arc), 0.02, (0.2, -0.1), rng=rng))
        de = (c[0] - 0.2, c[1] + 0.1)
        out.append(math.hypot(*de))
    out.sort()
    print("  arc %3d deg: median offset error %.4f B -> peak heading error ~%.2f deg; 90th pct %.4f B -> %.2f deg" %
          (arc, out[100], D(math.asin(min(1, out[100]))), out[180], D(math.asin(min(1, out[180])))))
