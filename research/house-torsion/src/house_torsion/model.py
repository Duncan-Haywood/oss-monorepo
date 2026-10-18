"""Rigid-diaphragm load split with the load offset from the centre of mass (accidental torsion).

Same layout as house_diaphragm: gable lines A (x = -L/2) and B (x = +L/2) resist load along y;
long walls (together k_long, at y = +-W/2) resist the twist. The lateral load F acts along y at
x = ecc_ft. Stylised; not a code torsion check. Units: lb, ft.
"""


def eccentric_split(f_lb, ka, kb, k_long, length_ft, width_ft, ecc_ft):
    """Return (load on A, load on B, rotation) for a load F at x = ecc_ft. ecc_ft = 0 is
    house_diaphragm.rigid_split."""
    xa, xb = -length_ft / 2, length_ft / 2
    kyy = ka + kb
    kyt = ka * xa + kb * xb
    ktt = ka * xa ** 2 + kb * xb ** 2 + k_long * (width_ft / 2) ** 2
    det = kyy * ktt - kyt ** 2
    m = f_lb * ecc_ft
    v = (f_lb * ktt - kyt * m) / det
    th = (kyy * m - kyt * f_lb) / det
    return ka * (v + th * xa), kb * (v + th * xb), th


def worst_split(f_lb, ka, kb, k_long, length_ft, width_ft, ecc_frac):
    """Load on A and on B, each the larger over the load offset to +-ecc_frac * length."""
    e = ecc_frac * length_ft
    plus = eccentric_split(f_lb, ka, kb, k_long, length_ft, width_ft, e)
    minus = eccentric_split(f_lb, ka, kb, k_long, length_ft, width_ft, -e)
    return max(plus[0], minus[0]), max(plus[1], minus[1])
