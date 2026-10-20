"""Motion-compensated burst merge of a moving subject (synthetic, Poisson-Gaussian noise).

The scene generator, sensor model and the mean / reference-guided merges are copied from
`research/sensing-ghost` (not imported, so the project stays self-contained). New here: each frame is
aligned to the reference (frame 0) by a dense per-pixel search over sub-pixel translations, scored on a
window of noise-normalised squared differences, and the aligned frame is then merged (optionally after
the same chi-square rejection test). A nonzero shift is only accepted when it beats zero shift by
`margin` chi-square units, so static regions are not moved by noise.
"""
import numpy as np

__all__ = ["make_canvas", "render_frame", "capture", "object_mask", "merge_mean", "merge_refguided",
           "align_frame", "merge_aligned", "merge_aligned_pair", "masked_psnr"]


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
    n = canvas.shape[0]
    y, x = np.mgrid[0:n, 0:n] / float(up) - pad
    return (y - cy) ** 2 + (x - cx) ** 2 < radius * radius


def render_frame(canvas, i, v, size=48, up=4, pad=4, radius=4.0, level=0.95, y0=24.0, x0=8.0):
    """Noise-free sensor image of frame `i`: a disc of radiance `level` moving `v` px per frame along x."""
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


def _box(a, r):
    """Sum over a (2r+1)x(2r+1) window, edge-replicated."""
    p = np.pad(a, r, mode="edge")
    c = np.pad(p.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    k = 2 * r + 1
    h, w = a.shape
    return c[k:k + h, k:k + w] - c[:h, k:k + w] - c[k:k + h, :w] + c[:h, :w]


def merge_mean(e, s, read):
    """Plain mean. Returns radiance."""
    return e.mean(axis=0) / s


def _var(ref, read):
    return 2.0 * (np.maximum(_box(ref, 1) / 9.0, 0) + read ** 2)


def merge_refguided(e, s, read, thresh=21.7):
    """Reject-only merge from sensing-ghost: add frame i where the 3x3 chi-square against frame 0 < thresh."""
    ref = e[0]
    num, den = ref.copy(), np.ones_like(ref)
    for i in range(1, e.shape[0]):
        loc = np.maximum(_box((ref + e[i]) / 2, 1) / 9.0, 0)
        t = _box((e[i] - ref) ** 2 / (2.0 * (loc + read ** 2)), 1)
        w = (t < thresh).astype(float)
        num += w * e[i]
        den += w
    return num / den / s


def _shifted(pad, P, h, w, dy, dx):
    """Bilinear sample of the edge-padded frame at (y + dy, x + dx) for every pixel."""
    iy, ix = int(np.floor(dy)), int(np.floor(dx))
    fy, fx = dy - iy, dx - ix
    y0, x0 = P + iy, P + ix
    a = pad[y0:y0 + h, x0:x0 + w]
    b = pad[y0:y0 + h, x0 + 1:x0 + 1 + w]
    c = pad[y0 + 1:y0 + 1 + h, x0:x0 + w]
    d = pad[y0 + 1:y0 + 1 + h, x0 + 1:x0 + 1 + w]
    return (1 - fy) * ((1 - fx) * a + fx * b) + fy * ((1 - fx) * c + fx * d)


def align_frame(ref, frame, read, max_dx, max_dy=2.0, step=0.5, win=4, margin=40.0):
    """Align `frame` to `ref`. For each pixel choose the translation (dy, dx), dy in [-max_dy, max_dy],
    dx in [-max_dx, max_dx] at `step` px, minimising the sum over a (2*win+1)^2 window of squared
    differences divided by the noise variance. A nonzero shift replaces zero shift only if it lowers that
    chi-square by more than `margin`. Returns (aligned frame, fraction of pixels moved)."""
    h, w = ref.shape
    P = int(np.ceil(max(max_dx, max_dy))) + 2
    pad = np.pad(frame, P, mode="edge")
    var = _var(ref, read)
    def cost(img):
        return _box((img - ref) ** 2 / var, win)
    best_img = frame.copy()
    best_c = cost(frame)
    c0 = best_c.copy()
    dys = np.arange(-max_dy, max_dy + 1e-9, step)
    dxs = np.arange(-max_dx, max_dx + 1e-9, step)
    for dy in dys:
        for dx in dxs:
            if dy == 0 and dx == 0:
                continue
            img = _shifted(pad, P, h, w, dy, dx)
            c = cost(img) + margin          # penalise any move by the margin
            better = c < best_c
            best_c = np.where(better, c, best_c)
            best_img = np.where(better, img, best_img)
    moved = float(np.mean(best_c < c0))
    return best_img, moved


def merge_aligned_pair(e, s, read, v_max=None, thresh=21.7, margin=40.0, max_dy=2.0, win=4):
    """Align every frame to frame 0 once, then return two radiance estimates: (plain mean of the aligned
    frames, mean after also dropping aligned pixels that still disagree with the reference by the 3x3
    chi-square test). `v_max` bounds the horizontal search for frame i to v_max * i + 1 px."""
    ref = e[0]
    n1, d1 = ref.copy(), np.ones_like(ref)
    n2, d2 = ref.copy(), np.ones_like(ref)
    for i in range(1, e.shape[0]):
        rng_x = (v_max * i + 1.0) if v_max is not None else float(e.shape[2])
        a, _ = align_frame(ref, e[i], read, rng_x, max_dy=max_dy, win=win, margin=margin)
        loc = np.maximum(_box((ref + a) / 2, 1) / 9.0, 0)
        t = _box((a - ref) ** 2 / (2.0 * (loc + read ** 2)), 1)
        w = (t < thresh).astype(float)
        n1 += a; d1 += 1.0
        n2 += w * a; d2 += w
    return n1 / d1 / s, n2 / d2 / s


def merge_aligned(e, s, read, reject=True, **kw):
    """`merge_aligned_pair`, returning the rejected (reject=True) or the plain aligned mean."""
    return merge_aligned_pair(e, s, read, **kw)[1 if reject else 0]


def masked_psnr(est, truth, mask, peak=1.0):
    """Display-referred PSNR (gamma 1/2.2, scene peak 1) over the pixels where `mask` is true."""
    f = lambda v: np.clip(v / peak, 0, 1) ** (1 / 2.2)
    d = (f(est) - f(truth))[mask]
    mse = float(np.mean(d * d))
    return 99.0 if mse < 1e-12 else -10 * np.log10(mse)
