import math, os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from reject_surrogates import *

out = []
def p(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)

p("E1. exact minimiser of the polyhedral conditional risk vs Bayes action (d=0.2): kinks -1/0/+1 decode to reject/escalate/accept")
d = 0.2
bad = 0
for i in range(1, 1000):
    eta = i / 1000
    u = poly_minimiser(eta, d)
    if abs(eta - d) < 1e-9 or abs(eta - (1 - d)) < 1e-9: continue
    bayes = 1 if eta > 1 - d else (-1 if eta < d else 0)
    bad += decode_poly(u) != bayes
p(f"  mismatches over 999 eta values: {bad}")

p("E2. linear transfer: sup regret_loss/regret_surrogate for the polyhedral surrogate (grid) vs closed form 2d")
for d in (0.05, 0.1, 0.25, 0.4, 0.49):
    p(f"  d={d}: sup ratio = {transfer_constant_poly(d, 1000):.4f}   2d = {2*d:.4f}")

p("E3. logistic surrogate has no linear transfer: ratio at u just below the reject cutoff, eta = d + delta (d=0.25)")
d = 0.25
u = math.log(d / (1 - d)) - 1e-9
prev = None
for dl in (0.1, 0.03, 0.01, 0.003, 0.001):
    r = regret_loss_log(u, d + dl, d) / regret_log(u, d + dl)
    p(f"  delta={dl}: ratio={r:.1f}   ratio*delta={r*dl:.3f}")

p("E4. SGD on one score, eta = d + delta near the reject/escalate boundary (d=0.25): mean 0-1-d regret of decoded action after T steps (2000 seeds)")
d = 0.25
seeds = 2000
for dl in (0.10, 0.03):
    eta = d + dl
    for T in (10, 100, 1000, 10000):
        row = []
        for sur in ("poly", "log"):
            rng = random.Random(1)
            tot = 0.0
            for _ in range(seeds):
                u = sgd_scalar(sur, eta, d, T, rng)
                tot += regret_loss_poly(u, eta, d) if sur == "poly" else regret_loss_log(u, eta, d)
            row.append(tot / seeds)
        p(f"  delta={dl} T={T}: poly regret={row[0]:.4f}  logistic regret={row[1]:.4f}")

p("E5. how far does the threshold move with d? verifier policy for re-execution cost d/error cost 1")
for d in (0.05, 0.1, 0.2, 0.4):
    p(f"  d={d}: reject if eta<={d}, accept if eta>={1-d}, escalate on ({d},{1-d}); escalation band width {1-2*d:.2f}; max Bayes risk {d}")

open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
