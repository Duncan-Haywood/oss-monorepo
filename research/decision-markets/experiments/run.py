import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from decision_markets import *

out = []
def P(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)

s, sig = 1.0, 1.0
lam, v, w = posterior(s, sig)
P(f"setup: s={s} sig={sig} lam={lam:.3f} v={v:.3f} gap std w={w:.4f}")

P("\nE1 exact IPW payment law (two arms, k=1): E[1/pi]=1+exp(w^2/2t^2); rel std = sqrt(3E[1/pi]-1)")
for t in (2.0, 1.0, 0.5, 0.3):
    m, m2 = payment_moments(1.0, v, 2, t, w)
    sm, s2 = simulate_payments(1.0, s, sig, t, 400000, seed=1)
    P(f"  t={t:<4} closed E[1/pi]={inv_propensity_mean(2,t,w):9.3f} rel-std={payment_rel_std(2,t,w):7.3f}"
      f"  MC mean {sm:.4f} (exact {m:.4f}) 2nd moment {s2:.4f} (exact {m2:.4f})")

P("\nE2 propriety when the policy reads the report (m=0.2, v=0.5, k=2, pi=sigmoid((0.4-r)/0.3))")
pi = lambda r: sigmoid((0.4 - r) / 0.3)
for r in (-0.5, 0.0, 0.2, 0.6):
    P(f"  r={r:5.2f} IPW penalty {ipw_expected_score(r,0.2,0.5,2.0,pi):.4f}  (k((r-m)^2+v) = {2*((r-0.2)**2+0.5):.4f})")
for A, lbl in ((1.2, "A=1.2 > kv"), (0.0, "A=0 (penalty only)")):
    r = unscaled_best_report(0.2, 0.5, 2.0, A, 0.3, 0.4)
    P(f"  unscaled, {lbl}: best report {r:+.3f} vs truth +0.200")

P("\nE3 exploration regret of softmax routing vs greedy (w=%.3f); bound 0.2785 t" % w)
for t in (0.05, 0.1, 0.2, 0.4, 0.8):
    P(f"  t={t:<4} regret {logistic_regret(t,w):.4f}  bound {regret_constant()*t:.4f}  loss {expected_loss(lambda d: sigmoid(d/t), w):+.4f}"
      f"  greedy {greedy_gain(w):+.4f}  payment rel-std {payment_rel_std(2,t,w):.2f}")

P("\nE4 probit vs logistic: E[1/pi] truncated at |D|<=L w (w=1)")
for t in (0.7, 1.0, 1.5):
    row = "  t=%.1f probit " % t + "  ".join(f"L={L}:{inv_pi_probit_truncated(t,1.0,L):.4g}" for L in (3, 5, 7, 9))
    P(row + f"   logistic exact {inv_propensity_mean(2,t,1.0):.4g}")

P("\nE5 K arms: E[1/pi] = 1+(K-1)exp(w^2/2t^2) and the temperature a payment cap allows (rel-std cap 10, w=1)")
for K in (2, 4, 8, 16):
    t = temperature_for_rel_std(10, 1.0, K)
    P(f"  K={K:<3} t_min={t:.4f}  E[1/pi] at t=1 {inv_propensity_mean(K,1.0,1.0):.3f}")

P("\nE6 stakes: symmetric stakes cancel; asymmetric stake dB shifts the reported gap (k=5, t=1)")
k, t = 5.0, 1.0
P(f"  concavity limit on stake 12sqrt3*k*t^2 = {concavity_stake_limit(k,t):.1f}")
for D in (0.0, 0.3, 1.0, 2.5):
    b0, b1, Dr = equilibrium_reports(D, 8.0, 8.0, k, t)
    c0, c1, Dr2 = equilibrium_reports(D, 12.0, 4.0, k, t)
    P(f"  D={D:3.1f} equal stakes: shift {Dr-D:+.4f} (b0=b1={b0:.4f});  stakes 12/4: shift {Dr2-D:+.4f} fixed point {distorted_gap(D,8.0,k,t)-D:+.4f}")
lim = concavity_stake_limit(k, t)
gaps = [i / 50 for i in range(-250, 251)]
for B in (0.9 * lim, 1.6 * lim):
    rs = [stake_best_report(0.0, k, B, t, g) for g in gaps]
    jumps = max(abs(rs[i + 1] - rs[i]) for i in range(len(rs) - 1))
    P(f"  stake {B:6.1f} ({B/lim:.1f}x limit): largest jump of the best report per 0.02 step of the opponent gap {jumps:.3f}")

P("\nE7 design: payment rel-std cap C, stake asymmetry dB=6, t=t_min(C); loss increase from distortion")
for C in (6.0, 12.0):
    for k in (2, 4, 8, 16, 32):
        t, hon, dis = design(w, 2, 6.0, k, C)
        if math.isnan(dis):
            P(f"  C={C:<4} k={k:<3} t={t:.3f} honest loss {hon:+.4f}  stake beyond concavity limit {concavity_stake_limit(k,t):.1f}: no unique equilibrium")
        else:
            P(f"  C={C:<4} k={k:<3} t={t:.3f} honest loss {hon:+.4f} distorted {dis:+.4f} extra {dis-hon:.5f}")
P(f"  greedy honest {greedy_gain(w):+.4f}")
P("  scaling of the extra loss with the stake gap (k=8, t=0.454): first-order harm cancels by symmetry")
base = None
for dB in (1.0, 2.0, 4.0, 8.0):
    t, hon, dis = design(w, 2, dB, 8, 6.0)
    e = dis - hon
    base = base or e
    P(f"  dB={dB:<4} extra {e:.6f}  ratio to dB=1: {e/base:.2f} (dB^2 would be {dB*dB:.0f})")

with open(os.path.join(os.path.dirname(__file__), "results.txt"), "w") as f:
    f.write("\n".join(out) + "\n")
