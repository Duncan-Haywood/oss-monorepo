"""Milestone 7za: does a fourth maker's family, Argo-Hytos GP3, bend like Danfoss's SNP3? (LOG.md 7z Next y;
predictions PA1 to PA4 written in LOG.md and pushed before this ran)

7z found the one in-range catalogue it could open with 50 and 100 bar curves (Casappa Polaris 30) flat, leaving
Danfoss the only bending family of eight from four makers. Argo-Hytos's GP3 datasheet draws input power at 20,
50, 100 bar and higher for 10 to 100 cm3/r (digitise_argo_gp3.py). It draws no flow curves; the flow lines are
built from its table (see the digitiser), which only places sizes along the flow axis.

Printed, at the model's working speed and 7j's central idle condition:
  (i)   each drawn power line against the formula P = V n p / (600000 eta_m) with the datasheet's eta_m = 0.85:
        slope ratio and the line's intercept at n = 0, to see whether the lines are drawn from that formula;
  (ii)  P(0) per size at 2100 r/min (the line through 50 and 100 bar, as gear_pump_point continues it);
  (iii) the drawn 20-bar power against that line's value at 20 bar;
  (iv)  P_idle(64), P_idle(79), b, and 7y's top-band reading, against the eight families of 7z.
Sizes 61 to 100 are drawn only to 2000 or 1800 r/min, below the working speed, so the family is read on 10 to 51
(Q20 at 2100 r/min 21 to 107 L/min: the bend's 64 and 79 L/min fall inside). PA2 and PA3 named 43, 51 and 61;
GP3 61 is reported at the last 100 r/min sample all its lines reach (they end near 2000 r/min), and marked so.

Usage: python gear_pump_argo.py > gear_pump_argo_results.txt     (numpy; no Hugging Face data)
"""
import csv
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
import catalogue_screen as cs  # noqa: E402
import digitise_argo_gp3 as ag  # noqa: E402
import gear_pump_polaris as gp  # noqa: E402
from excavator_gear_pump import N_W  # noqa: E402
from heavy_hydraulics.measured import gear_pump_point  # noqa: E402

DATA = os.path.join(HERE, "data", "argo_gp3_curves.csv")
SIZES = (10, 13, 17, 22, 27, 34, 43, 51)          # drawn past 2100 r/min
NAMED = (43, 51, 61)                              # the sizes PA2 and PA3 named


def argo_rows():
    with open(DATA) as fh:
        return [r for r in csv.reader(l for l in fh if not l.startswith("#"))][1:]


def lines(rows, size):
    """{pressure: (n, P) arrays} of the drawn power lines of one size."""
    out = {}
    for r in rows:
        if int(r[0]) == size and r[1] == "power":
            out.setdefault(int(r[2]), []).append((float(r[3]), float(r[4])))
    return {p: np.array(sorted(v)).T for p, v in out.items()}


def formula_check(rows):
    """Per size and pressure: drawn slope dP/dn over V p / (600000 * 0.85), and the line's intercept at n = 0."""
    res = {}
    for s in ag.SIZES:
        V = ag.TABLE[s][0]
        for p, (n, P) in lines(rows, s).items():
            k, c = np.polyfit(n, P, 1)
            res[(s, p)] = (k / (V * p / (600000.0 * ag.ETA_M)), c)
    return res


def main():
    out = []
    p = out.append
    rows = argo_rows()
    p("Milestone 7za: Argo-Hytos GP3 (datasheet GP3_8001_1en_11/2015, pp. 1, 3-4, 32 mm2/s) read as the model reads "
      "every gear-pump family")
    p(f"Central idle condition {cs.CENTRAL}; working speed {N_W:.0f} r/min; b = P_idle({cs.Q_HI:.0f}) / "
      f"P_idle({cs.Q_LO:.0f}); 'bends' means b > {cs.CUT}")
    p("")
    p("(i) Drawn power lines against P = V n p / (600000 x 0.85): slope ratio drawn/formula and intercept at n = 0 "
      "(kW)")
    fc = formula_check(rows)
    for s in ag.SIZES:
        ps = sorted(q for (t, q) in fc if t == s)
        p(f"  GP3 {s:3d}: " + "  ".join(f"{q}:{fc[(s, q)][0]:.3f}/{fc[(s, q)][1]:+.2f}" for q in ps))
    ratios = np.array([v[0] for v in fc.values()])
    hi = np.array([v[0] for (s, q), v in fc.items() if q >= 100])
    lo = np.array([v[0] for (s, q), v in fc.items() if q <= 50])
    icp = np.array([v[1] for v in fc.values()])
    p(f"  slope ratio over all {len(ratios)} lines: median {np.median(ratios):.3f}, range {ratios.min():.3f} to "
      f"{ratios.max():.3f}; at 100 bar or more median {np.median(hi):.3f}; at 20 and 50 bar median "
      f"{np.median(lo):.3f}")
    p(f"  intercept at n = 0: median {np.median(icp):+.3f} kW, range {icp.min():+.3f} to {icp.max():+.3f}")
    p("")
    p("(ii, iii) Per size at 2100 r/min (GP3 61 at the last speed all its lines reach): V, Q20 (built), P(0) from the line "
      "through 50 and 100 bar, drawn P(20), that line's value at 20 bar, error")
    pa2, pa3 = {}, {}
    for s in SIZES + (61,):
        L = lines(rows, s)
        last = min(float(n.max()) for n, _ in L.values())     # last 100 r/min sample every line reaches
        sp = N_W if last >= N_W else last
        fl, _ = gear_pump_point(rows, s, sp)
        q2 = sorted(L)[2]                         # 100 bar (90 on GP3 13,5)
        p50, p100 = (float(np.interp(sp, *L[q])) for q in (50, q2))
        p0 = p50 - (p100 - p50) * 50.0 / (q2 - 50.0)
        line20 = p50 - (p100 - p50) * 30.0 / (q2 - 50.0)
        d20 = float(np.interp(sp, *L[20]))
        err = d20 / line20 - 1.0
        p(f"  GP3 {s:3d} at {sp:.0f}: V {ag.TABLE[s][0]:6.2f}  Q20 {fl(20.0):7.2f}  P(0) {p0:+7.3f}  P(20) drawn "
          f"{d20:6.3f}  line {line20:6.3f}  {100 * err:+6.1f}%")
        if s in NAMED:
            pa2[s], pa3[s] = p0, err
    p("")
    full, a, t, bf, bt = gp.reading(rows, SIZES)
    j = int(np.searchsorted(full.qn, cs.Q_LO))
    k = int(np.searchsorted(full.qn, cs.Q_HI))
    p(f"64 L/min lies between GP3 {SIZES[j - 1]} and {SIZES[j]}; 79 L/min between GP3 {SIZES[k - 1]} and "
      f"{SIZES[k]} (Q20 at 2100 r/min {', '.join(f'{q:.1f}' for q in full.qn)})")
    p(f"GP3 full reading: P_idle(64) {a[cs.Q_LO]:.3f} kW, P_idle(79) {a[cs.Q_HI]:.3f} kW, b {bf:.3f} "
      f"({'bends' if bf > cs.CUT else 'flat'})")
    p(f"GP3 top band ({cs.BAND:.0f} bar): P_idle(64) {t[cs.Q_LO]:.3f} kW "
      f"({100 * (t[cs.Q_LO] / a[cs.Q_LO] - 1):+.1f}%), P_idle(79) {t[cs.Q_HI]:.3f} kW, b {bt:.3f} "
      f"(db {bt - bf:+.3f}; {'bends' if bt > cs.CUT else 'flat'})")
    # without the 20-bar line: the model's usual continuation below 50 bar, to see what the 20-bar curve changes
    no20 = [r for r in rows if not (r[1] == "power" and int(r[2]) == 20)]
    _, a2, _, b2, _ = gp.reading(no20, SIZES)
    p(f"GP3 without its 20-bar line (50/100 continuation, as the other families are read): P_idle(64) "
      f"{a2[cs.Q_LO]:.3f} kW, P_idle(79) {a2[cs.Q_HI]:.3f} kW, b {b2:.3f}")
    p("")
    p(f"  {'family':16s} {'P64':>7s} {'P79':>7s} {'b':>7s}  class   P(0) kW at 2100 r/min, median over the sizes "
      f"bracketing 64 and 79 L/min")
    fams = cs.families()
    fams["casappa PLP30"] = (gp.polaris_rows(), gp.pl.SIZES)
    fams["argo GP3"] = (rows, SIZES)
    res, drag = {}, {}
    for name, (r, sz) in fams.items():
        g3, a3, _, b3, _ = gp.reading(r, sz)
        res[name] = (a3[cs.Q_LO], a3[cs.Q_HI], b3)
        lo_i = max(int(np.searchsorted(g3.qn, cs.Q_LO)) - 1, 0)
        hi_i = min(int(np.searchsorted(g3.qn, cs.Q_HI)), len(g3.sizes) - 1)
        z = float(np.median([cs.zero_drag(g3, g3.sizes[i]) for i in range(lo_i, hi_i + 1)]))
        drag[name] = z
        p(f"  {name:16s} {a3[cs.Q_LO]:7.3f} {a3[cs.Q_HI]:7.3f} {b3:7.3f}  {'bends' if b3 > cs.CUT else 'flat ':5s}  "
          f"{z:+.3f}")
    seven = [v for n, v in res.items() if n not in ("danfoss SNP3", "argo GP3", "casappa PLP30")]
    eight = [v for n, v in res.items() if n not in ("danfoss SNP3", "argo GP3")]
    nd = [v[2] for n, v in res.items() if n != "danfoss SNP3"]
    p(f"b over the eight non-Danfoss families: {min(nd):.3f} to {max(nd):.3f}, median {float(np.median(nd)):.3f}; "
      f"Danfoss {res['danfoss SNP3'][2]:.3f}")
    med7 = float(np.median([v[0] for v in seven]))
    med8 = float(np.median([v[0] for v in eight]))
    p(f"median P_idle(64) of the seven non-Danfoss families of 7y {med7:.3f} kW (with PLP 30, eight: {med8:.3f}); "
      f"GP3 / median7 = {a[cs.Q_LO] / med7:.3f}")
    p("")
    verdict = {
        "PA1 (GP3 flat, b <= 1.55)": bf <= cs.CUT,
        "PA2 (P(0) > 0 for GP3 43, 51 and 61)": all(v > 0 for v in pa2.values()),
        "PA3 (drawn P(20) within 10% of the 50/100 line for GP3 43, 51 and 61)": all(abs(v) < 0.10
                                                                                   for v in pa3.values()),
        "PA4 (GP3 P_idle(64) within 25% of the seven-family median)": abs(a[cs.Q_LO] / med7 - 1.0) < 0.25,
    }
    for key, v in verdict.items():
        p(f"{key}: {'held' if v else 'refuted'}")
    print("\n".join(out))


if __name__ == "__main__":
    main()
