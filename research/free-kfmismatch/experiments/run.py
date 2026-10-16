import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from free_kfmismatch import *

print("Exact excess MSE ratio vs assumed/true process-noise ratio lam (r=1, true q=1)")
print("lam      ratio_exact  sim(n=3e5)  claimed/true")
for lam in [1/100, 1/30, 1/10, 1/3, 1, 3, 10, 30, 100]:
    k = gain(lam, 1.0)
    ex = steady_mse(k, 1.0, 1.0)
    sim = simulate_mse(k, 1.0, 1.0, n=300000, seed=7)
    print(f"{lam:<8.4g} {ex/optimal_mse(1,1):<12.4f} {sim/optimal_mse(1,1):<11.4f} {claimed_post_var(lam,1.0)/ex:.3f}")

print("\nSymmetry in log lam: excess ratio at lam=c vs lam=1/c")
for c in [2, 4, 10, 100]:
    print(f"c={c:<4} over (lam=c): {excess_ratio(c):.4f}   under (lam=1/c): {excess_ratio(1/c):.4f}")

print("\nDependence on signal-to-noise q/r (lam=1/10 and lam=10)")
for q in [0.001, 0.01, 0.1, 1, 10, 100]:
    print(f"q/r={q:<7g} under(1/10): {excess_ratio(0.1, q, 1):.4f}  over(10): {excess_ratio(10, q, 1):.4f}")
