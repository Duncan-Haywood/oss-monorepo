"""Experiments for escalation-bonds. Exact game solutions; the only randomness is the validation sweep (seeded)."""
import random
from escalation_bonds import *

V, EPS = 1000.0, 0.02
print(f"Setup: claim value V={V:.0f}, oracle error eps={EPS}.")

print("\nE1. Deterrence: largest opening bond b* at which a false challenge still pays, and the attacker's TOTAL outlay at b*")
print("R      " + "".join(f"{'g=%.1f b*'%g:>12}{'outlay':>10}" for g in (1.5, 2.0, 4.0)))
for R in (1, 3, 5, 9, 15, 21):
    row = f"{R:<7d}"
    for g in (1.5, 2.0, 4.0):
        bs = deterrence_bond(V, EPS, g, R)
        row += f"{bs:12.5f}{bs * totals(1.0, g, R)[0]:10.2f}"
    print(row)
print(f"Large-R limit of the outlay: eps V / (1 - eps (1 + 1/g)) = " +
      ", ".join(f"g={g}: {EPS * V / (1 - EPS * (1 + 1 / g)):.2f}" for g in (1.5, 2.0, 4.0)) + f"  (vs one-shot eps V/(1-eps) = {EPS * V / (1 - EPS):.2f})")

print("\nE2. Budget race (eps=0, b=1, R=40): defender capital needed to survive an attacker with capital BC")
print("Worst case over BC in [10, 10^6] of  safe_BD / BC  (sharp bound is gamma), and the average over log-uniform BC")
rng = random.Random(7)
for g in (1.1, 1.25, 1.5, 2.0, 3.0, 4.0):
    ratios = []
    for _ in range(4000):
        BC = 10 ** rng.uniform(1, 6)
        ratios.append(defender_safe_budget(1.0, g, 40, BC) / BC)
    print(f"gamma={g:<4} worst={max(ratios):.3f} mean={sum(ratios) / len(ratios):.3f}   (attacker needs only {1 / g:.2f} of the defender's capital in the worst case)")
print("A concrete instance, gamma=2, b=1: attacker capital 21 -> defender must hold",
      defender_safe_budget(1.0, 2.0, 40, 21.0), "; 20.9 ->", defender_safe_budget(1.0, 2.0, 40, 20.9))

print("\nE3. Cheap opening vs latency: fix the deterrence outlay (g=2) and vary rounds R; opening bond shrinks geometrically")
PC = deterrence_bond(V, EPS, 2.0, 1) * totals(1.0, 2.0, 1)[0]
print(f"required attacker outlay PC = {PC:.2f}")
print("R      opening bond   final bond    defender total bonds")
for R in (1, 3, 5, 9, 15, 21):
    b0 = opening_bond(PC, 2.0, R)
    print(f"{R:<7d}{b0:12.5f}{bond(b0, 2.0, R):14.2f}{totals(b0, 2.0, R)[1]:14.2f}")

print("\nE4. Choosing gamma: cheapest (capital + latency) design with opening bond <= 0.10, PC as above")
for lam_t in (0.1, 1.0, 10.0):
    g, R, cost = best_gamma(PC, 0.10, 301, lam_capital=0.01, lam_time=lam_t, gammas=[1.05 + 0.05 * i for i in range(120)])
    print(f"time cost per round {lam_t:<5}: gamma*={g:.2f}, R={R}, defender capital {totals(opening_bond(PC, g, R), g, R)[1]:.0f}")

print("\nE5. Griefing: honest defender's lock-up cost / false challenger's loss, gamma=2, PC fixed, rate per round r")
print("R      " + "".join(f"r={r:<9}" for r in (0.0001, 0.001, 0.01)))
for R in (3, 9, 21):
    b0 = opening_bond(PC, 2.0, R)
    print(f"{R:<7d}" + "".join(f"{griefing_ratio(b0, 2.0, R, r, EPS):<11.4f}" for r in (0.0001, 0.001, 0.01)))

print("\nE6. Validation")
rng = random.Random(1)
bad_n = bad_r = bad_d = 0
for _ in range(300):
    g = rng.uniform(1.1, 3); R = rng.randint(1, 8); b = rng.uniform(0.1, 2); v = rng.uniform(1, 20)
    eps = rng.choice([0, 0.02, 0.1, 0.3]); BC = rng.choice([INF_ := float('inf'), rng.uniform(1, 60)]); BD = rng.choice([INF_, rng.uniform(1, 60)])
    uc, ud, _ = solve(v, eps, b, g, R, BC, BD)
    bad_n += not any(abs(uc - x) < 1e-7 and abs(ud - y) < 1e-7 for x, y in nash_outcomes_stop_round(v, eps, b, g, R, BC, BD))
for _ in range(500):
    g = rng.uniform(1.1, 3); R = rng.randint(1, 10); b = rng.uniform(0.1, 2); v = rng.uniform(1, 20)
    BC, BD = rng.uniform(1, 80), rng.uniform(1, 80)
    bad_r += challenges(v, 0.0, b, g, R, BC, BD) != attacker_wins_budget_race(b, g, R, BC, BD)
for _ in range(400):
    g = rng.uniform(1.1, 3); R = rng.randint(1, 9); v = rng.uniform(1, 20); eps = rng.choice([0.01, 0.05, 0.1, 0.2, 0.4])
    cf, num = deterrence_bond(v, eps, g, R), deterrence_bond_search(v, eps, g, R)
    bad_d += (num != float('inf')) if cf == float('inf') else abs(cf - num) > 1e-6 * max(1, cf)
print(f"SPE outcome is a Nash equilibrium of the stop-round strategic form: {300 - bad_n}/300")
print(f"budget-race closed form matches the exact game: {500 - bad_r}/500")
print(f"deterrence-bond closed form matches bisection on the exact game: {400 - bad_d}/400")
