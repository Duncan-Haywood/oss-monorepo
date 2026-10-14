"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random, statistics as st
from twin_audit import *

a, q, r, bh, alpha, tau2 = 0.9, 1.0, 0.1, 1.0, 0.05, 1.0
k = optimal_gain(a, bh)
print("plant a=%.1f q=%.1f r=%.1f; twin gain bh=%.1f, deployed k*(bh)=%.4f; alpha=%.2f, mixture prior N(0,%.0f) on the gain error" % (a, q, r, bh, k, alpha, tau2))


def delays(b, n, seed, v=0.0, horizon=60000, bhat=bh):
    rng = random.Random(seed)
    return [audit_run(a, b, bhat, rng, v=v, alpha=alpha, tau2=tau2, horizon=horizon) for _ in range(n)]


print("\n== 1. Validity under H0 (twin exact): e-process vs a z-test that is looked at after every step ==")
N, H = 1000, 3000
rng = random.Random(11)
ev = sum(audit_run(a, bh, bh, rng, alpha=alpha, tau2=tau2, horizon=H) is not None for _ in range(N)) / N
rng = random.Random(12)
zv = sum(peeking_z_alarm(rng, H) for _ in range(N)) / N
print("false alarms within %d steps over %d audits: e-process %.3f (Ville bound %.2f), peeking z-test at 1.96: %.3f" % (H, N, ev, alpha, zv))

print("\n== 2. Detection delay in closed loop: simulation vs the noiseless-drift prediction ==")
print("db      U=E u^2   predicted n   mean n   median n   sim/pred(mean)   detected")
for db in (0.1, 0.2, 0.3, -0.2, -0.3):
    b = bh + db
    U = info_rate(a, b, k)
    d = delays(b, 400, 5)
    dd = [x for x in d if x]
    print("%+.1f    %.3f     %8.1f     %7.1f   %7.1f    %.3f            %d/%d" % (db, U, predicted_delay(db, U, alpha, tau2), st.mean(dd), st.median(dd), st.mean(dd) / predicted_delay(db, U, alpha, tau2), len(dd), len(d)))

print("\n== 3. Regret paid before detection = per-step regret x delay: nearly independent of the gap size ==")
print("db      regret/step   predicted n   regret x predicted n   regret x mean n   small-gap constant J_kk k'(b)^2 ln(1/alpha)/U")
Jkk, ks = regret_curvature(a, bh), gain_slope(a, bh)
for db in (0.05, 0.1, 0.2, 0.3):
    b = bh + db
    U = info_rate(a, b, k)
    rho = regret(a, b, k)
    d = [x for x in delays(b, 200, 6, horizon=200000) if x]
    pn = predicted_delay(db, U, alpha, tau2)
    print("%+.2f   %.5f       %8.1f      %.3f                  %.3f             %.3f" % (db, rho, pn, rho * pn, rho * st.mean(d), Jkk * ks * ks * math.log(1 / alpha) / U))

print("\n== 4. A cautious (expensive-control) operator hides twin error: same gap db=0.2 at r = 0.01, 0.1, 1, 10 (twin bh=1) ==")
print("r       k*(bh)   U=E u^2   predicted n   mean n   regret/step   regret x mean n")
for rr in (0.01, 0.1, 1.0, 10.0):
    kk = optimal_gain(a, bh, q, rr)
    b = bh + 0.2
    U = info_rate(a, b, kk)
    rng = random.Random(7)
    # audit_run uses the module default r for the controller; replicate its loop for other r via the gain directly
    def run(rng):
        c = a - b * kk
        x = rng.gauss(0, math.sqrt(stationary(a, b, kk)))
        S = R = 0.0
        for t in range(1, 400001):
            u = -kk * x
            w = rng.gauss(0, 1)
            xn = a * x + b * u + w
            S += u * u; R += u * (xn - a * x - bh * u)
            if log_e(S, R, tau2) >= math.log(1 / alpha):
                return t
            x = xn
    d = [run(rng) for _ in range(150)]
    rho = regret(a, b, kk, q, rr)
    print("%-6g  %.4f   %.4f    %9.1f    %8.1f   %.5f       %.3f" % (rr, kk, U, predicted_delay(0.2, U, alpha, tau2), st.mean(d), rho, rho * st.mean(d)))

print("\n== 5. Does dither (added probing) pay? Both regret and dither cost are per-step, information is linear in dither variance v ==")
print("regret per unit info rho/U0 vs dither price kappa_c/kappa_u (dither lowers expected cost before detection iff rho/U0 > price)")
print("db      rho/U0    price    pays?")
for db in (-0.8, -0.7, -0.6, -0.3, -0.1, 0.1, 0.3, 0.6, 1.0, 1.2, 1.3):
    b = bh + db
    rho_u, price = dither_payoff_threshold(a, b, bh)
    print("%+.1f    %.4f    %.4f   %s" % (db, rho_u, price, "yes" if rho_u > price else "no"))


def crossing(lo, hi):
    f = lambda m: dither_payoff_threshold(a, bh + m, bh)
    sgn = lambda m: f(m)[0] - f(m)[1]
    s_lo = sgn(lo) > 0
    for _ in range(60):
        m = (lo + hi) / 2
        lo, hi = (m, hi) if (sgn(m) > 0) == s_lo else (lo, m)
    return hi


up, dn = crossing(0.7, 1.3), crossing(-0.85, -0.3)
print("dither pays only for db > %.3f (true gain %.3f = %.2fx the twin) or db < %.3f (true gain %.3f = %.2fx the twin)" % (up, bh + up, 1 + up / bh, dn, bh + dn, 1 + dn / bh))
print("\nsimulated check: total expected cost before detection = (regret + dither cost)(v) x mean n, at a moderate gap (0.2), a gross gap below the threshold (-0.8) and one above (1.3)")
print("db     v      mean n   predicted n   rate (regret+dither)   rate x mean n")
for db in (0.2, -0.8, 1.3):
    b = bh + db
    kk = k
    for v in (0.0, 0.25, 1.0, 4.0):
        U = info_rate(a, b, kk, v)
        d = [x for x in delays(b, 150, 9, v=v, horizon=200000) if x]
        rate = regret(a, b, kk) + dither_cost_rate(a, b, kk, q, r, v)
        print("%+.1f   %.2f   %7.1f   %8.1f      %.5f              %.3f" % (db, v, st.mean(d), predicted_delay(db, U, alpha, tau2), rate, rate * st.mean(d)))
