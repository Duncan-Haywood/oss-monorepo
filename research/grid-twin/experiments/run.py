"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from grid_twin.model import ratio, octile, dijkstra, mean_ratio, max_ratio, flip_probability_mc, flip_probability_quad, SQ2

print("Grid twin: real = straight-line route (Euclidean length); twin = shortest path on a k-connected lattice, no obstacles")

print("\n== 1. Length bias factor r_k(phi) = grid length / Euclidean length, scale free ==")
print("k    mean over heading   closed form       max      at heading (deg)   min")
for k in (4, 8, 16):
    mean = mean_ratio(k)
    mx, arg = max_ratio(k)
    cf = {4: "4/pi = %.5f" % (4 / math.pi), 8: "8(sqrt2-1)/pi = %.5f" % (8 * (SQ2 - 1) / math.pi), 16: "(numeric only)"}[k]
    print("%-3d  %.5f            %-20s  %.5f  %6.2f             1.00000" % (k, mean, cf, mx, math.degrees(arg)))
print("8-connected max closed form cos(pi/8)+(sqrt2-1)sin(pi/8) = %.5f at 22.5 deg" % (math.cos(math.pi / 8) + (SQ2 - 1) * math.sin(math.pi / 8)))

print("\n== 2. Dijkstra on an obstacle-free lattice vs the closed forms ==")
print("k   target(cells)   Dijkstra   formula   heading(deg)")
for k, t in ((8, (40, 16)), (8, (16, 40)), (8, (37, 37)), (4, (30, 12)), (16, (60, 25)), (16, (25, 60))):
    d = dijkstra(k, 70, t)
    phi = math.atan2(t[1], t[0])
    f = ratio(k, phi) * math.hypot(*t)
    print("%-3d (%3d,%3d)      %8.3f   %8.3f   %6.2f" % (k, t[0], t[1], d, f, math.degrees(phi)))

print("\n== 3. Refining the grid does not remove the bias: 100 m route at 22.5 deg, 8-connected ==")
print("cell (m)   grid length (m)   ratio     Euclid (m)")
phi = math.pi / 8
for h in (8.0, 4.0, 2.0, 1.0, 0.5, 0.25, 0.1):
    dx, dy = round(100 * math.cos(phi) / h), round(100 * math.sin(phi) / h)
    eu = h * math.hypot(dx, dy)
    g = h * octile(dx, dy)
    print("%7.2f    %13.2f     %.4f    %.2f" % (h, g, g / eu, eu))

print("\n== 4. Calibrating by the mean factor leaves a heading-dependent residual ==")
for k in (4, 8, 16):
    m = mean_ratio(k)
    mx, _ = max_ratio(k)
    print("k=%-2d calibrated twin error range: %+.1f%% .. %+.1f%%  (mean factor %.4f)" % (k, 100 * (1 / m - 1), 100 * (mx / m - 1), m))

print("\n== 5. Route ranking: two routes, Euclid lengths 1 and rho > 1, independent uniform headings; P(twin ranks the longer one shorter) ==")
print("rho     k=8 quadrature   k=8 MC (2e5)   k=4 quadrature   k=16 quadrature")
for rho in (1.00, 1.01, 1.02, 1.03, 1.05, 1.08, 1.0824, 1.10):
    print("%.4f  %.4f           %.4f         %.4f           %.4f" % (
        rho, flip_probability_quad(8, rho), flip_probability_mc(8, rho, 200000, seed=3), flip_probability_quad(4, rho), flip_probability_quad(16, rho)))

print("\n== 6. Same two routes, rotate the map: fraction of map rotations (k=8) for which the twin ranks the longer route shorter ==")
print("rho    relative angle(deg)   fraction of rotations")
n = 20000
for rho in (1.02, 1.03, 1.05):
    for dlt in (22.5, 45.0, 90.0):
        c = 0
        for i in range(n):
            a = 2 * math.pi * (i + 0.5) / n
            if rho * ratio(8, a + math.radians(dlt)) < ratio(8, a):
                c += 1
        print("%.2f   %6.1f                %.4f" % (rho, dlt, c / n))
