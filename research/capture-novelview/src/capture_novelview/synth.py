"""Depth-image-based view synthesis: forward-warp neighbour views into a target pose and blend.

Bounded to what two neighbours can see: a pixel the target needs but neither source saw stays a hole.
"""
import numpy as np
from .scene import W, H, F, camera, SKY


def warp(src_col, src_z, src_angle, dst_angle, depth_noise=0.0, rng=None):
    """Splat every source pixel with finite depth into the target camera; nearest wins (z-buffer).

    Returns (colour, valid mask). depth_noise is a relative Gaussian error on the source depth (0.02 = 2%).
    """
    cs, rs = camera(src_angle)
    cd, rd = camera(dst_angle)
    from .scene import pixel_rays
    d = pixel_rays(rs)
    fin = np.isfinite(src_z)
    z = np.where(fin, src_z, 1.0)
    if depth_noise and rng is not None:
        z = z * (1 + depth_noise * rng.standard_normal(z.shape))
    # rays are unit; recover camera-frame ray with z=1, then scale by depth
    cam = d @ rs.T
    cam = cam / cam[..., 2:3]
    P = cs + (cam * z[..., None]) @ rs
    q = (P - cd) @ rd.T
    zq = q[..., 2]
    with np.errstate(invalid="ignore", divide="ignore"):
        u = np.round(F * q[..., 0] / zq + W / 2 - 0.5)
        v = np.round(F * q[..., 1] / zq + H / 2 - 0.5)
    ok = fin & (zq > 0.1) & (u >= 0) & (u < W) & (v >= 0) & (v < H)
    ui, vi = u[ok].astype(int), v[ok].astype(int)
    zz, cc = zq[ok], src_col[ok]
    order = np.argsort(-zz)  # far first, near overwrites
    out = np.tile(SKY, (H, W, 1))
    valid = np.zeros((H, W), bool)
    out[vi[order], ui[order]] = cc[order]
    valid[vi[order], ui[order]] = True
    return out, valid


def close_cracks(img, valid):
    """Fill 1-pixel cracks with the mean of valid 4-neighbours (a splat, not a hole)."""
    pad = np.pad(valid, 1)
    padc = np.pad(img, ((1, 1), (1, 1), (0, 0)))
    nb = [(0, 1), (2, 1), (1, 0), (1, 2)]
    cnt = sum(pad[a:a + H, b:b + W].astype(int) for a, b in nb)
    acc = sum(padc[a:a + H, b:b + W] * pad[a:a + H, b:b + W, None] for a, b in nb)
    fill = (~valid) & (cnt >= 3)
    out = img.copy()
    out[fill] = acc[fill] / cnt[fill][:, None]
    return out, valid | fill


def synthesise(sources, dst_angle, depth_noise=0.0, seed=0):
    """sources: list of (colour, depth, angle). Blend by taking the nearest-in-angle source first."""
    rng = np.random.default_rng(seed)
    srcs = sorted(sources, key=lambda s: abs(s[2] - dst_angle))
    out = np.tile(SKY, (H, W, 1))
    have = np.zeros((H, W), bool)
    for col, z, ang in srcs:
        w, ok = warp(col, z, ang, dst_angle, depth_noise, rng)
        w, ok = close_cracks(w, ok)
        take = ok & ~have
        out[take] = w[take]
        have |= ok
    return out, have


def psnr(a, b, mask=None):
    m = np.ones(a.shape[:2], bool) if mask is None else mask
    if not m.any():
        return float("nan")
    mse = float(np.mean((a[m] - b[m]) ** 2))
    return 99.0 if mse < 1e-12 else float(10 * np.log10(1 / mse))
