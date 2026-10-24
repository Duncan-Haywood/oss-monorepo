"""Burst merge of a small sensor against one frame of a larger sensor (synthetic, Poisson-Gaussian noise).

Units: a scene is a radiance image; a sensor turns radiance x over an exposure into electrons
Poisson(s*x) with s = electrons per unit radiance for that exposure, clipped at the full well `fw`,
then adds Gaussian read noise (sd `read`, electrons). A sensor with area ratio A has A times the
s and A times the full well of the small one at equal exposure time.
"""
import numpy as np

__all__ = ["make_canvas", "render", "capture", "estimate_shift", "fourier_shift", "merge",
           "display_psnr", "breakeven_frames", "var_large", "var_burst", "var_burst_fixed_time"]


def make_canvas(size=48, up=4, pad=4, hdr=0.0, seed=0):
    """High-resolution radiance canvas (periodic-free texture, shapes). Peak 1.0, or `hdr` > 1 for
    a bright disc of that radiance (the rest stays at or below 1)."""
    rng = np.random.default_rng(seed)
    n = (size + 2 * pad) * up
    y, x = np.mgrid[0:n, 0:n] / float(up)
    img = 0.35 + 0.15 * np.sin(0.45 * x + 0.3 * np.sin(0.2 * y)) * np.cos(0.37 * y)
    for _ in range(7):  # rectangles
        cy, cx = rng.uniform(0, n / up, 2)
        h, w = rng.uniform(3, 12, 2)
        m = (abs(y - cy) < h) & (abs(x - cx) < w)
        img[m] = rng.uniform(0.05, 0.9)
    for _ in range(4):  # discs
        cy, cx = rng.uniform(0, n / up, 2)
        r = rng.uniform(2, 7)
        img[(y - cy) ** 2 + (x - cx) ** 2 < r * r] = rng.uniform(0.1, 0.95)
    img = np.clip(img, 0.02, 1.0)
    if hdr > 1.0:
        cy, cx = 0.5 * n / up, 0.62 * n / up
        img[(y - cy) ** 2 + (x - cx) ** 2 < 36.0] = hdr
    return img


def render(canvas, shift, size=48, up=4, pad=4):
    """Crop at an integer high-res shift (dy, dx) and box-average to the sensor grid."""
    o = pad * up
    dy, dx = shift
    c = canvas[o + dy:o + dy + size * up, o + dx:o + dx + size * up]
    return c.reshape(size, up, size, up).mean(axis=(1, 3))


def capture(rad, s, fw, read, rng):
    """One exposure: electrons, Poisson shot noise, clip at full well, Gaussian read noise."""
    e = np.minimum(rng.poisson(rad * s).astype(float), fw)
    return e + read * rng.standard_normal(rad.shape)


def fourier_shift(img, dy, dx):
    """Translate an image by (dy, dx) pixels (sub-pixel allowed, periodic) with a phase ramp."""
    fy = np.fft.fftfreq(img.shape[0])[:, None]
    fx = np.fft.fftfreq(img.shape[1])[None, :]
    return np.fft.ifft2(np.fft.fft2(img) * np.exp(-2j * np.pi * (fy * dy + fx * dx))).real


def estimate_shift(ref, img, pad=8):
    """Shift (dy, dx) such that fourier_shift(img, dy, dx) ~ ref. Windowed cross-correlation of the
    two frames with a `pad`-times zero-padded spectrum, peak refined by a parabola."""
    n = ref.shape[0]
    w = np.hanning(n)[:, None] * np.hanning(n)[None, :]
    a = np.fft.fft2((ref - ref.mean()) * w)
    b = np.fft.fft2((img - img.mean()) * w)
    r = a * np.conj(b)
    m = n * pad
    big = np.zeros((m, m), complex)
    h = n // 2
    big[:h, :h] = r[:h, :h]
    big[:h, -h:] = r[:h, -h:]
    big[-h:, :h] = r[-h:, :h]
    big[-h:, -h:] = r[-h:, -h:]
    cc = np.fft.ifft2(big).real
    iy, ix = np.unravel_index(np.argmax(cc), cc.shape)

    def refine(idx, lo, mid, hi):
        d = lo - 2 * mid + hi
        return idx + (0.5 * (lo - hi) / d if d != 0 else 0.0)

    py = refine(iy, cc[(iy - 1) % m, ix], cc[iy, ix], cc[(iy + 1) % m, ix])
    px = refine(ix, cc[iy, (ix - 1) % m], cc[iy, ix], cc[iy, (ix + 1) % m])
    py = py - m if py > m / 2 else py
    px = px - m if px > m / 2 else px
    return py / pad, px / pad


def merge(frames, times, s_per_time, fw, shifts):
    """Register each frame by `shifts` (the shift that maps it onto frame 0) and take the Poisson
    maximum-likelihood radiance over unclipped samples: sum(e) / (s_per_time * sum(t)).
    Pixels clipped in every frame fall back to the lowest clip-free bound fw / (s_per_time * min t)."""
    num = np.zeros_like(frames[0])
    den = np.zeros_like(frames[0])
    for e, t, (dy, dx) in zip(frames, times, shifts):
        ok = (e < 0.98 * fw).astype(float)
        num += fourier_shift(np.maximum(e, 0) * ok, dy, dx)
        den += np.clip(fourier_shift(ok, dy, dx), 0, 1) * t
    rad = np.where(den > 1e-6, num / np.maximum(den, 1e-6) / s_per_time, fw / (s_per_time * min(times)))
    return rad


def display_psnr(est, truth, crop=6, peak=None):
    """PSNR after a display tone curve: normalise by the truth peak, clip to [0,1], gamma 1/2.2.
    A saturated or noisy estimate loses against the truth."""
    p = truth.max() if peak is None else peak
    f = lambda v: np.clip(v / p, 0, 1) ** (1 / 2.2)
    d = f(est) - f(truth)
    d = d[crop:d.shape[0] - crop, crop:d.shape[1] - crop]
    mse = float(np.mean(d * d))
    return 99.0 if mse < 1e-12 else -10 * np.log10(mse)


def var_large(x, s, A, read):
    """Variance of the radiance estimate from one large-sensor frame (s = small-sensor e per unit radiance)."""
    return (A * s * x + read ** 2) / (A * s) ** 2


def var_burst(x, s, N, read):
    """N small-sensor frames, each at the large frame's exposure time (burst takes N times longer)."""
    return (s * x + read ** 2) / (N * s ** 2)


def var_burst_fixed_time(x, s, N, read):
    """N small-sensor frames sharing the large frame's exposure time (each has s/N of the light)."""
    return (s * x + N * read ** 2) / s ** 2


def breakeven_frames(x, s, A, read):
    """Smallest real N at which var_burst == var_large: A^2 (s x + r^2) / (A s x + r^2).
    Shot-noise limit (r = 0): A. Read-noise limit (s x << r^2): A^2."""
    return A ** 2 * (s * x + read ** 2) / (A * s * x + read ** 2)
