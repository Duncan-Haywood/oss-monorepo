"""Nine woven fabrics with measured FAST/KES mechanics and a measured Cusick drape coefficient.

Source: S. Petrak, M. Mahnic Naglic, D. Rogale and J. Gersak (2021), "Analysis of polygonal computer
model parameters and influence on fabric drape simulation", *Materials* 14(21), 6259,
doi:10.3390/ma14216259, CC BY 4.0 (full text read from Europe PMC, PMC8584912, 2026-11-17).
Numbers are copied from the paper's tables, not re-measured:
  Table 1: areal weight W [g/m^2].
  Table 2 (FAST): E100 [%] (extension at 100 gf/cm = 98.0665 N/m), bending rigidity B [uN m],
    shear rigidity G [N/m]; (KES-FB): bending rigidity B [cN cm^2/cm] (printed "cNcm"), shear
    G [cN/(cm deg)].
  Table 3: drape coefficient Kd, Cusick drape meter, 30 cm specimen on an 18 cm disc, mean of five
    specimens per fabric (no spread printed).
Suffix 1 is warp, 2 is weft.
"""
import math

# code: (W, E100_1, E100_2, B1_fast, B2_fast, G_fast, B1_kes, B2_kes, G_kes, Kd)
TABLE = {
    "F1": (135.2, 1.1, 3.9, 4.5, 1.9, 23, 0.0195, 0.0061, 0.41, 0.222),
    "F2": (83.7, 1.6, 18.0, 2.1, 1.1, 16, 0.0085, 0.0033, 0.46, 0.227),
    "F3": (286.1, 11.9, 11.7, 7.7, 6.3, 27, 0.0297, 0.0240, 0.61, 0.285),
    "F4": (161.8, 1.4, 4.9, 7.6, 3.9, 33, 0.0324, 0.0161, 0.73, 0.319),
    "F5": (178.7, 4.9, 5.9, 5.7, 5.3, 24, 0.0214, 0.0200, 0.50, 0.348),
    "F6": (159.8, 6.5, 5.1, 9.1, 9.3, 24, 0.0362, 0.3980, 0.49, 0.403),
    "F7": (178.1, 3.2, 3.4, 11.9, 9.8, 38, 0.0532, 0.4440, 0.69, 0.442),
    "F8": (253.4, 1.6, 10.6, 32.1, 10.3, 60, 0.0743, 0.0370, 1.26, 0.548),
    "F9": (366.8, 1.5, 2.8, 94.3, 23.4, 67, 0.3354, 0.0989, 1.15, 0.647),
}
CODES = tuple(TABLE)
GF = 9.80665e-3                       # N per gf
N100 = 100 * GF / 1e-2                # 100 gf/cm in N/m (98.0665)


def gmean(x, y):
    return math.sqrt(x * y)


def ea_secant(code):
    """Isotropic stretch stiffness [N/m]: geometric mean of the warp and weft secants 98.07 / E100."""
    r = TABLE[code]
    return gmean(N100 / (r[1] / 100), N100 / (r[2] / 100))


def b_fast(code):
    """Isotropic bending rigidity [N m]: geometric mean of FAST warp and weft (Peirce's overall rigidity)."""
    r = TABLE[code]
    return gmean(r[3], r[4]) * 1e-6


def b_kes(code):
    """The same from the KES-FB2 columns, cN cm^2/cm -> N m."""
    r = TABLE[code]
    return gmean(r[6], r[7]) * 1e-2 * 1e-4 / 1e-2


def g_fast(code):
    """Shear rigidity [N/m per radian] from FAST."""
    return float(TABLE[code][5])


def g_kes(code):
    """KES-FB1 shear slope, cN/(cm deg) -> N/m per radian."""
    return TABLE[code][8] * 1e-2 / 1e-2 * 180 / math.pi


def weight(code):
    return TABLE[code][0]


def kd(code):
    return TABLE[code][9]
