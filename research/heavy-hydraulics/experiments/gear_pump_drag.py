"""Milestone 6v: how much is a kilowatt of idle drag worth? A continuous drag sweep on four measured shapes.

6u crossed four gear-pump moving shapes with four idle drags and found drag moves the 50% crossing E50 more than
shape. Here the idle-power curve of the Casappa family (over size) is multiplied by d in {0, 0.25, ..., 2} and
paired with each of the four moving shapes (Casappa catalogue, Danfoss SNP3, Marzocchi ALP3, bench KP30), E swept
0.70 to 0.96 in steps of 0.0025 at S = 0.38 and the central setting over 6k's 384 geometries. Per shape, E50 is
fitted linearly in idle kW at 85 L/min. The two-number rule, calibrated on the Casappa shape alone,
E50(kW) = E50(Casappa, d = 1) + b (kW - kW_Casappa), is scored on 6u's 16 measured cells against the one-number
rule (every cell 0.8212). Predictions DR1 to DR5 are in LOG.md (6v), registered before the sweep ran.

Usage: python gear_pump_drag.py [cache dir] > gear_pump_drag_results.txt
Needs numpy and h5py (cache shared with 5z to 6u).
"""
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gear_pump_shape as gs  # noqa: E402
from excavator_gear_pump import gear_powers  # noqa: E402
from excavator_idle_standby import CENTRAL, S_C  # noqa: E402
from excavator_breakeven_geometry import GRID  # noqa: E402

DS = (0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0)
E_GRID = np.round(np.arange(0.70, 0.96 + 1e-9, 0.0025), 4)
FAMS = gs.FAMS
Q85 = 85.0


def shape_cells(path=os.path.join(HERE, "gear_pump_shape_results.txt")):
    """6u's 16 committed cells {(shape, idle): E50}."""
    text = open(path).read().splitlines()
    i = next(k for k, l in enumerate(text) if l.strip().startswith("shape \\ idle"))
    out = {}
    for l in text[i + 1:i + 5]:
        f = l.split()
        for g, v in zip(FAMS, f[1:5]):
            out[(f[0], g)] = float(v)
    return out


def main(cache):
    gs.E_GRID = E_GRID                                   # wider sweep: d = 0 crosses lower than 0.74
    gears = gs.families()
    E = {f: gs.index2(g, f) for f, g in gears.items()}
    rows, coef = gs.geometry_rows(cache, gears)
    idle = {f: gear_powers(g, coef, *CENTRAL) for f, g in gears.items()}
    k85 = int(round((Q85 - GRID[0]) / 0.5))
    kw = {f: float(idle[f][0][k85]) for f in FAMS}
    for i, x in enumerate(rows):
        x["i"] = i
    norm = {f: [x["eo"][f] / E[f] for x in rows] for f in FAMS}
    poc_c, pls = idle["casappa"]
    out = []
    p = out.append
    p("Milestone 6v: E50 against idle drag, Casappa idle-power curve scaled by d, four moving shapes")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps as 6u)")
    p("")
    p(f"Idle kW at 85 L/min by family (6u): " + ", ".join(f"{f} {kw[f]:.2f}" for f in FAMS) +
      f"; load-sensing standby {pls:.2f} kW")
    p(f"Equivalent drag pressure: kW x 600 / {Q85:.0f} = {600 / Q85:.3f} bar per kW")
    p("")
    cells = {}
    for f in FAMS:
        for d in DS:
            sh = gs.shares(rows, lambda x, e, f=f: np.minimum(gs.CAP, e * norm[f][x["i"]]), (d * poc_c, pls))
            cells[(f, d)] = gs.crossing(list(E_GRID), sh)
    p(f"50% crossing E50 at S = {S_C} (rows: moving shape; columns: d, with idle kW at 85 L/min below):")
    p("  shape \\ d    " + "  ".join(f"{d:7.2f}" for d in DS))
    p("  idle kW      " + "  ".join(f"{d * kw['casappa']:7.2f}" for d in DS))
    fits = {}
    for f in FAMS:
        p(f"  {f:11s}  " + "  ".join(f"{cells[(f, d)]:7.4f}" for d in DS))
    p("")
    p("Linear fit E50 = a + b kW per shape:")
    p("  shape        a        b per kW   b per bar drag   largest residual   residual pattern (d order)")
    for f in FAMS:
        x = np.array([d * kw["casappa"] for d in DS])
        y = np.array([cells[(f, d)] for d in DS])
        b, a = np.polyfit(x, y, 1)
        r = y - (a + b * x)
        fits[f] = (a, b, float(np.abs(r).max()))
        p(f"  {f:11s}  {a:.4f}  {b:+.5f}   {b / (600 / Q85):+.6f}        {np.abs(r).max():.4f}           " +
          " ".join(f"{v:+.4f}" for v in r))
    bs = [fits[f][1] for f in FAMS]
    p(f"  slopes span {max(bs) - min(bs):.5f} per kW; Casappa slope rounded {fits['casappa'][1]:.4f} per kW, "
      f"{fits['casappa'][1] / (600 / Q85):.4f} per bar of equivalent drag pressure")
    p("")
    m = shape_cells()
    e1 = cells[("casappa", 1.0)]
    bc = fits["casappa"][1]
    p(f"Two-number rule (Casappa shape only): E50 = {e1:.4f} + {bc:.5f} (kW - {kw['casappa']:.2f}); "
      f"one-number rule: E50 = {gs.POOLED_6R}")
    p("  cell (shape/idle)       6u E50   two-number  error    one-number  error")
    e2, e1s = [], []
    for (f, g), v in m.items():
        pr = e1 + bc * (kw[g] - kw["casappa"])
        e2.append(pr - v)
        e1s.append(gs.POOLED_6R - v)
        p(f"  {f + '/' + g:22s}  {v:.4f}   {pr:.4f}     {pr - v:+.4f}   {gs.POOLED_6R:.4f}      {gs.POOLED_6R - v:+.4f}")
    r2 = float(np.sqrt(np.mean(np.square(e2))))
    r1 = float(np.sqrt(np.mean(np.square(e1s))))
    p(f"  RMS error: two-number {r2:.4f}, one-number {r1:.4f}")
    # the same rule with the shape's own intercept (a builder who knows the shape): reported, not predicted
    e3 = [cells[(f, 1.0)] + fits[f][1] * (kw[g] - kw["casappa"]) - v for (f, g), v in m.items()]
    p(f"  (diagnostic, not predicted: each shape's own d = 1 crossing and slope: RMS {np.sqrt(np.mean(np.square(e3))):.4f})")
    p("")
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    p("Predictions (LOG.md 6v):")
    p(f"  DR1 Casappa shape linear in kW, largest residual <= 0.002: {ok(fits['casappa'][2] <= 0.002)} "
      f"({fits['casappa'][2]:.4f})")
    p(f"  DR2 b_Casappa in 0.012 to 0.022 per kW: {ok(0.012 <= bc <= 0.022)} ({bc:.5f})")
    p(f"  DR3 four slopes span <= 0.004 per kW: {ok(max(bs) - min(bs) <= 0.004)} ({max(bs) - min(bs):.5f})")
    p(f"  DR4 two-number RMS <= 0.006 and below one-number: {ok(r2 <= 0.006 and r2 < r1)} ({r2:.4f} vs {r1:.4f})")
    p(f"  DR5 zero drag, Casappa shape, E50 >= 0.75: {ok(cells[('casappa', 0.0)] >= 0.75)} "
      f"({cells[('casappa', 0.0)]:.4f})")
    p("")
    p("Sources: as gear_pump_shape.py (6u).")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
