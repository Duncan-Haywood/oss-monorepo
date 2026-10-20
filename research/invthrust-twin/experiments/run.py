"""Reproduces every number in README.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
from invthrust_twin.model import G, accel, gains, step, overshoot, settle_time, twin_overshoot

print("Exact vs linear inverse of a quadratic thrust curve (true exponent 2, exact hover trim, throttle ratio in [0, 2]). g = %.2f" % G)
print("Controller thrust model T = g r^n_hat; linear inverse r = 1 + a/(n_hat g); exact inverse r = (1 + a/g)^(1/n_hat).")

print("\n== 1. Realised acceleration / g vs commanded a_cmd / g ==")
print("a_cmd/g  lin_n2   exact_n2  lin_n2.5  exact_n2.5")
for r in (-1.5, -1, -0.5, -0.25, 0.25, 0.5, 1, 2, 3, 4):
    a = r * G
    print("%-8g %-8.3f %-9.3f %-9.3f %.3f" % (r, accel(a, 2, "linear") / G, accel(a, 2, "exact") / G,
                                               accel(a, 2.5, "linear") / G, accel(a, 2.5, "exact") / G))

T = 40.0
kp, kd = gains(1.0, 0.7)
print("\n== 2. Overshoot, zeta = 0.7, wn = 1 (twin overshoot %.4f), step p = wn^2 |x0| / g, up / down ==" % twin_overshoot(0.7))
print("n_hat  p     lin_up  lin_down  exact_up  exact_down")
for n in (1.5, 2.0, 2.5):
    for p in (0.5, 1.0, 2.0):
        row = []
        for mode in ("linear", "exact"):
            for s in (1, -1):
                x0 = s * p * G
                row.append(overshoot(step(kp, kd, x0, T, n, mode), x0))
        print("%-6g %-5g %-7.4f %-9.4f %-9.4f %.4f" % (n, p, *row))

print("\n== 3. Up / down overshoot gap (|up - down|, points of the step), p = 2 ==")
print("n_hat  lin_gap  exact_gap")
for n in (1.5, 2.0, 2.5):
    g = []
    for mode in ("linear", "exact"):
        u = overshoot(step(kp, kd, 2 * G, T, n, mode), 2 * G)
        d = overshoot(step(kp, kd, -2 * G, T, n, mode), -2 * G)
        g.append(abs(u - d) * 100)
    print("%-6g %-8.2f %.2f" % (n, *g))

print("\n== 4. 2% settling time (s), zeta = 0.7, p = 2, n_hat = 2.5 (twin 5.98 s) ==")
for mode in ("linear", "exact"):
    print(mode, " ".join("%s %.2f" % (nm, settle_time(step(kp, kd, s * 2 * G, T, 2.5, mode), s * 2 * G)) for nm, s in (("up", 1), ("down", -1))))
