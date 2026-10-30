"""Milestone 3f: fold 3d/3e's open-centre cycle-time penalty back into 2n's energy ranking.

2n ranked load-sensing (LS) against open-centre (OC) on shaft energy for the same work, ignoring that an uncompensated OC
valve can make the dig phase last longer (3a to 3e). Here each OC work phase is stretched by `phase_slowdown` (bypass closing
law k, p_n 10.91 bar from 2n) and the OC pump is charged its full-flow power for the extra seconds, an UPPER bound on the
energy cost of slowness (a stalled actuator moves slowly, so the pump would in fact sit near relief or unloaded; neither is
modelled). LS is charged nothing extra (3c: its pump-limit penalty is 0.00% on these cycles). The idle phase is as 2n (load
factor 0.346, standby 2 L/min). Reports the median LS/OC and the break-even dp_ls.

    python3 experiments/time_penalised.py > experiments/time_penalised_results.txt
"""
import io, contextlib, os, random, statistics, sys
here = os.path.dirname(__file__)
sys.argv = [sys.argv[0]]
with contextlib.redirect_stdout(io.StringIO()):
    sys.path.insert(0, here)
    import physics_cycle as pc
from heavy_hydraulics import cycle_energy, Phase
from heavy_hydraulics.circuits import W_PER_BAR_LPM
from heavy_hydraulics.flow_share import phase_slowdown
from idle_sensitivity import useful_power
from pvg_neutral import p_n as pvg_pn
from ranking_map import crossing

ETA, DP_SPOOL, LF, QSB = 0.883, 6.0, 0.346, 2.0
P_N = pvg_pn(pc.Q_PUMP)
KS = (None, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0)   # None = 2n (no time penalty)
DPLS = tuple(range(10, 42, 2))


def stretched(cycle, p_n, k):
    return tuple(Phase(p.name, p.seconds * phase_slowdown([(a.pressure, a.flow) for a in p.actuators], pc.Q_PUMP, p_n, k),
                       p.actuators) for p in cycle)


def ratios(k, dp_ls, n_per_seed=300):
    out, pen = [], []
    for s in pc.SEEDS:
        for i in range(n_per_seed):
            rng = random.Random(s * 7919 + i)
            c, _, _, dpm = pc.one(rng)
            peak = max(useful_power(p) for p in c)
            t_idle = max(0.0, sum(useful_power(p) * p.seconds for p in c) / (LF * peak) - sum(p.seconds for p in c))
            p_i, q_i = rng.uniform(10, 25), rng.uniform(2, 8)
            kw = dict(pump_flow=pc.Q_PUMP, dp_spool=DP_SPOOL, dp_ls=dp_ls, dp_m=dpm, eta_pump=ETA)
            cs = c if k is None else stretched(c, P_N, k)
            pen.append(100 * (sum(p.seconds for p in cs) / sum(p.seconds for p in c) - 1))
            oc = cycle_energy(cs, "open_centre", **kw)["shaft_J"] + pc.Q_PUMP * P_N * W_PER_BAR_LPM * t_idle / ETA
            ls = cycle_energy(c, "load_sensing", **kw)["shaft_J"] + (q_i * (p_i + dp_ls) + QSB * dp_ls) * W_PER_BAR_LPM * t_idle / ETA
            out.append(ls / oc)
    return statistics.median(out), statistics.median(pen)


if __name__ == "__main__":
    print(f"p_n {P_N:.2f} bar; load factor {LF}; LS standby {QSB} L/min; 1,500 cycles per cell; OC charged full pump power for stretched seconds")
    for k in KS:
        rs = [ratios(k, float(d)) for d in DPLS]
        ys = [r[0] for r in rs]
        x = crossing(DPLS, ys)
        at = {d: ys[DPLS.index(d)] for d in (14, 20, 26)}
        print(f"k {k}: median time penalty {rs[0][1]:.2f}%; break-even dp_ls {x:.1f} bar; LS/OC at 14 bar {at[14]:.3f}, 20 bar {at[20]:.3f}, 26 bar {at[26]:.3f}")
