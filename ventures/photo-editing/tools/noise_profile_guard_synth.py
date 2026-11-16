"""Synthetic checks behind the NoiseProfile guard (eval/noise-profile-real-dngs-2026-11-16.md).

1. Bias of the in-frame estimate (``xtrans_demosaic.estimate_noise``): true sigma over estimated sigma at the
   median level, on a smooth gradient field and with growing texture, for Bayer and X-Trans.
2. The guard on a half-smooth, half-detailed scene with known Poisson-Gaussian noise: colour PSNR of the
   directional default, the noise-aware blend with the true noise, with the noise overstated by k (1, 2, 4,
   16, 100 in sigma), and with that overstated profile passed through ``guard_profile``; plus
   ``profile_ratio``'s reading, which should be about k.

Usage (from ``ventures/photo-editing``, numpy installed)::

    PYTHONPATH=src python tools/noise_profile_guard_synth.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))

from test_raf import XE1_PATTERN  # noqa: E402

from shootflow import raw_develop_np as rnp  # noqa: E402
from shootflow.bayer_demosaic import directional as bayer  # noqa: E402
from shootflow.xtrans_demosaic import (  # noqa: E402
    _box3,
    colour_map,
    directional,
    estimate_noise,
    guard_profile,
    noise_aware,
)

CFAS = [("bayer", (0, 1, 1, 2), bayer), ("xtrans", XE1_PATTERN, directional)]


def _mosaic(truth, pat):
    cm = colour_map(pat, *truth.shape[:2])
    return np.take_along_axis(truth, cm[..., None].astype(np.int64), axis=2)[..., 0]


def _bilinear(c, pat):
    h, w = c.shape
    out = np.empty((h, w, 3))
    rnp._bilinear(c, w, h, pat, (1.0, 1.0, 1.0), 1e9, None, None, None, None, sink=out, threads=1)
    return out


def estimate_bias() -> None:
    rng = np.random.default_rng(2)
    print("estimate bias: true sigma / estimated sigma at the median level")
    for name, pat, _ in CFAS:
        for tex in (0.0, 0.01, 0.04):
            y, x = np.mgrid[0:1200, 0:1596]
            truth = np.stack([0.05 + 0.4 * x / 1596, 0.1 + 0.5 * y / 1200, 0.08 + 0.2 * (x + y) / 2800], -1)
            t = _box3(_box3(rng.normal(size=(1200, 1596)))) / 9
            truth = np.clip(truth * (1 + tex * t[..., None] / t.std()), 0, 1)
            c = _mosaic(truth, pat)
            shot, read = 1e-4, 1e-6
            c = c + rng.normal(size=c.shape) * np.sqrt(shot * c + read)
            g, r = estimate_noise(c, pat)
            med = float(np.median(c))
            print(f"  {name:6s} texture {tex:4.2f}: {np.sqrt(shot * med + read) / np.sqrt(g * med + r):.3f}")


def guard() -> None:
    rng = np.random.default_rng(4)
    print("guard: colour PSNR (dB) directional / true noise / overstated by k / overstated then guarded; ratio read")
    for name, pat, dm in CFAS:
        n = 288
        y, x = np.mgrid[0:n, 0:n].astype(float)
        lum = np.where(x >= n // 2, 0.35 + 0.2 * np.sin(x * x / (2.2 * n) + y / 9), 0.15 + 0.35 * y / n)
        truth = np.stack([lum, lum * 0.9, lum * 0.7], -1)
        c = _mosaic(truth, pat)
        for shot, read in ((5e-5, 5e-7), (2e-4, 2e-6)):
            cc = c + rng.normal(size=c.shape) * np.sqrt(shot * c + read)
            b, d = _bilinear(cc, pat), dm(cc, pat)

            def psnr(a):
                return 10 * np.log10(1 / np.mean((a[8:-8, 8:-8] - truth[8:-8, 8:-8]) ** 2))

            honest = psnr(noise_aware(cc, pat, bilinear=b, directional_out=d, noise=(shot, read)))
            for k in (1, 2, 4, 16, 100):
                over = (shot * k * k, read * k * k)
                used, ratio = guard_profile(cc, pat, over)
                print(
                    f"  {name:6s} shot {shot:.0e} k {k:3d}: {psnr(d):.2f} / {honest:.2f} / "
                    f"{psnr(noise_aware(cc, pat, bilinear=b, directional_out=d, noise=over)):.2f} / "
                    f"{psnr(noise_aware(cc, pat, bilinear=b, directional_out=d, noise=used)):.2f}; ratio {ratio:.2f}"
                )


if __name__ == "__main__":
    estimate_bias()
    guard()
