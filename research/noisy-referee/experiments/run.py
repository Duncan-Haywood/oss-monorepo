"""Deterministic experiments; output in results.txt."""
import math
from noisy_referee import *

print("E1  raw score elicits the noisy probability: report = e0 + gamma p; raw Brier excess = gamma^2 (r'-p)^2")
for e0, e1 in ((0.1, 0.1), (0.05, 0.3), (0.2, 0.2)):
    g = 1 - e0 - e1
    p = 0.8
    print(f"  e0={e0} e1={e1} gamma={g:.2f}: truthful p={p} is paid as if p~={best_report_raw(p, e0, e1):.3f}; incentive to fix a 0.1 error shrinks {1/g**2:.2f}x")

print("\nE2  ranking reversal under raw scores (truthful verifiers, symmetric noise eta)")
A = [(0.05, 0.5), (0.95, 0.5)]
B = [(0.3, 0.5), (0.7, 0.5)]
print(f"  A: beliefs {{0.05,0.95}}, B: {{0.3,0.7}}, clean Brier A {raw_truthful_score(A,0,0):.4f}, B {raw_truthful_score(B,0,0):.4f}")
for eta in (0.05, 0.1, 0.2, 0.3):
    print(f"  eta={eta:.2f}  raw Brier A {raw_truthful_score(A,eta,eta):.4f}  B {raw_truthful_score(B,eta,eta):.4f}  {'REVERSED' if raw_truthful_score(A,eta,eta) > raw_truthful_score(B,eta,eta) else 'ok'}")
print(f"  reversal threshold eta* = {reversal_eta(A,B):.4f} (Brier), {reversal_eta(A,B,'log')}(log)")
for eta in (0.1, 0.3):
    sa = sum(w*(surrogate(p,1,eta,eta)*(eta+(1-2*eta)*p)+surrogate(p,0,eta,eta)*(1-eta-(1-2*eta)*p)) for p,w in A)
    print(f"  surrogate expected loss of A at eta={eta}: {sa:.4f}  (clean {raw_truthful_score(A,0,0):.4f})")

print("\nE3  price of the unbiased surrogate: Brier payment range and sample-size inflation (pi=0.5, r1=0.3 vs r2=0.5)")
for eta in (0.0, 0.1, 0.2, 0.3, 0.4):
    lo, hi = payment_range(eta, eta)
    ratio = sample_size_ratio(0.3, 0.5, 0.5, eta, eta)
    g = 1 - 2 * eta
    print(f"  eta={eta:.1f} gamma={g:.1f}  payment spread {hi-lo:.3f} (1/gamma={1/g:.3f})  n inflation {ratio:.2f}  1/gamma^2 {1/g**2:.2f}")

print("\nE4  misestimated rates: optimal report bias = ((gamma-gamma_hat)p + e0-eh0)/gamma_hat (true e0=e1=0.1)")
for eh0, eh1 in ((0.1, 0.1), (0.15, 0.1), (0.1, 0.2), (0.2, 0.2), (0.0, 0.0)):
    print(f"  assumed ({eh0},{eh1})  p=0.2 -> {best_report_surrogate(0.2,0.1,0.1,eh0,eh1):.4f}   p=0.8 -> {best_report_surrogate(0.8,0.1,0.1,eh0,eh1):.4f}")

print("\nE5  gold-check budget: mean true-Brier excess from estimating rates on m items per class (e0=0.1, e1=0.2), Monte Carlo vs delta method")
for m in (25, 100, 400, 1600):
    got, pred = misspec_excess_mc(0.1, 0.2, m, 600)
    print(f"  m={m:5d}  measured {got:.5f}  predicted {pred:.5f}  ratio {got/pred:.3f}   x m = {got*m:.3f}")
