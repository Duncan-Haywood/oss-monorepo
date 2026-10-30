"""Milestone 3b: does 3a's cycle-time penalty depend on the assumed bypass closing shape?

3a closes the centre bypass area one-for-one with the section openings (k = 1). Here k is swept
over 0.5 to 3 (k = 0 would be a bypass that never closes), at both sourced neutral drops. Same random
cycles as 3a. Only the closing law changes; the orifice model and the factor-2 stall bound do not.
"""
import io, contextlib, os, random, statistics, sys
here = os.path.dirname(__file__)
sys.argv = [sys.argv[0]]
with contextlib.redirect_stdout(io.StringIO()):
    sys.path.insert(0, here)
    import physics_cycle as pc
from heavy_hydraulics.flow_share import phase_slowdown

def run(p_n, k, n=300):
    pen, dig = [], []
    for s in pc.SEEDS:
        for i in range(n):
            c, *_ = pc.one(random.Random(s * 7919 + i))
            t0 = sum(p.seconds for p in c)
            t1 = 0.0
            for p in c:
                f = phase_slowdown([(a.pressure, a.flow) for a in p.actuators], pc.Q_PUMP, p_n, k)
                t1 += p.seconds * f
                if len(p.actuators) > 1:
                    dig.append(f)
            pen.append(100 * (t1 / t0 - 1))
    return pen, dig

KS = (0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0, 20.0)  # 5 to 20 added in 3c: bypass closed inside the dead band

if __name__ == "__main__":
    for p_n in (10.9, 1.44):
        for k in KS:
            pen, dig = run(p_n, k)
            srt = sorted(pen)
            print(f"p_n {p_n} k {k}: penalty % median {statistics.median(pen):.2f}, p95 {srt[int(.95*len(srt))]:.2f}; "
                  f"dig factor median {statistics.median(dig):.3f}; at stall bound {100*sum(x>=2.0 for x in dig)/len(dig):.1f}%")
