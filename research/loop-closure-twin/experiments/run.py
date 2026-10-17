"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random, statistics
from loop_closure_twin import *

T, M, ALPHA = 0.25, 1.0, 0.99
G = chi2_1_quantile(ALPHA)
RHOS = (1.0, 1.5, 2.0, 3.0, 4.0)
print("Scalar loop-closure filter. Twin drift variance per cycle T=%g, landmark noise m=%g, real drift R=rho^2 T; gate: nu^2 <= g (P^- + m^2), g=chi2_1 quantile at %.2f = %.4f" % (T, M, ALPHA, G))
xp = twin_riccati(T, M)
cl, K = twin_claim(T, M)
print("Twin stationary prior variance %.4f, gain K=%.4f, claimed posterior variance %.4f" % (xp, K, cl))

print("\n== 1. Ungated: exact real posterior variance vs simulation (400 chains x 300 cycles, gate off) ==")
print("rho   claimed  real (exact)  real (sim)  real/claim  P(genuine closure passes gate), exact  simulated (gated, first 300 cycles)")
for rho in RHOS:
    R = rho * rho * T
    r0 = run_chains(T, R, M, 1e12, chains=400, cycles=300, seed=1)
    rg = run_chains(T, R, M, G, chains=400, cycles=300, seed=2)
    print("%-5g %.4f   %.4f        %.4f      %.2fx       %.4f                                     %.4f" % (
        rho, cl, ungated_real_var(T, R, M), r0["mse"], ungated_real_var(T, R, M) / cl, accept_prob_gaussian(T, R, M, G), rg["acc_genuine"]))

print("\n== 2. Genuine closures only, gate on: lock-out and its dependence on horizon (400 chains, burn = cycles/5) ==")
print("rho   horizon  real MSE gated   real MSE ungated   genuine passed  fraction of time with |error| > 5m   twin's claimed variance")
for rho in RHOS:
    R = rho * rho * T
    for cyc in (150, 600):
        rg = run_chains(T, R, M, G, chains=400, cycles=cyc, burn=cyc // 5, seed=3)
        r0 = run_chains(T, R, M, 1e12, chains=400, cycles=cyc, burn=cyc // 5, seed=3)
        print("%-5g %-8d %-16.3f %-18.3f %-15.3f %-36.4f %.3f" % (rho, cyc, rg["mse"], r0["mse"], rg["acc_genuine"], rg["lost"], rg["claim"]))

print("\n== 3. Aliased closures (pi=0.1, offset sd D=6m), 400 chains x 300 cycles ==")
print("rho   configuration                     real MSE   lost fraction  genuine passed  aliased passed")
for rho in (1.0, 1.5, 2.0, 3.0):
    R = rho * rho * T
    for name, gg, Tf in (("no gate, twin tuning", 1e12, T), ("twin gate, twin tuning", G, T),
                         ("no gate, real tuning", 1e12, R), ("real gate, real tuning", G, R)):
        r = run_chains(T, R, M, gg, pi=0.1, D=6.0, chains=400, cycles=300, seed=4, T_filter=Tf)
        print("%-5g %-33s %-10.3f %-14.4f %-15.3f %.3f" % (rho, name, r["mse"], r["lost"], r["acc_genuine"], r["acc_alias"]))

print("\n== 4. Repair: fit the drift variance from n measured ground-truth cycle drifts, then tune the filter with it (rho=2, pi=0.1, D=6m) ==")
rho = 2.0
R = rho * rho * T
orc = run_chains(R, R, M, G, pi=0.1, D=6.0, chains=400, cycles=300, seed=5)
twn = run_chains(T, R, M, G, pi=0.1, D=6.0, chains=400, cycles=300, seed=5)
print("oracle (knows R): MSE %.3f, lost %.4f;  unrepaired twin: MSE %.3f, lost %.4f" % (orc["mse"], orc["lost"], twn["mse"], twn["lost"]))
print("n     mean R_hat/R  P(R_hat < R/2)  mean MSE   median MSE  90th pct MSE  P(lost fraction > 0.02)")
rng = random.Random(6)
for n in (3, 10, 30, 100):
    ms, lo, rh, under = [], [], [], 0
    for t in range(200):
        Rh = fit_drift([rng.gauss(0, math.sqrt(R)) for _ in range(n)])
        r = run_chains(T, R, M, G, pi=0.1, D=6.0, chains=15, cycles=300, seed=1000 + t, T_filter=Rh)
        ms.append(r["mse"]); lo.append(r["lost"] > 0.02); rh.append(Rh / R); under += Rh < R / 2
    ms.sort()
    print("%-5d %-13.3f %-15.3f %-10.3f %-11.3f %-13.3f %.3f" % (n, statistics.mean(rh), under / 200, statistics.mean(ms), statistics.median(ms), ms[179], sum(lo) / 200))
