"""Milestone 3k: 3h's rated-sizing open-centre slowdown with the pump flow scaled (0.8, 1.0, 1.2, 1.5 x).
Demands unchanged. Load-sensing is charged max(1, sum q / Q) (3c). Net penalty = open-centre / load-sensing time."""
import io, contextlib, os, random, statistics, sys
here = os.path.dirname(os.path.abspath(__file__))
sys.argv = [sys.argv[0]]
with contextlib.redirect_stdout(io.StringIO()):
    sys.path.insert(0, here)
    import physics_cycle as pc
    import rated_sizing_curve as rs

SCALES = (0.8, 1.0, 1.2, 1.5)

def run(scale, n=300):
    spool = rs.make('dp_1.0')
    q = pc.Q_PUMP * scale
    gross, ls, net = [], [], []
    for s in pc.SEEDS:
        for i in range(n):
            c, *_ = pc.one(random.Random(s * 7919 + i))
            t0 = tl = to = 0.0
            for p in c:
                d = [(a.pressure, a.flow) for a in p.actuators]
                fl = max(1.0, sum(f for _, f in d) / q)
                fo = max(rs.slowdown(d, q, spool), fl)
                t0 += p.seconds; tl += p.seconds * fl; to += p.seconds * fo
            gross.append(100 * (to / t0 - 1)); ls.append(100 * (tl / t0 - 1)); net.append(100 * (to / tl - 1))
    return gross, ls, net

if __name__ == "__main__":
    print(f"Q_PUMP base {pc.Q_PUMP} L/min")
    for sc in SCALES:
        g, l, n = run(sc)
        sn = sorted(n)
        print(f"pump x{sc} ({pc.Q_PUMP*sc:.1f} L/min): OC gross median {statistics.median(g):.2f}%; LS own median {statistics.median(l):.2f}%; "
              f"NET OC over LS median {statistics.median(n):.2f}% p95 {sn[int(.95*len(sn))]:.2f}%")
