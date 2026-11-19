"""Milestone 7z: does a second Casappa family, the Polaris 30 (PLP 30), bend like Danfoss's SNP3? (LOG.md 7y Next y;
predictions PZ1 to PZ4 written in LOG.md and pushed before this ran)

7t's Next (y) asked for a second gear-pump family whose measured idle drag bends: b = P_idle(79) / P_idle(64) at
7j's central idle condition is 1.781 for Danfoss SNP3 and 1.28 to 1.37 for the six other catalogue families. 7y
showed a catalogue that draws power only near rated pressure cannot answer that. Casappa's Polaris catalogue
PL 06 T A draws PLP 30 power at 50 and 100 bar for 22 to 91 cm3/r (digitise_casappa_polaris30.py), and at the
working speed 2100 r/min the bend's 64 and 79 L/min fall between PLP 30.27 and 30.43, so nothing is held or spun.

This script reads PLP 30 as the model reads every family (excavator_gear_pump.Gear: 20-bar flow at 2100 r/min,
power(p) through the drawn curves, continued below 50 bar as the line through 50 and 100 bar) and prints, at the
central condition: P_idle(64), P_idle(79), b, the zero-pressure drag P(0) per size, the top-band reading of 7y,
and the same numbers for the seven families of catalogue_screen.py. Two checks of the digitised curves are
printed: the 20-bar flow slope against the printed displacement, and the power curves against the torque implied
by eta_hm (none: the torque curves are not read) -- the latter is reported in LOG.md from a one-off read.

Usage: python gear_pump_polaris.py > gear_pump_polaris_results.txt     (numpy; no Hugging Face data)
"""
import csv
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
import catalogue_screen as cs  # noqa: E402
import digitise_casappa_polaris30 as pl  # noqa: E402
from excavator_gear_pump import Gear, N_W  # noqa: E402
from heavy_hydraulics.measured import gear_pump_point  # noqa: E402

DATA = os.path.join(HERE, "data", "casappa_plp30_curves.csv")


def polaris_rows():
    with open(DATA) as fh:
        return [r for r in csv.reader(l for l in fh if not l.startswith("#"))][1:]


def reading(rows, sizes):
    full = Gear(rows, sizes=sizes)
    top = Gear(cs.top_band(rows)[0], sizes=sizes)
    a, t = cs.idle_curve(full), cs.idle_curve(top)
    return full, a, t, a[cs.Q_HI] / a[cs.Q_LO], t[cs.Q_HI] / t[cs.Q_LO]


def main():
    out = []
    p = out.append
    rows = polaris_rows()
    sizes = pl.SIZES
    full, a, t, bf, bt = reading(rows, sizes)
    p("Milestone 7z: Casappa Polaris 30 (PLP 30, catalogue PL 06 T A, pp. 18-20, 50 C, ISO VG 46) read as the "
      "model reads every gear-pump family")
    p(f"Central idle condition {cs.CENTRAL}; working speed {N_W:.0f} r/min; b = P_idle({cs.Q_HI:.0f}) / "
      f"P_idle({cs.Q_LO:.0f}); 'bends' means b > {cs.CUT}")
    p("")
    p("Per size at 2100 r/min: V (cm3/r, p. 7), Q20 (L/min), Q20/V/2.1, P(0) kW (zero-pressure drag, line through "
      "50 and 100 bar), P(50), P(100), eta_t(150)")
    for s in sizes:
        fl, pw = gear_pump_point(rows, s, N_W)
        V = pl.DISPLACEMENT[s]
        p(f"  PLP 30.{s:<3d} V {V:6.2f}  Q20 {fl(20.0):7.2f}  ratio {fl(20.0) / V / 2.1:.4f}  P(0) {pw(0.0):6.3f}  "
          f"P(50) {pw(50.0):6.3f}  P(100) {pw(100.0):6.3f}  eta_t(150) {fl(150.0) * 150.0 / 600.0 / pw(150.0):.3f}")
    j = int(np.searchsorted(full.qn, cs.Q_LO))
    k = int(np.searchsorted(full.qn, cs.Q_HI))
    p(f"64 L/min lies between PLP 30.{sizes[j - 1]} and 30.{sizes[j]}; 79 L/min between PLP 30.{sizes[k - 1]} "
      f"and 30.{sizes[k]} (Q20 at 2100 r/min {', '.join(f'{q:.1f}' for q in full.qn)})")
    p("")
    p(f"PLP 30 full reading: P_idle(64) {a[cs.Q_LO]:.3f} kW, P_idle(79) {a[cs.Q_HI]:.3f} kW, b {bf:.3f} "
      f"({'bends' if bf > cs.CUT else 'flat'})")
    p(f"PLP 30 top band ({cs.BAND:.0f} bar): P_idle(64) {t[cs.Q_LO]:.3f} kW ({100 * (t[cs.Q_LO] / a[cs.Q_LO] - 1):+.1f}%), "
      f"P_idle(79) {t[cs.Q_HI]:.3f} kW, b {bt:.3f} (db {bt - bf:+.3f}; {'bends' if bt > cs.CUT else 'flat'})")
    p("")
    p(f"  {'family':16s} {'P64':>7s} {'P79':>7s} {'b':>7s}  class")
    fams = cs.families()
    fams["casappa PLP30"] = (rows, sizes)
    res = {}
    for name, (r, sz) in fams.items():
        _, a2, _, b2, _ = reading(r, sz)
        res[name] = (a2[cs.Q_LO], a2[cs.Q_HI], b2)
        p(f"  {name:16s} {a2[cs.Q_LO]:7.3f} {a2[cs.Q_HI]:7.3f} {b2:7.3f}  {'bends' if b2 > cs.CUT else 'flat'}")
    others = [v[2] for n, v in res.items() if n != "danfoss SNP3"]
    p(f"b over the seven non-Danfoss families: {min(others):.3f} to {max(others):.3f}, median "
      f"{float(np.median(others)):.3f}; Danfoss {res['danfoss SNP3'][2]:.3f}")
    kp = res["casappa KP30"]
    p("")
    verdict = {
        "PZ1 (PLP 30 flat, b <= 1.55)": bf <= cs.CUT,
        "PZ2 (|b(PLP 30) - b(KP 30)| < 0.10)": abs(bf - kp[2]) < 0.10,
        "PZ3 (PLP 30 P_idle(64) within 25% of KP 30's)": abs(a[cs.Q_LO] / kp[0] - 1.0) < 0.25,
        "PZ4 (PLP 30 top-band |db| > 0.10)": abs(bt - bf) > 0.10,
    }
    p(f"|b(PLP 30) - b(KP 30)| = {abs(bf - kp[2]):.3f}; P_idle(64) PLP 30 / KP 30 = {a[cs.Q_LO] / kp[0]:.3f}")
    for key, v in verdict.items():
        p(f"{key}: {'held' if v else 'refuted'}")
    print("\n".join(out))


if __name__ == "__main__":
    main()
