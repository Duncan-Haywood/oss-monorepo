"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from lens_twin.model import (twin_range, range_ratio, brake_point, brake_first_order, line_bow, lsq_scale, fit_scale, grid_points,
                             estimate_k1, observe)

H = 0.5
print("Lens twin: real = Brown radial distortion (x_d = x(1 + k1 r^2)), twin = pinhole (k1 = 0). Camera height h = %.2f m, horizontal axis, flat floor." % H)

print("\n== 1. Ground-plane range read by the uncalibrated twin, ratio twin/true = 1/(1 + k1 h^2/R^2) (exact) ==")
print("  k1     R (m)   rho=h/R   twin range   ratio (sim)   ratio (formula)")
for k1 in (-0.3, 0.2):
    for R in (0.75, 1.0, 2.0, 4.0, 10.0):
        t = twin_range(R, H, k1)
        print("%5.2f   %5.2f   %7.3f   %10.4f   %11.5f   %14.5f" % (k1, R, H / R, t, t / R, range_ratio(R, H, k1)))

print("\n== 2. Standoff braking: policy 'stop when twin range = R0' trained in the pinhole twin; true stopping range ==")
print("  k1     R0 (m)   true stop (m)   error (cm)   first order k1 h^2/R0 (cm)")
for k1 in (-0.3, -0.1, 0.1):
    for R0 in (0.75, 1.0, 1.5, 3.0):
        R = brake_point(R0, H, k1)
        print("%5.2f   %6.2f   %13.4f   %10.2f   %26.2f" % (k1, R0, R, 100 * (R - R0), 100 * brake_first_order(R0, H, k1)))

print("\n== 3. A scene line X = d bows in the image by exactly k1 d Y^2 (straight lane edge, d = 0.4) ==")
print("  k1     Y      bow (sim)    k1 d Y^2")
for k1 in (-0.3, 0.2):
    for Y in (0.1, 0.3, 0.5):
        print("%5.2f   %3.1f   %9.5f   %9.5f" % (k1, Y, line_bow(0.4, Y, k1), k1 * 0.4 * Y * Y))

print("\n== 4. Calibrating the twin's focal scale s by least squares over rho in [0, rho_max] (k1 = -0.3, s = 1 + 3 k1 rho_max^2/5) ==")
print("rho_max   s (closed form)   s (grid LSQ)   then range ratio at R = h/rho for rho = 0.1 rho_max, 0.5 rho_max, rho_max")
k1 = -0.3
for rm in (0.3, 0.5, 0.7):
    s = lsq_scale(k1, rm)
    rs = []
    for f in (0.1, 0.5, 1.0):
        R = H / (f * rm)
        rs.append(twin_range(R, H, k1, s) / R)
    print("%7.2f   %15.5f   %12.5f   %s" % (rm, s, fit_scale(k1, rm), "  ".join("%.4f" % r for r in rs)))
print("(ratio 1 would be unbiased; calibration moves the error between near and far rather than removing it)")

print("\n== 5. Braking after calibrating s (k1 = -0.3, rho_max = 0.5), R0 = 1.0 m: true stop vs uncalibrated ==")
s = lsq_scale(-0.3, 0.5)
for R0 in (1.0, 2.0, 4.0):
    print("R0 = %.1f: uncalibrated stop %.4f, calibrated stop %.4f" % (R0, brake_point(R0, H, -0.3), brake_point(R0, H, -0.3, s)))

print("\n== 6. Identifying k1 from one image of a known 7x7 grid on the plane z = 1 (half-width 0.6), 400 draws per row ==")
print("true k1   sigma (norm. px)   mean est   RMS err   (range ratio error at R=1 m implied by the RMS err, first order)")
pts = grid_points()
rng = random.Random(5)
for k1 in (-0.3, 0.2):
    for sg in (0.0005, 0.002, 0.008):
        ests = [estimate_k1(pts, observe(pts, k1, sg, rng)) for _ in range(400)]
        m = sum(ests) / len(ests)
        rms = math.sqrt(sum((e - k1) ** 2 for e in ests) / len(ests))
        print("%7.2f   %16.4f   %8.4f   %7.4f   %.4f" % (k1, sg, m, rms, rms * H * H / 1.0))
