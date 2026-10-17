import math, random
from forecast_duel import *

print("E1 optimal-bet growth = KL(q||pi); small-gap approx (q-pi)^2/(2pi(1-pi))")
for rA, rB, q in [(.7, .4, .65), (.7, .4, .6), (.55, .45, .56), (.9, .1, .6), (.8, .5, .7)]:
    lam = best_bet(rA, rB, q)
    print(f" rA={rA} rB={rB} q={q} pi={breakeven(rA,rB):.3f} lam*={lam:.3f} growth={growth(lam,rA,rB,q):.5f} KL={max_growth(rA,rB,q):.5f} approx={small_gap_growth(rA,rB,q):.5f}")

lams = [i / 40 for i in range(1, 40)]
print("\nE2 false-rejection rate at the null q=pi (rA=.7,rB=.4), alpha=0.05, 2000 runs")
for T in (50, 200, 1000):
    e, _ = simulate(.7, .4, .55, .05, lams, T, 2000, 10)
    z, _ = simulate(.7, .4, .55, .05, [], T, 2000, 11, test="z")
    print(f" T={T:5d} e-process {e:.3f}   peeking z-test {z:.3f}")

print("\nE3 stopping time (alpha=0.05): oracle bet prediction ln(20)/KL vs uniform-mixture simulation")
for rA, rB, q in [(.7, .4, .65), (.7, .4, .6), (.8, .2, .6), (.55, .45, .56)]:
    pred = delay_prediction(rA, rB, q, .05)
    T = int(pred * 12) + 200
    rej, m = simulate(rA, rB, q, .05, lams, T, 400, 20)
    print(f" rA={rA} rB={rB} q={q}: predicted {pred:8.1f}  mixture {m:8.1f}  ratio {m/pred:.2f}  power {rej:.2f}")

print("\nE4 growth of a misspecified fixed bet as a fraction of optimal (rA=.7,rB=.4,q=.65)")
lam_star = best_bet(.7, .4, .65)
print(f" lam*={lam_star:.3f}")
for f in (.25, .5, 1, 1.5, 2, 3):
    print(f" lam={f}*lam*: {growth(f*lam_star,.7,.4,.65)/max_growth(.7,.4,.65):.3f}")
