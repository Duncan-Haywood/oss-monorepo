"""Milestone 7y: can a catalogue that draws input power only near its rated pressure stand in for a second
measured bending family? (LOG.md 7t Next y; predictions PY1 to PY4 written in LOG.md before this ran)

7t's Next (y) asks for a second gear-pump family whose measured idle drag bends like Danfoss's (b = P_idle(79) /
P_idle(64) = 1.781 against 1.29 to 1.37 for the catalogue families). 7y screened the catalogues this container can
reach (SCREEN below, each read on 2026-11-19). The one new catalogue with input-power curves for 20 to 90 cm3/r
pumps, Magister Hydraulics' GP3K, draws them only in a band within 50 bar of each size's maximum pressure (250 to
300 bar on GP3K20 to 28, 170 to 230 bar on GP3K71 to 90), with no low-pressure curve and one flow line per size.
The model reads idle drag as power(p) at the neutral pressure, continued below the lowest drawn curve as the line
through the two lowest (measured.gear_pump_point), so such a catalogue's drag is an extrapolation over 150 to 250
bar.

This script measures what that extrapolation costs on the seven families whose catalogues do draw low-pressure
curves: each family's power curves are cut to the same top band (curves at or above the size's highest drawn
pressure minus BAND bar; the top two if fewer remain), and P_idle(64), P_idle(79) and b at 7j's central idle
condition are recomputed and set against the full reading. Flow lines are left as drawn (the truncation is of
power only), so the comparison isolates the drag extrapolation.

Usage: python catalogue_screen.py > catalogue_screen_results.txt     (numpy; no Hugging Face data)
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
import gear_pump_rexroth as gr  # noqa: E402
import gear_pump_six as g6  # noqa: E402
import gear_pump_seven as g7  # noqa: E402
import gear_pump_eight as g8  # noqa: E402
import digitise_danfoss_snp3 as dan  # noqa: E402
import digitise_marzocchi_alp3 as mz  # noqa: E402
import digitise_rexroth_azpg as rx  # noqa: E402
import digitise_rexroth_azpn as rn  # noqa: E402
import digitise_rexroth_azpu as ru  # noqa: E402
import digitise_rexroth_azpf as rf  # noqa: E402
from excavator_gear_pump import Gear, gear_rows, SIZES as KP_SIZES  # noqa: E402
from excavator_gear_pump_danfoss import danfoss_rows  # noqa: E402
from excavator_gear_pump_marzocchi import marzocchi_rows  # noqa: E402
from excavator_idle_standby import CENTRAL, READINGS  # noqa: E402
from excavator_breakeven_geometry import GRID  # noqa: E402

BAND = 50.0                  # bar: Magister GP3K draws its power curves within 50 bar of each size's maximum
Q_LO, Q_HI = 64.0, 79.0      # the bend's two flows (gear_pump_table.Q_LO, Q_HI)
CUT = 1.55                   # midway between Danfoss's b (1.781) and the highest other family's (1.37): "bends"

# Catalogues screened on 2026-11-19 for a second measured family (what each draws; why it can or cannot serve).
SCREEN = [
    ("Danfoss GearMe Aluminum Group 2 (BC319580185580en-000105)", "power at 2-3 pressures and flow, 3.9-25.2 cm3/r",
     "largest size gives about 52 L/min at 2100 r/min: b would be read entirely above the family's range (held or "
     "spun, as AZPF), not measured"),
    ("Danfoss GearMe Aluminum Group 4 (BC319660010597en-000103)", "no performance graphs, 58-194 cm3/r",
     "no curves to read"),
    ("Danfoss GearMe Group 0/1, Group 2 Flex, Group 2 Compact", "Group 0/1 power for tiny sizes; Flex and Compact none",
     "below the excavator's flow range or no curves"),
    ("Parker PGP030/031/050/051/075/076 (HY09-030/US)", "a table of average input power at 172 bar (138 bar for some)",
     "one pressure: no zero-pressure intercept"),
    ("Magister Hydraulics GP3K (gear pumps catalogue, pp. 62-66)", "flow at max pressure; power at 3 pressures within "
     "50 bar of each size's maximum, 20-90 cm3/r, 16 mm2/s at 60 C", "drag only by extrapolation over 150-250 bar; "
     "this script measures that error on the seven readable families"),
    ("Turolla Alu Group 3 (hainzl.at copy)", "not read: the host returned an HTML page, not the PDF",
     "the same SNP3 line as Danfoss in any case, so not independent"),
    ("Danfoss Rugid cast iron Group 2.5 (BC424862587147en-000401)", "not read: empty download", "unread"),
]


def families():
    return {
        "casappa KP30": (gear_rows(), KP_SIZES),
        "danfoss SNP3": (danfoss_rows(), dan.SIZES),
        "marzocchi ALP3": (marzocchi_rows(), mz.SIZES),
        "rexroth AZPG": (gr.rexroth_rows(), rx.SIZES),
        "rexroth AZPU": (g7.azpu_rows(), ru.SIZES),
        "rexroth AZPN": (g6.azpn_rows(), rn.SIZES),
        "rexroth AZPF": (g8.azpf_rows(), rf.SIZES),
    }


def top_band(rows, band=BAND):
    """Drop each size's power curves drawn below (its highest drawn pressure - band); keep at least the top two."""
    press = {}
    for r in rows:
        if r[1] == "power":
            press.setdefault(int(r[0]), set()).add(int(float(r[2])))
    keep = {}
    for s, ps in press.items():
        ps = sorted(ps)
        k = [p for p in ps if p >= ps[-1] - band]
        keep[s] = set(k if len(k) >= 2 else ps[-2:])
    return [r for r in rows if r[1] != "power" or int(float(r[2])) in keep[int(r[0])]], keep


def idle_curve(gear):
    reading, _q_sb, n_r = CENTRAL
    pn = READINGS[reading]
    return {q: gear.idle(q, pn(q * n_r)) for q in (Q_LO, Q_HI)}


def zero_drag(gear, s):
    return float(gear.work[s][1](0.0))


def main():
    out = []
    p = out.append
    p("Milestone 7y: idle drag read from a catalogue's top pressure band only (curves within "
      f"{BAND:.0f} bar of each size's maximum, as Magister GP3K draws them) against the full catalogue reading")
    p(f"Central idle condition {CENTRAL}; bend b = P_idle({Q_HI:.0f}) / P_idle({Q_LO:.0f}); 'bends' means b > {CUT}")
    p("")
    p("Catalogues screened for a second measured bending family (2026-11-19):")
    for name, draws, verdict in SCREEN:
        p(f"  {name}: {draws}; {verdict}")
    p("")
    hdr = (f"  {'family':16s} {'P64 full':>9s} {'P64 top':>8s} {'err%':>6s} {'P79 full':>9s} {'P79 top':>8s} "
           f"{'b full':>7s} {'b top':>7s} {'db':>7s}  class full/top  P(0) err% (median over sizes)")
    p(hdr)
    rows_out = {}
    for name, (rows, sizes) in families().items():
        full = Gear(rows, sizes=sizes)
        cut_rows, keep = top_band(rows)
        top = Gear(cut_rows, sizes=sizes)
        a, t = idle_curve(full), idle_curve(top)
        bf, bt = a[Q_HI] / a[Q_LO], t[Q_HI] / t[Q_LO]
        e64 = 100.0 * (t[Q_LO] / a[Q_LO] - 1.0)
        z = [100.0 * (zero_drag(top, s) / zero_drag(full, s) - 1.0) for s in sizes]
        cls = ("bends" if bf > CUT else "flat") + "/" + ("bends" if bt > CUT else "flat")
        rows_out[name] = (a, t, bf, bt, e64, z, keep)
        p(f"  {name:16s} {a[Q_LO]:9.3f} {t[Q_LO]:8.3f} {e64:+6.1f} {a[Q_HI]:9.3f} {t[Q_HI]:8.3f} "
          f"{bf:7.3f} {bt:7.3f} {bt - bf:+7.3f}  {cls:12s}  {float(np.median(z)):+6.1f}")
    p("")
    p("Power curves kept per size (bar):")
    for name, (*_, keep) in rows_out.items():
        p(f"  {name:16s} " + "; ".join(f"{s}: {','.join(str(x) for x in sorted(v))}" for s, v in sorted(keep.items())))
    p("")
    db = [abs(v[3] - v[2]) for v in rows_out.values()]
    e64 = [abs(v[4]) for v in rows_out.values()]
    mis = [n for n, v in rows_out.items() if (v[2] > CUT) != (v[3] > CUT)]
    dan_db = rows_out["danfoss SNP3"][3] - rows_out["danfoss SNP3"][2]
    gap = rows_out["danfoss SNP3"][2] - max(v[2] for n, v in rows_out.items() if n != "danfoss SNP3")
    p(f"|db|: median {float(np.median(db)):.3f}, max {max(db):.3f}; Danfoss db {dan_db:+.3f}; "
      f"Danfoss's measured gap to the next family's b {gap:.3f}")
    p(f"|P64 err|: median {float(np.median(e64)):.1f}%, max {max(e64):.1f}%; families above 25%: "
      f"{sum(e > 25.0 for e in e64)} of {len(e64)}")
    p(f"Misclassified at b = {CUT}: {len(mis)} of {len(rows_out)} ({', '.join(mis) if mis else 'none'})")
    p("")
    verdict = {
        "PY1 (Danfoss |db| > 0.10)": abs(dan_db) > 0.10,
        "PY2 (median |db| over seven > 0.10)": float(np.median(db)) > 0.10,
        "PY3 (|P64 err| > 25% in at least 4 of 7)": sum(e > 25.0 for e in e64) >= 4,
        "PY4 (at least one family misclassified at b = 1.55)": len(mis) >= 1,
    }
    for k, v in verdict.items():
        p(f"{k}: {'held' if v else 'refuted'}")
    print("\n".join(out))


if __name__ == "__main__":
    main()
