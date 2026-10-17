"""Experiments for milestone-schedules. Deterministic (closed forms and exact recursions; one seeded sweep)."""
import random
from milestone_schedules import *

C, V = 100.0, 120.0
print(f"Setup: worker cost C={C:.0f}, value V={V:.0f}, price P=110, relationship value W=W_r+W_w.")

print("\nE1. Milestones needed: equal split ceil(C/W) vs geometric front-loaded ceil(ln(1+(V-C)/W)/ln(V/C))")
print(f"{'W':>8}{'equal':>8}{'geometric':>11}{'ratio':>8}{'first milestone %':>20}")
for W in (20, 5, 1, 0.2, 0.05, 0.01):
    ne, ng = n_equal(C, W), n_geometric(C, V, W)
    print(f"{W:8.2f}{ne:8d}{ng:11d}{ne / ng:8.1f}{100 * first_fraction(C, V, W):20.1f}")

print("\nE2. Schedule at W=1 (C=100, V=120): milestone sizes and a self-enforcing pre-payment fraction range")
sch = greedy_schedule(C, V, 1.0)
P, Wr, Ww = 110.0, 0.4, 0.6
print("feasible per exact recursion:", schedule_feasible(sch, C, V, P, Wr, Ww), f" n={len(sch)}")
print("k  cost    cum%   theta range (pre-paid share of the milestone's price)")
cum = 0.0
for k, c in enumerate(sch):
    cum += c
    rem = (C - cum) / C
    rg = theta_range(c, P / C * c, Wr + (V - P) * rem, Ww + (P - C) * rem)
    if k < 5 or k >= len(sch) - 2:
        print(f"{k + 1:<3d}{c:6.2f}{100 * cum / C:7.1f}   [{rg[0]:.3f}, {rg[1]:.3f}]")
    elif k == 5:
        print("...")

print("\nE3. Who carries the relationship value? Equal milestones, C=100, P=110, W_r+W_w=5")
print(f"{'W_r':>6}{'W_w':>6}{'pay after':>11}{'pay before':>12}{'best split':>12}")
for Wr in (0.5, 1.0, 2.5, 4.0, 4.5):
    Ww = 5.0 - Wr
    print(f"{Wr:6.1f}{Ww:6.1f}{n_pay_after(110.0, Wr):11d}{n_pay_before(C, Ww):12d}{n_equal(C, 5.0):12d}")

print("\nE4. Cheap re-entry caps the relationship value: W=5, milestones vs identity entry cost e")
print(f"{'e':>8}{'W_eff':>8}{'equal':>8}{'geometric':>11}")
for e in (100, 5, 2, 1, 0.5, 0.1, 0.02):
    We = effective_w(5.0, e)
    print(f"{e:8.2f}{We:8.2f}{n_equal(C, We):8d}{n_geometric(C, V, We):11d}")

print("\nE5. Value/cost margin: milestones at W=1 vs V/C (C=100)")
print(f"{'V/C':>7}{'equal':>7}{'geometric':>11}{'first %':>9}")
for r in (1.001, 1.05, 1.2, 1.5, 2.0, 4.0):
    v = C * r
    print(f"{r:7.3f}{n_equal(C, 1.0):7d}{n_geometric(C, v, 1.0):11d}{100 * first_fraction(C, v, 1.0):9.1f}")

print("\nE6. Random validation (seeded): greedy count == formula and schedule feasible; nothing shorter found")
rng = random.Random(11)
ok = short = 0
for _ in range(2000):
    c = rng.uniform(10, 500); v = c * rng.uniform(1.01, 3); p = c + (v - c) * rng.random(); w = rng.uniform(0.05, 20) * c / 100
    g = greedy_schedule(c, v, w); wr = w * rng.random()
    ok += len(g) == n_geometric(c, v, w) and schedule_feasible(g, c, v, p, wr, w - wr)
    n = len(g)
    if n >= 2:
        for _ in range(5):
            cuts = sorted(rng.random() for _ in range(n - 2))
            cs = [c * (b - a) for a, b in zip([0] + cuts, cuts + [1])]
            short += schedule_feasible(cs, c, v, p, wr, w - wr)
print(f"formula+feasibility: {ok}/2000; feasible schedules with one fewer milestone found in 10000 random draws: {short}")
