"""Rigid versus flexible diaphragm load split for a one-storey box with four shear-wall lines.

Stylised: a wall's stiffness is a toy pier model (see README), not a measured or code stiffness.
Layout: gable walls (resist load across the ridge, along y) at x = -L/2 and +L/2; long walls
(resist load along x) at y = -W/2 and +W/2. The load acts at the centre of mass (0, 0).
Units: lb, ft, in.
"""
from house_structure.model import segments


def pier_stiffness(width_in, height_in=96.0, r=1.0):
    """Relative lateral stiffness of one full-height pier: shear-dominated k = b/h, softened by a
    bending term, k = (b/h) / (1 + r (h/b)^2). r = 0 is pure shear; r is an assumed input."""
    a = height_in / width_in
    return (width_in / height_in) / (1.0 + r * a * a)


def wall_stiffness(wall, height_in=96.0, r=1.0):
    return sum(pier_stiffness(b, height_in, r) for b in segments(wall, height_in))


def flexible_split(v_lb, ka, kb):
    """Flexible diaphragm: load goes to each line by tributary area; the load is centred, so half each."""
    return v_lb / 2, v_lb / 2


def rigid_split(v_lb, ka, kb, k_long, length_ft, width_ft):
    """Rigid diaphragm, load v_lb along y at the centre of mass. Gable lines A (x=-L/2) and B (+L/2)
    have stiffnesses ka, kb; the two long walls together have k_long (half each, at y = +-W/2).
    Solves for the rigid displacement (v, theta). Returns (load on A, load on B, rotation) with the
    rotation in radians per unit stiffness-load; long walls resist the twist."""
    xa, xb = -length_ft / 2, length_ft / 2
    kyy = ka + kb
    kyt = ka * xa + kb * xb
    ktt = ka * xa ** 2 + kb * xb ** 2 + k_long * (width_ft / 2) ** 2
    det = kyy * ktt - kyt ** 2
    v = v_lb * ktt / det
    th = -v_lb * kyt / det
    fa, fb = ka * (v + th * xa), kb * (v + th * xb)
    return fa, fb, th


def long_wall_twist_load(th, k_long, width_ft):
    """Load (lb) the twist puts on each long wall (they act in x, at y = +-W/2)."""
    return abs(th) * (k_long / 2) * width_ft / 2
