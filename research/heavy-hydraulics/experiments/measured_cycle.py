"""Milestone 2b: circuit rankings on the measured cycle times and pump curve of
Juza and Hermanek (2023), Research in Agricultural Engineering 69(1):18-27,
doi:10.17221/77/2021-RAE (CC BY-NC 4.0; numbers transcribed from Tables 1, 2 and 4).

Sourced: six phase times (Table 4), the pump half's measured Q(p) (Table 1), the
open-centre block loss 6 bar (Table 2), pump efficiency 0.8834 (text). Not sourced:
per-phase pressures and flows (random), actuators per phase, dp_ls, dp_m (swept).
Stdlib, seeded, a few seconds.
"""
import random, statistics, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from heavy_hydraulics import Phase, Actuator, cycle_energy
from heavy_hydraulics.circuits import W_PER_BAR_LPM

QP = ((0, 158.0), (50, 156.0), (100, 153.3), (130, 147.0), (160, 131.5),
      (200, 111.7), (270, 77.7), (300, 71.3))          # bar, L/min (Table 1)
PHASES = (("fill", 4.01, (2, 3)), ("lift", 2.21, (1, 1)), ("swing", 6.21, (1, 1)),
          ("dump", 4.16, (1, 1)), ("swing_back", 5.76, (1, 1)), ("lower", 2.65, (1, 1)))
DP_SPOOL, ETA = 6.0, 0.8834
SEEDS, N = (0, 1, 2, 3, 4), 4000


def qp(p):
    for (p0, q0), (p1, q1) in zip(QP, QP[1:]):
        if p <= p1:
            return q0 + (q1 - q0) * (p - p0) / (p1 - p0)
    return QP[-1][1]


def one(rng, equal_pressure):
    dp_ls, dp_m = rng.uniform(14, 30), rng.uniform(3, 10)
    phases, oc = [], 0.0
    for name, secs, (lo, hi) in PHASES:
        n = rng.randint(lo, hi)
        p0 = rng.uniform(20, 280)
        ps = [p0 if equal_pressure else rng.uniform(20, 280) for _ in range(n)]
        pmax = max(ps)
        q_pump = qp(pmax + DP_SPOOL)
        tot = rng.uniform(0.2, 1.0) * q_pump
        w = [rng.uniform(0.3, 1.0) for _ in range(n)]
        acts = tuple(Actuator(p, tot * x / sum(w)) for p, x in zip(ps, w))
        phases.append(Phase(name, secs, acts))
        oc += q_pump * (pmax + DP_SPOOL) * W_PER_BAR_LPM * secs / ETA
    c = tuple(phases)
    ls = cycle_energy(c, "load_sensing", pump_flow=1e9, dp_ls=dp_ls, eta_pump=ETA)["shaft_J"]
    mt = cycle_energy(c, "metered", pump_flow=1e9, dp_m=dp_m, eta_pump=ETA)["shaft_J"]
    return oc, ls, mt


def q(xs, f):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(f * len(xs)))]


assert abs(qp(270) / 60 - 1.295) < 0.001, "transcription check vs paper's Q1"
for label, eq in (("random pressures per actuator", False), ("equal pressure within a phase", True)):
    rows = [one(random.Random(1000 * eq + s * 7919 + i), eq) for s in SEEDS for i in range(N)]
    ls = [b / a for a, b, c in rows]; mt = [c / b for a, b, c in rows]
    order = sum(a >= b >= c for a, b, c in rows) / len(rows)
    print(f"{label}: {len(rows)} cycles; ordering OC>=LS>=metered {100*order:.2f}%")
    print(f"  LS/OC  median {statistics.median(ls):.3f}  5-95%: {q(ls,.05):.3f} to {q(ls,.95):.3f}")
    print(f"  Met/LS median {statistics.median(mt):.3f}  5-95%: {q(mt,.05):.3f} to {q(mt,.95):.3f}; "
          f"share < 0.85: {100*sum(x<0.85 for x in mt)/len(mt):.1f}%")
