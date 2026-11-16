"""Milestone 6u: is efficiency at 150 bar enough? A shape-by-drag factorial over four gear-pump families.

The manuscript's one curve (6r, 6t) maps a fixed gear pump's index 2 (overall efficiency at 150 bar, 2100 r/min,
85 L/min of 20 bar flow) to the share of 384 excavator geometries in which a smaller fixed pump beats
load-sensing. Each family's sweep scaled its own efficiency map uniformly, so the curve cannot say whether the
pump's shape (how efficiency moves with pressure and size) or its idle drag also matter. Here they are crossed:

  shape f, idle g, index E:  moving efficiency E x eta_f(q, P) / E_f,  idle power that of family g,

for f, g in {Casappa KAPPA catalogue (6k), Danfoss SNP3 (6m, all ten sizes as 6n swept it), Marzocchi ALP3 (6o),
the bench-shaped KP30 (6q)}. The cell (f, f) is exactly family f's committed c sweep (c = E / E_f). E runs
0.74 to 0.96 in steps of 0.0025; the 50% crossing is read by linear interpolation. Synthetic shapes on the
Casappa cell: a pressure tilt (1 + t (P - 150) / 100) and a size slope (1 + k (q - 85) / 85), each 1 at the index
point, so E is unchanged; efficiency capped at 0.99. Everything else is 6k's method (S = 0.38, central setting:
PVG 32 neutral, standby 2 L/min, working speed). Predictions SH1 to SH5 are in LOG.md (6u), registered before the
sweep ran.

Usage: python gear_pump_shape.py [cache dir] > gear_pump_shape_results.txt
Needs numpy and h5py (cache shared with 5z to 6q).
"""
import contextlib
import io
import itertools
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
from measured_excavator_flow import load, CYL, Q_PUMP, COV  # noqa: E402
from measured_excavator_pump_size import Trace, KIN  # noqa: E402
from excavator_breakeven_geometry import case_curves, GRID, JOINTS, M_C, P_C  # noqa: E402
from excavator_part_stroke_eta import tables, B_C  # noqa: E402
from excavator_loss_below_x0 import LossCurves  # noqa: E402
from excavator_idle_standby import CENTRAL, READINGS, S_C, fcurve  # noqa: E402
from excavator_gear_pump import Gear, gear_powers, gear_rows  # noqa: E402
from excavator_gear_pump_danfoss import danfoss_rows  # noqa: E402
from excavator_gear_pump_marzocchi import marzocchi_rows  # noqa: E402
from excavator_gear_pump_bench import bench_rows  # noqa: E402
import digitise_danfoss_snp3 as dan  # noqa: E402
import digitise_marzocchi_alp3 as mz  # noqa: E402
with contextlib.redirect_stdout(io.StringIO()):            # gear_pump_crux prints 6n's report at import
    from gear_pump_crux import Q_REF, interp  # noqa: E402

T = 60
THRESH = 3.986                                  # 6f: tractor-standard no-load rate, L/h
E_GRID = np.round(np.arange(0.74, 0.96 + 1e-9, 0.0025), 4)
POOLED_6R = 0.8212
COMMITTED = {"casappa": 0.8284, "danfoss": 0.8309, "marzocchi": 0.8188}   # 6r's own-crossing reads (6q, 6n, 6o)
FAMS = ("casappa", "danfoss", "marzocchi", "bench")
TILTS = (-0.05, 0.05, 0.10)
SLOPES = (-0.10, 0.10)
CAP = 0.99


def families():
    return {"casappa": Gear(gear_rows()), "danfoss": Gear(danfoss_rows(), sizes=dan.SIZES),
            "marzocchi": Gear(marzocchi_rows(), sizes=mz.SIZES), "bench": Gear(bench_rows("fig11"))}


def index2(g, fam, hold=True):
    """6n's index 2: eta_t(150) per size, interpolated in 20 bar flow at Q_REF (Danfoss without SNP3 090, as 6n).

    hold (6z, LOG.md 6y Next h): outside the sizes' 20 bar flow range, hold the end size's value, as the model (Gear)
    does, instead of extrapolating the size trend. Every family that reaches Q_REF gives the same index either way;
    hold=False is 6y's registered reading (gear_pump_six.py keeps it so its results file reproduces)."""
    pairs = [(float(q), g.eta(float(q), 150.0)) for s, q in zip(g.sizes, g.qn)
             if not (fam == "danfoss" and s == dan.SIZES[-1])]
    xs, ys = [a for a, _ in pairs], [b for _, b in pairs]
    if hold and not min(xs) <= Q_REF <= max(xs):
        return ys[xs.index(max(xs))] if Q_REF > max(xs) else ys[xs.index(min(xs))]
    return interp(xs, ys, Q_REF)


def crossing(xs, ys, level=50.0):
    """First upward crossing of `level` by linear interpolation (None if the sweep never crosses)."""
    for k in range(1, len(xs)):
        if ys[k - 1] < level <= ys[k]:
            return xs[k - 1] + (level - ys[k - 1]) * (xs[k] - xs[k - 1]) / (ys[k] - ys[k - 1])
    return None


def geometry_rows(cache, gears):
    tabs = tables()
    lc = LossCurves(tabs)
    recs = load(cache)
    allq = np.concatenate([r["q"] for r in recs])
    span = np.percentile(allq, 99.9, axis=0) - np.percentile(allq, 0.1, axis=0)
    lev0 = [CYL[k][2] / span[j] for j, k in enumerate(JOINTS)]
    po = P_C + M_C
    rows = []
    fs = (1.0, 1.5, 2.0, 2.5)
    for fb, fa, fu in itertools.product(fs, repeat=3):
        lev = [lev0[0] / fb, lev0[1] / fa, lev0[2] / fu]
        for bs in (1, -1):
            for s_sw in (0.0, 0.5, 1.0):
                tr = Trace(recs, lev, KIN + (bs,), s_sw)
                r, tau, q_ls, mu, phi, r219 = case_curves(tr)
                e = lc.eta_ls(T, "anchored", tr.q, tr.w, po)
                ms = COV * (r - 1.0) * P_C
                t_ls = sum(float((np.maximum(1.0, q / Q_PUMP) * dt).sum()) for q, _, dt in tr.files)
                t_still = sum(float((~mv).sum() * dt) for _, mv, dt in tr.files)
                eo = {f: np.array([g.eta(float(q), P_C + v) for q, v in zip(GRID, ms)]) for f, g in gears.items()}
                rows.append({"key": (fb, fa, fu, bs, s_sw), "tau": tau, "s0": t_still / t_ls, "eo": eo,
                             "A": B_C * q_ls / 600.0 * po / e, "Bv": B_C * q_ls / 600.0 * (P_C + ms),
                             "pms": P_C + ms})
    return rows, lc.full[T]


def shares(rows, eta_of, idle):
    """Share (%) of geometries whose f_t,max beats THRESH, for each E on E_GRID; eta_of(row, E) -> array on GRID."""
    poc, pls = idle
    out = []
    for E in E_GRID:
        fm = np.array([fcurve({"sm": x["A"] - x["Bv"] / eta_of(x, E), "tau": x["tau"], "s0": x["s0"]},
                              poc, pls, S_C).max() for x in rows])
        out.append(float(np.mean(fm > THRESH) * 100))
    return out


def main(cache):
    gears = families()
    E = {f: index2(g, f) for f, g in gears.items()}
    out = []
    p = out.append
    p("Milestone 6u: is index 2 (efficiency at 150 bar) enough? Moving shape x idle drag, four gear-pump families")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps: Casappa KAPPA K 05 T A (6k), Danfoss SNP3 (6m), Marzocchi ALP3 (6o), "
      "Frosina, Senatore, Rigosi 2017 bench KP30 (6p, 6q))")
    p("")
    p("Family shapes at 2100 r/min (index 2 = eta_t(150 bar) at 85 L/min of 20 bar flow):")
    p("  family     index 2  eta(100)/E  eta(200)/E  tilt per 100 bar  eta(q 50)/E  eta(q 150)/E  idle kW at 85 L/min")
    rows, coef = geometry_rows(cache, gears)
    idle = {f: gear_powers(g, coef, *CENTRAL) for f, g in gears.items()}
    k85 = int(round((85.0 - GRID[0]) / 0.5))
    for f, g in gears.items():
        e100, e200 = g.eta(85.0, 100.0) / E[f], g.eta(85.0, 200.0) / E[f]
        p(f"  {f:9s}  {E[f]:.4f}  {e100:10.4f}  {e200:10.4f}  {e200 - e100:+16.4f}  {g.eta(50.0, 150.0) / E[f]:11.4f}  "
          f"{g.eta(150.0, 150.0) / E[f]:12.4f}  {idle[f][0][k85]:19.2f}")
    p(f"  load-sensing standby power {idle['casappa'][1]:.2f} kW; index point: 85 L/min, 150 bar")
    pm = np.concatenate([x["pms"] for x in rows])
    p(f"  fixed-pump outlet pressure p + m* over all geometries and sizes: {pm.min():.1f} to {pm.max():.1f} bar "
      f"(median {np.median(pm):.1f}; m* is 6c's equivalent surplus pressure, so large pumps read far up the map)")
    cen = next(x for x in rows if x["key"] == (1.0, 1.0, 1.0, 1, 0.5))
    p(f"  central geometry at q_p 85 L/min: p + m* = {cen['pms'][k85]:.1f} bar")
    p("")

    norm = {f: [x["eo"][f] / E[f] for x in rows] for f in gears}
    for i, x in enumerate(rows):
        x["i"] = i
    cells = {}
    curves = {}
    for f in FAMS:
        for g in FAMS:
            sh = shares(rows, lambda x, e, f=f: np.minimum(CAP, e * norm[f][x["i"]]), idle[g])
            curves[(f, g)] = sh
            cells[(f, g)] = crossing(list(E_GRID), sh)
    p(f"50% crossing E50 of the share beating {THRESH} L/h at S = {S_C} (rows: moving shape; columns: idle drag):")
    p("  shape \\ idle  " + "  ".join(f"{g:>9s}" for g in FAMS) + "   row mean")
    for f in FAMS:
        p(f"  {f:12s}  " + "  ".join(f"{cells[(f, g)]:9.4f}" for g in FAMS) +
          f"   {np.mean([cells[(f, g)] for g in FAMS]):8.4f}")
    p("  column mean   " + "  ".join(f"{np.mean([cells[(f, g)] for f in FAMS]):9.4f}" for g in FAMS))
    rm = [np.mean([cells[(f, g)] for g in FAMS]) for f in FAMS]
    cm = [np.mean([cells[(f, g)] for f in FAMS]) for g in FAMS]
    allc = np.array(list(cells.values()))
    p(f"  shape main effect (range of row means) {max(rm) - min(rm):.4f}; drag main effect (range of column means) "
      f"{max(cm) - min(cm):.4f}; all 16 cells {allc.min():.4f} to {allc.max():.4f}, largest distance from 6r's "
      f"pooled {POOLED_6R}: {np.abs(allc - POOLED_6R).max():.4f}")
    resid = [cells[(f, g)] - rm[a] - cm[b] + np.mean(allc) for a, f in enumerate(FAMS) for b, g in enumerate(FAMS)]
    p(f"  interaction (cell minus row and column effects): largest {np.abs(resid).max():.4f}")
    ik = np.array([idle[g][0][k85] for g in FAMS])
    slope = np.polyfit(ik, cm, 1)[0]
    p(f"  column means against idle kW at 85 L/min: slope {slope:+.4f} E50 per kW (4 points)")
    p("")
    p("Check: diagonal cells against the committed crossings (6q, 6n, 6o; E step 0.0025 here):")
    for f, v in COMMITTED.items():
        p(f"  {f:9s} {cells[(f, f)]:.4f} (committed {v}; {cells[(f, f)] - v:+.4f})")
    p(f"  bench    {cells[('bench', 'bench')]:.4f} (no committed sweep; 6q's bench family sits at E {E['bench']:.4f})")
    p("")
    p("Share (%) by E, diagonal cells and the Casappa shape with each idle:")
    pick = [(f, f) for f in FAMS] + [("casappa", g) for g in FAMS if g != "casappa"]
    p("     E  " + "  ".join(f"{a[:3]}/{b[:3]}" for a, b in pick))
    for k, e in enumerate(E_GRID):
        if k % 4 == 0:
            p(f"  {e:.3f} " + "  ".join(f"{curves[c][k]:7.1f}" for c in pick))
    p("")
    base = cells[("casappa", "casappa")]
    p("Synthetic shapes on the Casappa cell (shape and idle Casappa), E unchanged at the index point:")
    syn = {}
    for t in TILTS:
        sh = shares(rows, lambda x, e, t=t: np.minimum(CAP, e * norm["casappa"][x["i"]] *
                                                        (1.0 + t * (x["pms"] - 150.0) / 100.0)), idle["casappa"])
        syn[("tilt", t)] = crossing(list(E_GRID), sh)
        p(f"  pressure tilt t {t:+.2f} per 100 bar: E50 {syn[('tilt', t)]:.4f} ({syn[('tilt', t)] - base:+.4f})")
    for k in SLOPES:
        sh = shares(rows, lambda x, e, k=k: np.minimum(CAP, e * norm["casappa"][x["i"]] *
                                                        (1.0 + k * (GRID - 85.0) / 85.0)), idle["casappa"])
        syn[("slope", k)] = crossing(list(E_GRID), sh)
        p(f"  size slope k {k:+.2f} per 85 L/min: E50 {syn[('slope', k)]:.4f} ({syn[('slope', k)] - base:+.4f})")
    p("")
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    col_c = [cells[(f, "casappa")] for f in FAMS]
    row_c = [cells[("casappa", g)] for g in FAMS]
    tmax = max(abs(syn[("tilt", t)] - base) for t in (-0.05, 0.05))
    smax = max(abs(syn[("slope", k)] - base) for k in SLOPES)
    p("Predictions (LOG.md 6u):")
    p(f"  SH1 Casappa idle, four shapes span <= 0.010: {ok(max(col_c) - min(col_c) <= 0.010)} "
      f"({max(col_c) - min(col_c):.4f})")
    p(f"  SH2 Casappa shape, four idles span >= 0.010: {ok(max(row_c) - min(row_c) >= 0.010)} "
      f"({max(row_c) - min(row_c):.4f})")
    p(f"  SH3 all 16 cells within 0.015 of {POOLED_6R}: {ok(np.abs(allc - POOLED_6R).max() <= 0.015)} "
      f"({np.abs(allc - POOLED_6R).max():.4f})")
    p(f"  SH4 tilts +-0.05 move E50 by <= 0.005: {ok(tmax <= 0.005)} ({tmax:.4f})")
    p(f"  SH5 size slopes +-0.10 move E50 by <= 0.010: {ok(smax <= 0.010)} ({smax:.4f})")
    p("")
    p("Sources: fuxi-robot/excavator-motion (CC BY-NC-SA 4.0; derived statistics only); Kauranne 2022 Fig. 13 "
      "(CC BY 4.0); Casappa KAPPA K 05 T A (2012); Danfoss SNP3 technical information; Marzocchi Pompe SERIE ALP "
      "catalogue; Frosina, Senatore, Rigosi 2017, doi:10.3390/en10081113 (CC BY 4.0); PVG 32 neutral curve; "
      "Moore 2020 (idle share).")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
