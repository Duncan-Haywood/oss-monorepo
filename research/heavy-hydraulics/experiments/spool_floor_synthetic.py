"""Milestone 5p (synthetic part): 2n's break-even with the open-centre spool drop set to the PVG 32
full-travel floor instead of the constant 6 bar of Juza and Hermanek's (different) open-centre block.

Same cycles, idle model and neutral drop as 2n (`pvg_neutral.py`: load factor 0.346, LS standby 2 L/min,
p_n 10.91 bar from the PVG 32 neutral curve at 45 L/min, eta 0.883, dp_m swept as 2d). While a phase
moves, the open-centre pump delivers its full 45 L/min at max_i (p_i + dp_floor_i(q_i)), where each
actuator gets the smallest PVG 32 spool covering its demand (3g's rule, or one size up) and
dp_floor is the least drop at which that spool, fully open, passes q (`heavy_hydraulics.spool_floor`).
It is the best any PVG 32 open-centre section could do, so it favours open-centre. No time penalty (3h/3i).
Predictions S1 to S3 were written in LOG.md (5p) before this ran. Stdlib, seeded, under a minute.

    python3 experiments/spool_floor_synthetic.py   (writes spool_floor_synthetic_results.txt)
"""
import contextlib
import io
import os
import random
import statistics
import sys

here = os.path.dirname(os.path.abspath(__file__))
sys.argv = [sys.argv[0]]
with contextlib.redirect_stdout(io.StringIO()):
    sys.path.insert(0, here)
    sys.path.insert(0, os.path.join(here, "..", "src"))
    import physics_cycle as pc
from heavy_hydraulics import cycle_energy
from heavy_hydraulics.circuits import W_PER_BAR_LPM
from heavy_hydraulics.spool_floor import read_table, size_spool, floor_drop, oc_pressure
from idle_sensitivity import useful_power
from pvg_neutral import p_n as pvg_pn
from ranking_map import crossing

ETA, LF, QSB = 0.883, 0.346, 2.0
DPLS = tuple(range(10, 42, 2))
TABLE = read_table(os.path.join(here, "data", "pvg32_flow_full_travel.csv"))
PN = pvg_pn(pc.Q_PUMP)


def oc_work(c, spool):
    """Open-centre hydraulic energy of the moving phases, J (before eta), and the
    energy-weighted extra drop. spool: None for a constant 6 bar, else (law, step_up)."""
    e, wd = 0.0, 0.0
    for ph in c:
        if spool is None:
            p = max(a.pressure for a in ph.actuators) + 6.0
        else:
            law, up = spool
            p = oc_pressure([(a.pressure, floor_drop(a.flow, size_spool(a.flow, TABLE, up), law))
                             for a in ph.actuators])
        h = pc.Q_PUMP * p * W_PER_BAR_LPM * ph.seconds
        e += h
        wd += h * (p - max(a.pressure for a in ph.actuators))
    return e, wd


def ratio(dp_ls, spool, n_per_seed=600):
    """LS/OC shaft energy as idle_models.ratio with 2n's neutral drop; returns
    (median, 5%, 95%, % LS worse, energy-weighted mean extra OC drop in bar)."""
    out, num, den = [], 0.0, 0.0
    for s in pc.SEEDS:
        for i in range(n_per_seed):
            rng = random.Random(s * 7919 + i)
            c, _, _, dpm = pc.one(rng)
            peak = max(useful_power(p) for p in c)
            t_idle = max(0.0, sum(useful_power(p) * p.seconds for p in c) / (LF * peak) - sum(p.seconds for p in c))
            p_i, q_i = rng.uniform(10, 25), rng.uniform(2, 8)
            ls = cycle_energy(c, "load_sensing", pump_flow=pc.Q_PUMP, dp_ls=dp_ls, dp_m=dpm, eta_pump=ETA)["shaft_J"]
            h, wd = oc_work(c, spool)
            oc = h / ETA + pc.Q_PUMP * PN * W_PER_BAR_LPM * t_idle / ETA
            ls += (q_i * (p_i + dp_ls) + QSB * dp_ls) * W_PER_BAR_LPM * t_idle / ETA
            out.append(ls / oc)
            num, den = num + wd, den + h
    q = lambda f: sorted(out)[min(len(out) - 1, int(f * len(out)))]  # noqa: E731
    return statistics.median(out), q(.05), q(.95), 100 * sum(x > 1 for x in out) / len(out), num / den


def check_constant():
    """The constant-6-bar path must reproduce cycle_energy's open-centre rung."""
    c, *_ = pc.one(random.Random(7919))
    h, _ = oc_work(c, None)
    ref = cycle_energy(c, "open_centre", pump_flow=pc.Q_PUMP, dp_spool=6.0, eta_pump=1.0)["shaft_J"]
    assert abs(h - ref) <= 1e-9 * ref


def main():
    check_constant()
    out = []
    p = out.append
    p(f"pump {pc.Q_PUMP:g} L/min; p_n {PN:.2f} bar (PVG 32 neutral, 2n); load factor {LF}; LS standby {QSB:g} L/min; "
      f"eta {ETA}; 3,000 cycles per cell; same cycles as 2n")
    p("check: constant-6-bar path equals cycle_energy's open-centre rung")
    # per-actuator view of the floor drop on the cycles (orifice law, 3g sizing)
    drops, sizes = [], {}
    for s in pc.SEEDS:
        for i in range(600):
            c, *_ = pc.one(random.Random(s * 7919 + i))
            for ph in c:
                for a in ph.actuators:
                    row = size_spool(a.flow, TABLE)
                    sizes[row["spool"]] = sizes.get(row["spool"], 0) + 1
                    drops.append(floor_drop(a.flow, row))
    drops.sort()
    p(f"actuator floor drops (orifice, 3g sizing): median {statistics.median(drops):.2f} bar, "
      f"5-95% {drops[int(.05*len(drops))]:.2f} to {drops[int(.95*len(drops))]:.2f}; spools used "
      + ", ".join(f"{k} {v}" for k, v in sorted(sizes.items())))
    rows = [("constant 6 bar (2n)", None), ("floor, orifice, 3g sizing", ("orifice", 0)),
            ("floor, power law, 3g sizing", ("power", 0)), ("floor, orifice, one size up", ("orifice", 1)),
            ("floor, power law, one size up", ("power", 1))]
    res = {}
    for label, sp in rows:
        ys, wds = [], []
        for d in DPLS:
            m, lo, hi, w, wd = ratio(float(d), sp)
            ys.append(m)
            wds.append(wd)
        x = crossing(DPLS, ys)
        res[label] = (x, ys, wds[0])
        p("")
        p(f"{label}: energy-weighted extra OC drop while moving {wds[0]:.2f} bar; break-even dp_ls = "
          + (f"{x:.1f} bar" if x else "none in range"))
        p("  " + " ".join(f"{d}:{y:.3f}" for d, y in zip(DPLS, ys)))
        for d in (14.0, 25.0):
            m, lo, hi, w, _ = ratio(d, sp)
            p(f"  dp_ls {d:g}: LS/OC median {m:.3f} ({lo:.3f} to {hi:.3f}); LS worse in {w:.1f}% of cycles")
    x1 = res["floor, orifice, 3g sizing"][0]
    m14 = ratio(14.0, ("orifice", 0))[0]
    wd = res["floor, orifice, 3g sizing"][2]
    p("")
    p(f"S1 {'HOLDS' if x1 is not None and 24 <= x1 <= 29 else 'REFUTED'} (break-even 24 to 29 bar: {x1:.1f})")
    p(f"S2 {'HOLDS' if m14 < 0.85 else 'REFUTED'} (LS/OC at 14 bar < 0.85: {m14:.3f})")
    p(f"S3 {'HOLDS' if 3 <= wd <= 7 else 'REFUTED'} (energy-weighted floor drop 3 to 7 bar: {wd:.2f})")
    return "\n".join(out)


if __name__ == "__main__":
    text = main()
    print(text)
    with open(os.path.join(here, "spool_floor_synthetic_results.txt"), "w") as fh:
        fh.write(text + "\n")
