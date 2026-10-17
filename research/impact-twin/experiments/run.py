"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from impact_twin.model import (G, v1, zeno_time, impact_time, last_time_above, settle_error_factor, simulate, e_eff,
                               last_above)

H0, DELTA = 1.0, 0.01
SCHEMES = ("clamp", "mirror", "locate")
DTS = (1e-2, 3e-3, 1e-3, 3e-4, 1e-4)
print("Impact twin: ball dropped from h0 = %.1f m, g = %.2f, restitution e; twin = fixed-step semi-implicit Euler, truth = event-driven closed form." % (H0, G))


def settle_twin(e_param, dt, scheme, e_true):
    ex = last_time_above(DELTA, e_true, H0)
    ys, _, _ = simulate(e_param, dt, scheme, T=ex * 1.4 + 1.0, h0=H0)
    return last_above(ys, dt, DELTA)


def slope(xs, ys):
    lx, ly = [math.log(x) for x in xs], [math.log(y) for y in ys]
    n = len(xs)
    mx, my = sum(lx) / n, sum(ly) / n
    return sum((a - mx) * (b - my) for a, b in zip(lx, ly)) / sum((a - mx) ** 2 for a in lx)


print("\n== 1. Truth: Zeno time T = (v1/g)(1+e)/(1-e), infinitely many impacts (v1 = %.4f) ==" % v1(H0))
print("e      Zeno time   first impact   impact 10   impact 50   t_last>%.0fcm   dlnT/de = 2/(1-e^2)" % (DELTA * 100))
for e in (0.5, 0.8, 0.9, 0.95, 0.99):
    print("%.2f   %9.4f   %11.4f   %9.4f   %9.4f   %10.4f   %8.2f" % (
        e, zeno_time(e, H0), impact_time(1, e, H0), impact_time(10, e, H0), impact_time(50, e, H0), last_time_above(DELTA, e, H0), settle_error_factor(e)))

print("\n== 2. Apparent restitution of the twin, sqrt(first rebound apex / h0), true e in header ==")
for e in (0.5, 0.9):
    print("e = %.2f" % e)
    print("dt       " + "".join("%-12s" % s for s in SCHEMES))
    for dt in DTS:
        print("%-8g " % dt + "".join("%-12.5f" % e_eff(e, dt, s, H0) for s in SCHEMES))

print("\n== 3. Settling time (last instant above %.0f cm), twin vs exact, relative error (twin-exact)/exact ==" % (DELTA * 100))
for e in (0.5, 0.9, 0.95):
    ex = last_time_above(DELTA, e, H0)
    print("e = %.2f  exact %.4f" % (e, ex))
    print("dt       " + "".join("%-12s" % s for s in SCHEMES))
    rows = {}
    for dt in DTS:
        vals = [(settle_twin(e, dt, s, e) - ex) / ex for s in SCHEMES]
        rows[dt] = vals
        print("%-8g " % dt + "".join("%+-12.4f" % v for v in vals))
    if e == 0.9:
        for i, s in enumerate(SCHEMES):
            print("  log-log slope of |error| vs dt, %s: %.2f" % (s, slope(DTS, [abs(rows[d][i]) for d in DTS])))

print("\n== 4. Amplification: e error -> settling-time error ==")
print("(a) exact-system sensitivity: Zeno time when the parameter is off by de")
print("e      de      predicted dlnT = 2 de/(1-e^2)   exact ln(T(e+de)/T(e))")
for e in (0.5, 0.9, 0.95):
    for de in (-0.01, 0.01):
        print("%.2f   %+.2f   %+.4f                        %+.4f" % (e, de, settle_error_factor(e) * de, math.log(zeno_time(e + de, H0) / zeno_time(e, H0))))
print("(b) the clamp twin at dt = 1e-2, e = 0.9: apparent e %.5f (de = %+.5f); predicted linear change in Zeno time %+.4f, measured change in settling time %+.4f"
      % (e_eff(0.9, 1e-2, "clamp", H0), e_eff(0.9, 1e-2, "clamp", H0) - 0.9,
         settle_error_factor(0.9) * (e_eff(0.9, 1e-2, "clamp", H0) - 0.9),
         (settle_twin(0.9, 1e-2, "clamp", 0.9) - last_time_above(DELTA, 0.9, H0)) / last_time_above(DELTA, 0.9, H0)))

print("\n== 5. Calibrating the twin's e on the first rebound (bisection so the twin's apparent e equals the true e) ==")
print("e_true = 0.9; 'param' is the e fed to the twin; settling-time error after calibration, relative")
ex = last_time_above(DELTA, 0.9, H0)
for s in SCHEMES:
    for dt in (1e-2, 3e-3, 1e-3):
        lo, hi = 0.80, 0.99
        for _ in range(45):
            mid = 0.5 * (lo + hi)
            if e_eff(mid, dt, s, H0) < 0.9:
                lo = mid
            else:
                hi = mid
        ep = 0.5 * (lo + hi)
        raw = (settle_twin(0.9, dt, s, 0.9) - ex) / ex
        cal = (settle_twin(ep, dt, s, 0.9) - ex) / ex
        print("%-7s dt=%-6g param %.5f   settle error uncalibrated %+.4f   calibrated %+.4f" % (s, dt, ep, raw, cal))

print("\n== 6. Impact counts: the twin's contacts are mostly resolution artefacts (e = 0.9, clamp) ==")
print("resolvable bounces = exact impacts whose following flight 2 v_n/g exceeds dt; twin impacts counted up to the exact Zeno time")
print("dt       resolvable   twin impacts   twin impacts separated by > 2 dt")
e = 0.9
for dt in (1e-2, 1e-3, 1e-4):
    res = 1
    while 2 * v1(H0) * e ** res / G > dt:
        res += 1
    n = int(round(zeno_time(e, H0) / dt))
    y, v, imp_steps = H0, 0.0, []
    for k in range(n):
        v -= G * dt
        yn = y + v * dt
        if yn < 0.0:
            yn, v = 0.0, -e * v
            imp_steps.append(k)
        y = yn
    sep = sum(1 for a, b in zip(imp_steps, imp_steps[1:]) if b - a > 2) + 1
    print("%-8g %10d   %12d   %8d" % (dt, res, len(imp_steps), sep))

print("\n== 7. Where the settling error comes from: twin impact times vs exact, e = 0.9 (only impacts separated from the previous one by > 2 dt) ==")
print("impact time error (twin - exact) in units of dt; n = index of the exact impact; flight = exact following flight time / dt")
for s in ("clamp", "mirror"):
    for dt in (1e-2, 1e-3):
        e = 0.9
        ti = []
        simulate(e, dt, s, T=zeno_time(e, H0) * 1.2, h0=H0, log=ti)
        out = []
        for n in (1, 2, 5, 10, 20, 30, 40):
            tn = impact_time(n, e, H0)
            if 2 * v1(H0) * e ** (n - 1) / G < 3 * dt:
                continue
            j = min(range(len(ti)), key=lambda i: abs(ti[i] - tn))
            out.append("n=%d: %+.2f (flight %.0f dt)" % (n, (ti[j] - tn) / dt, 2 * v1(H0) * e ** n / G / dt))
        print("%-7s dt=%-6g  %s" % (s, dt, "; ".join(out)))
