"""Milestone 6w: a fifth gear-pump family (Bosch Rexroth AZPG, RE 10093) as an out-of-sample test of the one-number
rule (6r: E50 = 0.8212 whatever the pump) and the two-number rule (6v: E50 = 0.8277 + 0.0187 (kW - 3.57), kW the
fixed pump's idle power at 85 L/min). No fit, index or form choice in 6k to 6v saw this family.

The family is built exactly as 6u built the other four: 6k's Gear at 2100 r/min over the digitised sizes
(data/rexroth_azpg_curves.csv, digitise_rexroth_azpg.py), index 2 = overall efficiency at 150 bar and 85 L/min of
20 bar flow, idle power from its own curves at the PVG 32 neutral pressure (6j's central setting). E sweeps 0.70 to
0.96 in steps of 0.0025 with its own moving shape and its own idle drag, over 6k's 384 geometries at S = 0.38, and
the 50% crossing E50 is read by linear interpolation. The catalogue itself (c = 1, i.e. E = its index 2) is scored
too, against 6r's pooled logistic. Two cross cells (AZPG shape with Casappa idle, Casappa shape with AZPG idle) say
whether any miss comes from shape or drag; they are diagnostics, not predictions. Check: the Casappa cell
reproduces 6u's 0.8277. Predictions RX1 to RX6 are in LOG.md (6w), registered before the catalogue was digitised.

Usage: python gear_pump_rexroth.py [cache dir] > gear_pump_rexroth_results.txt
Needs numpy and h5py (cache shared with 5z to 6v).
"""
import csv
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gear_pump_shape as gs  # noqa: E402
import digitise_rexroth_azpg as rx  # noqa: E402
from excavator_gear_pump import Gear, gear_powers, gear_rows  # noqa: E402
from excavator_idle_standby import CENTRAL, S_C  # noqa: E402
from excavator_breakeven_geometry import GRID  # noqa: E402

E_GRID = np.round(np.arange(0.70, 0.96 + 1e-9, 0.0025), 4)
Q85 = 85.0
POOLED = (0.8212, 0.0270)                 # 6r: pooled logistic E50, w (gear_pump_evidence_results.txt)
RULE2 = (0.8277, 0.01870, 3.57)           # 6v: E50(Casappa, d = 1), slope per kW, Casappa idle kW (gear_pump_drag)
CATALOGUE_RANGE = (0.759, 0.898)          # 6u: index 2 of the Casappa and Marzocchi catalogues
CASAPPA_6U = 0.8277


def rexroth_rows():
    with open(os.path.join(HERE, "data", "rexroth_azpg_curves.csv")) as fh:
        return [r for r in csv.reader(l for l in fh if not l.startswith("#"))][1:]


def logistic(e, e50=POOLED[0], w=POOLED[1]):
    return 100.0 / (1.0 + math.exp(-(e - e50) / w))


def main(cache):
    gs.E_GRID = E_GRID
    gears = {"casappa": Gear(gear_rows()), "rexroth": Gear(rexroth_rows(), sizes=rx.SIZES)}
    E = {f: gs.index2(g, f) for f, g in gears.items()}
    rows, coef = gs.geometry_rows(cache, gears)
    idle = {f: gear_powers(g, coef, *CENTRAL) for f, g in gears.items()}
    k85 = int(round((Q85 - GRID[0]) / 0.5))
    kw = {f: float(idle[f][0][k85]) for f in gears}
    for i, x in enumerate(rows):
        x["i"] = i
    norm = {f: [x["eo"][f] / E[f] for x in rows] for f in gears}
    out = []
    p = out.append
    p("Milestone 6w: Bosch Rexroth AZPG (RE 10093/2019-09-27) as a held-out fifth gear-pump family")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps: Casappa KAPPA K 05 T A (6k) and Rexroth AZPG data sheet pp. 8, 16-18, "
      "32 mm2/s at 50 C, read from vector paths)")
    p("")
    g = gears["rexroth"]
    p("AZPG at 2100 r/min, from the catalogue curves (index 2 = eta_t(150 bar) at 85 L/min of 20 bar flow):")
    p("  size  Vg cm3/r  20 bar flow L/min  geometric L/min  eta_t(50)  eta_t(100)  eta_t(150)  eta_t(200)  P(0 bar) kW")
    for s, q in zip(g.sizes, g.qn):
        fl, pw = g.work[s]
        eta = lambda pr: fl(pr) * pr / (600.0 * pw(pr))  # noqa: E731
        p(f"  {s:4d}  {rx.DISPLACEMENT[s]:8.1f}  {q:17.2f}  {rx.DISPLACEMENT[s] * 2.1:15.2f}  {eta(50):9.4f}  "
          f"{eta(100):10.4f}  {eta(150):10.4f}  {eta(200):10.4f}  {pw(0.0):11.3f}")
    p("")
    p("Family shapes (as 6u):")
    p("  family     index 2  eta(100)/E  eta(200)/E  tilt per 100 bar  eta(q 50)/E  eta(q 150)/E  idle kW at 85 L/min")
    for f, gg in gears.items():
        e100, e200 = gg.eta(85.0, 100.0) / E[f], gg.eta(85.0, 200.0) / E[f]
        p(f"  {f:9s}  {E[f]:.4f}  {e100:10.4f}  {e200:10.4f}  {e200 - e100:+16.4f}  {gg.eta(50.0, 150.0) / E[f]:11.4f}  "
          f"{gg.eta(150.0, 150.0) / E[f]:12.4f}  {kw[f]:19.2f}")
    p(f"  load-sensing standby power {idle['casappa'][1]:.2f} kW")
    p("")

    cells, curves = {}, {}
    for f, gi in (("rexroth", "rexroth"), ("casappa", "casappa"), ("rexroth", "casappa"), ("casappa", "rexroth")):
        sh = gs.shares(rows, lambda x, e, f=f: np.minimum(gs.CAP, e * norm[f][x["i"]]), idle[gi])
        curves[(f, gi)] = sh
        cells[(f, gi)] = gs.crossing(list(E_GRID), sh)
    cat = gs.shares(rows, lambda x, e: np.minimum(gs.CAP, x["eo"]["rexroth"]), idle["rexroth"])[0]
    e50 = cells[("rexroth", "rexroth")]
    pred1 = POOLED[0]
    pred2 = RULE2[0] + RULE2[1] * (kw["rexroth"] - RULE2[2])
    p(f"50% crossing E50 of the share beating {gs.THRESH} L/h at S = {S_C} (E step 0.0025):")
    p(f"  AZPG shape, AZPG idle (the family):        {e50:.4f}")
    p(f"  Casappa shape, Casappa idle (check):       {cells[('casappa', 'casappa')]:.4f} (6u {CASAPPA_6U}; "
      f"{cells[('casappa', 'casappa')] - CASAPPA_6U:+.4f})")
    p(f"  AZPG shape, Casappa idle (diagnostic):     {cells[('rexroth', 'casappa')]:.4f}")
    p(f"  Casappa shape, AZPG idle (diagnostic):     {cells[('casappa', 'rexroth')]:.4f}")
    p("")
    p("Rules as committed (not refitted):")
    p(f"  one-number rule (6r): E50 = {pred1:.4f}; error {pred1 - e50:+.4f}")
    p(f"  two-number rule (6v): E50 = {RULE2[0]} + {RULE2[1]:.4f} ({kw['rexroth']:.2f} - {RULE2[2]}) = {pred2:.4f}; "
      f"error {pred2 - e50:+.4f}")
    p(f"  AZPG catalogue (c = 1, E {E['rexroth']:.4f}): share {cat:.1f}% of geometries; pooled logistic says "
      f"{logistic(E['rexroth']):.1f}% (residual {cat - logistic(E['rexroth']):+.1f} points)")
    p("")
    p("Share (%) by E:")
    keys = list(curves)
    p("     E  " + "  ".join(f"{a[:3]}/{b[:3]}" for a, b in keys) + "  pooled logistic")
    for k, e in enumerate(E_GRID):
        if k % 4 == 0:
            p(f"  {e:.3f} " + "  ".join(f"{curves[c][k]:7.1f}" for c in keys) + f"  {logistic(float(e)):15.1f}")
    p("")
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    p("Predictions (LOG.md 6w):")
    p(f"  RX1 AZPG E50 within 0.010 of the two-number rule: {ok(abs(pred2 - e50) <= 0.010)} ({abs(pred2 - e50):.4f})")
    p(f"  RX2 two-number error below one-number error: {ok(abs(pred2 - e50) < abs(pred1 - e50))} "
      f"({abs(pred2 - e50):.4f} against {abs(pred1 - e50):.4f})")
    p(f"  RX3 AZPG E50 within 0.015 of {pred1}: {ok(abs(pred1 - e50) <= 0.015)} ({abs(pred1 - e50):.4f})")
    p(f"  RX4 catalogue share within 10 points of the pooled logistic: "
      f"{ok(abs(cat - logistic(E['rexroth'])) <= 10)} ({cat - logistic(E['rexroth']):+.1f})")
    p(f"  RX5 index 2 inside {CATALOGUE_RANGE[0]} to {CATALOGUE_RANGE[1]}: "
      f"{ok(CATALOGUE_RANGE[0] <= E['rexroth'] <= CATALOGUE_RANGE[1])} ({E['rexroth']:.4f})")
    p(f"  RX6 idle power at 85 L/min in 2.5 to 4.0 kW: {ok(2.5 <= kw['rexroth'] <= 4.0)} ({kw['rexroth']:.2f})")
    p("")
    p("Sources: fuxi-robot/excavator-motion (CC BY-NC-SA 4.0; derived statistics only); Kauranne 2022 Fig. 13 "
      "(CC BY 4.0); Casappa KAPPA K 05 T A (2012); Bosch Rexroth RE 10093/2019-09-27 (AZPG); PVG 32 neutral curve; "
      "Moore 2020 (idle share).")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
