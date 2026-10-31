"""Milestone 3h: 3g with each spool's own drop at rated flow, digitised from the PVG 32 manual p. 99
(experiments/data/pvg32_dp_at_rated.csv) instead of one swept dp_ref. Area = Q_rated / sqrt(dp_rated),
using the dp read at 1.0 x rated, and as sensitivity the dp read at 0.8 x and 1.2 x rated (a +-20%
change of the flow at which the rating is taken). Everything else as rated_sizing.py (same cycles)."""
import csv, io, contextlib, os, random, statistics, sys
from math import sqrt
here = os.path.dirname(os.path.abspath(__file__))
sys.argv = [sys.argv[0]]
with contextlib.redirect_stdout(io.StringIO()):
    sys.path.insert(0, here)
    import physics_cycle as pc
from heavy_hydraulics.flow_share import _bisect

ROWS = list(csv.DictReader(open(os.path.join(here, 'data', 'pvg32_dp_at_rated.csv'))))

def make(col):
    sp = [(float(r['rated_lpm']), float(r[col])) for r in ROWS]
    def spool(q):
        return next((s for s in sp if s[0] >= q), sp[-1])
    return spool

def slowdown(demands, q_pump, spool, p_relief=250.0):
    if len(demands) < 2:
        return 1.0
    areas = [spool(q)[0] / sqrt(spool(q)[1]) for _, q in demands]
    f = lambda ps: sum(a * sqrt(max(ps - p, 0.0)) for a, (p, _) in zip(areas, demands)) - q_pump
    ps = _bisect(f, 1e-6, p_relief)
    got = [a * sqrt(max(ps - p, 0.0)) for a, (p, _) in zip(areas, demands)]
    return min(float(len(demands)), max(1.0, max(q / max(g, 1e-9) for (_, q), g in zip(demands, got))))

def run(col, n=300):
    spool = make(col)
    pen, dig = [], []
    for s in pc.SEEDS:
        for i in range(n):
            c, *_ = pc.one(random.Random(s * 7919 + i))
            t0 = sum(p.seconds for p in c)
            t1 = 0.0
            for p in c:
                f = slowdown([(a.pressure, a.flow) for a in p.actuators], pc.Q_PUMP, spool)
                t1 += p.seconds * f
                if len(p.actuators) > 1:
                    dig.append(f)
            pen.append(100 * (t1 / t0 - 1))
    return pen, dig

if __name__ == "__main__":
    for col, lab in (('dp_1.0', 'dp read at 1.0 x rated'), ('dp_0.8', 'dp read at 0.8 x rated'), ('dp_1.2', 'dp read at 1.2 x rated')):
        pen, dig = run(col)
        srt = sorted(pen)
        print(f"{lab}: penalty % median {statistics.median(pen):.2f}, p95 {srt[int(.95*len(srt))]:.2f}; "
              f"dig factor median {statistics.median(dig):.3f}; at stall bound {100*sum(x>=2.0 for x in dig)/len(dig):.1f}%")
