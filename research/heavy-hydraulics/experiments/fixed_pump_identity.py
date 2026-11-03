"""Milestone 3p: is the surplus fraction f of 3n a free parameter for a fixed-displacement pump?

Solve the steady pressure of a parallel open-centre circuit by flow continuity: a fixed pump of Q L/min
feeds actuator spools (q_i = a_i sqrt(p - p_i)) and a bypass (q_b = b sqrt(p)). Whatever b is, the pump
sees p, so shaft power is Q p and the surplus flow Q - sum q_i is dropped at p, not at some lower
pressure. The only way to move the operating pressure is to change b, and that changes how much flow
the actuators get. So f = 1 (3m) is the identity for a fixed pump, and f < 1 (3n) needs a different
pump (pressure-compensated, unloading, variable). Pure stdlib, seeded.

    python3 experiments/fixed_pump_identity.py > experiments/fixed_pump_identity_results.txt
"""
import os, random, sys
from math import sqrt
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from heavy_hydraulics import cycle_energy, Phase, Actuator

random.seed(3)
N, Q, DP_S = 2000, 45.0, 6.0


def solve_p(Q, acts, b):
    """Pump pressure (bar) at which spool + bypass flows sum to Q. acts = [(a_i, p_i)]."""
    def total(p):
        return sum(a * sqrt(max(p - pi, 0.0)) for a, pi in acts) + b * sqrt(p)
    lo, hi = min(pi for _, pi in acts), 1e4
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if total(mid) < Q else (lo, mid)
    return 0.5 * (lo + hi)


max_err_p = max_err_e = 0.0
n_lower = n_delivering_lower = 0
min_gap = 1e9
for _ in range(N):
    k = random.choice((1, 2, 3))
    pl = [random.uniform(30, 220) for _ in range(k)]
    qd = [random.uniform(2, Q / k * 0.9) for _ in range(k)]
    pmax = max(pl)
    p_star = pmax + DP_S
    acts = [(q / sqrt(p_star - p), p) for q, p in zip(qd, pl)]
    b0 = (Q - sum(qd)) / sqrt(p_star)
    p = solve_p(Q, acts, b0)
    max_err_p = max(max_err_p, abs(p - p_star))
    e_model = cycle_energy((Phase("x", 1.0, tuple(Actuator(a, q) for a, q in zip(pl, qd))),),
                           "open_centre", pump_flow=Q, dp_spool=DP_S, eta_pump=1.0)["shaft_J"]
    e_solve = Q * p / 0.6
    max_err_e = max(max_err_e, abs(e_solve - e_model) / e_model)
    # widen the bypass: pressure falls, but do the actuators still get their demanded flow?
    for scale in (1.01, 1.05, 1.2, 2.0):
        pb = solve_p(Q, acts, b0 * scale)
        got = [a * sqrt(max(pb - pi, 0.0)) for a, pi in acts]
        n_lower += pb < p_star
        if all(g >= q - 1e-6 for g, q in zip(got, qd)):
            n_delivering_lower += pb < p_star - 1e-6
        min_gap = min(min_gap, min(g / q for g, q in zip(got, qd)))
print(f"{N} random parallel open-centre phases (1 to 3 actuators, 30 to 220 bar), Q {Q} L/min, spool drop {DP_S} bar")
print(f"sized bypass: solved pressure vs p_max + drop, max abs error {max_err_p:.2e} bar")
print(f"solved shaft energy vs cycle_energy open_centre, max relative error {max_err_e:.2e}")
print(f"wider bypass (x1.01 to x2): {n_lower} of {4 * N} cases lower the pressure; "
      f"{n_delivering_lower} of them still deliver every demanded flow")
print(f"worst delivered/demanded flow over widened-bypass cases {min_gap:.3f}")
