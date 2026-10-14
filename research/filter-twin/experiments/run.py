"""All numbers quoted in README.md / paper/whitepaper.md.  Seeded; pure Python."""
import math, random
from filter_twin import *

A, Q, R = 0.9, 1.0, 1.0
print(f"real plant a={A}, Q={Q}, R={R}: optimal gain {opt_gain(A,Q,R):.4f}, optimal MSE {opt_mse(A,Q,R):.4f}")

print("\n== E1  twin ratio rho_t=Qt/Rt vs real rho=1: twin gain, twin's claimed MSE, real MSE, regret")
print("  m=rho_t/rho  Kt      claim    real MSE   claim/real   regret")
for m in (0.001, 0.01, 0.1, 0.25, 0.5, 1, 2, 4, 10, 100, 1000):
    Kt = opt_gain(A, m, 1.0)
    cl = twin_claim(A, m, 1.0)            # twin with Rt=1, Qt=m
    real = mse(Kt, A, Q, R)
    print(f"  {m:<11} {Kt:.4f}  {cl:.4f}   {real:.4f}     {cl/real:8.3f}     {real/opt_mse(A,Q,R)-1:.4f}")

print("\n== E2  asymmetry: regret for factor-f too quiet vs too noisy twin, by real plant a")
print("  a      f      quiet(rho/f)  noisy(rho*f)  ratio noisy/quiet")
for a in (0.5, 0.9, 0.99, 1.0, 1.1):
    for f in (3, 10, 100):
        q, n = regret(a, Q, R, 1.0 / f), regret(a, Q, R, 1.0 * f)
        print(f"  {a:<5} {f:<5}  {q:12.4f}  {n:12.4f}  {n/q:8.3f}")

print("\n== E3  local law: regret ~ c (ln m)^2 ; c by real a, and c from small m=e^{+-0.1}")
for a in (0.5, 0.9, 0.99, 1.0, 1.1):
    c = 0.5 * (regret(a, Q, R, math.exp(0.1)) + regret(a, Q, R, math.exp(-0.1))) / 0.01
    print(f"  a={a:<5} c={c:.4f}")

print("\n== E4  random walk (a=1), quiet twin: regret vs m")
for m in (1e-1, 1e-2, 1e-3, 1e-4, 1e-6):
    print(f"  m={m:<7} regret={regret(1.0,Q,R,m):.2f}   real MSE={mse(opt_gain(1.0,m,1.0),1.0,Q,R):.3f}   claim={twin_claim(1.0,m,1.0):.4f}")
print(f"  a=0.9 open-loop limit (K->0): real MSE {mse(0.0,A,Q,R):.3f}, regret {mse(0.0,A,Q,R)/opt_mse(A,Q,R)-1:.2f}")

print("\n== E5  innovation whiteness: lag-1 covariance vs gain (a=0.9, Q=R=1); zero exactly at optimal gain")
Ko = opt_gain(A, Q, R)
for K in (0.2, 0.4, Ko, 0.7, 0.9):
    print(f"  K={K:.4f}  lag1={lag1_cov(K,A,Q,R):+.4f}  innovation var={innovation_cov(K,A,Q,R):.4f}")

print("\n== E6  simulation check of exact MSE (n=400000): twin m=0.05 gain")
Kt = opt_gain(A, 0.05, 1.0)
nus, errs = simulate(A, Q, R, Kt, 400000, random.Random(7))
c0 = sum(v * v for v in nus) / len(nus); c1 = sum(nus[i] * nus[i + 1] for i in range(len(nus) - 1)) / (len(nus) - 1)
print(f"  Kt={Kt:.4f}  MSE sim {sum(errs)/len(errs):.4f} vs exact {mse(Kt,A,Q,R):.4f};  c0 {c0:.4f} vs {innovation_cov(Kt,A,Q,R):.4f};  c1 {c1:+.4f} vs {lag1_cov(Kt,A,Q,R):+.4f}")

print("\n== E7  one Mehra retune from n real innovations (200 reps), twin m=0.05 and m=20; regret before -> after")
for m in (0.05, 20.0):
    print(f"  twin m={m}: regret before {regret(A,Q,R,m):.4f}")
    print("    n        mean regret  median regret  clipped  mean*n")
    for n in (200, 1000, 5000, 25000):
        mean, med, clip = retuned_regret(A, Q, R, m, n, 200, seed=n)
        print(f"    {n:<7}  {mean:10.5f}  {med:12.5f}   {clip:5.3f}   {mean*n:7.2f}")
