"""VINS-Mono camodocs' pinhole undistortion loop, ported for milestone 3zh.

Source: HKUST-Aerial-Robotics/VINS-Mono@90dabb5ec79946ae42fd2e1e91d4e69aabe1e25d,
camera_model/src/camera_models/PinholeCamera.cc, PinholeCamera::liftProjective (the "recursive
distortion model" branch, n = 8) and PinholeCamera::distortion (k1, k2, p1, p2; no k3). VINS-Mono is
GPL-3.0; this file is an independent re-implementation of the algorithm from its description (a few
lines of arithmetic), not a copy of the code, and is MIT-licensed like the rest of research/.
"""


def distortion(x, y, k1, k2, p1, p2):
    """The additive distortion D(x): x_d = x + D(x)."""
    mx2, my2, mxy = x * x, y * y, x * y
    r2 = mx2 + my2
    rad = k1 * r2 + k2 * r2 * r2
    return x * rad + 2.0 * p1 * mxy + p2 * (r2 + 2.0 * mx2), y * rad + 2.0 * p2 * mxy + p1 * (r2 + 2.0 * my2)


def additive_map(x, y, xd, yd, k1, k2, p1, p2):
    """One step of the loop: x <- x_d - D(x)."""
    dx, dy = distortion(x, y, k1, k2, p1, p2)
    return xd - dx, yd - dy


def lift_projective(u, v, c, n=8):
    """Normalised undistorted point after n evaluations of D, as liftProjective does (first from x_d)."""
    xd, yd = (u - c["cx"]) / c["fx"], (v - c["cy"]) / c["fy"]
    x, y = xd, yd
    for _ in range(n):
        x, y = additive_map(x, y, xd, yd, c["k1"], c["k2"], c["p1"], c["p2"])
    return x, y
