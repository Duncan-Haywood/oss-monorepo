"""Milestone 3c: charge load-sensing its own pump-limit slowdown, so 3a's penalty is open-centre versus load-sensing.

3a/3b gave load-sensing a factor of 1.0 "by construction". But when the actuators' demands add to more than the
pump flow, a compensated load-sensing valve also slows (flow shared in proportion, so the phase lasts
sum(q)/Q_pump longer). Per phase here: LS factor = max(1, sum q / Q_pump); open-centre factor = 3a's
`phase_slowdown` (k = 1), floored at the LS factor since an uncompensated valve cannot beat the pump limit.
The net open-centre penalty is cycle time under open-centre over cycle time under load-sensing.
Same random cycles as 3b.
"""
import io, contextlib, os, random, statistics, sys
here = os.path.dirname(__file__)
sys.argv = [sys.argv[0]]
with contextlib.redirect_stdout(io.StringIO()):
    sys.path.insert(0, here)
    import physics_cycle as pc
from heavy_hydraulics.flow_share import phase_slowdown


def ls_factor(demands, q_pump):
    return max(1.0, sum(q for _, q in demands) / q_pump)


def run(p_n, k=1.0, n=300):
    net, ls_pen, oc_pen, short = [], [], [], 0
    for s in pc.SEEDS:
        for i in range(n):
            c, *_ = pc.one(random.Random(s * 7919 + i))
            t0 = tl = to = 0.0
            for p in c:
                d = [(a.pressure, a.flow) for a in p.actuators]
                fl = ls_factor(d, pc.Q_PUMP)
                fo = max(phase_slowdown(d, pc.Q_PUMP, p_n, k), fl)
                short += fo > phase_slowdown(d, pc.Q_PUMP, p_n, k) + 1e-9
                t0 += p.seconds
                tl += p.seconds * fl
                to += p.seconds * fo
            ls_pen.append(100 * (tl / t0 - 1))
            oc_pen.append(100 * (to / t0 - 1))
            net.append(100 * (to / tl - 1))
    return net, ls_pen, oc_pen, short


if __name__ == "__main__":
    for p_n in (10.9, 1.44):
        net, ls_pen, oc_pen, short = run(p_n)
        q = lambda x, f: sorted(x)[int(f * len(x))]
        print(f"p_n {p_n}: LS own penalty median {statistics.median(ls_pen):.2f}% p95 {q(ls_pen,.95):.2f}%; "
              f"OC vs ideal-pump median {statistics.median(oc_pen):.2f}% p95 {q(oc_pen,.95):.2f}%; "
              f"NET OC over LS median {statistics.median(net):.2f}% p95 {q(net,.95):.2f}%; "
              f"cycles with LS>0.5%: {100*sum(x>0.5 for x in ls_pen)/len(ls_pen):.1f}%; floored phases {short}")
