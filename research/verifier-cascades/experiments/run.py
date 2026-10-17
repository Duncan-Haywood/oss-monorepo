import os, sys, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from verifier_cascades import *

print("E1 pure sequential: wrong-cascade prob, expected revealed signals, herd ceiling vs independent majority")
print("   a   P(wrong casc)  E[agents]  herd acc  maj(3)  maj(5)  maj(11)  maj(101)")
for a in (0.55, 0.6, 0.65, 0.7, 0.8, 0.9):
    print(f"{a:5.2f}  {cascade_wrong_prob(a):11.4f}  {expected_agents_to_cascade(a):9.3f}  {herd_accuracy(a):8.4f}  "
          f"{majority_accuracy(a,3):6.4f}  {majority_accuracy(a,5):6.4f}  {majority_accuracy(a,11):7.4f}  {majority_accuracy(a,101):8.4f}")

print("\nE2 accuracy of the n-th sequential verdict (a=0.7) vs one verifier and majority of n")
for n in (1, 2, 3, 4, 6, 10, 30):
    print(f"n={n:3d}  seq {sequential_law(0.7,n)['p_last_right']:.4f}  maj {majority_accuracy(0.7,n):.4f}")

print("\nE3 committed first batch of m sealed verifiers, then sequential (herd accuracy / expected paid verifiers)")
for a in (0.6, 0.7):
    print(f" a={a}")
    for m in (0, 1, 2, 3, 5, 7, 11, 21, 41):
        print(f"   m={m:3d}  acc {herd_accuracy(a,m):.4f}  paid {agents_used(a,m):6.2f}  maj(paid,rounded odd) "
              f"{majority_accuracy(a, 2*round(agents_used(a,m)/2)+1):.4f}")

print("\nE4 Monte-Carlo with full Bayesian agents (no walk assumption), a=0.7, 6 verifiers, 100000 markets")
rng = random.Random(0)
N, n = 100000, 6
w = 0
for _ in range(N):
    v, s = bayes_run(0.7, n, rng)
    w += (v[-1] != s)
print(f"  wrong final verdict  MC {w/N:.4f}   DP {1-sequential_law(0.7,n)['p_last_right']:.4f}   cascade limit {cascade_wrong_prob(0.7):.4f}")
