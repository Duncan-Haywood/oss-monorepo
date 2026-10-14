import math, random
from collision_elicitation import *

out = []
P = lambda *a: out.append(" ".join(str(x) for x in a))

P("== 1. estimator variance: all pairs vs disjoint pairs (p=[.6,.3,.1], Monte Carlo 20000)")
rng = random.Random(0)
p = [0.6, 0.3, 0.1]
P("n  var_allpairs(exact)  var_allpairs(MC)  var_disjoint(exact)  ratio")
for n in (4, 10, 30, 100):
    est = [u_stat(rng.choices(range(3), p, k=n)) for _ in range(20000)]
    m = sum(est) / len(est)
    mc = sum((e - m) ** 2 for e in est) / len(est)
    P(n, "%.5f" % u_var(p, n), "%.5f" % mc, "%.5f" % disjoint_var(p, n), "%.3f" % (u_var(p, n) / disjoint_var(p, n)))

P("\n== 2. one run cannot elicit Gamma: level-set witness")
pp, qq = equal_gamma_pair()
P("Gamma(p), Gamma(q), Gamma(mid) =", "%.3f %.3f %.3f" % level_set_witness(pp, qq))

P("\n== 3. k-fold: strict-equality false-slash rate of honest replicas, fleet of H equal classes")
P("H  Gamma_2  fail(k=2)  fail(k=3)  fail(k=5)")
for H in (1, 2, 3, 5, 10):
    pi = [1 / H] * H
    P(H, "%.3f" % gamma(pi, 2), *["%.3f" % strict_fail_rate(pi, k) for k in (2, 3, 5)])

P("\n== 4. collusion blind spot: eps that leaves pair agreement unchanged")
for g in (0.2, 0.5, 0.9, 0.99):
    P("Gamma=%.2f blind eps=%.3f  agreement at eps=.1: %.4f" % (g, blind_spot(g), contaminated_gamma(g, 0.1)))

P("\n== 5. float32 reduction-order fleets (n_terms sums, 4 kernels, random weights)")
P("terms  classes_distinct  Gamma_true  Gamma_hat(n=40 runs)  runs_for_+-0.05")
rng = random.Random(7)
for nt in (8, 64, 512):
    vals = [rng.gauss(0, 1) for _ in range(nt)]
    orders = kernel_orders(nt, 4, rng)
    outs = class_outputs(vals, orders)
    pi = [0.4, 0.3, 0.2, 0.1]
    d = output_distribution(outs, pi)
    pv = list(d.values())
    hats = [u_stat(sample_runs(d, 40, rng)) for _ in range(2000)]
    mh = sum(hats) / len(hats)
    P(nt, len(d), "%.3f" % gamma(pv), "%.3f (sd %.3f)" % (mh, math.sqrt(sum((h - mh) ** 2 for h in hats) / len(hats))), runs_needed(pv, 0.05))

open("experiments/results.txt", "w").write("\n".join(out) + "\n")
print("\n".join(out))
