"""Quality indicators for a found set against the true front (all objectives minimised, points already scaled)."""
import numpy as np
from eda_proposers.hv import hypervolume, nondominated


def hv_ratio(found, true, ref):
    """Hypervolume of the found set over that of the true front, at reference point `ref`."""
    return hypervolume(nondominated(found), ref) / hypervolume(true, ref)


def recall(found, true):
    """Fraction of the true front's points that were evaluated exactly."""
    f = set(found)
    return sum(p in f for p in true) / len(true)


def igd_plus(found, true):
    """IGD+ (Ishibuchi et al., 2015): mean over true-front points of the distance to the nearest found point,
    counting only the coordinates where the found point is worse. Lower is better; 0 means the front was found."""
    F, T = np.array(found), np.array(true)
    d = np.sqrt((np.maximum(F[None, :, :] - T[:, None, :], 0.0) ** 2).sum(-1))
    return float(d.min(1).mean())


def eps_add(found, true):
    """Additive epsilon indicator: the smallest shift that makes the found set weakly dominate the true front. Lower is better."""
    F, T = np.array(found), np.array(true)
    return float((F[None, :, :] - T[:, None, :]).max(-1).min(1).max())
