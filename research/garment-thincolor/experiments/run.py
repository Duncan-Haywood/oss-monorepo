"""Experiments for garment-thincolor. Deterministic (fixed seed); writes experiments/results.txt."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_thincolor.model import *  # noqa: E402

N_SUB, N_HI, N_LO = 1.53, 2.4, 1.46  # nylon-like substrate, TiO2-like, SiO2-like (round recalled values)
RHO_HI, RHO_LO = 4230.0, 2200.0
out = []


def p(s=""):
    out.append(s)
    print(s)


def row(tag, refl):
    L, a, b, C, h = lab(refl)
    return f"{tag:>22s}  peak {peak_wavelength(refl):5.0f} nm  Rmax {refl.max():.3f}  L*={L:5.1f}  C*={C:5.1f}  h={h:5.0f}"


p("1. Single TiO2-like film on nylon-like substrate, normal incidence (the reported peak can sit at the 380 or 780 nm edge of the grid when the true maximum is outside it)")
for d in (40, 60, 80, 100, 120, 160, 200):
    p(row(f"d={d} nm", reflectance(WL, [(N_HI, d)], N_SUB)))

p("\n2. Quarter-wave stacks (hi/lo pairs), design wavelength 450/530/620 nm, normal incidence")
for lam in (450, 530, 620):
    for k in (2, 4, 6):
        layers = quarter_wave_stack(N_HI, N_LO, k, lam)
        m = areal_mass_g_m2(layers, [RHO_HI, RHO_LO] * k)
        r = reflectance(WL, layers, N_SUB)
        p(row(f"lam0={lam} pairs={k}", r) + f"  mass {m:.2f} g/m2")

p("\n3. Angle dependence of a 6-pair stack designed at 620 nm (unpolarised)")
layers = quarter_wave_stack(N_HI, N_LO, 6, 620)
ref0 = lab(reflectance_unpolarised(WL, layers, N_SUB, 0))
for th in (0, 15, 30, 45, 60):
    r = reflectance_unpolarised(WL, layers, N_SUB, th)
    c = lab(r)
    p(row(f"theta={th} deg", r) + f"  dE76 vs 0deg = {delta_e76(ref0, c):5.1f}")

p("\n4. Thickness tolerance: each layer thickness x (1 + N(0, s)); 6-pair stack at 530 nm, 200 draws")
rng = np.random.default_rng(0)
layers = quarter_wave_stack(N_HI, N_LO, 6, 530)
nom = lab(reflectance(WL, layers, N_SUB))
p(f"nominal: peak {peak_wavelength(reflectance(WL, layers, N_SUB)):.0f} nm  C*={nom[3]:.1f}")
for s in (0.0, 0.02, 0.05, 0.10, 0.20):
    des, chroma = [], []
    for _ in range(200):
        pert = [(n, d * (1 + s * rng.standard_normal())) for n, d in layers]
        c = lab(reflectance(WL, pert, N_SUB))
        des.append(delta_e76(nom, c))
        chroma.append(c[3])
    p(f"sigma={s:4.2f}  median dE76 {np.median(des):5.1f}  90th pct {np.percentile(des, 90):5.1f}  median C* {np.median(chroma):5.1f}")

with open(os.path.join(os.path.dirname(__file__), "results.txt"), "w") as f:
    f.write("\n".join(out) + "\n")
