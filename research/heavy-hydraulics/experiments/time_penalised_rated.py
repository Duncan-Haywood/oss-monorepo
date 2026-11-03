"""Milestone 3i: 3f's time-penalised break-even with phases stretched by the rated-sizing slowdown of 3h
(spool sizes and drops digitised from the PVG 32 manual p. 99) instead of the closing-law factor k.

    python3 experiments/time_penalised_rated.py > experiments/time_penalised_rated_results.txt
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
P_N = pvg_pn(pc.Q_PUMP)
DPLS = tuple(range(10, 42, 2))


def stretched(cycle, spool):
    return tuple(Phase(p.name, p.seconds * rs.slowdown([(a.pressure, a.flow) for a in p.actuators], pc.Q_PUMP, spool),
                       p.actuators) for p in cycle)


def ratios(col, dp_ls, n_per_seed=300):
    spool = None if col is None else rs.make(col)
    out, pen = [], []
    for s in pc.SEEDS:
        for i in range(n_per_seed):
            rng = random.Random(s * 7919 + i)
            c, _, _, dpm = pc.one(rng)
            peak = max(useful_power(p) for p in c)
            t_idle = max(0.0, sum(useful_power(p) * p.seconds for p in c) / (LF * peak) - sum(p.seconds for p in c))
            p_i, q_i = rng.uniform(10, 25), rng.uniform(2, 8)
            kw = dict(pump_flow=pc.Q_PUMP, dp_spool=DP_SPOOL, dp_ls=dp_ls, dp_m=dpm, eta_pump=ETA)
            cs = c if spool is None else stretched(c, spool)
            pen.append(100 * (sum(p.seconds for p in cs) / sum(p.seconds for p in c) - 1))
            oc = cycle_energy(cs, "open_centre", **kw)["shaft_J"] + pc.Q_PUMP * P_N * W_PER_BAR_LPM * t_idle / ETA
            ls = cycle_energy(c, "load_sensing", **kw)["shaft_J"] + (q_i * (p_i + dp_ls) + QSB * dp_ls) * W_PER_BAR_LPM * t_idle / ETA
            out.append(ls / oc)
    return statistics.median(out), statistics.median(pen)


if __name__ == "__main__":
    print(f"p_n {P_N:.2f} bar; load factor {LF}; LS standby {QSB} L/min; 1,500 cycles per cell; OC charged full pump power for stretched seconds")
    for col, lab in ((None, "no time penalty (2n)"), ("dp_1.0", "rated sizing, dp at 1.0 x rated"),
                     ("dp_0.8", "dp at 0.8 x rated"), ("dp_1.2", "dp at 1.2 x rated")):
        rows = [ratios(col, float(d)) for d in DPLS]
        ys = [r[0] for r in rows]
        at = {d: ys[DPLS.index(d)] for d in (14, 20, 26)}
        print(f"{lab}: median time penalty {rows[0][1]:.2f}%; break-even dp_ls {crossing(DPLS, ys):.1f} bar; "
              f"LS/OC at 14 bar {at[14]:.3f}, 20 bar {at[20]:.3f}, 26 bar {at[26]:.3f}")
