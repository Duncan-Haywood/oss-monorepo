"""Burst super-resolution on synthetic scenes (Poisson-Gaussian sensor, integer-pixel-grid shifts).

Geometry. A canvas has U canvas pixels per low-resolution (LR) sensor pixel. The high-resolution (HR)
grid has f HR pixels per LR pixel, so one HR pixel is U/f canvas pixels (U must be divisible by f).
A frame is the canvas, shifted by an integer number of canvas pixels (hand shake), box-averaged over
U x U blocks, so each LR pixel integrates its whole area (no anti-alias filter, as on a phone sensor).
The reconstruction lives on the HR grid and sees each shift rounded to the nearest HR pixel, so a
frame's true sub-HR-pixel offset (up to half an HR pixel) is an unmodelled registration error.
"""
import numpy as np

__all__ = ["make_canvas", "blockmean", "lr_frame", "hr_truth", "capture", "fourier_shift",
           "estimate_shift", "forward", "adjoint", "solve_ls", "bilinear_up", "merge_register",
           "psnr", "nyquist_energy"]


def make_canvas(size, U, pad=4, seed=0):
    """Radiance canvas of (size + 2*pad)*U px: smooth texture, rectangles, discs, and a fine grating
    patch (period ~2.4 LR px, above the LR Nyquist rate) so there is detail that one LR frame aliases."""
    rng = np.random.default_rng(seed)
    n = (size + 2 * pad) * U
    y, x = np.mgrid[0:n, 0:n] / float(U)
    img = 0.35 + 0.15 * np.sin(0.45 * x + 0.3 * np.sin(0.2 * y)) * np.cos(0.37 * y)
    for _ in range(7):
        cy, cx = rng.uniform(0, n / U, 2)
        h, w = rng.uniform(3, 10, 2)
        img[(abs(y - cy) < h) & (abs(x - cx) < w)] = rng.uniform(0.05, 0.9)
    for _ in range(4):
        cy, cx = rng.uniform(0, n / U, 2)
        r = rng.uniform(2, 6)
        img[(y - cy) ** 2 + (x - cx) ** 2 < r * r] = rng.uniform(0.1, 0.95)
    gy, gx = rng.uniform(pad + 4, pad + size - 14, 2)
    m = (y > gy) & (y < gy + 10) & (x > gx) & (x < gx + 10)
    th = rng.uniform(0, np.pi)
    img[m] = 0.5 + 0.35 * np.sin(2 * np.pi * (np.cos(th) * x + np.sin(th) * y) / 2.4)[m]
    return np.clip(img, 0.02, 1.0)


def blockmean(a, b):
    h, w = a.shape
    return a.reshape(h // b, b, w // b, b).mean(axis=(1, 3))


def lr_frame(canvas, shift, U, size, pad=4):
    """Noise-free LR frame at integer canvas shift (sy, sx): the cropped scene, treated as periodic, moves by -shift."""
    o = pad * U
    c = np.roll(canvas[o:o + size * U, o:o + size * U], (-shift[0], -shift[1]), axis=(0, 1))
    return blockmean(c, U)


def hr_truth(canvas, U, f, size, pad=4):
    """Noise-free HR image (the target): the unshifted canvas box-averaged to the HR grid."""
    o = pad * U
    return blockmean(canvas[o:o + size * U, o:o + size * U], U // f)


def capture(rad, s, read, rng):
    """Electrons: Poisson(s*rad) plus Gaussian read noise (sd `read` e-); returned as radiance (e/s)."""
    return (rng.poisson(rad * s) + read * rng.standard_normal(rad.shape)) / s


def fourier_shift(img, dy, dx):
    fy = np.fft.fftfreq(img.shape[0])[:, None]
    fx = np.fft.fftfreq(img.shape[1])[None, :]
    return np.fft.ifft2(np.fft.fft2(img) * np.exp(-2j * np.pi * (fy * dy + fx * dx))).real


def estimate_shift(ref, img, pad=8):
    """Shift (dy, dx), in LR pixels, such that fourier_shift(img, dy, dx) ~ ref (same estimator as
    sensing-burst: windowed cross-correlation, zero-padded spectrum, parabola-refined peak)."""
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


def forward(h, off, f):
    """LR frame predicted from HR image h at HR-pixel offset `off`: shift by -off, box-average f x f."""
    return blockmean(np.roll(h, (-off[0], -off[1]), axis=(0, 1)), f)


def adjoint(y, off, f):
    return np.roll(np.kron(y, np.ones((f, f))) / (f * f), (off[0], off[1]), axis=(0, 1))


def _lap(h):
    return 4 * h - np.roll(h, 1, 0) - np.roll(h, -1, 0) - np.roll(h, 1, 1) - np.roll(h, -1, 1)


def solve_ls(frames, offs, f, lam, h0, iters=80):
    """Minimise (1/N) sum_k |A_k h - y_k|^2 + lam |grad h|^2 by conjugate gradients, from h0."""
    N = len(frames)
    b = sum(adjoint(y, o, f) for y, o in zip(frames, offs)) / N

    def op(h):
        return sum(adjoint(forward(h, o, f), o, f) for o in offs) / N + lam * _lap(h)

    h = h0.copy()
    r = b - op(h)
    p = r.copy()
    rs = float(np.sum(r * r))
    for _ in range(iters):
        if rs < 1e-24:
            break
        Ap = op(p)
        a = rs / float(np.sum(p * Ap))
        h += a * p
        r -= a * Ap
        rn = float(np.sum(r * r))
        p = r + (rn / rs) * p
        rs = rn
    return h


def bilinear_up(a, f):
    """Separable linear interpolation of an LR image onto the HR grid (pixel centres aligned), edges replicated."""
    n = a.shape[0] * f
    pos = (np.arange(n) + 0.5) / f - 0.5
    lo = np.clip(np.floor(pos).astype(int), 0, a.shape[0] - 1)
    hi = np.clip(lo + 1, 0, a.shape[0] - 1)
    t = np.clip(pos - lo, 0, 1)
    rows = a[lo] * (1 - t)[:, None] + a[hi] * t[:, None]
    return rows[:, lo] * (1 - t)[None, :] + rows[:, hi] * t[None, :]


def merge_register(frames, shifts_lr):
    """Average LR frames after Fourier-registering each onto frame 0 (shifts in LR px, as estimate_shift)."""
    return np.mean([fourier_shift(y, dy, dx) for y, (dy, dx) in zip(frames, shifts_lr)], axis=0)


def psnr(est, truth, crop=4, peak=1.0):
    d = (est - truth)[crop:-crop, crop:-crop]
    mse = float(np.mean(d * d))
    return 99.0 if mse < 1e-12 else -10 * np.log10(mse / peak ** 2)


def nyquist_energy(img, f):
    """Fraction of an HR image's spectral energy (mean removed) beyond the LR Nyquist rate (|freq| > 1/(2f) cycles per HR px)."""
    F = np.abs(np.fft.fft2(img - img.mean())) ** 2
    fy = np.fft.fftfreq(img.shape[0])[:, None]
    fx = np.fft.fftfreq(img.shape[1])[None, :]
    hi = (np.abs(fy) > 0.5 / f) | (np.abs(fx) > 0.5 / f)
    return float(F[hi].sum() / F.sum())
