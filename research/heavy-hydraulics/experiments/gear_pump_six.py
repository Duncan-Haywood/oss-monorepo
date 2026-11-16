"""Milestone 6y: a sixth gear-pump family (Bosch Rexroth AZPN, RE 10091) held out from every fit, then the six-family
shape-by-drag factorial and a leave-one-family-out test over six families.

(i) The AZPN family alone, built exactly as 6w built the AZPG: 6k's Gear at 2100 r/min over the digitised sizes
(data/rexroth_azpn_curves.csv, digitise_rexroth_azpn.py), index 2 = overall efficiency at 150 bar and 85 L/min of
20 bar flow, idle power at 85 L/min from its own curves at the central setting, and E50 with its own moving shape
and its own idle drag. It is scored against the rules as 6x committed them (gear_pump_five_results.txt):
two-number E50 = 0.8241 + 0.0179 (kW - 3.57) and one-number E50 = 0.8172 (the 25-cell constant).
The largest AZPN (36 cm3/r) gives about 75 L/min at 2100 r/min, so at 85 L/min and above Gear reads it at size
36's per-unit values, as it does every family above its largest size (disclosed in LOG.md before the run).

(ii) All six families crossed (36 cells); the one- and two-number rules (gear_pump_five.fit) refitted on them; and
leave-one-family-out over six families: fit on the 25 cells with neither shape h nor drag h, predict the diagonal
(h, h) and the 11 cells that involve h. Check: the 25 five-family cells reproduce 6x's table.

Everything else is 6u's method (S = 0.38, central setting, 6k's 384 geometries, E swept 0.70 to 0.96 in steps of
0.0025, crossing by linear interpolation). Predictions AY1 to AY6 are in LOG.md (6y), registered before the
catalogue was digitised.

(iii) Post hoc, after the run: index 2 (gear_pump_shape.index2) extrapolates eta(150 bar) linearly past a family's
largest size, while the model (Gear) holds the largest size's values there; the AZPN is the first family whose sizes
stop short of 85 L/min, so (iii) repeats its row of cells and the six-family tests with the model's own efficiency at
85 L/min as its index. Labelled post hoc in the output and in LOG.md.

Usage: python gear_pump_six.py [cache dir] > gear_pump_six_results.txt
Needs numpy and h5py (cache shared with 5z to 6x).
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
import digitise_rexroth_azpg as rx  # noqa: E402
import digitise_rexroth_azpn as rn  # noqa: E402
from excavator_gear_pump import Gear, gear_powers  # noqa: E402
from excavator_idle_standby import CENTRAL, S_C  # noqa: E402
from excavator_breakeven_geometry import GRID  # noqa: E402

E_GRID = g5.E_GRID
FAMS5 = g5.FAMS
FAMS = FAMS5 + ("azpn",)
Q85 = 85.0
RULE2_6X = (0.8241, 0.0179, 3.57)           # 6x: E50 = 0.8241 + 0.0179 (kW - 3.57), 25-cell fit
RULE1_6X = 0.8172                           # 6x: 25-cell constant
KW_RANGE_5 = (2.58, 3.64)                   # 6x: the five families' idle kW at 85 L/min
AZPG_INDEX2 = 0.9124                        # 6w


def azpn_rows():
    with open(os.path.join(HERE, "data", "rexroth_azpn_curves.csv")) as fh:
        return [r for r in csv.reader(l for l in fh if not l.startswith("#"))][1:]


def table_6x():
    """The 25 cells of 6x's table, read from gear_pump_five_results.txt."""
    out, cols = {}, None
    with open(os.path.join(HERE, "gear_pump_five_results.txt")) as fh:
        for ln in fh:
            if ln.strip().startswith("shape \\ idle"):
                cols = ln.split()[3:3 + len(FAMS5)]
                continue
            if cols and ln.split() and ln.split()[0] in FAMS5 and re.search(r"0\.\d{4}", ln):
                vals = [float(v) for v in ln.split()[1:1 + len(FAMS5)]]
                for g, v in zip(cols, vals):
                    out[(ln.split()[0], g)] = v
            if cols and ln.strip().startswith("column mean"):
                break
    return out


def main(cache):
    gs.E_GRID = E_GRID
    gears = gs.families()
    gears["rexroth"] = Gear(gr.rexroth_rows(), sizes=rx.SIZES)
    gears["azpn"] = Gear(azpn_rows(), sizes=rn.SIZES)
    E = {f: gs.index2(g, f, hold=False) for f, g in gears.items()}   # 6y's registered reading (6z made hold the default)
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
    p("Milestone 6y: a sixth gear-pump family (Bosch Rexroth AZPN) held out from every fit, then six families crossed "
      "(moving shape x idle drag), rules refitted on 36 cells and tested leave-one-family-out")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps: Casappa KAPPA K 05 T A (6k), Danfoss SNP3 (6m), Marzocchi ALP3 (6o), "
      "Frosina, Senatore, Rigosi 2017 bench KP30 (6p, 6q), Bosch Rexroth AZPG RE 10093 (6w), Bosch Rexroth AZPN "
      "RE 10091/2024-11-18 (6y))")
    p("")
    g = gears["azpn"]
    p(f"AZPN at 2100 r/min, from the digitised curves (sizes {rn.SIZES[0]} to {rn.SIZES[-1]} cm3/r):")
    p("  size  V cm3/r  Q20 L/min  Q20/geometric  eta_t(100)  eta_t(150)  eta_t(200)")
    for s, q in zip(g.sizes, g.qn):
        fl, pw = g.work[s]
        et = lambda pr: fl(pr) * pr / (600.0 * pw(pr))  # noqa: E731
        geo = rn.DISPLACEMENT[s] * 2100.0 / 1000.0
        p(f"  {s:4d}  {rn.DISPLACEMENT[s]:7.1f}  {q:9.2f}  {q / geo:13.4f}  {et(100.0):10.4f}  {et(150.0):10.4f}  "
          f"{et(200.0):10.4f}")
    p(f"  largest size gives {g.qn[-1]:.2f} L/min of 20 bar flow, so at {Q85:.0f} L/min the family is read at size "
      f"{rn.SIZES[-1]}'s per-unit values")
    p("")
    p("Families (index 2 = eta_t(150 bar) at 85 L/min of 20 bar flow; size slope k = eta(150 L/min)/E - 1; idle kW "
      "at 85 L/min):")
    p("  family     index 2  size slope k  idle kW")
    for f in FAMS:
        p(f"  {f:9s}  {E[f]:.4f}  {ks[f]:+12.4f}  {kw[f]:7.2f}")
    p("")

    # (i) the held-out family against 6x's committed rules
    e50 = cells[("azpn", "azpn")]
    pred2 = RULE2_6X[0] + RULE2_6X[1] * (kw["azpn"] - RULE2_6X[2])
    err2, err1 = e50 - pred2, e50 - RULE1_6X
    p("(i) AZPN as a held-out family, rules as 6x committed them:")
    p(f"  E50 (own shape, own drag) {e50:.4f}")
    p(f"  two-number {RULE2_6X[0]} + {RULE2_6X[1]} ({kw['azpn']:.2f} - {RULE2_6X[2]}) = {pred2:.4f}; error {err2:+.4f}")
    p(f"  one-number {RULE1_6X}; error {err1:+.4f}")
    p(f"  diagnostics: AZPN shape with Casappa drag {cells[('azpn', 'casappa')]:.4f}, with AZPG drag "
      f"{cells[('azpn', 'rexroth')]:.4f}; Casappa shape with AZPN drag {cells[('casappa', 'azpn')]:.4f}; AZPG shape "
      f"with AZPN drag {cells[('rexroth', 'azpn')]:.4f}")
    p("")

    # (ii) the six-family factorial
    p(f"50% crossing E50 of the share beating {gs.THRESH} L/h at S = {S_C} (rows: moving shape; columns: idle drag; "
      "E step 0.0025 from 0.70):")
    p("  shape \\ idle  " + "  ".join(f"{h:>9s}" for h in FAMS) + "   row mean")
    for f in FAMS:
        p(f"  {f:12s}  " + "  ".join(f"{cells[(f, h)]:9.4f}" for h in FAMS) +
          f"   {np.mean([cells[(f, h)] for h in FAMS]):8.4f}")
    p("  column mean   " + "  ".join(f"{np.mean([cells[(f, h)] for f in FAMS]):9.4f}" for h in FAMS))
    allc = np.array(list(cells.values()))
    rm = [np.mean([cells[(f, h)] for h in FAMS]) for f in FAMS]
    cm = [np.mean([cells[(f, h)] for f in FAMS]) for h in FAMS]
    p(f"  all 36 cells {allc.min():.4f} to {allc.max():.4f}; shape main effect {max(rm) - min(rm):.4f}, drag main "
      f"effect {max(cm) - min(cm):.4f}")
    t6x = table_6x()
    d = [abs(cells[c] - v) for c, v in t6x.items()]
    p(f"Check: the 25 five-family cells against 6x ({len(t6x)} read): largest difference {max(d):.4f}")
    p("")

    names = {1: "one-number", 2: "two-number"}
    p("Rules fitted on all 36 cells (least squares):")
    full = {}
    for w in (1, 2):
        b = g5.fit(cells, kw, ks, w)
        full[w] = b
        res = [cells[(f, h)] - g5.predict(b, kw[h], ks[f]) for f, h in cells]
        terms = f"a {b[0]:.4f}" + (f", b {b[1]:+.4f} per kW" if w >= 2 else "")
        p(f"  {names[w]:12s} {terms}; in-sample RMS {g5.rms(res):.4f}, worst {max(res, key=abs):+.4f}")
    b2 = full[2]
    at357 = g5.predict(b2, RULE2_6X[2], 0.0)
    p(f"  two-number fit as E50 = {at357:.4f} + {b2[1]:.4f} (kW - {RULE2_6X[2]}) (6x: {RULE2_6X[0]} + "
      f"{RULE2_6X[1]} (kW - {RULE2_6X[2]}))")
    res6x = [cells[(f, h)] - (RULE2_6X[0] + RULE2_6X[1] * (kw[h] - RULE2_6X[2])) for f, h in cells]
    p(f"  6x's committed rule on the 36 cells: RMS {g5.rms(res6x):.4f}, worst {max(res6x, key=abs):+.4f}")
    p("")

    p("Leave-one-family-out (fit on the 25 cells with neither shape h nor drag h; error = cell minus prediction):")
    p("  held out   diagonal E50   one-number  two-number   11-cell RMS: one  two   two-number fit (a at 3.57 kW, b)")
    diag = {w: [] for w in (1, 2)}
    eleven = {w: [] for w in (1, 2)}
    for h in FAMS:
        train = {c: v for c, v in cells.items() if h not in c}
        test = [c for c in cells if h in c]
        errs, n11 = {}, {}
        for w in (1, 2):
            b = g5.fit(train, kw, ks, w)
            errs[w] = cells[(h, h)] - g5.predict(b, kw[h], ks[h])
            e_t = [cells[c] - g5.predict(b, kw[c[1]], ks[c[0]]) for c in test]
            n11[w] = g5.rms(e_t)
            diag[w].append(errs[w])
            eleven[w].extend(e_t)
            if w == 2:
                bb = b
        p(f"  {h:9s}  {cells[(h, h)]:12.4f}  {errs[1]:+11.4f}  {errs[2]:+10.4f}   {n11[1]:.4f} {n11[2]:.4f}   "
          f"{g5.predict(bb, RULE2_6X[2], 0.0):.4f}, {bb[1]:+.4f}")
    r1, r2 = g5.rms(diag[1]), g5.rms(diag[2])
    p(f"  RMS over the six held-out diagonals: one-number {r1:.4f}, two-number {r2:.4f}")
    p(f"  RMS over all 66 held-out cell predictions: one-number {g5.rms(eleven[1]):.4f}, two-number "
      f"{g5.rms(eleven[2]):.4f}")
    p("")
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    p("Predictions (LOG.md 6y):")
    p(f"  AY1 AZPN within 0.010 of 6x's two-number rule: {ok(abs(err2) <= 0.010)} ({err2:+.4f})")
    p(f"  AY2 two-number error smaller than one-number: {ok(abs(err2) < abs(err1))} ({abs(err2):.4f} against "
      f"{abs(err1):.4f})")
    out_rng = not (KW_RANGE_5[0] <= kw["azpn"] <= KW_RANGE_5[1])
    p(f"  AY3 AZPN idle kW outside {KW_RANGE_5[0]} to {KW_RANGE_5[1]}: {ok(out_rng)} ({kw['azpn']:.2f})")
    p(f"  AY4 AZPN index 2 within 0.020 of the AZPG's {AZPG_INDEX2}: {ok(abs(E['azpn'] - AZPG_INDEX2) <= 0.020)} "
      f"({E['azpn']:.4f}, {E['azpn'] - AZPG_INDEX2:+.4f})")
    p(f"  AY5 36-cell slope in 0.016 to 0.021 per kW: {ok(0.016 <= b2[1] <= 0.021)} ({b2[1]:.4f})")
    p(f"  AY6 six-fold held-out diagonal RMS, two-number below 0.005 and below one-number: "
      f"{ok(r2 < 0.005 and r2 < r1)} ({r2:.4f} against {r1:.4f})")
    p("")
    # (iii) post hoc, not registered: index 2 read where the model reads the pump
    p("(iii) Post hoc (found after the run, not registered): gear_pump_shape.index2 interpolates eta(150 bar) over "
      "the sizes' 20 bar flows")
    p("  and extrapolates linearly past the largest size, while Gear (the model) holds the largest size's per-unit "
      "values there.")
    q = [float(v) for v in g.qn]
    et = [g.eta(v, 150.0) for v in q]
    e_clamp = g.eta(Q85, 150.0)
    p(f"  AZPN: eta(150) {et[-2]:.4f} at {q[-2]:.2f} L/min (size {rn.SIZES[-2]}) and {et[-1]:.4f} at {q[-1]:.2f} "
      f"L/min (size {rn.SIZES[-1]}); index 2 extrapolated to {Q85:.0f} L/min {E['azpn']:.4f}; the model's own "
      f"efficiency there {e_clamp:.4f}")
    others = {f: abs(E[f] - gears[f].eta(Q85, 150.0)) for f in FAMS5}
    p("  the five other families reach 85 L/min, so the two readings agree for them: largest difference "
      f"{max(others.values()):.4f}")
    Ec = dict(E)
    Ec["azpn"] = e_clamp
    norm_c = dict(norm)
    norm_c["azpn"] = [x["eo"]["azpn"] / e_clamp for x in rows]
    cells_c = dict(cells)
    for h in FAMS:
        sh = gs.shares(rows, lambda x, e, h=h: np.minimum(gs.CAP, e * norm_c["azpn"][x["i"]]), idle[h])
        cells_c[("azpn", h)] = gs.crossing(list(E_GRID), sh)
    ec = cells_c[("azpn", "azpn")]
    pc2 = RULE2_6X[0] + RULE2_6X[1] * (kw["azpn"] - RULE2_6X[2])
    p(f"  with the model's efficiency as the index: AZPN E50 {ec:.4f} (registered reading {e50:.4f}; ratio of the "
      f"indices {e_clamp / E['azpn']:.4f}, crossings {ec / e50:.4f})")
    p(f"  6x's two-number rule {pc2:.4f}: error {ec - pc2:+.4f}; one-number {RULE1_6X}: error {ec - RULE1_6X:+.4f}")
    p("  AZPN shape row with this index: " + ", ".join(f"{h} {cells_c[('azpn', h)]:.4f}" for h in FAMS))
    bc = g5.fit(cells_c, kw, ks, 2)
    resc = [cells_c[c] - g5.predict(bc, kw[c[1]], 0.0) for c in cells_c]
    p(f"  two-number on 36 cells: E50 = {g5.predict(bc, RULE2_6X[2], 0.0):.4f} + {bc[1]:.4f} (kW - "
      f"{RULE2_6X[2]}), in-sample RMS {g5.rms(resc):.4f}")
    dc = {w: [] for w in (1, 2)}
    lo = []
    for h in FAMS:
        train = {c: v for c, v in cells_c.items() if h not in c}
        for w in (1, 2):
            dc[w].append(cells_c[(h, h)] - g5.predict(g5.fit(train, kw, ks, w), kw[h], ks[h]))
        lo.append(f"{h} {dc[2][-1]:+.4f}")
    p("  leave-one-family-out two-number diagonal errors: " + ", ".join(lo))
    p(f"  RMS over the six held-out diagonals: one-number {g5.rms(dc[1]):.4f}, two-number {g5.rms(dc[2]):.4f}")
    p("")
    p("Sources: fuxi-robot/excavator-motion (CC BY-NC-SA 4.0; derived statistics only); Kauranne 2022 Fig. 13 "
      "(CC BY 4.0); Casappa KAPPA K 05 T A (2012); Danfoss SNP3; Marzocchi ALP3; Frosina et al. 2017; Bosch Rexroth "
      "RE 10093/2019-09-27 (AZPG); Bosch Rexroth RE 10091/2024-11-18 (AZPN); PVG 32 neutral curve; Moore 2020 "
      "(idle share).")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
