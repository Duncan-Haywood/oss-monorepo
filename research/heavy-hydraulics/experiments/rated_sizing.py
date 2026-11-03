"""Milestone 3g: size open-centre sections from the PVG 32 rated spool flows (A 10, B 25, C 40, D 65,
E 100 L/min; Danfoss BC152886483664en-001602, July 2024) instead of 3a to 3f's closing-law constant k.

Each actuator gets the smallest spool whose rated flow covers its demand (E if none does). The spool
area is Q_rated / sqrt(dp_ref); dp_ref (the drop at which the rating applies) is NOT in the pages
read, so it is swept. The bypass is shut whenever any section is open (the manual's dead band, 3d).
Same random cycles as 3a to 3f. Penalty = phase stretch from flow sharing, as in flow_share.py.
"""
import io, contextlib, os, random, statistics, sys
from math import sqrt
here = os.path.dirname(__file__)
sys.argv = [sys.argv[0]]
with contextlib.redirect_stdout(io.StringIO()):
    sys.path.insert(0, here)
    import physics_cycle as pc
from heavy_hydraulics.flow_share import _bisect

RATED = (10.0, 25.0, 40.0, 65.0, 100.0)

def spool(q):
    return next((r for r in RATED if r >= q), RATED[-1])

def slowdown(demands, q_pump, dp_ref, p_relief=250.0):
    if len(demands) < 2:
        return 1.0
    areas = [spool(q) / sqrt(dp_ref) for _, q in demands]
    f = lambda ps: sum(a * sqrt(max(ps - p, 0.0)) for a, (p, _) in zip(areas, demands)) - q_pump
    ps = _bisect(f, 1e-6, p_relief)
    got = [a * sqrt(max(ps - p, 0.0)) for a, (p, _) in zip(areas, demands)]
    return min(float(len(demands)), max(1.0, max(q / max(g, 1e-9) for (_, q), g in zip(demands, got))))

def run(dp_ref, n=300):
    pen, dig = [], []
    for s in pc.SEEDS:
        for i in range(n):
            c, *_ = pc.one(random.Random(s * 7919 + i))
            t0 = sum(p.seconds for p in c)
            t1 = 0.0
            for p in c:
                f = slowdown([(a.pressure, a.flow) for a in p.actuators], pc.Q_PUMP, dp_ref)
                t1 += p.seconds * f
                if len(p.actuators) > 1:
                    dig.append(f)
            pen.append(100 * (t1 / t0 - 1))
    return pen, dig

if __name__ == "__main__":
    for dp_ref in (5.0, 10.0, 14.0, 25.0, 35.0):
        pen, dig = run(dp_ref)
        srt = sorted(pen)
        print(f"dp_ref {dp_ref} bar: penalty % median {statistics.median(pen):.2f}, p95 {srt[int(.95*len(srt))]:.2f}; "
              f"dig factor median {statistics.median(dig):.3f}; at stall bound {100*sum(x>=2.0 for x in dig)/len(dig):.1f}%")
