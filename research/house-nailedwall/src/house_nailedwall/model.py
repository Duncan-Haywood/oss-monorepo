"""Nailed shear-wall stiffness from a four-term deflection, for the house-diaphragm load split.

Pier deflection under unit shear v (plf), height h and width b (in):
    d = 8 v h^3 / (E A b)   chord bending
      + v h / (G t)         panel shear
      + 0.75 h e_n          nail slip, e_n = (nail load / 616)^3.276 in
      + h da / b            hold-down slip, da assumed at the same load level
Every constant is an input from memory of published SDPWS-style practice and was NOT checked in this
run (see README). Stiffness of a pier is k = v b / d (secant at v); a wall's is the sum over piers.
"""
from dataclasses import dataclass

from house_structure.model import segments


@dataclass(frozen=True)
class Params:
    e_psi: float = 1.4e6  # chord modulus
    a_in2: float = 10.5  # two 2x4 studs as the chord
    gt: float = 83500.0  # panel shear stiffness G t, lb/in (15/32 OSB, assumed)
    edge_in: float = 6.0  # panel-edge nail spacing
    da_in: float = 0.10  # hold-down slip at v
    nail_k: float = 616.0
    nail_n: float = 3.276


def nail_slip(v_plf, p=Params()):
    nail_load = v_plf * p.edge_in / 12.0
    return (nail_load / p.nail_k) ** p.nail_n


def pier_deflection(b_in, v_plf, h_in=96.0, p=Params(), hold_down=True):
    bend = 8 * v_plf / 12.0 * h_in ** 3 / (p.e_psi * p.a_in2 * b_in)
    shear = v_plf / 12.0 * h_in / p.gt
    slip = 0.75 * h_in * nail_slip(v_plf, p)
    hd = h_in * p.da_in / b_in if hold_down else 0.0
    return bend + shear + slip + hd


def pier_stiffness(b_in, v_plf, h_in=96.0, p=Params(), hold_down=True):
    """Secant lateral stiffness, lb/in, of one pier at unit shear v_plf."""
    return v_plf * b_in / 12.0 / pier_deflection(b_in, v_plf, h_in, p, hold_down)


def wall_stiffness(wall, v_plf, h_in=96.0, p=Params(), hold_down=True):
    return sum(pier_stiffness(b, v_plf, h_in, p, hold_down) for b in segments(wall, h_in))
