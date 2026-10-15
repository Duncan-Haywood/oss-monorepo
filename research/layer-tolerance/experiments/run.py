import random
from layer_tolerance import *

A = 0.05
print("E1 total drift admitted: sum of per-layer (Sidak) tolerances vs one tolerance on the total, units of sigma, a=0.05")
print(" L    L*c(L,a)   z_a*sqrt(L)   ratio")
for L in (2, 4, 8, 16, 32, 64, 128):
    n, t = naive_sum_of_tolerances(L, A)
    print(f" {L:<4} {n:>8.2f}   {t:>9.2f}   {n/t:.2f}")

L = 16
print(f"\nE2 power vs how many layers k the cheat is spread over (total shift D=8 sigma, L={L}, a=0.05)")
print(" k     sum      max      combined(lb)  combined(MC)")
rng = random.Random(0)
for k in (1, 2, 4, 8, 16):
    d = even_split(8.0, k)
    print(f" {k:<4} {power_sum(L,A,d):.3f}    {power_max(L,A,d):.3f}    {power_combined_lb(L,A,d):.3f}         {power_mc(L,A,d,40000,rng,'combined'):.3f}")

print(f"\nE3 hidden budget: largest total shift (sigma) pushed through with detection <= 1/2 by the best spread k*")
print(" L    sum(k*)      max(k*)       combined(k*)")
for L in (4, 8, 16, 32, 64):
    s, m, c = (hidden_budget(f, L, A) for f in (power_sum, power_max, power_combined_lb))
    print(f" {L:<4} {s[0]:>6.2f}({s[1]:>2})   {m[0]:>7.2f}({m[1]:>2})   {c[0]:>7.2f}({c[1]:>2})")

print("\nE4 sizes detected half the time when the cheat sits in ONE layer (k=1) vs ALL layers (k=L), sigma units")
print(" L    sum k=1   max k=1   sum k=L   max k=L")
for L in (4, 16, 64):
    print(f" {L:<4} {half_detect_size(power_sum,L,A,1):>7.2f}   {half_detect_size(power_max,L,A,1):>7.2f}   "
          f"{half_detect_size(power_sum,L,A,L):>7.2f}   {half_detect_size(power_max,L,A,L):>7.2f}")

print("\nE5 empirical level under the null (60000 trials, a=0.05)")
rng = random.Random(5)
for L in (4, 16, 64):
    print(f" L={L:<3} " + "  ".join(f"{t}={power_mc(L,A,[],60000,rng,t):.4f}" for t in ("sum", "max", "combined")))
