import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from verifier_complements import *

out = []
def p(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)
pi, c, q = 0.05, 1.0, 0.7
p(f"Setup: prior fault rate pi={pi}, slash-a-good-job cost c={c}, identical verifiers accuracy q={q}")
p("E1. value V(n) of n identical verifiers: zero until n0 (unanimous flags must flip the default), then concave")
n0 = min_committee(q, pi, c)
p(f"  closed-form n0 = {n0}")
vs = [value([q] * n, pi, c) for n in range(0, 11)]
mis = [mutual_info([q] * n, pi) if n else 0.0 for n in range(0, 11)]
for n in range(0, 11):
    marg = vs[n] - vs[n - 1] if n else 0.0
    p(f"  n={n:2d} V={vs[n]:.5f} marginal={marg:+.5f} | mutual-info {mis[n]:.5f} marginal={mis[n]-(mis[n-1] if n else 0):+.5f}")
p("E2. submodularity check over all (S,i,j) in a pool of 8 verifiers with q in {.6,.65,.7,.75,.8,.85,.9,.95}")
pool = [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]
for pi_ in (0.05, 0.2, 0.5):
    bad, tot, worst = submodularity_violations(pool, pi_, 1.0)
    bad_mi = 0
    p(f"  pi={pi_}: decision value violates diminishing returns in {bad}/{tot} triples ({100*bad/tot:.1f}%), worst excess {worst[0]:.5f}")
p("E3. hiring under a budget: myopic marginal-value greedy vs exhaustive optimum (pool: 6 cheap q=.7 @1, one q=.9 @4; pi=.05)")
pool3 = [0.7] * 6 + [0.9]; costs3 = [1] * 6 + [4]
for B in (2, 3, 4, 5, 6, 7):
    vg, sg = greedy_committee(pool3, costs3, B, pi, c); vo, so = best_committee(pool3, costs3, B, pi, c)
    p(f"  budget {B}: greedy V={vg:.5f} {sg} | optimal V={vo:.5f} {so} | ratio {vg/vo if vo else float('nan'):.3f}")
p("E4. leave-one-out (marginal-contribution) pay per verifier, identical q=.7, n up to 40: zero below n0, then a parity sawtooth, decaying only slowly")
lo = lambda n: value_hom(n, q, pi, c) - value_hom(n - 1, q, pi, c)
for n in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 16, 25, 26, 39, 40):
    p(f"  n={n:2d} LOO pay {lo(n):.5f}")
p(f"  V(40) = {value_hom(40, q, pi, c):.5f} of prior risk {prior_risk(pi, c):.3f}; mean LOO over n=31..40 = {sum(lo(n) for n in range(31,41))/10:.5f}; V(n)/n per verifier at 40 = {value_hom(40,q,pi,c)/40:.5f}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
