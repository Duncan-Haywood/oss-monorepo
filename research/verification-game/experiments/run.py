"""Reproduces the tables in paper/whitepaper.md (~1s)."""
from verification_game import (Params, equilibrium, multi_verifier, jackpot_budget,
                               DriftModel, best_design)

p = Params(s=1.0, S=4.0, k=0.5, lam=0.5)
print("Stake sweep (s=1,k=.5,lam=.5): S, cheat x*, audit y*")
for S in (1, 2, 4, 8, 16, 32):
    x, y = equilibrium(Params(1, S, .5)); print(f"{S:>4} {x:.3f} {y:.3f}")

print("\nVerifier count m (S=4): cheat rate, total check cost")
for m in (1, 2, 4, 8, 32, 1000):
    x, y, c = multi_verifier(p, m); print(f"{m:>5} {x:.3f} {c:.3f}")

print("\nJackpot spend phi*J to hold cheat<=eps (S=4, phi=.05) vs eps")
for e in (0, .05, .1, .2, .25):
    print(f"{e:.2f} {jackpot_budget(p, e):.3f}")

print("\nOptimal (tau,S) vs hardware noise sigma")
taus = [0.1 * i for i in range(1, 100)]; Ss = [0.5 * i for i in range(1, 200)]
for sg in (0.5, 1, 2, 4):
    d = best_design(DriftModel(sigma=sg), taus, Ss)
    print(f"sigma={sg}: tau={d['tau']:.1f} S={d['S']:.1f} p_fp={d['p_fp']:.4f} "
          f"cheat={d['cheat']:.3f} audit={d['audit']:.3f} loss={d['loss']:.3f}")
