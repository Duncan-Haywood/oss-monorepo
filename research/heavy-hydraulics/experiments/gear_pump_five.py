"""Milestone 6x: the five-family shape-by-drag factorial, and a leave-one-family-out test of the selection rules.

6u crossed four gear-pump moving shapes with four idle drags (16 cells), 6v turned the drag effect into a
two-number rule calibrated on the Casappa shape alone, E50 = 0.8277 + 0.0187 (kW - 3.57), and 6w confirmed it on
a fifth family (Bosch Rexroth AZPG) that no fit had seen. Here all five families are crossed (25 cells) and three
rules are fitted by least squares on the cells:

  one-number    E50 = a
  two-number    E50 = a + b kW          kW: the drag family's idle power at 85 L/min, central setting
  three-number  E50 = a + b kW + c k    k: the shape family's size slope, eta(150 L/min, 150 bar) / E - 1

Leave-one-family-out: for each family h the rules are fitted on the 16 cells with neither shape h nor drag h and
asked about the diagonal (h, h), the family as it really is, and about all 9 cells that involve h. Everything else
is 6u's method (S = 0.38, central setting, 6k's 384 geometries, E swept 0.70 to 0.96 in steps of 0.0025, crossing
by linear interpolation). Predictions FX1 to FX6 are in LOG.md (6x), registered before the sweep ran.

Usage: python gear_pump_five.py [cache dir] > gear_pump_five_results.txt
Needs numpy and h5py (cache shared with 5z to 6w).
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gear_pump_shape as gs  # noqa: E402
import gear_pump_rexroth as gr  # noqa: E402
import digitise_rexroth_azpg as rx  # noqa: E402
from excavator_gear_pump import Gear, gear_powers  # noqa: E402
from excavator_idle_standby import CENTRAL, S_C  # noqa: E402
from excavator_breakeven_geometry import GRID  # noqa: E402

E_GRID = np.round(np.arange(0.70, 0.96 + 1e-9, 0.0025), 4)
FAMS = gs.FAMS + ("rexroth",)
Q85 = 85.0
POOLED = 0.8212                               # 6r
RULE2 = (0.8277, 0.0187, 3.57)                # 6v
REXROTH_6W = 0.8040                           # 6w


def design(cells, kw, k, which):
    keys = list(cells)
    cols = [np.ones(len(keys))]
    if which >= 2:
        cols.append([kw[g] for _, g in keys])
    if which >= 3:
        cols.append([k[f] for f, _ in keys])
    return keys, np.column_stack(cols), np.array([cells[c] for c in keys])


def fit(cells, kw, k, which):
    _, X, y = design(cells, kw, k, which)
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    return beta


def predict(beta, kw_g, k_f):
    x = [1.0, kw_g, k_f][:len(beta)]
    return float(np.dot(beta, x))


def rms(v):
    return float(np.sqrt(np.mean(np.square(v))))


def main(cache):
    gs.E_GRID = E_GRID
    gears = gs.families()
    gears["rexroth"] = Gear(gr.rexroth_rows(), sizes=rx.SIZES)
    E = {f: gs.index2(g, f) for f, g in gears.items()}
    rows, coef = gs.geometry_rows(cache, gears)
    idle = {f: gear_powers(g, coef, *CENTRAL) for f, g in gears.items()}
    k85 = int(round((Q85 - GRID[0]) / 0.5))
    kw = {f: float(idle[f][0][k85]) for f in FAMS}
    ks = {f: gears[f].eta(150.0, 150.0) / E[f] - 1.0 for f in FAMS}
    for i, x in enumerate(rows):
        x["i"] = i
    norm = {f: [x["eo"][f] / E[f] for x in rows] for f in FAMS}
    cells = {}
    for f in FAMS:
        for g in FAMS:
            sh = gs.shares(rows, lambda x, e, f=f: np.minimum(gs.CAP, e * norm[f][x["i"]]), idle[g])
            cells[(f, g)] = gs.crossing(list(E_GRID), sh)

    out = []
    p = out.append
    p("Milestone 6x: five gear-pump families crossed (moving shape x idle drag), rules fitted on 25 cells and "
      "tested leave-one-family-out")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps: Casappa KAPPA K 05 T A (6k), Danfoss SNP3 (6m), Marzocchi ALP3 (6o), "
      "Frosina, Senatore, Rigosi 2017 bench KP30 (6p, 6q), Bosch Rexroth AZPG RE 10093 (6w))")
    p("")
    p("Families (index 2 = eta_t(150 bar) at 85 L/min of 20 bar flow; size slope k = eta(150 L/min)/E - 1; idle kW "
      "at 85 L/min):")
    p("  family     index 2  size slope k  idle kW")
    for f in FAMS:
        p(f"  {f:9s}  {E[f]:.4f}  {ks[f]:+12.4f}  {kw[f]:7.2f}")
    p("")
    p(f"50% crossing E50 of the share beating {gs.THRESH} L/h at S = {S_C} (rows: moving shape; columns: idle drag; "
      "E step 0.0025 from 0.70):")
    p("  shape \\ idle  " + "  ".join(f"{g:>9s}" for g in FAMS) + "   row mean")
    for f in FAMS:
        p(f"  {f:12s}  " + "  ".join(f"{cells[(f, g)]:9.4f}" for g in FAMS) +
          f"   {np.mean([cells[(f, g)] for g in FAMS]):8.4f}")
    p("  column mean   " + "  ".join(f"{np.mean([cells[(f, g)] for f in FAMS]):9.4f}" for g in FAMS))
    allc = np.array(list(cells.values()))
    rm = [np.mean([cells[(f, g)] for g in FAMS]) for f in FAMS]
    cm = [np.mean([cells[(f, g)] for f in FAMS]) for g in FAMS]
    p(f"  all 25 cells {allc.min():.4f} to {allc.max():.4f}; largest distance from 6r's pooled {POOLED}: "
      f"{np.abs(allc - POOLED).max():.4f}; shape main effect {max(rm) - min(rm):.4f}, drag main effect "
      f"{max(cm) - min(cm):.4f}")
    p("")
    import gear_pump_drag as gd
    d = [cells[c] - v for c, v in gd.shape_cells().items()]
    p(f"Check: the 16 four-family cells against 6u (grid from 0.74 there): largest difference {max(map(abs, d)):.4f}")
    gr_check = cells[("rexroth", "rexroth")]
    p(f"Check: AZPG diagonal {gr_check:.4f} (6w {REXROTH_6W}; {gr_check - REXROTH_6W:+.4f})")
    p("")

    names = {1: "one-number", 2: "two-number", 3: "three-number"}
    p("Rules fitted on all 25 cells (least squares):")
    full = {}
    for w in (1, 2, 3):
        b = fit(cells, kw, ks, w)
        full[w] = b
        res = [cells[(f, g)] - predict(b, kw[g], ks[f]) for f, g in cells]
        terms = f"a {b[0]:.4f}" + (f", b {b[1]:+.4f} per kW" if w >= 2 else "") + (f", c {b[2]:+.4f}" if w >= 3 else "")
        p(f"  {names[w]:12s} {terms}; in-sample RMS {rms(res):.4f}, worst {max(res, key=abs):+.4f}")
    b2 = full[2]
    at357 = predict(b2, RULE2[2], 0.0)
    p(f"  two-number fit at {RULE2[2]} kW: {at357:.4f} (6v's intercept {RULE2[0]}; {at357 - RULE2[0]:+.4f}); "
      f"as E50 = {at357:.4f} + {b2[1]:.4f} (kW - {RULE2[2]})")
    res6v = [cells[(f, g)] - (RULE2[0] + RULE2[1] * (kw[g] - RULE2[2])) for f, g in cells]
    p(f"  6v's committed rule on the 25 cells: RMS {rms(res6v):.4f}, worst {max(res6v, key=abs):+.4f}")
    p("")

    p("Leave-one-family-out (fit on the 16 cells with neither shape h nor drag h; error = cell minus prediction):")
    p("  held out   diagonal E50   one-number  two-number  three-number   9-cell RMS: one  two  three   "
      "two-number fit (a at 3.57 kW, b)")
    diag = {w: [] for w in (1, 2, 3)}
    nine = {w: [] for w in (1, 2, 3)}
    for h in FAMS:
        train = {c: v for c, v in cells.items() if h not in c}
        test = [c for c in cells if h in c]
        errs, n9 = {}, {}
        for w in (1, 2, 3):
            b = fit(train, kw, ks, w)
            errs[w] = cells[(h, h)] - predict(b, kw[h], ks[h])
            n9[w] = rms([cells[c] - predict(b, kw[c[1]], ks[c[0]]) for c in test])
            diag[w].append(errs[w])
            nine[w].extend(cells[c] - predict(b, kw[c[1]], ks[c[0]]) for c in test)
            if w == 2:
                bb = b
        p(f"  {h:9s}  {cells[(h, h)]:12.4f}  {errs[1]:+11.4f}  {errs[2]:+10.4f}  {errs[3]:+12.4f}   "
          f"{n9[1]:.4f} {n9[2]:.4f} {n9[3]:.4f}   {predict(bb, RULE2[2], 0.0):.4f}, {bb[1]:+.4f}")
    p("  RMS over the five held-out diagonals: " +
      ", ".join(f"{names[w]} {rms(diag[w]):.4f}" for w in (1, 2, 3)))
    p("  RMS over all 45 held-out cell predictions: " +
      ", ".join(f"{names[w]} {rms(nine[w]):.4f}" for w in (1, 2, 3)))
    p("")
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    r1, r2, r3 = rms(diag[1]), rms(diag[2]), rms(diag[3])
    p("Predictions (LOG.md 6x):")
    p(f"  FX1 25-cell slope in 0.016 to 0.021 per kW: {ok(0.016 <= b2[1] <= 0.021)} ({b2[1]:.4f})")
    p(f"  FX2 fit at 3.57 kW within 0.003 of 0.8277: {ok(abs(at357 - RULE2[0]) <= 0.003)} ({at357 - RULE2[0]:+.4f})")
    w2 = max(abs(e) for e in diag[2])
    p(f"  FX3 every held-out diagonal two-number error within 0.010: {ok(w2 <= 0.010)} (worst {w2:.4f})")
    p(f"  FX4 held-out diagonal RMS, two-number below one-number: {ok(r2 < r1)} ({r2:.4f} against {r1:.4f})")
    p(f"  FX5 three-number cuts the held-out diagonal RMS by at least 20%: {ok(r3 <= 0.8 * r2)} "
      f"({r3:.4f} against {r2:.4f}, {100 * (1 - r3 / r2):+.0f}%)")
    dmax = float(np.abs(allc - POOLED).max())
    p(f"  FX6 all 25 cells within 0.020 of {POOLED}: {ok(dmax <= 0.020)} ({dmax:.4f})")
    p("")
    p("Sources: fuxi-robot/excavator-motion (CC BY-NC-SA 4.0; derived statistics only); Kauranne 2022 Fig. 13 "
      "(CC BY 4.0); Casappa KAPPA K 05 T A (2012); Danfoss SNP3; Marzocchi ALP3; Frosina et al. 2017; Bosch Rexroth "
      "RE 10093/2019-09-27 (AZPG); PVG 32 neutral curve; Moore 2020 (idle share).")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
