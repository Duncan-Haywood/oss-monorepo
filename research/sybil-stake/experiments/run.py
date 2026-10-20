import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sybil_stake import *

out = []
def p(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)

R, n, s, S = 100.0, 20, 1.0, 1.0
p("E1. per-head pool (alpha=0), R=100, n=20 honest, attacker cost c per identity: best k vs sqrt(Rn/c)-n")
for c in (0.05, 0.5, 2.0, 4.0):
    k, pi = best_k(R, c, S, n, s, 0.0)
    p(f"  c={c:<5} best k={k:<4} closed form={k_star_per_head(R, c, n):7.2f}  pool share={share(k, S, n, s, 0):.3f}  net payoff={pi:.2f} (honest one identity: {payoff(1, R, c, S, n, s, 0):.2f})")
p("E2. sharp deterrence fee R n/((n+1)(n+2)) (alpha=0)")
for nn in (4, 9, 20):
    f = deterrence_fee(R, nn)
    p(f"  n={nn:<3} fee={f:.3f}  best k at 1.02f={best_k(R, 1.02 * f, S, nn, s, 0.0, 300)[0]}  at 0.98f={best_k(R, 0.98 * f, S, nn, s, 0.0, 300)[0]}")
p("E3. stake exponent alpha: attacker (stake 1 vs 20 honest of stake 1) share at k identities, no identity cost")
for a in (0.0, 0.5, 0.9, 1.0, 1.1, 1.5):
    p(f"  alpha={a:<4} k=1:{share(1, S, n, s, a):.3f} k=4:{share(4, S, n, s, a):.3f} k=64:{share(64, S, n, s, a):.3f} k=4096:{share(4096, S, n, s, a):.3f}")
p("E4. merging: 4 honest stakes of 1 among others of total weight 20; gain in pooled share from merging")
for a in (0.5, 1.0, 1.25, 1.5, 2.0):
    p(f"  alpha={a:<4} merge gain={merge_gain(4, 1.0, 20.0, a):+.4f}")
p("E5. Monte Carlo lottery (200k draws) vs formula, alpha=0.7, k=5, S=2, n=12")
p(f"  mc={lottery_share_mc(5, 2.0, 12, 1.0, 0.7):.4f} formula={share(5, 2.0, 12, 1.0, 0.7):.4f}")
p("E6. weighted-score wagering (Brier), coalition wager 3 with belief 0.7 vs two other wagerers")
oth = dict(others_w=[1.0, 2.0], others_q=[0.4, 0.8], others_p=[0.5, 0.75])
one = wswm_coalition_net(0.7, [3.0], [0.7], **oth)
p(f"  one identity truthful net={one:.6f};  3 identities truthful net={wswm_coalition_net(0.7, [1.0] * 3, [0.7] * 3, **oth):.6f}")
worst = max(wswm_coalition_net(0.7, [1.5, 1.5], [a / 20, b / 20], **oth) for a in range(1, 20) for b in range(1, 20))
p(f"  best of 361 split-report pairs (grid 0.05..0.95) net={worst:.6f} (<= truthful)")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
