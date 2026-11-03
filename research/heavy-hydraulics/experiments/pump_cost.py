"""Milestone 3l: what does the larger open-centre pump cost in fuel and parts against the time it saves?

Reuses 3k's cycles and rated-sizing slowdown (PVG 32 spools, drop at 1.0 x rated). Per pump scale s:
  time/cycle  = stretched work seconds + idle seconds (idle from the unstretched cycle and load factor 0.346, as 3i)
  energy/cycle = cycle_energy(open_centre, pump_flow = s Q) on the stretched cycle + neutral flow s Q p_n(sQ) over the idle time
Parts: the one listed gear-pump price in payback.py (28 cc, ~44.8 L/min at 1,600 rpm = Q_PUMP) scaled linearly with flow
(ASSUMED; slope also swept to 3 x). Fuel: payback.py's 0.298 L/kWh and $6.28/US gal.
Per working hour of the 1.0 x machine (3600/t1 cycles): extra fuel $, pump premium / 2,000 h, hours saved per hour.
Break-even machine-hour value = (extra fuel + premium per hour) / hours saved.

    python3 experiments/pump_cost.py > experiments/pump_cost_results.txt
"""
import io, contextlib, os, random, statistics, sys
here = os.path.dirname(os.path.abspath(__file__))
sys.argv = [sys.argv[0]]
with contextlib.redirect_stdout(io.StringIO()):
    sys.path.insert(0, here)
    import physics_cycle as pc
    import rated_sizing_curve as rs
    import payback as pb
from heavy_hydraulics import cycle_energy, Phase
from heavy_hydraulics.circuits import W_PER_BAR_LPM
from idle_sensitivity import useful_power
from pvg_neutral import p_n as pvg_pn

ETA, DP_SPOOL, LF = 0.883, 6.0, 0.346
SCALES = (0.8, 1.0, 1.2, 1.5)
PUMP_USD = 113.40 * 1.30
USD_PER_L = 6.28 / pb.GAL
L_PER_KWH = pb.L_PER_KWH
HOURS_LIFE = 2000.0


def one_scale(scale, n=300):
    spool = rs.make('dp_1.0')
    q = pc.Q_PUMP * scale
    pn = pvg_pn(q)
    T, E, dropped = [], [], 0
    for s in pc.SEEDS:
        for i in range(n):
            rng = random.Random(s * 7919 + i)
            c, _, _, dpm = pc.one(rng)
            peak = max(useful_power(p) for p in c)
            t_work0 = sum(p.seconds for p in c)
            t_idle = max(0.0, sum(useful_power(p) * p.seconds for p in c) / (LF * peak) - t_work0)
            cs = tuple(Phase(p.name, p.seconds * rs.slowdown([(a.pressure, a.flow) for a in p.actuators], q, spool),
                             p.actuators) for p in c)
            try:
                e = cycle_energy(cs, "open_centre", pump_flow=q, dp_spool=DP_SPOOL, dp_ls=25.0, dp_m=dpm, eta_pump=ETA)["shaft_J"]
            except ValueError:
                dropped += 1
                continue
            e += q * pn * W_PER_BAR_LPM * t_idle / ETA
            T.append(sum(p.seconds for p in cs) + t_idle); E.append(e)
    return statistics.mean(T), statistics.mean(E), len(T), dropped, pn


if __name__ == "__main__":
    rows = {sc: one_scale(sc) for sc in SCALES}
    t1, e1 = rows[1.0][0], rows[1.0][1]
    print(f"Q_PUMP {pc.Q_PUMP} L/min; pump price {PUMP_USD:.0f} USD at 1.0 x (assumed proportional to flow); fuel {USD_PER_L:.2f} USD/L")
    for sc, (t, e, n, dr, pn) in rows.items():
        print(f"pump x{sc}: p_n {pn:.2f} bar; mean cycle time {t:.2f} s ({100*(t/t1-1):+.2f}%); mean OC shaft energy/cycle {e/1000:.2f} kJ "
              f"({100*(e/e1-1):+.2f}%); cycles kept {n}, dropped (demand > pump) {dr}")
    for sc in (1.2, 1.5):
        t, e = rows[sc][0], rows[sc][1]
        saved = (t1 - t) / t1
        fuel_h = (e - e1) / 3.6e6 * (3600 / t1) * L_PER_KWH * USD_PER_L
        for slope in (1, 3):
            prem = PUMP_USD * (sc - 1) * slope
            per_h = fuel_h + prem / HOURS_LIFE
            print(f"pump x{sc}, price slope {slope} x: time saved {100*saved:.2f}% per hour; extra fuel {fuel_h:+.3f} USD/h; "
                  f"premium {prem:.0f} USD ({prem/HOURS_LIFE:.3f} USD/h); break-even value of a machine hour {per_h/saved:.2f} USD")
