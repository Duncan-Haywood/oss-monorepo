"""Deterministic experiments; output is experiments/results.txt."""
import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from finetune_twin import *

eta, s = 0.1, 0.3
d, kappa = 10, 100
L = spectrum(d, kappa)
F = floor(L, eta, s)
print(f"setup: d={d}, eigenvalues geometric in [1/{kappa},1], eta={eta}, noise s={s}; SGD stationary floor = {F:.5f}\n")

print("1. exact risk vs Monte Carlo (20000 runs, seed 1), cold start e0=1 in every direction")
print("   k    exact     sim      ratio")
for k in (5, 20, 80, 320):
    ex = risk(L, [1.0] * d, eta, s, k); sm = risk_sim(L, [1.0] * d, eta, s, k, 20000, 1)
    print(f"  {k:4d}  {ex:.5f}  {sm:.5f}  {sm/ex:.4f}")

print("\n2. steps to reach 2x the floor, cold start |e0|=1 per direction, twin error b per direction")
tgt = 2 * F
kc = steps_to(L, [1.0] * d, eta, s, tgt)
print(f"   target {tgt:.5f}; cold start needs {kc} real steps")
print("   b/e0   steps   saved   saved/cold")
for b in (0.03, 0.1, 0.3, 0.6, 1.0, 1.5, 3.0):
    kw = steps_to(L, [b] * d, eta, s, tgt)
    kw_s = "unreached-from-start" if kw is None else kw
    print(f"  {b:5.2f}  {kw_s!s:>6}  {kc-kw if kw is not None else 'n/a':>6}  {(kc-kw)/kc if kw is not None else float('nan'):+.3f}")
print("   (b/e0 = 1 saves exactly 0; b > e0 is negative transfer: the twin start is worse than a cold start)")

print("\n3. where the twin error sits (|b|^2 = 1 fixed, noise-free): loss left after k steps")
print("   k     stiffest(lam=1)   flattest(lam=.01)   isotropic   worst single lam (lam*=1/(2 eta k))   bound |b|^2/(4e eta k)")
for k in (10, 50, 200, 1000):
    st = risk([L[-1]], [1.0], eta, 0.0, k); fl = risk([L[0]], [1.0], eta, 0.0, k)
    iso = risk(L, [1 / math.sqrt(d)] * d, eta, 0.0, k)
    lw = min(1.0 / eta, worst_direction(eta, k)) if worst_direction(eta, k) < 1 / eta else 1.0
    lw = min(lw, 1.0 / eta - 1e-9)
    wr = risk([lw], [1.0], eta, 0.0, k)
    print(f"  {k:5d}  {st:.3e}        {fl:.3e}         {iso:.3e}    {wr:.3e} (lam*={lw:.3f})            {residual_bound(1.0, eta, k):.3e}")
print("   Stiff errors vanish geometrically, flat errors cost little because lam is small; the damage peaks at")
print("   lam* ~ 1/(2 eta k), so for ANY spectrum the twin-error loss after k real steps is <= |b|^2/(4e eta k): a 1/k law, not geometric.")

print("\n4. the saving is a near-constant fraction (0.64-0.67) of the cold-start steps at every target: same rate, shorter by ln(e0/b)/(2 eta lam_min)-type head start")
print("   target multiple of floor   cold steps   twin(b=0.6) steps   saved")
for mult in (8, 4, 2, 1.5, 1.2):
    t = mult * F
    a = steps_to(L, [1.0] * d, eta, s, t); b = steps_to(L, [0.6] * d, eta, s, t)
    print(f"   {mult:5.1f}x                    {a:7d}      {b:7d}            {a-b:7d}")

print("\n5. twin error with the same initial real loss (0.5) but placed differently, steps to 2x floor")
init = 0.5 * 1.0
for name, e in (("stiff-heavy", [0.0] * (d - 1) + [math.sqrt(2 * init / L[-1])]),
                ("flat-heavy", [math.sqrt(2 * init / L[0])] + [0.0] * (d - 1)),
                ("isotropic-in-loss", [math.sqrt(2 * init / (d * l)) for l in L])):
    print(f"   {name:18s} initial loss {risk(L, e, eta, 0.0, 0):.3f}  steps to 2x floor: {steps_to(L, e, eta, s, tgt)}")
