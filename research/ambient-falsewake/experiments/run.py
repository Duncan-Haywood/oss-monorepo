"""Exact (grid Markov chain) vs Monte Carlo vs independent-frames false-wake rates. Prints results.txt."""
import math
from ambient_falsewake import (FRAMES_PER_DAY as D, wake_rate, independent_rate, simulate_rate,
                               threshold_for_rate)

PHIS = (0.0, 0.5, 0.8, 0.9, 0.95)
MS = (1, 2, 3, 5)

print("== A. Threshold set by the independent-frames rule (per-frame P(s>=theta)^m = 1/day), true wakes/day on AR(1) scores")
print("   frames: 10 ms, 8,640,000 per day; the target is 1 false wake per day")
print("   m   phi   theta_indep  true_wakes_per_day  theta_exact  theta_gap")
for m in MS:
    th_ind = threshold_for_rate(lambda t: independent_rate(t, m), 1 / D)
    for phi in PHIS:
        true = wake_rate(th_ind, phi, m) * D
        th_ex = threshold_for_rate(lambda t: wake_rate(t, phi, m), 1 / D)
        print(f"  {m:2d}  {phi:4.2f}  {th_ind:11.3f}  {true:18.2f}  {th_ex:11.3f}  {th_ex - th_ind:9.3f}")

print()
print("== B. Exact grid chain vs Monte Carlo (phi=0.9; 6,000,000 frames per cell; seed 11)")
print("   m  theta  exact_per_Mframe  mc_per_Mframe  z")
FR = 6_000_000
for m, th in ((1, 2.0), (1, 3.0), (3, 2.0), (3, 2.5), (5, 1.5), (5, 2.0)):
    ex = wake_rate(th, 0.9, m)
    mc = simulate_rate(th, 0.9, m, FR, seed=11)
    # wakes cluster, so the count's variance exceeds Poisson; z uses Poisson sd and is a rough guide only
    z = (mc - ex) / math.sqrt(ex / FR)
    print(f"  {m:2d}  {th:5.2f}  {ex * 1e6:16.1f}  {mc * 1e6:13.1f}  {z:5.2f}")

print()
print("== C. Wakes per day against threshold, phi=0.9, m=3 (exact) and the independent rule's claim")
print("  theta  exact_per_day  independent_claim_per_day  ratio")
for th in (2.5, 3.0, 3.5, 4.0, 4.5, 5.0):
    ex = wake_rate(th, 0.9, 3) * D
    ind = independent_rate(th, 3) * D
    print(f"  {th:5.2f}  {ex:13.2f}  {ind:25.3e}  {ex / ind:9.3g}")
