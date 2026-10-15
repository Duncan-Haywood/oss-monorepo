"""Reproduces every number in README.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from thrust_twin.model import (G, accel_real, accel_closed_form, gains, step, overshoot, settle_time, twin_overshoot)

print("Thrust twin: x'' = T(u) - g, real T = k u^2, twin T = linearisation at hover; throttle u in [0, 2 u_h] when clipped.")
print("Controller a_cmd = kp (x0 - x) - kd v, throttle u = u_h + a_cmd/(2 k u_h).  Closed form: x'' = a_cmd + a_cmd^2/(4 g).  g = %.2f" % G)

print("\n== 1. Realised vs commanded acceleration ==")
print("a_cmd/g   closed form/g   clipped sim/g   ratio realised/commanded (clipped)")
for r in (-3, -2, -1, -0.5, -0.1, 0.1, 0.5, 1, 2, 3, 4):
    a = r * G
    print("%-9g %-15.4f %-15.4f %s" % (r, accel_closed_form(a) / G, accel_real(a) / G, "%.3f" % (accel_real(a) / a)))

print("\n== 2. Step response, zeta = 0.7, wn = 1, step size x0 swept (p = wn^2 |x0| / g = peak a_cmd / g) ==")
print("twin overshoot (zeta 0.7) = %.4f" % twin_overshoot(0.7))
print("p      sign  real overshoot(clip)  real overshoot(no clip)  real 2% settle (s)  twin 2% settle (s)")
kp, kd = gains(1.0, 0.7)
T = 40.0
for p in (0.05, 0.25, 0.5, 1.0, 2.0, 4.0):
    for sgn in (1, -1):
        x0 = sgn * p * G
        xs_c = step(kp, kd, x0, T)
        xs_n = step(kp, kd, x0, T, clip=False)
        xs_t = step(kp, kd, x0, T, real=False)
        print("%-6g %-5s %-21.4f %-24.4f %-19.2f %.2f" % (p, "up" if sgn > 0 else "down", overshoot(xs_c, x0), overshoot(xs_n, x0),
                                                            settle_time(xs_c, x0), settle_time(xs_t, x0)))

print("\n== 3. Same, zeta = 1.0 (twin critically damped, overshoot 0) ==")
kp, kd = gains(1.0, 1.0)
print("p      sign  real overshoot(clip)  real 2% settle (s)  twin 2% settle (s)")
for p in (0.25, 1.0, 4.0):
    for sgn in (1, -1):
        x0 = sgn * p * G
        xs_c = step(kp, kd, x0, T)
        xs_t = step(kp, kd, x0, T, real=False)
        print("%-6g %-5s %-21.4f %-19.2f %.2f" % (p, "up" if sgn > 0 else "down", overshoot(xs_c, x0), settle_time(xs_c, x0), settle_time(xs_t, x0)))

print("\n== 4. Largest step that keeps the throttle floor (u >= 0) untouched in the twin's own plan ==")
print("floor reached when a_cmd = -2 g; the descent step peaks at a_cmd = -wn^2 |x0|, so |x0| <= 2 g / wn^2")
for wn in (1.0, 2.0, 4.0):
    print("wn = %-4g  max descent step without hitting the floor = %.2f m" % (wn, 2 * G / wn ** 2))
