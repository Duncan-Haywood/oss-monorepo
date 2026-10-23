"""Widened design bounds: hanger-fit's box has bow -2..3 cm and end radius 0.15..3 cm, and several 3D designs sat on the 3 cm radius limit."""
import numpy as np

from hanger_fit.model import Hanger

WIDE = np.array([[12.0, 30.0], [0.0, 40.0], [-2.0, 5.0], [0.15, 6.0]])


def to_wide(u):
    v = WIDE[:, 0] + np.clip(u, 0, 1) * (WIDE[:, 1] - WIDE[:, 0])
    return Hanger(w=float(v[0]), slope=float(v[1]), bow=float(v[2]), r=float(v[3]))
