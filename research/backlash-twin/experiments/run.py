"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from backlash_twin.model import *

print("Backlash twin: real actuator has a gap of half-width h, twin has none. Loop z+=z+y, m+=m-kp*y-ki*z, y=play(y,m,h).")

print("\n== 1. Describing function of the play operator: closed form vs numerical first harmonic (h=1) ==")
print("A/h    N closed form          N numerical            |N|     lag (deg)")
worst = 0.0
for A in (1.2, 1.5, 2, 3, 5, 10, 30):
    c, f = describing_function(A, 1.0), fourier_df(A, 1.0)
    worst = max(worst, abs(c - f))
    print("%-6g %-22s %-22s %-7.4f %.2f" % (A, "%.5f%+.5fj" % (c.real, c.imag), "%.5f%+.5fj" % (f.real, f.imag), abs(c), -math.degrees(math.atan2(c.imag, c.real))))
print("max |closed - numerical| = %.1e" % worst)

print("\n== 2. Twin says converge; real loop hunts (h=1, start x0=10, 30000 steps, tail 3000) ==")
print("kp    ki     twin radius  twin |m| end   real amp(m)  period  DF amp   DF period  DF amp error")
for kp, ki in ((0.5, 0.1), (0.3, 0.1), (0.5, 0.2), (0.3, 0.05), (0.2, 0.2)):
    tw = abs(run_loop(kp, ki, 0.0, 10.0, 3000)[0][-1])
    ms, _ = run_loop(kp, ki, 1.0, 10.0, 30000)
    a, per = measured_cycle(ms[-3000:])
    A, w, r = predict_cycle(kp, ki)
    print("%-5g %-6g %-12.3f %-14.1e %-12.4f %-7.2f %-8.4f %-11.2f %+.1f%%" % (kp, ki, twin_radius(kp, ki), tw, a, per, A, 2 * math.pi / w, 100 * (A - a) / a))

print("\n== 3. Exact scaling with h (kp=0.5, ki=0.1, x0=10h): amplitude / h ==")
print("h        amp(m)/h")
for h in (0.01, 1.0, 100.0):
    ms, _ = run_loop(0.5, 0.1, h, 10 * h, 30000)
    print("%-8g %.6f" % (h, measured_cycle(ms[-3000:])[0] / h))

print("\n== 4. Bistability: final amp(m)/h by start x0/h (h=1, 60000 steps) ==")
print("x0/h   (kp,ki)=(0.5,0.05)   (0.8,0.1)   (0.5,0.1)")
for x0 in (1.5, 3, 5, 6, 8, 10, 100):
    row = []
    for kp, ki in ((0.5, 0.05), (0.8, 0.1), (0.5, 0.1)):
        ms, _ = run_loop(kp, ki, 1.0, x0, 60000)
        row.append(measured_cycle(ms[-3000:])[0])
    print("%-6g %-20.4f %-11.4f %.4f" % (x0, *row))
print("harmonic balance (h=1): (0.5,0.05) A=%.3f, (0.8,0.1) A=%.3f, (0.5,0.1) A=%.3f" % tuple(predict_cycle(kp, ki)[0] for kp, ki in ((0.5, 0.05), (0.8, 0.1), (0.5, 0.1))))

print("\n== 5. Integral gain sweep (kp=0.5, h=1, x0=10 and x0=2): amp(m)/h ==")
print("ki     twin radius  x0=10    x0=2     DF amp")
for ki in (0.01, 0.02, 0.05, 0.1, 0.2, 0.4):
    r = []
    for x0 in (10.0, 2.0):
        ms, _ = run_loop(0.5, ki, 1.0, x0, 80000)
        r.append(measured_cycle(ms[-3000:])[0])
    print("%-6g %-12.3f %-8.4f %-8.4f %.3f" % (ki, twin_radius(0.5, ki), r[0], r[1], predict_cycle(0.5, ki)[0]))
