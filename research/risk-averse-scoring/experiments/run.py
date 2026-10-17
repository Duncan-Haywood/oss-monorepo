"""Deterministic experiments; output in results.txt. Seconds."""
import math
from risk_averse_scoring import *

print("E1  log score, CARA: numerical best report vs closed form odds^(1/(1+k)), k=alpha*b")
for p in (0.6, 0.9, 0.99):
    for k in (0.5, 1.0, 3.0):
        r = best_report(p, "log", cara(1.0), b=k)
        print(f"  p={p:.2f} k={k:.1f}  numeric={r:.6f}  closed={log_report(p, k):.6f}")

print("\nE2  Brier, CARA: report r solves logit p = logit r + k(2r-1); first order p - k p(1-p)(2p-1)")
for p in (0.6, 0.9, 0.99):
    for k in (0.1, 0.5, 2.0):
        r = best_report(p, "brier", cara(1.0), b=k)
        print(f"  p={p:.2f} k={k:.1f}  numeric={r:.6f}  implicit={brier_report(p, k):.6f}  first-order={brier_first_order(p, k):.6f}  debias={brier_debias(r, k):.6f}")

print("\nE3  binarised Brier lottery (prize 1): report under any utility; certainty-equivalent cost under CARA")
for name, u in (("neutral", lambda x: x), ("CARA 2", cara(2.0)), ("sqrt", math.sqrt)):
    print("  " + name + ": " + "  ".join(f"p={p}->{binarised_report(p, u):.5f}" for p in (0.1, 0.5, 0.9)))
for alpha in (0.5, 1.0, 3.0):
    P = binarised_win_prob(0.9, 0.9)
    ce = cara_certainty_equivalent(P, 1.0, alpha)
    print(f"  alpha={alpha}: truthful p=0.9, win prob {P:.3f}, mean pay {P:.3f}, certainty equivalent {ce:.4f} (risk premium {P-ce:.4f}, {100*(P-ce)/P:.1f}% of mean)")

print("\nE4  aggregation, n=5 verifiers, signal strength mu=0.6, log-loss (nats); k = alpha*b")
for label, ks in (("k=0.5 all", [0.5] * 5), ("k=2 all", [2.0] * 5), ("k in {0,0.5,1,2,4}", [0, 0.5, 1, 2, 4])):
    r = simulate_aggregation(5, 0.6, ks, trials=40000, seed=7)
    print(f"  {label:20s} bayes={r['bayes']:.4f} naive-sum={r['naive']:.4f} kbar-corrected={r['kbar']:.4f} true-k-corrected={r['true_k']:.4f}")

print("\nE5  decision thresholding: true belief needed for a tempered log report to reach tau; expected regret band, p~U(0,1)")
for tau in (0.7, 0.9, 0.99):
    for k in (0.5, 1.0, 2.0):
        t = log_decision_threshold(tau, k)
        print(f"  tau={tau}  k={k}  effective threshold={t:.4f}  band width={t-tau:.4f}  regret={decision_regret_band(tau, k):.5f}")

print("\nE6  scale cap: largest b (in units of 1/alpha) keeping odds exponent >= 1-delta")
for d in (0.02, 0.05, 0.1, 0.25):
    print(f"  delta={d}  alpha*b <= {max_scale_for_distortion(1.0, d):.4f}")
