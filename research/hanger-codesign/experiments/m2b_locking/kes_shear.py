"""Measured KES-FB shear rigidity G of the four `hanger-kes` fabrics, and its value in the spring
sheet's units.

Source: Ramaiah, Radhalakshmi and Nachane, "Comparative Analysis of Low-Stress Mechanical
Properties of Woven and Knitted Apparel Fabrics" (fibre2fashion.com PDF,
https://static.fibre2fashion.com/articleresources/PdfFiles/60/5963.pdf), Table 3, row 6 "Shear
stiffness G", the same table `hanger-kes` takes B and W from; read from the PDF text on
2026-11-11. KES-FB1 reports G in gf/cm/deg (shear force per unit specimen width per degree of
shear angle, slope between 0.5 and 5 degrees, under a 10 gf/cm pretension).

In the spring sheet (`cusick.Specimen`, `hanger-3d`'s `Sheet`) the diagonal springs have stiffness
k_s = SHEAR x EA in N/m. Under a small simple shear gamma each diagonal of length h*sqrt(2) changes
length by +-gamma*h/sqrt(2), so the two diagonals of an h x h cell store k_s gamma^2 h^2 / 2, an
energy density of k_s gamma^2 / 2: the sheet's in-plane shear stiffness is k_s, independent of h
(`tests/test_m2b.py` checks it on a specimen). So G converts to the model's k_s directly.
"""
import math

GF_CM_DEG = 9.80665e-3 / 1e-2 / (math.pi / 180.0)      # gf/cm/deg -> N/m per radian (56.19)

G_KES = {"A": 0.47, "B": 0.48, "C": 0.52, "D": 1.58}    # gf/cm/deg, Table 3 row 6


def g_si(code):
    """Measured shear rigidity of fabric `code` in N/m per radian."""
    return G_KES[code] * GF_CM_DEG


def shear_fraction(code, EA):
    """The `shear` argument of `cusick.Specimen` that gives fabric `code` its measured G at EA."""
    return g_si(code) / EA
