import math
from calibration_hedging import *

adv = lambda q, K, t, rng: adaptive_adversary(q, K)
coin = lambda q, K, t, rng: int(rng.random() < 0.7)
N = 20


def avg(K, T, a, idx):
    return sum(run(T, K, a, s)[idx] for s in range(N)) / N


print("E1 expected calibration error of the information-free hedger (mean of %d runs)" % N)
print("  K   T      ECE adaptive   ECE iid(0.7)   worst-case bound")
for K in (10, 20):
    for T in (250, 1000, 4000):
        print(f" {K:<3} {T:<6} {avg(K,T,adv,0):<14.4f} {avg(K,T,coin,0):<14.4f} {ece_bound(K,T):.3f}")

print("\nE2 skill: Brier score of hedger vs informed verifier vs base-rate forecaster, K=10, T=2000")
print("  outcome sequence     hedger Brier   informed Brier   base-rate Brier   hedger ECE")
for name, a in (("adaptive adversary", adv), ("iid Bernoulli(0.7)", coin)):
    rs = [run(2000, 10, a, s) for s in range(N)]
    hb = sum(r[1] for r in rs) / N
    br = sum(informed_brier(r[3]) for r in rs) / N
    ib = 0.0 if name.startswith("adaptive") else 0.21   # informed = knows the rule (Brier 0) / the true 0.7 (Brier 0.21)
    print(f"  {name:<20} {hb:<14.4f} {ib:<16.4f} {br:<17.4f} {sum(r[0] for r in rs)/N:.4f}")

print("\nE3 a calibration slashing test 'slash if ECE > eps' at T=2000, K=10: share of runs that PASS")
print("  eps    hedger (adaptive outcomes)   constant-0.5 forecaster")
const_ece = 0.5   # against the adversary a constant 0.5 has mean 0.5, so y=0 every round: |0 - 0.5| = 0.5
for eps in (0.05, 0.1, 0.2):
    ok = sum(run(2000, 10, adv, s)[0] <= eps for s in range(100)) / 100
    print(f" {eps:<6} {ok:<28.2f} {'0.00' if const_ece > eps else '1.00'}")

print("\nE4 rounds for the worst-case bound to fall below eps (K=50) and the power of a Brier-gap test against the hedger")
for eps in (0.2, 0.15, 0.1):
    print(f" eps={eps}: T >= {min_rounds(50, eps)}")
rs = [run(500, 10, adv, s) for s in range(100)]
gap = [r[1] - 0.0 for r in rs]
print(f" Brier gap to an informed benchmark at T=500: min {min(gap):.3f}, mean {sum(gap)/100:.3f} (a gap test with margin 0.1 detects {sum(g>0.1 for g in gap)}/100)")
