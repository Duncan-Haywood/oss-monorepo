"""Lateral-torsional buckling (LTB) of the flat-bar arms of the L-bracket (mm, N, MPa).

Each arm is a rectangular bar, in-plane width w, sheet thickness b (b < w), bent in its own plane
(strong axis). Out-of-plane buckling is the twist-plus-sideways mode the 2D model cannot see.
Textbook closed forms for a prismatic, elastic, perfect bar (see README for sources):
  cantilever, end moment M      : M_cr = pi / (2 l) * sqrt(E Iy G J)
  cantilever, end load at centroid: P_cr = 4.013 * sqrt(E Iy G J) / l^2
with Iy = w b^3 / 12 (weak axis) and J = w b^3 / 3 * (1 - 0.63 b / w) (thin rectangle).
"""
import numpy as np

E_STEEL, NU_STEEL = 200000.0, 0.30   # assumed, as in the bracket projects
F_LOAD, L_ARM, H_ARM = 100.0, 80.0, 80.0


def iy(w, b):
    return w * b ** 3 / 12.0


def torsion_j(w, b):
    return w * b ** 3 / 3.0 * (1.0 - 0.63 * b / w)


def _gj_ei(w, b, E=E_STEEL, nu=NU_STEEL):
    G = E / (2 * (1 + nu))
    return np.sqrt(E * iy(w, b) * G * torsion_j(w, b))


def vertical_arm_factor(w, b, F=F_LOAD, L=L_ARM, H=H_ARM, E=E_STEEL, nu=NU_STEEL):
    """M_cr / M for the vertical arm: end moment M = F (L - w/2), cantilever of length H.
    Tension from F (stabilising) and the restraint of the horizontal arm are ignored."""
    return np.pi / (2 * H) * _gj_ei(w, b, E, nu) / (F * (L - w / 2.0))


def horizontal_arm_factor(w, b, F=F_LOAD, L=L_ARM, E=E_STEEL, nu=NU_STEEL):
    """P_cr / F for the horizontal arm taken as a cantilever of length L - w with a tip load F
    (load at the centroid; the real load sits on the bar, i.e. on the neutral axis in z)."""
    return 4.013 * _gj_ei(w, b, E, nu) / (L - w) ** 2 / F


def governing_factor(w, b, E=E_STEEL, nu=NU_STEEL, F=F_LOAD, L=L_ARM, H=H_ARM):
    return min(vertical_arm_factor(w, b, F=F, L=L, H=H, E=E, nu=nu), horizontal_arm_factor(w, b, F=F, L=L, E=E, nu=nu))
