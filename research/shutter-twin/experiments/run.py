"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from shutter_twin.model import Rect, measure, predict, naive_theta, solve

H, TAU = 480, 0.030
K = TAU / H
print("Shutter twin: real = rolling shutter, H=%d rows, readout tau=%g s (k=tau/H=%.3e s/row); twin = global shutter (k=0)." % (H, TAU, K))
print("target: rectangle 200 x 120 px, centre (320, 240); velocities in px/s; angles in degrees")

print("\n== 1. Horizontal speed u, theta = 0, w = 0: orientation each edge family reports (closed form: atan(-u k), 0) ==")
print("     u   vertical-edge angle (sim)   atan(-uk)   horizontal-edge angle (sim)   naive mean (twin-trained)")
for u in (0, 250, 500, 1000, 1500):
    r = Rect(u=float(u))
    tv, th, dr = measure(r, K)
    print("%6d   %20.4f   %10.4f   %22.4f   %22.4f" % (u, math.degrees(math.atan(tv)), math.degrees(math.atan(-u * K)), math.degrees(math.atan(th)),
                                                    math.degrees(naive_theta(tv, th))))

print("\n== 2. Vertical speed w, theta = 0, u = 0: row gap of the two horizontal edges (closed form 120/(1 - w k)) ==")
print("     w   gap (sim)   120/(1-wk)   gap / 120")
for w in (-1000, -500, 500, 1000, 1500):
    r = Rect(w=float(w))
    dr = measure(r, K)[2]
    print("%6d   %9.3f   %10.3f   %9.4f" % (w, dr, 120 / (1 - w * K), dr / 120))

print("\n== 3. Closed forms vs forward simulation, random poses (200 draws, theta in +-17 deg, u, w in +-1000) ==")
rng = random.Random(7)
ev = eh = ed = 0.0
for _ in range(200):
    r = Rect(theta=rng.uniform(-0.3, 0.3), u=rng.uniform(-1000, 1000), w=rng.uniform(-1000, 1000))
    sim, cf = measure(r, K), predict(r, K)
    ev, eh, ed = max(ev, abs(sim[0] - cf[0])), max(eh, abs(sim[1] - cf[1])), max(ed, abs(sim[2] - cf[2]))
print("max |t_v sim - formula| = %.2e   max |t_h sim - formula| = %.2e   max |gap sim - formula| = %.3f px" % (ev, eh, ed))

print("\n== 4. Orientation error of the twin-trained (naive) estimator vs the rolling-shutter-aware solver, noise sigma = 0.25 px per edge point ==")
print("(200 draws, theta in +-17 deg, u, w uniform in +-U; errors are RMS; target size known exactly)")
print("  U     naive theta err   RS theta err   RS u err (px/s)   RS w err (px/s)   u RMS of draws")
for U in (250, 500, 1000):
    rng = random.Random(11)
    sn = ss = su = sw = sp = 0.0
    n = 200
    for _ in range(n):
        th, u, w = rng.uniform(-0.3, 0.3), rng.uniform(-U, U), rng.uniform(-U, U)
        r = Rect(theta=th, u=u, w=w)
        tv, tH, dr = measure(r, K, noise=0.25, rng=rng)
        sn += (naive_theta(tv, tH) - th) ** 2
        eth, eu, ew = solve(tv, tH, dr, r.hd, K)
        ss += (eth - th) ** 2
        su += (eu - u) ** 2
        sw += (ew - w) ** 2
        sp += u * u
    print("%5d   %12.3f deg   %9.3f deg   %14.1f   %15.1f   %14.1f" % (U, math.degrees(math.sqrt(sn / n)), math.degrees(math.sqrt(ss / n)), math.sqrt(su / n),
                                                                     math.sqrt(sw / n), math.sqrt(sp / n)))

print("\n== 5. Sensitivity to the assumed target height (RS solver, noiseless, theta = 0.12 rad, u = 650, w = -500) ==")
print("height error   u est    w est    theta est (deg)")
r = Rect(theta=0.12, u=650.0, w=-500.0)
fr = predict(r, K)
for e in (-0.05, -0.02, 0.0, 0.02, 0.05):
    eth, eu, ew = solve(*fr, r.hd * (1 + e), K)
    print("%+11.0f%%   %6.1f   %6.1f   %8.3f" % (100 * e, eu, ew, math.degrees(eth)))
