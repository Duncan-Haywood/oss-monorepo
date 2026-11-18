"""Milestone 5s: the programme's grid break-evens (2n, 5p, 5q) recomputed in closed form.

For each of the same 3,000 force-model cycles as 2n/5p/5q (same seeds, same random draws in the same
order), `heavy_hydraulics.breakeven.breakeven_margin` gives the exact margin m*_c at which that cycle's
LS and open-centre energies are equal, and splits it into surplus flow (S), open-centre spool drop (D)
and idle bleed net of LS idle work (I). The median of m*_c is the margin at which the median LS/OC is
1; the grid answers it is checked against are copied from the results files of 5p and 5q.
Predictions B1 to B5 were written in LOG.md (5s) before this script existed. Stdlib, seeded.

    python3 experiments/breakeven_closed_form.py   (writes breakeven_closed_form_results.txt)
"""
import os
import random
import statistics

import spool_floor_synthetic as sf
import spool_function_sizing as fs
from spool_floor_synthetic import pc, useful_power, LF, QSB, PN
from heavy_hydraulics.spool_floor import size_spool, floor_drop, oc_pressure
from heavy_hydraulics.breakeven import breakeven_margin, median_breakeven, share_ls_worse

here = os.path.dirname(os.path.abspath(__file__))

# Grid answers as printed in spool_floor_synthetic_results.txt (5p) and spool_function_sizing_results.txt (5q):
# label -> (break-even bar, LS worse % at 14 bar, LS worse % at 25 bar); None where not printed.
GRID = {
    "constant 6 bar (2n)": (28.0, 0.8, 33.6),
    "5p floor, orifice, per-phase sizing": (26.5, 1.6, 41.7),
    "5p floor, power law, per-phase sizing": (27.2, 1.3, 38.3),
    "5p floor, orifice, one size up": (22.6, 8.6, 61.7),
    "5q per function, envelope, orifice": (23.0, 5.3, 60.6),
    "5q per function, per cycle, orifice": (25.6, None, None),
}
CONST_GRID = {0: 20.6, 1: 21.8, 2: 23.0, 3: 24.3, 4: 25.5, 5: 26.7, 6: 28.0, 8: 30.5}


def phase_pressures(c, setting):
    """Open-centre pump pressure in each moving phase under one of the programme's spool models."""
    if isinstance(setting, (int, float)):
        return [max(a.pressure for a in ph.actuators) + float(setting) for ph in c]
    kind, *args = setting
    out = []
    for ph in c:
        one = (ph,)
        if kind == "5p":
            e, _ = sf.oc_work(one, tuple(args))
            out.append(e / (pc.Q_PUMP * sf.W_PER_BAR_LPM * ph.seconds))
        else:
            rule, law = args
            qd = fs.design_flows(c, rule)
            out.append(oc_pressure([(a.pressure, floor_drop(a.flow, size_spool(qd[f], sf.TABLE), law))
                                    for f, a in zip(fs.FUNCS[ph.name], ph.actuators)]))
    # same open-centre moving energy as the script the grid answer came from
    e = sum(pc.Q_PUMP * x * sf.W_PER_BAR_LPM * ph.seconds for x, ph in zip(out, c))
    ref = sf.oc_work(c, tuple(args))[0] if kind == "5p" else fs.oc_work(c, *args)[0]
    assert abs(e - ref) <= 1e-9 * ref
    return out


def cycles():
    """Yield (cycle, t_idle, p_idle, q_idle) exactly as spool_floor_synthetic.ratio draws them."""
    for s in pc.SEEDS:
        for i in range(600):
            rng = random.Random(s * 7919 + i)
            c, _, _, _ = pc.one(rng)
            peak = max(useful_power(p) for p in c)
            t_idle = max(0.0, sum(useful_power(p) * p.seconds for p in c) / (LF * peak) - sum(p.seconds for p in c))
            p_i, q_i = rng.uniform(10, 25), rng.uniform(2, 8)
            yield c, t_idle, p_i, q_i


CYCLES = list(cycles())


def run(setting):
    rs = []
    for c, t_idle, p_i, q_i in CYCLES:
        rs.append(breakeven_margin(c, pc.Q_PUMP, oc_pressures=phase_pressures(c, setting), p_neutral=PN,
                                   t_idle=t_idle, q_idle=q_i, p_idle=p_i, q_standby=QSB))
    return rs


def pct(xs, f):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(f * len(xs)))]


def main():
    out = []
    p = out.append
    p(f"pump {pc.Q_PUMP:g} L/min; p_n {PN:.2f} bar; load factor {LF}; LS standby {QSB:g} L/min; "
      f"{len(CYCLES)} cycles, the same as 2n, 5p and 5q")
    settings = {
        "constant 6 bar (2n)": 6.0,
        "5p floor, orifice, per-phase sizing": ("5p", "orifice", 0),
        "5p floor, power law, per-phase sizing": ("5p", "power", 0),
        "5p floor, orifice, one size up": ("5p", "orifice", 1),
        "5q per function, envelope, orifice": ("5q", "envelope", "orifice"),
        "5q per function, per cycle, orifice": ("5q", "cycle", "orifice"),
    }
    b1_err, b2_err = [], []
    p("")
    p("setting: closed-form median m* (grid) | LS worse % at 14 and 25 bar, closed form (grid)")
    for label, st in settings.items():
        ms = [r["m"] for r in run(st)]
        m0 = median_breakeven(ms)
        g = GRID[label]
        b1_err.append(abs(m0 - g[0]))
        w14, w25 = share_ls_worse(ms, 14.0), share_ls_worse(ms, 25.0)
        txt = f"  {label}: {m0:.2f} ({g[0]:.1f}) | {w14:.1f} ({g[1]}) {w25:.1f} ({g[2]})"
        if g[1] is not None:
            b2_err += [abs(w14 - g[1]), abs(w25 - g[2])]
        p(txt)
    p("")
    p("constant open-centre drop d while moving: closed-form median m* (5q grid); m* 5-95%; "
      "median per-cycle slope Q T_move / B")
    meds, rows0 = {}, None
    for d, g in CONST_GRID.items():
        rs = run(float(d))
        ms = [r["m"] for r in rs]
        meds[d] = median_breakeven(ms)
        b1_err.append(abs(meds[d] - g))
        p(f"  d {d}: {meds[d]:.2f} ({g:.1f}); 5-95% {pct(ms, .05):.1f} to {pct(ms, .95):.1f}; "
          f"slope {statistics.median(r['dm_ddrop'] for r in rs):.3f}")
        if d == 0:
            rows0 = rs
    slope_med = (meds[8] - meds[0]) / 8
    slope_cyc = statistics.median(r["dm_ddrop"] for r in rows0)
    p(f"  slope of the median m* over d 0 to 8: {slope_med:.3f} bar per bar; "
      f"median per-cycle slope {slope_cyc:.3f}; median per-cycle dm*/dp_n {statistics.median(r['dm_dpn'] for r in rows0):.3f}")
    p("")
    p("decomposition at d = 0 (bar of m*, each term divided by B): median and 5-95%")
    for k, name in (("S", "surplus flow at load pressure"), ("I", "idle bleed net of LS idle work")):
        xs = [r[k] / r["B"] for r in rows0]
        p(f"  {name}: median {statistics.median(xs):.2f} bar ({pct(xs, .05):.2f} to {pct(xs, .95):.2f})")
    share_i = [r["I"] / (r["S"] + r["D"] + r["I"]) for r in rows0]
    p(f"  idle share of m*: median {statistics.median(share_i):.3f} ({pct(share_i, .05):.3f} to {pct(share_i, .95):.3f})")
    ms0 = [r["m"] for r in rows0]
    spread = pct(ms0, .95) - pct(ms0, .05)
    p(f"  median cycle (by m*): m* {statistics.median(ms0):.2f} bar")
    p("")
    p(f"B1 {'HOLDS' if max(b1_err) <= 0.15 else 'REFUTED'} (every closed-form median within 0.15 bar of the grid: "
      f"largest gap {max(b1_err):.3f})")
    p(f"B2 {'HOLDS' if max(b2_err) <= 0.1 else 'REFUTED'} (LS-worse shares within 0.1 points: largest gap {max(b2_err):.2f})")
    p(f"B3 {'HOLDS' if statistics.median(share_i) > 0.5 else 'REFUTED'} (median idle share > 0.5: "
      f"{statistics.median(share_i):.3f})")
    p(f"B4 {'HOLDS' if abs(slope_cyc - 1.24) <= 0.05 else 'REFUTED'} (median per-cycle slope within 0.05 of 1.24: "
      f"{slope_cyc:.3f})")
    p(f"B5 {'HOLDS' if spread > 12 else 'REFUTED'} (5-95% range of m* at d 0 wider than 12 bar: {spread:.1f})")
    return "\n".join(out)


if __name__ == "__main__":
    text = main()
    print(text)
    with open(os.path.join(here, "breakeven_closed_form_results.txt"), "w") as fh:
        fh.write(text + "\n")
