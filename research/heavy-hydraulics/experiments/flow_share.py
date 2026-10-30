"""Milestone 3a: how much longer does an open-centre parallel valve make the dig phase when two
actuators move together at unequal pressure (steady-state flow sharing, `heavy_hydraulics.flow_share`)?

Same random cycles as 2d (`physics_cycle.one`), pump 45 L/min, neutral drop p_n from 2n (10.9 bar, PVG 32 bypass
curve) and from 2i (1.44 bar). Only the dig phase has two actuators. Cycle-time penalty = sum of phase durations
stretched by the slowdown factor over the unstretched sum. Load-sensing (compensated) is 1.0 by construction
while demand <= pump flow, which `cycle_energy` already requires. No operator feathering.
"""
import io, contextlib, os, random, statistics, sys
here = os.path.dirname(__file__)
sys.argv = [sys.argv[0]]
with contextlib.redirect_stdout(io.StringIO()):
    sys.path.insert(0, here)
    import physics_cycle as pc
from heavy_hydraulics.flow_share import phase_slowdown

def run(p_n, n=1000):
    pen, dig = [], []
    for s in pc.SEEDS:
        for i in range(n):
            c, *_ = pc.one(random.Random(s * 7919 + i))
            t0 = sum(p.seconds for p in c)
            t1 = 0.0
            for p in c:
                f = phase_slowdown([(a.pressure, a.flow) for a in p.actuators], pc.Q_PUMP, p_n)
                t1 += p.seconds * f
                if len(p.actuators) > 1:
                    dig.append(f)
            pen.append(100 * (t1 / t0 - 1))
    q = lambda xs, f: sorted(xs)[min(len(xs) - 1, int(f * len(xs)))]
    return pen, dig, q

if __name__ == "__main__":
    for p_n in (10.9, 1.44):
        pen, dig, q = run(p_n)
        print(f"p_n {p_n} bar: cycle-time penalty % median {statistics.median(pen):.2f}, p95 {q(pen,.95):.2f}, max {max(pen):.2f}; "
              f"dig slowdown factor median {statistics.median(dig):.3f}, p95 {q(dig,.95):.3f}; dig phases at the stall bound (factor 2) "
              f"{100*sum(x>=2.0 for x in dig)/len(dig):.1f}%; share of cycles with any slowdown "
              f"{100*sum(x>0.005 for x in pen)/len(pen):.1f}%")
