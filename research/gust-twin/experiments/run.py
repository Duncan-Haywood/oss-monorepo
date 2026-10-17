"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from gust_twin.model import (real_var, psd_matched_var, twin_var_exact, ratio_real_over_psd, ratio_real_over_twin, crossover_dt,
                             simulate_real, simulate_twin, fit_ou_from_lag1, exceedance, margin_for)

KP, KD, S2, DT = 1.0, 1.4, 1.0, 0.01   # natural frequency 1 rad/s, damping 0.7; gust std 1 (force units); twin step 10 ms
print("Gust twin: x'' = -kp x - kd x' + d, kp=%g kd=%g (wn=1, zeta=0.7), gust variance s2=%g; real gust = OU with rate a; twin step dt=%g" % (KP, KD, S2, DT))

print("\n== 1. Stationary Var(x): real OU gust vs three twins (exact formulas) ==")
print("   a   real       variance-matched twin (dt=%g)   ratio real/twin   spectrum-matched white   ratio real/psd" % DT)
for a in (0.05, 0.2, 1.0, 3.0, 10.0, 50.0):
    rv, tv, pv = real_var(KP, KD, a, S2), twin_var_exact(KP, KD, S2, DT), psd_matched_var(KP, KD, a, S2)
    print("%5.2f  %8.4f   %10.5f (closed form %8.5f)    %8.1f        %10.4f            %6.3f" % (
        a, rv, tv, S2 * DT / (2 * KD * KP), rv / tv, pv, rv / pv))
print("closed-form ratio check real/twin (continuum): %s" % ["%.1f" % ratio_real_over_twin(KP, KD, a, DT) for a in (0.05, 0.2, 1.0, 3.0, 10.0, 50.0)])
print("step at which the variance-matched twin would be exact, a=1: dt* = %.3f s" % crossover_dt(KP, KD, 1.0))

print("\n== 2. The variance-matched twin's answer depends on its own step (a=1): std of x ==")
print("   dt       twin std    real std   ratio real/twin")
rs = math.sqrt(real_var(KP, KD, 1.0, S2))
for dt in (0.1, 0.03, 0.01, 0.003, 0.001):
    ts = math.sqrt(twin_var_exact(KP, KD, S2, dt))
    print("%7.3f  %9.4f  %9.4f  %8.2f" % (dt, ts, rs, rs / ts))

print("\n== 3. Monte Carlo check (exact discretisations, 4e5 steps each, seed 7) ==")
print("   a   dt     real MC / closed form   twin MC / exact")
for a, dt in ((0.2, 0.05), (1.0, 0.05), (5.0, 0.02)):
    m = simulate_real(KP, KD, a, S2, dt, 400000, seed=7)
    t = simulate_twin(KP, KD, S2, dt, 400000, seed=7)
    print("%5.2f %5.2f      %6.3f                 %6.3f" % (a, dt, m / real_var(KP, KD, a, S2), t / twin_var_exact(KP, KD, S2, dt)))

print("\n== 4. Safety margin for P(|x| > m) <= 1e-3 (Gaussian x), a=1 ==")
eps = 1e-3
mt_ = margin_for(eps, twin_var_exact(KP, KD, S2, DT))
mr = margin_for(eps, real_var(KP, KD, 1.0, S2))
mp = margin_for(eps, psd_matched_var(KP, KD, 1.0, S2))
print("variance-matched twin margin %.4f  real margin %.4f  spectrum-matched margin %.4f" % (mt_, mr, mp))
print("real exceedance probability at the twin's margin: %.3g (target %g)" % (exceedance(mt_, real_var(KP, KD, 1.0, S2)), eps))
print("real exceedance probability at the spectrum-matched margin: %.3g" % exceedance(mp, real_var(KP, KD, 1.0, S2)))
print("margin ratio real/twin-variance-matched %.2f, spectrum-matched/real %.2f" % (mr / mt_, mp / mr))

print("\n== 5. Fixing it: fit (a, s2) of an OU gust from logged wind at spacing 0.1 s; true a=1, s2=1 ==")
print("log length   a_hat    s2_hat   Var_twin(fit)/Var_real")
rng = random.Random(11)
rho = math.exp(-1.0 * 0.1)
for n in (100, 1000, 10000, 100000):
    d, xs = 0.0, []
    for _ in range(n):
        d = rho * d + math.sqrt(1 - rho * rho) * rng.gauss(0, 1)
        xs.append(d)
    ah, s2h = fit_ou_from_lag1(xs, 0.1)
    print("%9d  %6.3f  %7.3f   %8.3f" % (n, ah, s2h, real_var(KP, KD, ah, s2h) / real_var(KP, KD, 1.0, 1.0)))
