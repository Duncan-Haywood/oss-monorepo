"""Experiments for garment-optics. Seeded; writes experiments/results.txt."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_optics.model import *

out = []
def P(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)

P("Sheet resistance needed (ohm/sq):", ", ".join(f"{s} dB: {rs_for_se(s):.3g}" for s in (20, 30, 40, 60)))

# Designs: (name, material, d [um], coating [um] or None, pitch [um])
DES = [("Cu wire 50um @1mm", "copper", 50, None, 1000),
       ("SS316 wire 50um @1mm", "stainless316", 50, None, 1000),
       ("SS316 wire 50um @0.3mm", "stainless316", 50, None, 300),
       ("Ag-coated nylon 100um, 1um Ag @1mm", "silver", 100, 1, 1000),
       ("Ag-coated nylon 100um, 1um Ag @0.3mm", "silver", 100, 1, 300),
       ("Ag-coated nylon 100um, 0.2um Ag @0.5mm", "silver", 100, 0.2, 500)]
P("\nSE (dB) at frequency, min(sheet, aperture); Rs in ohm/sq; metal mass in g/m2")
P(f"{'design':42s} {'Rs':>9s} {'sheet':>6s} {'0.9GHz':>7s} {'2.4GHz':>7s} {'5.8GHz':>7s} {'28GHz':>7s} {'g/m2':>6s}")
for name, mat, d, coat, p in DES:
    sig, rho = MATERIALS[mat]
    d_m, p_m = d * 1e-6, p * 1e-6
    c = coat * 1e-6 if coat else None
    rp = yarn_resistance_per_m(sig, d_m, c)
    rs = sheet_resistance(rp, p_m)
    se = [float(se_fabric(f, rp, p_m, d_m)) for f in (0.9e9, 2.4e9, 5.8e9, 28e9)]
    m = metal_areal_mass(rho, d_m, p_m, c) * 1e3
    P(f"{name:42s} {rs:9.3g} {float(se_sheet(rs)):6.1f} " + " ".join(f"{x:7.1f}" for x in se) + f" {m:6.2f}")

P("\nYarn breakage: Monte Carlo effective sheet resistance of an n x n grid (units of one segment), 30x30, 20 draws each, seed 0; EMT = effective-medium estimate 1/(1-2f) for bond dilution of a square lattice")
rng = np.random.default_rng(0)
P(f"{'break':>6s} {'median':>8s} {'p10':>8s} {'p90':>8s} {'open':>5s} {'EMT':>8s}")
for f in (0.0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6):
    r = np.array([effective_sheet_resistance(30, f, rng) for _ in range(20)])
    fin = r[np.isfinite(r)]
    q = np.percentile(fin, [50, 10, 90]) if len(fin) else [np.nan] * 3
    P(f"{f:6.2f} {q[0]:8.3f} {q[1]:8.3f} {q[2]:8.3f} {int((~np.isfinite(r)).sum()):5d} {(1/(1-2*f) if f<0.5 else float('inf')):8.3f}")

P("\nSE lost to breakage for stainless 50um @0.3mm at the median Rs ratio of a fresh draw (sheet formula only; the aperture bound ignores breaks)")
sig, _ = MATERIALS["stainless316"]
rp = yarn_resistance_per_m(sig, 50e-6)
rng = np.random.default_rng(1)
for f in (0.0, 0.1, 0.2, 0.3, 0.4):
    ratio = np.median([effective_sheet_resistance(30, f, rng) for _ in range(20)])
    rs = sheet_resistance(rp, 300e-6) * ratio
    P(f"  break {f:.1f}: Rs x{ratio:.2f} -> sheet SE {float(se_sheet(rs)):.1f} dB")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
