"""Experiments for garment-contactres. Seeded; writes experiments/results.txt."""
import os, sys
import numpy as np
here = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(here, "..", "src"))
from garment_contactres.model import *

out = []
def P(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)

N, DRAWS = 30, 20
FS = (0.0, 0.1, 0.2, 0.3, 0.4, 0.5)
RCS = (0.0, 0.1, 1.0, 10.0, 100.0)

P(f"Effective sheet resistance / one segment's resistance, {N}x{N} fabric, {DRAWS} draws per cell, seed 0.")
P("Median of the draws that conduct; 'open' = draws with no path between the bus bars. rc = contact resistance / segment resistance.")
P(f"{'break f':>8s} " + " ".join(f"{'rc=' + str(r):>16s}" for r in RCS))
med = {}
for f in FS:
    row = []
    for rc in RCS:
        r = sample(N, f, rc, DRAWS, 0)
        fin = r[np.isfinite(r)]
        m = float(np.median(fin)) if len(fin) else float("nan")
        med[(f, rc)] = m
        row.append(f"{m:7.3f} ({int((~np.isfinite(r)).sum()):2d} open)")
    P(f"{f:8.2f} " + " ".join(f"{x:>16s}" for x in row))

P("\nPenalty from contacts: median(rc) / median(rc=0), same seed.")
P(f"{'break f':>8s} " + " ".join(f"{'rc=' + str(r):>9s}" for r in RCS[1:]))
for f in FS[:-1]:
    P(f"{f:8.2f} " + " ".join(f"{med[(f, rc)] / med[(f, 0.0)]:9.2f}" for rc in RCS[1:]))

# Translate to dB for one stylised design. Segment resistance = yarn resistance per metre * pitch.
# 316 stainless conductivity 1.35e6 S/m is a handbook value recalled from memory (as in garment-optics), unsourced.
sigma, d, pitch = 1.35e6, 50e-6, 300e-6
r_seg = pitch / (sigma * np.pi * d * d / 4)
P(f"\nStylised design: 316 stainless wire, 50 um, 0.3 mm pitch: one segment = {r_seg:.3f} ohm, so ideal sheet resistance {r_seg:.3f} ohm/sq.")
P("Thin-sheet shielding effectiveness (dB) of that sheet (aperture limit not included) at 20% of yarn segments broken:")
P(f"{'contact (ohm)':>14s} {'rc/seg':>8s} {'Rs (ohm/sq)':>12s} {'SE (dB)':>8s}")
f = 0.2
base = med[(f, 0.0)]
P(f"{'intact, any':>14s} {'':>8s} {r_seg:12.3f} {float(se_sheet(r_seg)):8.1f}")
for rc in RCS:
    rs = med[(f, rc)] * r_seg
    P(f"{rc * r_seg:14.3g} {rc:8.3g} {rs:12.3f} {float(se_sheet(rs)):8.1f}")

open(os.path.join(here, "results.txt"), "w").write("\n".join(out) + "\n")
