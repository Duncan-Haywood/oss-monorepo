"""Milestone 3n: 3m's break-even dp_ls with a surplus-flow fraction f for open-centre.

In each work phase open-centre draws q_dem + f (Q_pump - q_dem) at the highest load pressure plus
the spool drop. f = 1 is 3m (the pessimistic full-flow bleed); f = 0 is a demand-matched open-centre
(optimistic). Everything else is 3m.

    python3 experiments/surplus_fraction.py > experiments/surplus_fraction_results.txt
"""
import io, contextlib, os, random, statistics, sys
here = os.path.dirname(os.path.abspath(__file__))
sys.argv = [sys.argv[0]]
with contextlib.redirect_stdout(io.StringIO()):
    sys.path.insert(0, here)
    import physics_cycle as pc
    import rated_sizing_curve as rs
from heavy_hydraulics import cycle_energy, Phase
from heavy_hydraulics.circuits import W_PER_BAR_LPM
from idle_sensitivity import useful_power
from pvg_neutral import p_n as pvg_pn
from ranking_map import crossing

ETA, DP_SPOOL, LF, QSB = 0.883, 6.0, 0.346, 2.0
DPLS = tuple(range(4, 62, 2))
SCALES = (1.0, 1.2)
FRACS = (1.0, 0.75, 0.5, 0.25, 0.0)


def oc_shaft(cs, qp, f, kw):
    tot = 0.0
    for ph in cs:
        qd = sum(a.flow for a in ph.actuators)
        tot += cycle_energy((ph,), "open_centre", pump_flow=qd + f * (qp - qd), **kw)["shaft_J"]
    return tot


def ratios(scale, f, dp_ls, n_per_seed=300):
    spool = rs.make('dp_1.0')
    qp = pc.Q_PUMP * scale
    pn = pvg_pn(qp)
    out = []
    for s in pc.SEEDS:
        for i in range(n_per_seed):
            rng = random.Random(s * 7919 + i)
            c, _, _, dpm = pc.one(rng)
            peak = max(useful_power(p) for p in c)
            t_idle = max(0.0, sum(useful_power(p) * p.seconds for p in c) / (LF * peak) - sum(p.seconds for p in c))
            p_i, q_i = rng.uniform(10, 25), rng.uniform(2, 8)
            kw = dict(dp_spool=DP_SPOOL, dp_ls=dp_ls, dp_m=dpm, eta_pump=ETA)
            cs = tuple(Phase(p.name, p.seconds * rs.slowdown([(a.pressure, a.flow) for a in p.actuators], qp, spool),
                             p.actuators) for p in c)
            oc = oc_shaft(cs, qp, f, kw) + qp * pn * W_PER_BAR_LPM * t_idle / ETA
            ls = cycle_energy(c, "load_sensing", pump_flow=pc.Q_PUMP, **kw)["shaft_J"] + (q_i * (p_i + dp_ls) + QSB * dp_ls) * W_PER_BAR_LPM * t_idle / ETA
            out.append(ls / oc)
    return statistics.median(out)


if __name__ == "__main__":
    print(f"Q_PUMP base {pc.Q_PUMP} L/min; rated sizing 1.0 x; load factor {LF}; LS standby {QSB} L/min; 1,500 cycles per cell")
    for sc in SCALES:
        for f in FRACS:
            ys = [ratios(sc, f, float(d)) for d in DPLS]
            x = crossing(DPLS, ys)
            at = {d: ys[DPLS.index(d)] for d in (14, 26)}
            print(f"pump x{sc} f={f}: break-even dp_ls {x if x is None else round(x,1)} bar; LS/OC at 14 bar {at[14]:.3f}, 26 bar {at[26]:.3f}")
