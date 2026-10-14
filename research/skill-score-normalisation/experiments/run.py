import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from skill_score_normalisation import *

print("1. Single task type: optimal report r*(n,p) under BSS = 1 - Brier/(ybar(1-ybar)) (exact; n=2 gives 1/2)")
print("      n " + "".join(f"  p={p:<5}" for p in (.05, .1, .3, .5, .7, .9)))
for n in [2, 3, 5, 10, 20, 50, 100, 400, 1600]:
    print(f"  {n:5d} " + "".join(f"  {single_type_report(n, p):.4f} " for p in (.05, .1, .3, .5, .7, .9)))

print("\n2. Distortion r*-p and n*(r*-p) at large n (p=0.1, 0.05)")
for p in (.1, .05):
    for n in [100, 400, 1600, 6400]:
        d = single_type_report(n, p) - p
        print(f"  p={p} n={n:5d}: r*-p={d:+.5f}  n(r*-p)={n*d:+.3f}")

print("\n3. Worst distortion over n, and value of misreporting (p=0.1)")
best = max(range(3, 300), key=lambda n: abs(single_type_report(n, .1) - .1))
r = single_type_report(best, .1)
print(f"  largest |r*-p| at n={best}: r*={r:.4f}")
for n in (5, 10, 30):
    r = single_type_report(n, .1)
    g = expected_bss([n], [.1], [r]) - expected_bss([n], [.1], [.1])
    print(f"  n={n}: BSS gain from lying {g:.5f}; true Brier cost (r-p)^2={(r-.1)**2:.5f}; honest BSS={expected_bss([n],[.1],[.1]):.4f}")

print("\n4. Cross-task leakage: honest p=(0.1, 0.5), equal task counts")
for n in (5, 10, 20):
    r = optimal_reports([n, n], [.1, .5])
    print(f"  n_i={n:2d}: r*=({r[0]:.4f}, {r[1]:.4f})  vs alone ({single_type_report(n,.1):.4f}, {single_type_report(n,.5):.4f})")
for p2 in (.1, .3, .5, .7, .9):
    r = optimal_reports([10, 10], [.1, p2])
    print(f"  types (0.1, {p2}), n_i=10: r*=({r[0]:.4f}, {r[1]:.4f})")

print("\n5. Leave-one-out baseline is proper: expected payoff over report on type-1 (p=(.1,.5), n_i=8)")
for r1 in (.05, .1, .15, .3):
    print(f"  r1={r1:.2f}: LOO {expected_loo([8,8],[.1,.5],[r1,.5]):.5f}   BSS {expected_bss([8,8],[.1,.5],[r1,.5]):.5f}")

print("\n6. Monte Carlo check (200k): types (0.1,0.5), n_i=8, report at exact optimum")
r = optimal_reports([8, 8], [.1, .5])
print(f"  exact {expected_bss([8,8],[.1,.5],r):.5f}  MC {simulate_report([8,8],[.1,.5],r,200000,1):.5f}")
