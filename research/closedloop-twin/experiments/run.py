"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random
from closedloop_twin import *

A, B, K, S = 1.1, 1.0, 0.6, 1.0   # open loop unstable (a>1); logged closed-loop pole rho = 0.5
RHO = pole(A, B, K)
print("Plant x' = 1.1 x + u + w (w~N(0,1)), logged under u = -0.6 x + e, e~N(0,tau^2): logged closed-loop pole %.2f." % RHO)
print("The twin is the least-squares fit of x_{t+1} on (x_t,u_t). A new gain k2 has real pole 1.1 - k2 (k2=0.05: 1.05, unstable).")

def sd_of(v):
    m = sum(v) / len(v)
    return m, math.sqrt(sum((x - m) ** 2 for x in v) / len(v))

print("\n== 0. sd of the twin's predicted pole under gain k2: closed form vs simulation (n=500, 2000 fits) ==")
print("tau   k2    mean pole  real pole  sd formula  sd simulated")
rng = random.Random(1)
for tau in (0.5, 0.1):
    for k2 in (0.6, 0.3, 0.05):
        ps = []
        for _ in range(2000):
            ah, bh, _, _ = fit(log_data(rng, A, B, K, tau, S, 500))
            ps.append(twin_pole(ah, bh, k2))
        m, sd = sd_of(ps)
        print("%-5g %-5g %-10.4f %-10.4f %-11.4f %.4f" % (tau, k2, m, pole(A, B, k2), pred_sd(RHO, B, K, k2, S, tau, 500), sd))

print("\n== 1. Held-out validation is blind to the dither (n=500, 300 fits; tau=0 is the minimum-norm fit) ==")
print("Held-out = one-step MSE of the fitted twin on 20000 fresh transitions of the SAME logging controller, divided by sigma^2=1.")
print("tau    heldout MSE  mean b_hat  mean pole(k2=0.05)  sd pole(k2=0.05)  P(pole<1)")
rng = random.Random(2)
for tau in (1.0, 0.3, 0.1, 0.03, 0.0):
    mses, bs, ps = [], [], []
    for _ in range(300):
        rows = log_data(rng, A, B, K, tau, S, 500)
        ah, bh, _, _ = minnorm_fit(rows) if tau == 0 else fit(rows)
        mses.append(heldout_mse(rng, A, B, K, tau, S, ah, bh, 4000)); bs.append(bh); ps.append(twin_pole(ah, bh, 0.05))
    m, sd = sd_of(ps)
    print("%-6g %-12.4f %-11.3f %-19.3f %-17.3f %.3f" % (tau, sum(mses) / len(mses), sum(bs) / len(bs), m, sd, sum(1 for p in ps if p < 1) / len(ps)))
print("min-norm closed form at tau=0: a_hat=rho/(1+k^2)=%.3f, b_hat=-k rho/(1+k^2)=%.3f (true b=1), predicted pole at k2=0.05: %.3f" % (
    RHO / (1 + K * K), -K * RHO / (1 + K * K), RHO / (1 + K * K) + K * RHO / (1 + K * K) * 0.05))

print("\n== 2. False certification of the new gain k2=0.05 (real pole 1.05, unstable), and power at k2=0.2 (real pole 0.9) ==")
print("Point rule: certify if twin pole < 1. Bound rule: certify if OLS one-sided 95% upper bound on the pole < 1. 1500 fits per cell.")
print("n      tau    P(point cert | bad)  P(bound cert | bad)  bound coverage  P(bound cert | good, k2=0.2)  P(point cert | good)")
rng = random.Random(3)
for n in (200, 1000):
    for tau in (1.0, 0.3, 0.1, 0.03):
        reps = 1500
        pc = bc = cov = gb = gp = 0
        for _ in range(reps):
            rows = log_data(rng, A, B, K, tau, S, n)
            ah, bh, s2, inv = fit(rows)
            pc += twin_pole(ah, bh, 0.05) < 1
            ub = ols_pole_bound(ah, bh, s2, inv, 0.05)
            bc += ub < 1
            cov += ub >= pole(A, B, 0.05)
            gb += ols_pole_bound(ah, bh, s2, inv, 0.2) < 1
            gp += twin_pole(ah, bh, 0.2) < 1
        print("%-6d %-6g %-20.3f %-20.3f %-15.3f %-28.3f %.3f" % (n, tau, pc / reps, bc / reps, cov / reps, gb / reps, gp / reps))

print("\n== 3. Dither needed for a predicted-pole sd of 0.05 at gain k2 (sigma=1, exact solve of the closed form) ==")
print("n      k2     |k-k2|  tau needed   extra logged Var x (x)   simulated sd (1000 fits)")
rng = random.Random(4)
for n in (200, 1000, 5000):
    for k2 in (0.5, 0.3, 0.05):
        tau = tau_required(RHO, B, K, k2, S, n, 0.05)
        ps = []
        for _ in range(1000):
            ah, bh, _, _ = fit(log_data(rng, A, B, K, tau, S, n))
            ps.append(twin_pole(ah, bh, k2))
        print("%-6d %-6g %-7.2f %-12.4f %-24.3f %.4f" % (n, k2, K - k2, tau, stationary_var(A, B, K, S, tau) / stationary_var(A, B, K, S, 0.0), sd_of(ps)[1]))
