"""Milestone 3m: 3i's break-even dp_ls with the open-centre pump scaled (1.0, 1.1, 1.2, 1.5 x Q_PUMP).

The larger pump removes the open-centre starvation slowdown (3k) but delivers more flow at the highest
load pressure in every phase and bypasses more at neutral. Load-sensing is unchanged (it draws demand,
not pump flow). Everything else is 3i: rated-sizing spools (dp at 1.0 x rated), load factor 0.346,
LS standby 2 L/min, open-centre charged full pump power for stretched seconds, neutral drop from the
PVG 32 curve at the scaled pump flow.

    python3 experiments/pump_size_energy.py > experiments/pump_size_energy_results.txt
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
DPLS = tuple(range(10, 62, 2))
SCALES = (1.0, 1.1, 1.2, 1.5)


def ratios(scale, dp_ls, n_per_seed=300):
    spool = rs.make('dp_1.0')
    qp = pc.Q_PUMP * scale
    pn = pvg_pn(qp)
    out, pen = [], []
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
            pen.append(100 * (sum(p.seconds for p in cs) / sum(p.seconds for p in c) - 1))
            oc = cycle_energy(cs, "open_centre", pump_flow=qp, **kw)["shaft_J"] + qp * pn * W_PER_BAR_LPM * t_idle / ETA
            ls = cycle_energy(c, "load_sensing", pump_flow=pc.Q_PUMP, **kw)["shaft_J"] + (q_i * (p_i + dp_ls) + QSB * dp_ls) * W_PER_BAR_LPM * t_idle / ETA
            out.append(ls / oc)
    return statistics.median(out), statistics.median(pen)


if __name__ == "__main__":
    print(f"Q_PUMP base {pc.Q_PUMP} L/min; rated sizing at 1.0 x; load factor {LF}; LS standby {QSB} L/min; 1,500 cycles per cell")
    for sc in SCALES:
        rows = [ratios(sc, float(d)) for d in DPLS]
        ys = [r[0] for r in rows]
        at = {d: ys[DPLS.index(d)] for d in (14, 20, 26)}
        x = crossing(DPLS, ys)
        print(f"pump x{sc} ({pc.Q_PUMP*sc:.1f} L/min, p_n {pvg_pn(pc.Q_PUMP*sc):.2f} bar): median OC time penalty {rows[0][1]:.2f}%; "
              f"break-even dp_ls {x if x is None else round(x,1)} bar; LS/OC at 14 bar {at[14]:.3f}, 20 bar {at[20]:.3f}, 26 bar {at[26]:.3f}")
