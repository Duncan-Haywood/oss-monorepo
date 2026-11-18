"""Milestone 3k helpers: a rolling-shutter camera for synthetic windows, and the first-order focal bias.

A rolling shutter exposes image row v at time tau = t_r * (v - c_y) / H relative to the centre row,
where t_r is the top-to-bottom readout time and H the image height. During readout the camera moves
with angular velocity w (rad/s, camera frame) and linear velocity u (m/s, camera frame):

    x_cam(tau) = exp([w tau]x) (R X + t) + u tau

The pixel a point lands on depends on its own row, so the projection is a fixed point; ten
iterations converge to under 1e-6 px for the rates used here (checked in the tests).
"""
import os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m3b_natural"))
import nfba  # noqa: E402


def expm_so3(w):
    """Rotation matrices exp([w]x) for an (n,3) array of rotation vectors."""
    w = np.atleast_2d(w)
    th = np.linalg.norm(w, axis=1)[:, None, None]
    with np.errstate(invalid="ignore", divide="ignore"):
        k = np.where(th[:, :, 0] > 1e-15, w / th[:, :, 0], 0.0)
    K = np.zeros((len(w), 3, 3))
    K[:, 0, 1], K[:, 0, 2] = -k[:, 2], k[:, 1]
    K[:, 1, 0], K[:, 1, 2] = k[:, 2], -k[:, 0]
    K[:, 2, 0], K[:, 2, 1] = -k[:, 1], k[:, 0]
    return np.eye(3) + np.sin(th) * K + (1 - np.cos(th)) * K @ K


def project_rs(intr, rv, tv, X, w, u, t_r, H=480, iters=10):
    """Rolling-shutter projection of points X (n,3) seen from one keyframe (rv, tv: (3,)).
    Returns (uv (n,2), depth (n,), tau (n,))."""
    n = len(X)
    tau = np.zeros(n)
    for _ in range(iters + 1):
        Xc, z = _cam(rv, tv, X, w, u, tau)
        uv = _pix(intr, Xc)
        tau = t_r * (uv[:, 1] - intr[2]) / H
    Xc, z = _cam(rv, tv, X, w, u, tau)
    return _pix(intr, Xc), z, tau


def _cam(rv, tv, X, w, u, tau):
    Rk = expm_so3(np.asarray(rv, float)[None])[0]
    Xc0 = X @ Rk.T + tv
    Rt = expm_so3(np.outer(tau, w))
    Xc = np.einsum("nij,nj->ni", Rt, Xc0) + np.outer(tau, u)
    return Xc, Xc[:, 2]


def _pix(intr, Xc):
    f, cx, cy, k1, k2 = intr
    xn = Xc[:, :2] / Xc[:, 2:3]
    r2 = (xn ** 2).sum(1, keepdims=True)
    return f * xn * (1 + k1 * r2 + k2 * r2 ** 2) + np.array([cx, cy])


def first_order_bias(uv, intr, w_pitch, t_r, H=480):
    """First-order relative focal bias of a global-shutter fit to a rolling-shutter image under a
    pitch rate w_pitch (rotation about the camera x axis).

    To first order a pitch rate w moves a point at normalised height y by w * tau * (1 + y^2) in y,
    with tau = t_r * f * y / H: a vertical stretch s = w t_r f / H (plus a y^3 term). An isotropic
    focal length fitted by least squares to (x, (1 + s) y) takes the share of s carried by the
    vertical spread of the observations: e = s * sum(dy^2) / sum(dx^2 + dy^2), d = uv - c.
    The sign follows the convention x_cam(tau) = exp([w tau]x) x_cam: a positive w_pitch with
    image y pointing down shrinks the image vertically, so e has the sign of -w_pitch."""
    f, cx, cy = intr[0], intr[1], intr[2]
    d = uv - np.array([cx, cy])
    share = (d[:, 1] ** 2).sum() / (d ** 2).sum()
    s = w_pitch * t_r * f / H
    return -s * share, share
