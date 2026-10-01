"""Deterministic experiments; output in results.txt."""
import math
from abstention_scoring import *

mu = 1.0
print("E1  abstention region and information kept (pi=0.5, mu=1, Brier gain>=c, silence used correctly)")
pi = 0.5
I0 = mutual_info(pi, mu, region_brier(pi, pi, mu, 0.0))
for c in (0.0, 0.01, 0.04, 0.09, 0.16):
    reg = region_brier(pi, pi, mu, c)
    pa = pi * abstain_prob(1, mu, reg) + (1 - pi) * abstain_prob(0, mu, reg)
    I = mutual_info(pi, mu, reg)
    pay = expected_payment(pi, pi, mu, reg)
    print(f"  c={c:4.2f}  abstain interval ({reg[0]:+.3f},{reg[1]:+.3f})  P(abstain) {pa:.3f}  info {I:.4f} nats ({I/I0:6.1%})  payment {pay:.4f}  silence LR {abstain_lr(mu, reg):.4f}")

print("\nE2  asymmetric prior: silence is evidence (mu=1, c=0.03)")
for pi in (0.5, 0.3, 0.2, 0.1, 0.05):
    reg = region_brier(pi, pi, mu, 0.03)
    print(f"  pi={pi:4.2f}  abstain ({reg[0]:+.3f},{reg[1]:+.3f})  silence LR {abstain_lr(mu, reg):.4f}  P(theta=1|silence) {posterior_after_abstain(pi, mu, reg):.4f}  P(theta=1|reports) {reporter_base_rate(pi, mu, reg):.4f}")

print("\nE3  n verifiers, log-loss of aggregator that uses silence vs ignores it (pi=0.1, mu=0.8, c=0.02, 20000 jobs)")
pi, mu3, c = 0.1, 0.8, 0.02
reg = region_brier(pi, pi, mu3, c)
for n in (1, 3, 6, 12):
    sim = simulate(pi, mu3, reg, n, 20000, seed=11)
    ll = {True: 0.0, False: 0.0}
    for th, rep, k in sim:
        for u in (True, False):
            q = min(max(aggregate(pi, mu3, reg, rep, k, u), 1e-12), 1 - 1e-12)
            ll[u] -= math.log(q if th else 1 - q)
    lu, ln = ll[True] / len(sim), ll[False] / len(sim)
    allsil = sum(1 for _, r, _ in sim if not r) / len(sim)
    print(f"  n={n:2d}  logloss silence-aware {lu:.4f}  ignoring silence {ln:.4f}  excess {ln-lu:+.4f}  P(all silent) {allsil:.3f}")

print("\nE4  stale anchor: alpha != pi (pi=0.3, mu=1, c=0.03); who abstains?")
pi = 0.3
for alpha in (0.3, 0.4, 0.5, 0.6):
    reg = region_brier(pi, alpha, mu, 0.03)
    print(f"  alpha={alpha:.1f}  abstain ({reg[0]:+.3f},{reg[1]:+.3f})  silence LR {abstain_lr(mu, reg):.4f}  P(theta=1|silence) {posterior_after_abstain(pi, mu, reg):.4f}  info {mutual_info(pi, mu, reg):.4f}")

print("\nE5  Brier vs log-score gain: same c, different regions (pi=0.5, mu=1)")
pi = 0.5
for c in (0.01, 0.04, 0.09):
    rb, rl = region_brier(pi, pi, mu, c), region_log(pi, pi, mu, c)
    print(f"  c={c:4.2f}  Brier ({rb[0]:+.3f},{rb[1]:+.3f}) info {mutual_info(pi, mu, rb):.4f} | log ({rl[0]:+.3f},{rl[1]:+.3f}) info {mutual_info(pi, mu, rl):.4f}")

print("\nE6  reward scale k (unit reporting cost, report iff gain >= 1/k, pi=0.5, mu=1): information saturates, payment grows ~k")
pi = 0.5
best = None
for k in (5, 8, 12, 20, 30, 50, 100):
    reg = region_brier(pi, pi, mu, min(1 / k, 0.999))
    I = mutual_info(pi, mu, reg); pay = k * expected_payment(pi, pi, mu, reg) - 0
    # net principal payoff: information (nats) minus expected net reward beyond cost = pay - c * P(report)
    pr = 1 - (pi * abstain_prob(1, mu, reg) + (1 - pi) * abstain_prob(0, mu, reg))
    rent = pay - pr
    print(f"  k={k:4d}  info {I:.4f}  reporters {pr:.3f}  total payment {pay:.4f}  verifier rent {rent:.4f}")
