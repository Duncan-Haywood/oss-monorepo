"""Milestone 6z: index 2 fixed to hold at a family's largest size (LOG.md 6y, Next h), then a seventh gear-pump family
(Bosch Rexroth AZPU, RE 10 098/02.12) held out from every fit, the seven-family shape-by-drag factorial and a
leave-one-family-out test over seven families.

(h) gear_pump_shape.index2 now holds the end size's eta(150 bar) outside the sizes' 20 bar flow range, as the model
(Gear) does. Check: the six families' indices equal the model's own efficiency at 85 L/min, and the 36 six-family
cells reproduce 6y's table with the AZPN row of 6y's post-hoc reading (iii) (gear_pump_six_results.txt).

(i) The AZPU family alone, built as 6w and 6y built theirs: 6k's Gear at 2100 r/min over the digitised sizes
(data/rexroth_azpu_curves.csv, digitise_rexroth_azpu.py), index 2 under the fixed rule, idle power at 85 L/min at the
central setting, and E50 with its own moving shape and its own idle drag. Scored against (A) 6x's rule as committed,
E50 = 0.8241 + 0.0179 (kW - 3.57); (B) 6y's post-hoc six-family refit, 0.8245 + 0.0183 (kW - 3.57); (C) the
one-number 0.8172 (6x).

(ii) All seven families crossed (49 cells), the one- and two-number rules refitted (gear_pump_five.fit), and
leave-one-family-out: fit on the 36 cells with neither shape h nor drag h, predict the diagonal (h, h) and the 13
cells that involve h.

Everything else is 6u's method (S = 0.38, central setting, 6k's 384 geometries, E swept 0.70 to 0.96 in steps of
0.0025, crossing by linear interpolation). Predictions AZ1 to AZ6 are in LOG.md (6z), registered before any number
was computed from the AZPU curves.

Usage: python gear_pump_seven.py [cache dir] > gear_pump_seven_results.txt
Needs numpy and h5py (cache shared with 5z to 6y).
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
import digitise_rexroth_azpg as rx  # noqa: E402
import digitise_rexroth_azpn as rn  # noqa: E402
import digitise_rexroth_azpu as ru  # noqa: E402
from excavator_gear_pump import Gear, gear_powers  # noqa: E402
from excavator_idle_standby import CENTRAL, S_C  # noqa: E402
from excavator_breakeven_geometry import GRID  # noqa: E402

E_GRID = g5.E_GRID
FAMS6 = g6.FAMS
FAMS = FAMS6 + ("azpu",)
Q85 = 85.0
RULE_A = (0.8241, 0.0179, 3.57)            # 6x: 25-cell fit, as committed
RULE_B = (0.8245, 0.0183, 3.57)            # 6y (iii): 36-cell refit with the AZPN read on its largest size
RULE_C = 0.8172                            # 6x: 25-cell constant
KW_RANGE_6 = (2.49, 3.64)                  # 6y: the six families' idle kW at 85 L/min
AZPG_INDEX2 = 0.9124                       # 6w


def azpu_rows():
    with open(os.path.join(HERE, "data", "rexroth_azpu_curves.csv")) as fh:
        return [r for r in csv.reader(l for l in fh if not l.startswith("#"))][1:]


def table_6y():
    """6y's 36 cells, with its AZPN shape row replaced by the post-hoc (iii) row (index read on the largest size)."""
    out, cols = {}, None
    text = open(os.path.join(HERE, "gear_pump_six_results.txt")).read()
    for ln in text.splitlines():
        if ln.strip().startswith("shape \\ idle"):
            cols = ln.split()[3:3 + len(FAMS6)]
            continue
        if cols and ln.split() and ln.split()[0] in FAMS6 and re.search(r"0\.\d{4}", ln):
            for g, v in zip(cols, ln.split()[1:1 + len(FAMS6)]):
                out[(ln.split()[0], g)] = float(v)
        if cols and ln.strip().startswith("column mean"):
            break
    row = re.search(r"AZPN shape row with this index: (.*)", text).group(1)
    for h, v in re.findall(r"(\w+) (0\.\d{4})", row):
        out[("azpn", h)] = float(v)
    return out


def rule(r, kw):
    return r[0] + r[1] * (kw - r[2])


def main(cache):
    gs.E_GRID = E_GRID
    gears = gs.families()
    gears["rexroth"] = Gear(gr.rexroth_rows(), sizes=rx.SIZES)
    gears["azpn"] = Gear(g6.azpn_rows(), sizes=rn.SIZES)
    gears["azpu"] = Gear(azpu_rows(), sizes=ru.SIZES)
    E = {f: gs.index2(g, f) for f, g in gears.items()}            # 6z: hold at the end sizes (the default now)
    E_old = {f: gs.index2(g, f, hold=False) for f, g in gears.items()}
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
    p("Milestone 6z: index 2 holds at a family's largest size; a seventh gear-pump family (Bosch Rexroth AZPU) held "
      "out from every fit, then seven families crossed (moving shape x idle drag), rules refitted on 49 cells and "
      "tested leave-one-family-out")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps: Casappa KAPPA K 05 T A (6k), Danfoss SNP3 (6m), Marzocchi ALP3 (6o), "
      "Frosina, Senatore, Rigosi 2017 bench KP30 (6p, 6q), Bosch Rexroth AZPG RE 10093 (6w), AZPN RE 10091 (6y), "
      "AZPU RE 10 098/02.12 (6z))")
    p("")
    p("(h) index 2 with hold (6z) against the extrapolating reading (6y as registered) and the model's own "
      "efficiency at 85 L/min:")
    p("  family     hold    extrapolated  Gear eta(85, 150)")
    for f in FAMS:
        p(f"  {f:9s}  {E[f]:.4f}  {E_old[f]:12.4f}  {gears[f].eta(Q85, 150.0):17.4f}")
    dmod = max(abs(E[f] - gears[f].eta(Q85, 150.0)) for f in FAMS if f != "danfoss")
    p(f"  largest |hold - model| over the families other than Danfoss (whose index leaves out SNP3 090, as 6n): "
      f"{dmod:.4f}")
    t6y = table_6y()
    d6 = [abs(cells[c] - v) for c, v in t6y.items()]
    p(f"Check: the 36 six-family cells against 6y's table with its post-hoc AZPN row ({len(t6y)} read): largest "
      f"difference {max(d6):.4f}")
    p("")

    g = gears["azpu"]
    p(f"AZPU at 2100 r/min, from the digitised curves (sizes {ru.SIZES[0]} to {ru.SIZES[-1]} cm3/r; 35 mm2/s, 50 C):")
    p("  size  V cm3/r  Q20 L/min  Q20/geometric  eta_t(100)  eta_t(150)  eta_t(200)  P(0) kW")
    for s, q in zip(g.sizes, g.qn):
        fl, pw = g.work[s]
        et = lambda pr: fl(pr) * pr / (600.0 * pw(pr))  # noqa: E731
        geo = ru.DISPLACEMENT[s] * 2100.0 / 1000.0
        p(f"  {s:4d}  {ru.DISPLACEMENT[s]:7.1f}  {q:9.2f}  {q / geo:13.4f}  {et(100.0):10.4f}  {et(150.0):10.4f}  "
          f"{et(200.0):10.4f}  {pw(0.0):7.3f}")
    p(f"  largest size gives {g.qn[-1]:.2f} L/min of 20 bar flow, so 85 L/min lies inside the family "
      f"(hold does not apply)")
    p("")
    p("Families (index 2 = eta_t(150 bar) at 85 L/min of 20 bar flow, held at the end sizes; size slope k = "
      "eta(150 L/min)/E - 1; idle kW at 85 L/min):")
    p("  family     index 2  size slope k  idle kW")
    for f in FAMS:
        p(f"  {f:9s}  {E[f]:.4f}  {ks[f]:+12.4f}  {kw[f]:7.2f}")
    p("")

    e50 = cells[("azpu", "azpu")]
    pa, pb = rule(RULE_A, kw["azpu"]), rule(RULE_B, kw["azpu"])
    ea, eb, ec = e50 - pa, e50 - pb, e50 - RULE_C
    p("(i) AZPU as a held-out family:")
    p(f"  E50 (own shape, own drag) {e50:.4f}")
    p(f"  (A) 6x as committed {RULE_A[0]} + {RULE_A[1]} ({kw['azpu']:.2f} - {RULE_A[2]}) = {pa:.4f}; error {ea:+.4f}")
    p(f"  (B) 6y six-family refit {RULE_B[0]} + {RULE_B[1]} ({kw['azpu']:.2f} - {RULE_B[2]}) = {pb:.4f}; error "
      f"{eb:+.4f}")
    p(f"  (C) one-number {RULE_C}; error {ec:+.4f}")
    p(f"  diagnostics: AZPU shape with AZPG drag {cells[('azpu', 'rexroth')]:.4f}, with Casappa drag "
      f"{cells[('azpu', 'casappa')]:.4f}; AZPG shape with AZPU drag {cells[('rexroth', 'azpu')]:.4f}; Casappa shape "
      f"with AZPU drag {cells[('casappa', 'azpu')]:.4f}")
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
    p(f"  all 49 cells {allc.min():.4f} to {allc.max():.4f}; shape main effect {max(rm) - min(rm):.4f}, drag main "
      f"effect {max(cm) - min(cm):.4f}")
    p("")

    names = {1: "one-number", 2: "two-number"}
    p("Rules fitted on all 49 cells (least squares):")
    full = {}
    for w in (1, 2):
        b = g5.fit(cells, kw, ks, w)
        full[w] = b
        res = [cells[(f, h)] - g5.predict(b, kw[h], ks[f]) for f, h in cells]
        terms = f"a {b[0]:.4f}" + (f", b {b[1]:+.4f} per kW" if w >= 2 else "")
        p(f"  {names[w]:12s} {terms}; in-sample RMS {g5.rms(res):.4f}, worst {max(res, key=abs):+.4f}")
    b2 = full[2]
    p(f"  two-number fit as E50 = {g5.predict(b2, 3.57, 0.0):.4f} + {b2[1]:.4f} (kW - 3.57) (6y (iii): "
      f"{RULE_B[0]} + {RULE_B[1]}; 6x: {RULE_A[0]} + {RULE_A[1]})")
    for nm, r in (("6x (A)", RULE_A), ("6y (B)", RULE_B)):
        rr = [cells[(f, h)] - rule(r, kw[h]) for f, h in cells]
        p(f"  {nm} on the 49 cells: RMS {g5.rms(rr):.4f}, worst {max(rr, key=abs):+.4f}")
    p("")

    p("Leave-one-family-out (fit on the 36 cells with neither shape h nor drag h; error = cell minus prediction):")
    p("  held out   diagonal E50   one-number  two-number   13-cell RMS: one  two   two-number fit (a at 3.57 kW, b)")
    diag = {w: [] for w in (1, 2)}
    held = {w: [] for w in (1, 2)}
    for h in FAMS:
        train = {c: v for c, v in cells.items() if h not in c}
        test = [c for c in cells if h in c]
        errs, n13 = {}, {}
        for w in (1, 2):
            b = g5.fit(train, kw, ks, w)
            errs[w] = cells[(h, h)] - g5.predict(b, kw[h], ks[h])
            e_t = [cells[c] - g5.predict(b, kw[c[1]], ks[c[0]]) for c in test]
            n13[w] = g5.rms(e_t)
            diag[w].append(errs[w])
            held[w].extend(e_t)
            if w == 2:
                bb = b
        p(f"  {h:9s}  {cells[(h, h)]:12.4f}  {errs[1]:+11.4f}  {errs[2]:+10.4f}   {n13[1]:.4f} {n13[2]:.4f}   "
          f"{g5.predict(bb, 3.57, 0.0):.4f}, {bb[1]:+.4f}")
    r1, r2 = g5.rms(diag[1]), g5.rms(diag[2])
    p(f"  RMS over the seven held-out diagonals: one-number {r1:.4f}, two-number {r2:.4f}")
    p(f"  RMS over all 91 held-out cell predictions: one-number {g5.rms(held[1]):.4f}, two-number "
      f"{g5.rms(held[2]):.4f}")
    p("")
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    p("Predictions (LOG.md 6z):")
    p(f"  AZ1 AZPU within 0.006 of rule (B): {ok(abs(eb) <= 0.006)} ({eb:+.4f})")
    p(f"  AZ2 rule (A) error smaller than one-number: {ok(abs(ea) < abs(ec))} ({abs(ea):.4f} against {abs(ec):.4f})")
    out_rng = not (KW_RANGE_6[0] <= kw["azpu"] <= KW_RANGE_6[1])
    p(f"  AZ3 AZPU idle kW outside {KW_RANGE_6[0]} to {KW_RANGE_6[1]}: {ok(out_rng)} ({kw['azpu']:.2f})")
    p(f"  AZ4 AZPU index 2 within 0.020 of the AZPG's {AZPG_INDEX2}: {ok(abs(E['azpu'] - AZPG_INDEX2) <= 0.020)} "
      f"({E['azpu']:.4f}, {E['azpu'] - AZPG_INDEX2:+.4f})")
    p(f"  AZ5 49-cell slope in 0.016 to 0.021 per kW: {ok(0.016 <= b2[1] <= 0.021)} ({b2[1]:.4f})")
    p(f"  AZ6 seven-fold held-out diagonal RMS, two-number below 0.005 and below one-number: "
      f"{ok(r2 < 0.005 and r2 < r1)} ({r2:.4f} against {r1:.4f})")
    p("")
    p("Sources: fuxi-robot/excavator-motion (CC BY-NC-SA 4.0; derived statistics only); Kauranne 2022 Fig. 13 "
      "(CC BY 4.0); Casappa KAPPA K 05 T A (2012); Danfoss SNP3; Marzocchi ALP3; Frosina et al. 2017; Bosch Rexroth "
      "RE 10093/2019-09-27 (AZPG), RE 10091/2024-11-18 (AZPN), RE 10 098/02.12 (AZPU); PVG 32 neutral curve; Moore "
      "2020 (idle share).")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
