"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random, statistics as st
from twin_distillation import *

a, q, r, b = 0.9, 1.0, 0.1, 1.0   # real plant; process noise variance 1
print("real plant a=%.1f b=%.1f q=%.1f r=%.1f, process noise variance 1; student sees z = x + zeta, Var zeta = s; teacher sees x" % (a, b, q, r))

print("\n== 1. Closed forms vs Monte Carlo ==")
rng = random.Random(1)
g = lqr_gain(a, b)
for (bh, s2h, s) in ((1.0, 0.25, 0.5), (1.0, 1.0, 2.0), (0.7, 4.0, 0.5)):
    gt = lqr_gain(a, bh)
    P = stationary_var(a, bh, gt, 0.0, s2h)
    k_th = bc_gain(gt, P, s)
    k_mc = st.mean(bc_fit(a, bh, gt, s, s2h, 100000, rng) for _ in range(20))
    print("twin (bh=%.1f, s2h=%.2f), s=%.1f: teacher g=%.4f, demo Var x=%.4f, BC gain theory %.4f, Monte Carlo %.4f (20x1e5 steps)" % (bh, s2h, s, gt, P, k_th, k_mc))
for (k, s) in ((0.3, 0.5), (0.6, 2.0)):
    c_th = cost(a, b, k, s)
    c_mc = st.mean(simulate_cost(a, b, k, s, 1.0, 100000, rng) for _ in range(20))
    print("student k=%.1f, s=%.1f in the real plant: cost theory %.4f, Monte Carlo %.4f" % (k, s, c_th, c_mc))

print("\n== 2. On-policy imitation of an exact teacher is nearly optimal (no twin error) ==")
worst = (0, None)
for aa in (0.5, 0.9, 0.99):
    for bb in (0.5, 1.0, 2.0):
        for qq, rr in ((1, 0.1), (1, 1), (1, 10), (0.1, 1)):
            gg = lqr_gain(aa, bb, qq, rr)
            for s in (0.01, 0.1, 0.5, 1, 2, 5, 20):
                k = dagger_fixed_point(gg, aa, bb, s)
                ko = best_student_gain(aa, bb, s, 1.0, qq, rr)
                rel = regret(aa, bb, k, s, 1.0, qq, rr) / cost(aa, bb, ko, s, 1.0, qq, rr)
                if rel > worst[0]:
                    worst = (rel, (aa, bb, qq, rr, s, k, ko))
print("grid a in {.5,.9,.99} x b in {.5,1,2} x (q,r) x s in 0.01..20 (252 cells): worst relative regret of the DAgger fixed point %.4f at (a,b,q,r,s)=%s, k=%.3f vs best %.3f" % (worst[0], worst[1][:5], worst[1][5], worst[1][6]))
for s in (0.1, 0.5, 2.0):
    k = dagger_fixed_point(g, a, b, s)
    ko = best_student_gain(a, b, s)
    print("s=%.1f: teacher g=%.4f, best student k=%.4f (cost %.4f), DAgger fixed point %.4f (regret %.5f), BC in the exact twin %.4f (regret %.5f)" % (
        s, g, ko, cost(a, b, ko, s), k, regret(a, b, k, s), bc_gain(g, stationary_var(a, b, g, 0.0), s), regret(a, b, bc_gain(g, stationary_var(a, b, g, 0.0), s), s)))

print("\n== 3. A too-clean twin (process noise s2h < 1, exact actuator) teaches a lazy student ==")
print("s     s2h    BC gain   DAgger-in-twin   RL-in-twin   |  regret: BC    DAgger-twin   RL-twin   real-DAgger")
for s in (0.5, 2.0):
    for s2h in (0.1, 0.25, 0.5, 1.0, 2.0, 4.0):
        P = stationary_var(a, b, g, 0.0, s2h)
        kb = bc_gain(g, P, s)
        kd = dagger_fixed_point(g, a, b, s, s2h)
        kr = best_student_gain(a, b, s, s2h)
        kR = dagger_fixed_point(g, a, b, s)
        print("%.1f   %.2f   %.4f    %.4f           %.4f       |  %.4f     %.4f       %.4f    %.5f" % (s, s2h, kb, kd, kr, regret(a, b, kb, s), regret(a, b, kd, s), regret(a, b, kr, s), regret(a, b, kR, s)))
for s in (0.5, 2.0):
    P = stationary_var(a, b, g, 0.0, 0.25)
    print("s=%.1f, s2h=0.25: BC regret / DAgger-in-twin regret = %.1f; BC regret / best-student cost = %.2f" % (s, regret(a, b, bc_gain(g, P, s), s) / regret(a, b, dagger_fixed_point(g, a, b, s, 0.25), s), regret(a, b, bc_gain(g, P, s), s) / cost(a, b, best_student_gain(a, b, s), s)))

print("\n== 4. Actuator error: BC's regret can cancel the teacher's, but the cancellation point moves with sensor noise ==")
for s in (0.5, 2.0):
    print("s=%.1f   bh: teacher-gain error and BC-in-twin (s2h=1) vs DAgger-real-with-twin-teacher (the 'teacher floor')" % s)
    print("   bh    g(bh)    BC gain   floor gain   BC regret   floor regret   twin-RL regret")
    for bh in (0.5, 0.7, 0.85, 1.0, 1.2, 1.5, 2.0):
        gt = lqr_gain(a, bh)
        kb = bc_gain(gt, stationary_var(a, bh, gt, 0.0), s)
        kf = dagger_fixed_point(gt, a, b, s)
        kr = best_student_gain(a, bh, s)
        print("   %.2f  %.4f   %.4f    %.4f       %.5f     %.5f        %.5f" % (bh, gt, kb, kf, regret(a, b, kb, s), regret(a, b, kf, s), regret(a, b, kr, s)))
    zs = None
    lo, hi = 0.5, 1.0
    f = lambda bh: bc_gain(lqr_gain(a, bh), stationary_var(a, bh, lqr_gain(a, bh), 0.0), s) - best_student_gain(a, b, s)
    for _ in range(80):
        m = (lo + hi) / 2
        if f(lo) * f(m) <= 0:
            hi = m
        else:
            lo = m
    print("   BC gain equals the real-optimal student exactly at bh = %.4f (accident of cancellation)" % ((lo + hi) / 2))

print("\n== 5. DAgger rounds (aggregated data) in the twin with s2h=0.25, s=0.5 ==")
print("gains by round (0 = BC):", " ".join("%.4f" % k for k in dagger_path(g, a, b, 0.5, 0.25, 10)), "; fixed point %.4f" % dagger_fixed_point(g, a, b, 0.5, 0.25))
gp = dagger_path(g, a, b, 0.5, 0.25, 10)
print("regret in the real plant by round:", " ".join("%.4f" % regret(a, b, k, 0.5) for k in gp))

print("\n== 6. Matching one scalar: DART-style noise in the twin, set from real logs ==")
print("deploy the student, log z, estimate P_hat = mean(z^2) - s, choose injected teacher-action noise nu so the twin's demo Var x = P_hat, re-clone (labels stay clean); repeat")
s, s2h = 0.5, 0.25
P = stationary_var(a, b, g, 0.0, s2h)
k = bc_gain(g, P, s)
print("exact statistics (infinite real logs), twin s2h=%.2f, s=%.1f:" % (s2h, s))
print("round 0 (plain BC): k=%.4f regret %.5f" % (k, regret(a, b, k, s)))
for rd in range(1, 5):
    Pr = stationary_var(a, b, k, s)
    nu = dart_noise(g, a, b, s2h, Pr)
    Pd = stationary_var(a, b, g, 0.0, s2h, nu)
    k = bc_gain(g, Pd, s)
    print("round %d: real Var x under the student %.4f -> nu=%.4f, demo Var x %.4f, k=%.4f regret %.5f" % (rd, Pr, nu, Pd, k, regret(a, b, k, s)))
print("real DAgger fixed point (needs privileged real state): k=%.4f regret %.5f" % (dagger_fixed_point(g, a, b, s), regret(a, b, dagger_fixed_point(g, a, b, s), s)))
print("with finite real logs (one round, 300 repetitions; s=%.1f, s2h=%.2f): regret of the DART student after n real steps" % (s, s2h))
print("n_real     mean regret   90th pct    fraction with P_hat<=0 or unstable")
k0 = bc_gain(g, P, s)
rng = random.Random(6)
for n in (100, 300, 1000, 10000):
    regs, bad = [], 0
    for _ in range(300):
        x, acc = 0.0, 0.0
        for _ in range(200):
            x = (a - b * k0) * x + rng.gauss(0, 1) - b * k0 * math.sqrt(s) * rng.gauss(0, 1)
        for _ in range(n):
            z = x + math.sqrt(s) * rng.gauss(0, 1)
            acc += z * z
            x = a * x - b * k0 * z + rng.gauss(0, 1)
        Ph = acc / n - s
        if Ph <= 0:
            bad += 1
            continue
        nu = dart_noise(g, a, b, s2h, Ph)
        kk = bc_gain(g, stationary_var(a, b, g, 0.0, s2h, nu), s)
        c = regret(a, b, kk, s)
        if math.isinf(c):
            bad += 1
        else:
            regs.append(c)
    regs.sort()
    print("%6d     %.5f      %.5f     %.3f" % (n, st.mean(regs), regs[int(0.9 * len(regs))], bad / 300))
print("reference: plain BC regret %.5f" % regret(a, b, k0, s))

print("\n== 7. Teacher floor vs distribution shift, with both errors present (bh=0.7, s2h=0.25) ==")
for s in (0.5, 2.0):
    gt = lqr_gain(a, 0.7)
    kb = bc_gain(gt, stationary_var(a, 0.7, gt, 0.0, 0.25), s)
    kf = dagger_fixed_point(gt, a, b, s)
    print("s=%.1f: BC regret %.4f, teacher floor (on-policy real, twin teacher) %.4f, twin-RL regret %.4f" % (s, regret(a, b, kb, s), regret(a, b, kf, s), regret(a, b, best_student_gain(a, 0.7, s, 0.25), s)))
