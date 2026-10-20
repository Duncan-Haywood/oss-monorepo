"""Burst merge with a moving subject (synthetic, Poisson-Gaussian noise).

The scene generator and sensor model follow `research/sensing-burst` (copied, not imported, so the
project stays self-contained). Here the camera is still and one disc moves at `v` pixels per frame.
Frames are electrons (shot noise + Gaussian read noise, no clipping); a merge turns the stack into a
radiance estimate for frame 0, the reference frame.
"""
import numpy as np

__all__ = ["make_canvas", "render_frame", "capture", "object_mask", "merge_mean", "merge_median",
           "merge_sigclip", "merge_refguided", "MERGES", "masked_psnr"]


def make_canvas(size=48, up=4, pad=4, seed=0):
    """High-resolution radiance background (texture, rectangles, discs), as in sensing-burst."""
    rng = np.random.default_rng(seed)
    n = (size + 2 * pad) * up
    y, x = np.mgrid[0:n, 0:n] / float(up)
    img = 0.35 + 0.15 * np.sin(0.45 * x + 0.3 * np.sin(0.2 * y)) * np.cos(0.37 * y)
    for _ in range(7):
        cy, cx = rng.uniform(0, n / up, 2)
        h, w = rng.uniform(3, 12, 2)
        img[(abs(y - cy) < h) & (abs(x - cx) < w)] = rng.uniform(0.05, 0.9)
    for _ in range(4):
        cy, cx = rng.uniform(0, n / up, 2)
        r = rng.uniform(2, 7)
        img[(y - cy) ** 2 + (x - cx) ** 2 < r * r] = rng.uniform(0.1, 0.95)
    return np.clip(img, 0.02, 1.0)


def _disc(canvas, cy, cx, radius, up, pad):
    """Boolean high-res mask of a disc centred at sensor-pixel (cy, cx), radius in sensor pixels."""
    n = canvas.shape[0]
    y, x = np.mgrid[0:n, 0:n] / float(up) - pad
    return (y - cy) ** 2 + (x - cx) ** 2 < radius * radius


def render_frame(canvas, i, v, size=48, up=4, pad=4, radius=4.0, level=0.95, y0=24.0, x0=8.0):
    """Noise-free sensor image of frame `i`: background with a disc of radiance `level` whose centre
    moves along x at `v` pixels per frame; box-averaged to the sensor grid (so edges are anti-aliased)."""
    c = canvas.copy()
    c[_disc(c, y0, x0 + v * i, radius, up, pad)] = level
    o = pad * up
    return c[o:o + size * up, o:o + size * up].reshape(size, up, size, up).mean(axis=(1, 3))


def object_mask(canvas, n_frames, v, size=48, up=4, pad=4, radius=4.0, y0=24.0, x0=8.0, grow=1):
    """Sensor pixels the disc touches in any frame, grown by `grow` pixels (the trail)."""
    m = np.zeros((size, size), bool)
    for i in range(n_frames):
        d = _disc(canvas, y0, x0 + v * i, radius, up, pad)
        o = pad * up
        m |= d[o:o + size * up, o:o + size * up].reshape(size, up, size, up).any(axis=(1, 3))
    for _ in range(grow):
        g = m.copy()
        g[1:] |= m[:-1]; g[:-1] |= m[1:]; g[:, 1:] |= m[:, :-1]; g[:, :-1] |= m[:, 1:]
        m = g
    return m


def capture(rad, s, read, rng):
    """One exposure in electrons: Poisson(s * rad) plus Gaussian read noise (no full-well clip)."""
    return rng.poisson(rad * s).astype(float) + read * rng.standard_normal(rad.shape)


def merge_mean(e, s, read):
    """Plain mean: the maximum-likelihood merge when nothing moves. Returns radiance."""
    return e.mean(axis=0) / s


def merge_median(e, s, read):
    """Per-pixel median over frames."""
    return np.median(e, axis=0) / s


def merge_sigclip(e, s, read, k=3.0):
    """Mean of the frames within `k` noise sigmas of the per-pixel median; sigma comes from the
    known noise model, sqrt(median + read^2) electrons. Falls back to the median if none survive."""
    m = np.median(e, axis=0)
    sig = np.sqrt(np.maximum(m, 0) + read ** 2)
    keep = np.abs(e - m) <= k * sig
    n = keep.sum(axis=0)
    mean = np.where(n > 0, (e * keep).sum(axis=0) / np.maximum(n, 1), m)
    return mean / s


def _box3(a):
    p = np.pad(a, 1, mode="edge")
    return sum(p[dy:dy + a.shape[0], dx:dx + a.shape[1]] for dy in range(3) for dx in range(3))


def merge_refguided(e, s, read, thresh=21.7):
    """Reference-guided merge in the spirit of burst pipelines (not a copy of any): keep frame 0, and
    add frame i where the 3x3 sum of (e_i - e_0)^2 / noise variance is below `thresh` (a chi-square
    with 9 degrees of freedom has mean 9 and a 99% point near 21.7)."""
    ref = e[0]
    num, den = ref.copy(), np.ones_like(ref)
    for i in range(1, e.shape[0]):
        loc = np.maximum(_box3((ref + e[i]) / 2) / 9.0, 0)
        var = 2.0 * (loc + read ** 2)
        t = _box3((e[i] - ref) ** 2 / var)
        w = (t < thresh).astype(float)
        num += w * e[i]
        den += w
    return num / den / s


MERGES = {"mean": merge_mean, "median": merge_median, "sigclip": merge_sigclip, "refguided": merge_refguided}


def masked_psnr(est, truth, mask, peak=1.0):
    """Display-referred PSNR (gamma 1/2.2, scene peak 1) over the pixels where `mask` is true."""
    f = lambda v: np.clip(v / peak, 0, 1) ** (1 / 2.2)
    d = (f(est) - f(truth))[mask]
    mse = float(np.mean(d * d))
    return 99.0 if mse < 1e-12 else -10 * np.log10(mse)
