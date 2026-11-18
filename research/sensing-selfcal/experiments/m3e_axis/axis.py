"""Milestone 3e helpers: optical-axis spread of a window's keyframes (stdlib + numpy)."""
import numpy as np


def rodrigues(rv):
    rv = np.asarray(rv, float)
    th = np.linalg.norm(rv)
    if th < 1e-12:
        return np.eye(3)
    k = rv / th
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + np.sin(th) * K + (1 - np.cos(th)) * K @ K


def quat_to_R(q):
    """TUM order qx qy qz qw -> rotation matrix."""
    x, y, z, w = np.asarray(q, float) / np.linalg.norm(q)
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def max_pair_angle_deg(axes):
    a = np.asarray(axes, float)
    a = a / np.linalg.norm(a, axis=1, keepdims=True)
    c = np.clip(a @ a.T, -1.0, 1.0)
    return float(np.degrees(np.arccos(c.min())))


def axis_spread_solver(rvs):
    """x_cam = R X + t, so the optical axis in the world is R^T e_z, the third row of R."""
    return max_pair_angle_deg([rodrigues(r)[2] for r in rvs])


def axis_spread_mocap(quats):
    """TUM ground truth is camera-to-world, so the optical axis is the third column."""
    return max_pair_angle_deg([quat_to_R(q)[:, 2] for q in quats])


def total_rotation_deg(Ra, Rb):
    c = (np.trace(Ra.T @ Rb) - 1) / 2
    return float(np.degrees(np.arccos(np.clip(c, -1, 1))))


def spearman(x, y):
    def rank(v):
        v = np.asarray(v, float)
        o = np.argsort(v, kind="mergesort")
        r = np.empty(len(v))
        r[o] = np.arange(len(v))
        for u in np.unique(v):          # average ties
            m = v == u
            r[m] = r[m].mean()
        return r
    rx, ry = rank(x), rank(y)
    return float(np.corrcoef(rx, ry)[0, 1])
