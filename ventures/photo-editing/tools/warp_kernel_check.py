"""Bilinear against cubic (Catmull-Rom) resampling for the warps, measured two ways.

1. Accuracy under a real camera's warp. The Leica T DNG's own WarpRectilinear
   terms (read from the file) are run on band-limited test patterns
   ``0.5 + 0.4 sin(2 pi (fx x + fy y))`` whose value at any point is known, so
   every interior output pixel can be compared with the pattern at the source
   point the warp names. Reported: RMS error per spatial frequency, both kernels.
2. The real frame. The Leica T DNG is developed (numpy engine, full size) with
   no warp, the bilinear warp and the cubic warp; reported are the time and the
   mean absolute Laplacian of the 8-bit green channel (fine detail kept), and
   the largest difference between the two engines' cubic output on a crop.

Usage:
    python3 tools/warp_kernel_check.py "Leica T (Typ 701).dng"
    (from raw.githubusercontent.com/drewnoakes/metadata-extractor-images/master/dng/)
"""

from __future__ import annotations

import argparse
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import numpy as np  # noqa: E402

from shootflow import dng_opcodes as do  # noqa: E402
from shootflow import raw_develop as rd  # noqa: E402


def pattern(fx, fy, xs, ys):
    return 0.5 + 0.4 * np.sin(2.0 * math.pi * (fx * xs + fy * ys))


def accuracy(wp, w, h):
    rows = []
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
    # The source point of every output pixel, plane 1 (green), from the module's reference formula.
    sx = np.empty((h, w))
    sy = np.empty((h, w))
    for y in range(h):
        for x in range(w):
            sx[y, x], sy[y, x] = do.warp_source(wp, 1, x, y, w, h)
    for f in (0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4):
        fx, fy = f * 0.8, f * 0.6  # a diagonal grating, |f| = f cycles per pixel
        img = np.repeat(pattern(fx, fy, xx, yy)[..., None], 3, axis=2)
        inside = (sx >= 2) & (sx <= w - 3) & (sy >= 2) & (sy <= h - 3)
        want = pattern(fx, fy, sx, sy)
        out = {}
        for k in do.WARP_KERNELS:
            got = do.warp_planes([wp], img.copy(), kernel=k)[..., 1]
            out[k] = float(np.sqrt(np.mean((got - want)[inside] ** 2)))
        rows.append((f, out["bilinear"], out["cubic"]))
    return rows


def laplacian(g):
    g = g.astype(np.float64)
    lap = 4 * g[1:-1, 1:-1] - g[:-2, 1:-1] - g[2:, 1:-1] - g[1:-1, :-2] - g[1:-1, 2:]
    return float(np.mean(np.abs(lap)))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("dng")
    ap.add_argument("--size", default="600x400", help="test-pattern size for the accuracy table")
    args = ap.parse_args(argv)
    raw = rd.parse_raw(Path(args.dng).read_bytes())
    plan = do.plan(raw.ifd, raw.ifd0)
    warps = [op for op in plan.stage3 if isinstance(op, do.WARP_TYPES)]
    if not warps:
        sys.exit("no warp in this file's OpcodeList3")
    wp = warps[0]
    print(f"warp: {type(wp).__name__} centre ({wp.cx:.4f}, {wp.cy:.4f}) green terms {wp.plane_terms(1)}")
    w, h = (int(v) for v in args.size.split("x"))
    print(f"\n1. RMS error against the pattern at the source point, {w}x{h}, interior pixels")
    print("   cycles/px  bilinear   cubic     cubic/bilinear")
    for f, b, c in accuracy(wp, w, h):
        print(f"   {f:9.2f}  {b:.6f}  {c:.6f}  {c / b:6.3f}")

    print("\n2. Real frame, numpy engine, full size")
    res = {}
    for label, settings in (
        ("no warp", rd.DevelopSettings(engine="numpy", opcodes=False)),
        ("bilinear", rd.DevelopSettings(engine="numpy")),
        ("cubic", rd.DevelopSettings(engine="numpy", warp_kernel="cubic")),
    ):
        t0 = time.perf_counter()
        ow, oh, px, _rep = rd.develop(raw, settings)
        took = time.perf_counter() - t0
        g = (np.frombuffer(px.tobytes(), dtype=np.uint16).reshape(oh, ow, 3)[..., 1] >> 8).astype(np.uint8)
        res[label] = g
        print(f"   {label:9s} {ow}x{oh}  {took:6.2f} s  mean |Laplacian| of green {laplacian(g):.3f}")
    d = np.abs(res["cubic"].astype(int) - res["bilinear"].astype(int))
    print(f"   cubic vs bilinear 8-bit green: mean {d.mean():.3f}, 99.9th pct {np.percentile(d, 99.9):.0f}, max {d.max()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
