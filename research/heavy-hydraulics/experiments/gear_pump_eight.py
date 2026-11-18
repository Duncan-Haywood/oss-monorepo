"""Milestone 7a: an eighth gear-pump family (Bosch Rexroth AZPF, RE 10089/2021-11-24, sizes 4 to 28 cm3/r) held out
from every fit, then the eight-family shape-by-drag factorial and leave-one-family-out over eight families.

The AZPF's largest size gives about 59 L/min of 20 bar flow at 2100 r/min, below the 85 L/min index point, so every
number this family contributes at the index point is 6z's hold rule at work: index 2 is size 28's efficiency at 150
bar, and the idle power at 85 L/min is size 28's drag per L/min times 85 (Gear._blend). It is the first family the
rule must price entirely past its largest size (LOG.md 6z, Next g).

(i) The AZPF family alone, built as 6z built the AZPU: 6k's Gear at 2100 r/min over the digitised sizes
(data/rexroth_azpf_curves.csv, digitise_rexroth_azpf.py), index 2 (hold), idle power at 85 L/min at the central
setting, and E50 with its own moving shape and its own idle drag. Scored against (A) 6x's rule as committed,
E50 = 0.8241 + 0.0179 (kW - 3.57); (Z) 6z's seven-family refit, 0.8239 + 0.0179 (kW - 3.57); (C) 6z's seven-family
one-number 0.8135.

(ii) All eight families crossed (64 cells), the one- and two-number rules refitted (gear_pump_five.fit), and
leave-one-family-out: fit on the 49 cells with neither shape h nor drag h, predict the diagonal (h, h) and the 15
cells that involve h. Check: the 49 seven-family cells reproduce 6z's table (gear_pump_seven_results.txt).

Everything else is 6u's method (S = 0.38, central setting, 6k's 384 geometries, E swept 0.70 to 0.96 in steps of
0.0025, crossing by linear interpolation). Predictions AF1 to AF6 are in LOG.md (7a), registered before any number
was computed from the AZPF curves.

Usage: python gear_pump_eight.py [cache dir] > gear_pump_eight_results.txt
Needs numpy and h5py (cache shared with 5z to 6z).
"""
import csv
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gear_pump_shape as gs  # noqa: E402
import gear_pump_rexroth as gr  # noqa: E402
import gear_pump_five as g5  # noqa: E402
import gear_pump_six as g6  # noqa: E402
import gear_pump_seven as g7  # noqa: E402
import digitise_rexroth_azpg as rx  # noqa: E402
import digitise_rexroth_azpn as rn  # noqa: E402
import digitise_rexroth_azpu as ru  # noqa: E402
import digitise_rexroth_azpf as rf  # noqa: E402
from excavator_gear_pump import Gear, gear_powers  # noqa: E402
from excavator_idle_standby import CENTRAL, S_C  # noqa: E402
from excavator_breakeven_geometry import GRID  # noqa: E402

E_GRID = g5.E_GRID
FAMS7 = g7.FAMS
FAMS = FAMS7 + ("azpf",)
Q85 = 85.0
RULE_A = (0.8241, 0.0179, 3.57)            # 6x: 25-cell fit, as committed
RULE_Z = (0.8239, 0.0179, 3.57)            # 6z: 49-cell refit
RULE_C = 0.8135                            # 6z: 49-cell constant
KW_RANGE_7 = (2.45, 3.64)                  # 6z: the seven families' idle kW at 85 L/min
AZPN_INDEX2 = 0.9250                       # 6z: the AZPN held at its largest size


def azpf_rows():
    with open(os.path.join(HERE, "data", "rexroth_azpf_curves.csv")) as fh:
        return [r for r in csv.reader(l for l in fh if not l.startswith("#"))][1:]


def table_6z(path=os.path.join(HERE, "gear_pump_seven_results.txt")):
    """6z's 49 committed cells {(shape, idle): E50}."""
    out, cols = {}, None
    for ln in open(path).read().splitlines():
        if ln.strip().startswith("shape \\ idle"):
            cols = ln.split()[3:3 + len(FAMS7)]
            continue
        if cols and ln.split() and ln.split()[0] in FAMS7 and re.search(r"0\.\d{4}", ln):
            for g, v in zip(cols, ln.split()[1:1 + len(FAMS7)]):
                out[(ln.split()[0], g)] = float(v)
        if cols and ln.strip().startswith("column mean"):
            break
    return out


def rule(r, kw):
    return r[0] + r[1] * (kw - r[2])


def main(cache):
    gs.E_GRID = E_GRID
    gears = gs.families()
    gears["rexroth"] = Gear(gr.rexroth_rows(), sizes=rx.SIZES)
    gears["azpn"] = Gear(g6.azpn_rows(), sizes=rn.SIZES)
    gears["azpu"] = Gear(g7.azpu_rows(), sizes=ru.SIZES)
    gears["azpf"] = Gear(azpf_rows(), sizes=rf.SIZES)
    gears["azpf_to25"] = Gear(azpf_rows(), sizes=rf.SIZES[:-1])     # (iii) post-hoc: size 25 as the end size
    E = {f: gs.index2(g, f) for f, g in gears.items()}
    rows, coef = gs.geometry_rows(cache, gears)
    idle = {f: gear_powers(g, coef, *CENTRAL) for f, g in gears.items()}
    k85 = int(round((Q85 - GRID[0]) / 0.5))
    kw = {f: float(idle[f][0][k85]) for f in gears}
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
    p("Milestone 7a: an eighth gear-pump family (Bosch Rexroth AZPF, sizes 4 to 28 cm3/r, largest size below the "
      "85 L/min index point) held out from every fit, then eight families crossed (moving shape x idle drag), rules "
      "refitted on 64 cells and tested leave-one-family-out")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps: Casappa KAPPA K 05 T A (6k), Danfoss SNP3 (6m), Marzocchi ALP3 (6o), "
      "Frosina, Senatore, Rigosi 2017 bench KP30 (6p, 6q), Bosch Rexroth AZPG RE 10093 (6w), AZPN RE 10091 (6y), "
      "AZPU RE 10 098/02.12 (6z), AZPF RE 10089/2021-11-24 (7a))")
    p("")
    t6z = table_6z()
    d7 = [abs(cells[c] - v) for c, v in t6z.items()]
    p(f"Check: the 49 seven-family cells against 6z's table ({len(t6z)} read): largest difference {max(d7):.4f}")
    p("")

    g = gears["azpf"]
    p(f"AZPF at 2100 r/min, from the digitised curves (sizes {rf.SIZES[0]} to {rf.SIZES[-1]} cm3/r; 32 mm2/s, 50 C):")
    p("  size  V cm3/r  Q20 L/min  Q20/geometric  eta_t(100)  eta_t(150)  eta_t(200)  P(0) kW  P(0) W per L/min")
    for s, q in zip(g.sizes, g.qn):
        fl, pw = g.work[s]
        et = lambda pr: fl(pr) * pr / (600.0 * pw(pr))  # noqa: E731
        geo = rf.DISPLACEMENT[s] * 2100.0 / 1000.0
        p(f"  {s:4d}  {rf.DISPLACEMENT[s]:7.1f}  {q:9.2f}  {q / geo:13.4f}  {et(100.0):10.4f}  {et(150.0):10.4f}  "
          f"{et(200.0):10.4f}  {pw(0.0):7.3f}  {1000.0 * pw(0.0) / q:16.1f}")
    above = float(np.mean(GRID > g.qn[-1]) * 100)
    p(f"  largest size gives {g.qn[-1]:.2f} L/min of 20 bar flow, so 85 L/min lies outside the family and the hold "
      f"rule prices it; {above:.1f}% of the fixed-pump size grid ({GRID[0]:.0f} to {GRID[-1]:.0f} L/min) lies above "
      f"size {rf.SIZES[-1]}")
    p("")
    p("Families (index 2 = eta_t(150 bar) at 85 L/min of 20 bar flow, held at the end sizes; size slope k = "
      "eta(150 L/min)/E - 1; idle kW at 85 L/min):")
    p("  family     index 2  size slope k  idle kW")
    for f in FAMS:
        p(f"  {f:9s}  {E[f]:.4f}  {ks[f]:+12.4f}  {kw[f]:7.2f}")
    p("")

    e50 = cells[("azpf", "azpf")]
    pa, pz = rule(RULE_A, kw["azpf"]), rule(RULE_Z, kw["azpf"])
    ea, ez, ec = e50 - pa, e50 - pz, e50 - RULE_C
    p("(i) AZPF as a held-out family:")
    p(f"  E50 (own shape, own drag) {e50:.4f}")
    p(f"  (A) 6x as committed {RULE_A[0]} + {RULE_A[1]} ({kw['azpf']:.2f} - {RULE_A[2]}) = {pa:.4f}; error {ea:+.4f}")
    p(f"  (Z) 6z seven-family refit {RULE_Z[0]} + {RULE_Z[1]} ({kw['azpf']:.2f} - {RULE_Z[2]}) = {pz:.4f}; error "
      f"{ez:+.4f}")
    p(f"  (C) seven-family one-number {RULE_C}; error {ec:+.4f}")
    p(f"  diagnostics: AZPF shape with AZPN drag {cells[('azpf', 'azpn')]:.4f}, with Casappa drag "
      f"{cells[('azpf', 'casappa')]:.4f}; AZPN shape with AZPF drag {cells[('azpn', 'azpf')]:.4f}; Casappa shape "
      f"with AZPF drag {cells[('casappa', 'azpf')]:.4f}")
    p("")
    # (iii) post-hoc, not a registered prediction: the hold rule leans on one size, so read the family with size 25
    # as its largest (index, drag per L/min and shape all held from size 25 instead of 28)
    t = "azpf_to25"
    nt = [x["eo"][t] / E[t] for x in rows]
    e25 = gs.crossing(list(E_GRID), gs.shares(rows, lambda x, e: np.minimum(gs.CAP, e * nt[x["i"]]), idle[t]))
    p("(iii) post-hoc end-size sensitivity (not registered): the AZPF read with size 25 as its largest size")
    p(f"  index 2 {E[t]:.4f} (size 28: {E['azpf']:.4f}); idle kW at 85 L/min {kw[t]:.2f} (size 28: {kw['azpf']:.2f}); "
      f"E50 {e25:.4f} (size 28: {e50:.4f}); rule (Z) at its kW {rule(RULE_Z, kw[t]):.4f}, error "
      f"{e25 - rule(RULE_Z, kw[t]):+.4f}")
    p("")

    p(f"50% crossing E50 of the share beating {gs.THRESH} L/h at S = {S_C} (rows: moving shape; columns: idle drag; "
      "E step 0.0025 from 0.70; index held at the end sizes):")
    p("  shape \\ idle  " + "  ".join(f"{h:>9s}" for h in FAMS) + "   row mean")
    for f in FAMS:
        p(f"  {f:12s}  " + "  ".join(f"{cells[(f, h)]:9.4f}" for h in FAMS) +
          f"   {np.mean([cells[(f, h)] for h in FAMS]):8.4f}")
    p("  column mean   " + "  ".join(f"{np.mean([cells[(f, h)] for f in FAMS]):9.4f}" for h in FAMS))
    allc = np.array(list(cells.values()))
    rm = [np.mean([cells[(f, h)] for h in FAMS]) for f in FAMS]
    cm = [np.mean([cells[(f, h)] for f in FAMS]) for h in FAMS]
    p(f"  all 64 cells {allc.min():.4f} to {allc.max():.4f}; shape main effect {max(rm) - min(rm):.4f}, drag main "
      f"effect {max(cm) - min(cm):.4f}")
    p("")

    names = {1: "one-number", 2: "two-number"}
    p("Rules fitted on all 64 cells (least squares):")
    full = {}
    for w in (1, 2):
        b = g5.fit(cells, kw, ks, w)
        full[w] = b
        res = [cells[(f, h)] - g5.predict(b, kw[h], ks[f]) for f, h in cells]
        terms = f"a {b[0]:.4f}" + (f", b {b[1]:+.4f} per kW" if w >= 2 else "")
        p(f"  {names[w]:12s} {terms}; in-sample RMS {g5.rms(res):.4f}, worst {max(res, key=abs):+.4f}")
    b2 = full[2]
    p(f"  two-number fit as E50 = {g5.predict(b2, 3.57, 0.0):.4f} + {b2[1]:.4f} (kW - 3.57) (6z: "
      f"{RULE_Z[0]} + {RULE_Z[1]}; 6x: {RULE_A[0]} + {RULE_A[1]})")
    for nm, r in (("6x (A)", RULE_A), ("6z (Z)", RULE_Z)):
        rr = [cells[(f, h)] - rule(r, kw[h]) for f, h in cells]
        p(f"  {nm} on the 64 cells: RMS {g5.rms(rr):.4f}, worst {max(rr, key=abs):+.4f}")
    p("")

    p("Leave-one-family-out (fit on the 49 cells with neither shape h nor drag h; error = cell minus prediction):")
    p("  held out   diagonal E50   one-number  two-number   15-cell RMS: one  two   two-number fit (a at 3.57 kW, b)")
    diag = {w: [] for w in (1, 2)}
    held = {w: [] for w in (1, 2)}
    slopes = []
    for h in FAMS:
        train = {c: v for c, v in cells.items() if h not in c}
        test = [c for c in cells if h in c]
        errs, n15 = {}, {}
        for w in (1, 2):
            b = g5.fit(train, kw, ks, w)
            errs[w] = cells[(h, h)] - g5.predict(b, kw[h], ks[h])
            e_t = [cells[c] - g5.predict(b, kw[c[1]], ks[c[0]]) for c in test]
            n15[w] = g5.rms(e_t)
            diag[w].append(errs[w])
            held[w].extend(e_t)
            if w == 2:
                bb = b
        slopes.append(bb[1])
        p(f"  {h:9s}  {cells[(h, h)]:12.4f}  {errs[1]:+11.4f}  {errs[2]:+10.4f}   {n15[1]:.4f} {n15[2]:.4f}   "
          f"{g5.predict(bb, 3.57, 0.0):.4f}, {bb[1]:+.4f}")
    r1, r2 = g5.rms(diag[1]), g5.rms(diag[2])
    p(f"  RMS over the eight held-out diagonals: one-number {r1:.4f}, two-number {r2:.4f}")
    p(f"  RMS over all {len(held[2])} held-out cell predictions: one-number {g5.rms(held[1]):.4f}, two-number "
      f"{g5.rms(held[2]):.4f}; fold slopes {min(slopes):.4f} to {max(slopes):.4f} per kW")
    p("")
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    p("Predictions (LOG.md 7a):")
    p(f"  AF1 AZPF within 0.006 of rule (Z): {ok(abs(ez) <= 0.006)} ({ez:+.4f})")
    p(f"  AF2 rule (A) error smaller than the seven-family one-number: {ok(abs(ea) < abs(ec))} "
      f"({abs(ea):.4f} against {abs(ec):.4f})")
    out_rng = not (KW_RANGE_7[0] <= kw["azpf"] <= KW_RANGE_7[1])
    p(f"  AF3 AZPF idle kW outside {KW_RANGE_7[0]} to {KW_RANGE_7[1]}: {ok(out_rng)} ({kw['azpf']:.2f})")
    p(f"  AF4 AZPF index 2 within 0.020 of the AZPN's {AZPN_INDEX2}: {ok(abs(E['azpf'] - AZPN_INDEX2) <= 0.020)} "
      f"({E['azpf']:.4f}, {E['azpf'] - AZPN_INDEX2:+.4f})")
    p(f"  AF5 64-cell slope in 0.016 to 0.021 per kW: {ok(0.016 <= b2[1] <= 0.021)} ({b2[1]:.4f})")
    p(f"  AF6 eight-fold held-out diagonal RMS, two-number below 0.005 and below one-number: "
      f"{ok(r2 < 0.005 and r2 < r1)} ({r2:.4f} against {r1:.4f})")
    p("")
    p("Sources: fuxi-robot/excavator-motion (CC BY-NC-SA 4.0; derived statistics only); Kauranne 2022 Fig. 13 "
      "(CC BY 4.0); Casappa KAPPA K 05 T A (2012); Danfoss SNP3; Marzocchi ALP3; Frosina et al. 2017; Bosch Rexroth "
      "RE 10093/2019-09-27 (AZPG), RE 10091/2024-11-18 (AZPN), RE 10 098/02.12 (AZPU), RE 10089/2021-11-24 (AZPF); "
      "PVG 32 neutral curve; Moore 2020 (idle share).")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
