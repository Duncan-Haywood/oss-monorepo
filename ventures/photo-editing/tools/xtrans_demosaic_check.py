"""Measure X-Trans demosaics against a known truth, and against LibRaw on the real frames.

Two checks, both on real RAFs read through rawpy (LibRaw) and numpy:

**Known truth.** A truth picture is mosaicked with the RAF's own X-Trans layout and demosaiced by:
ours bilinear (``raw_develop_np._bilinear``, the developer's current method), ours directional
(``xtrans_demosaic.directional``) and LibRaw's own X-Trans methods, run by writing the mosaic into
the RAF's sensor data in memory (``raw_image_visible``) and calling ``postprocess`` (linear
interpolation at quality 0; Markesteijn one pass at 1-2; three passes at 3). Truth pictures:

* each RAF's own frame, rendered by LibRaw (three-pass) and binned 4 x 4, which removes nearly all
  demosaic error and noise while keeping real edges, textures and colours, at a size the X-Trans
  sampling then has to recover;
* a synthetic sheet: a circular zone plate (luminance detail up to Nyquist), colour-edged discs and
  a slanted colour edge, the cases where demosaics make false colour.

Scores, on the interior (a 12-sensel border dropped): colour PSNR over the three channels (peak 1),
luminance PSNR, and the mean and 99th-percentile chroma error (R - G and B - G against the truth's),
the false colour a viewer sees. LibRaw's output is matched to the truth by one least-squares gain per
channel (its scaling to 16 bits differs from ours); ours are scored as they come.

**Half size.** The developer's X-Trans half size (full demosaic, then 2x2 averages) for both of ours,
against the truth's 2x2 averages.

**Real frames.** Our two demosaics against LibRaw's three-pass X-Trans on the real sensor data, same
white balance, linear camera RGB: PSNR of each against LibRaw's. This says which of ours is nearer
the established method; it is not a quality score on its own.

Usage (from ``ventures/photo-editing``)::

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    PYTHONPATH=src /tmp/v/bin/python tools/xtrans_demosaic_check.py FILE.RAF [...] > rows.jsonl

**Other cameras' frames as truth** (``--truth-from FILE``, repeatable, 2026-11-16). Only two X-Trans
frames are in the public sample set, so any LibRaw-readable raw (a Bayer frame from another camera)
can be rendered, binned 4 x 4 the same way, cropped to ``--truth-crop`` (default 800 x 1200) and
mosaicked with each RAF's own X-Trans layout. The scene is real; only the layout is borrowed. These
are scored like the RAF's own binned frame, LibRaw included (the mosaic is written into the RAF).

Real files used on 2026-11-14: the X-E1 and X-E2 RAFs in drewnoakes/metadata-extractor-images
(``raf/``; the X-E2 is the file named ``FujiFilm EX-2.raf``); ``eval/xtrans-directional-demosaic-2026-11-14.md``
and, for the clamp and the gradient choice, ``eval/xtrans-clamp-gradient-2026-11-15.md``.
"""

from __future__ import annotations

import argparse
import json
import sys
import time

import numpy as np

BORDER = 12


def _pattern(raw) -> tuple[int, ...]:
    colours = np.asarray(raw.raw_colors_visible[:6, :6]).astype(int)
    colours[colours == 3] = 1
    desc = raw.color_desc.decode()
    order = {ch: i for i, ch in enumerate("RGB")}
    return tuple(order[desc[v]] if desc[v] in order else 1 for v in colours.ravel())


def mosaic(truth: np.ndarray, pat) -> np.ndarray:
    from shootflow.xtrans_demosaic import colour_map

    h, w, _ = truth.shape
    cm = colour_map(pat, h, w)
    return np.take_along_axis(truth, cm[..., None].astype(np.int64), axis=2)[..., 0]


def ours_bilinear(c: np.ndarray, pat) -> np.ndarray:
    from shootflow import raw_develop_np as rnp

    h, w = c.shape
    out = np.empty((h, w, 3), dtype=np.float64)
    rnp._bilinear(c, w, h, pat, (1.0, 1.0, 1.0), 1e9, None, None, None, None, sink=out, threads=1)
    return out


def ours_directional(c: np.ndarray, pat, **kw) -> np.ndarray:
    from shootflow.xtrans_demosaic import directional

    return directional(c, pat, **kw)


def libraw_demosaic(path: str, region: np.ndarray, quality: int) -> np.ndarray:
    """Write ``region`` (values 0..1, the RAF's layout at the visible origin) into the RAF's visible
    sensor data, fill the rest with mid grey, and demosaic with LibRaw at ``quality``."""

    import rawpy

    raw = rawpy.imread(path)
    vis = raw.raw_image_visible
    black = float(np.mean(raw.black_level_per_channel))
    white = float(raw.white_level)
    h, w = region.shape
    vis[...] = int(black + 0.18 * (white - black))
    vis[:h, :w] = np.round(black + region * (white - black)).astype(vis.dtype)
    rgb = raw.postprocess(
        demosaic_algorithm=rawpy.DemosaicAlgorithm(quality),
        output_color=rawpy.ColorSpace.raw,
        gamma=(1, 1),
        no_auto_bright=True,
        output_bps=16,
        user_wb=[1.0, 1.0, 1.0, 1.0],
        user_flip=0,
        highlight_mode=rawpy.HighlightMode.Clip,
    )
    return rgb[:h, :w].astype(np.float64) / 65535.0


def _fit(test: np.ndarray, truth: np.ndarray) -> np.ndarray:
    out = np.empty_like(test)
    for k in range(3):
        a, b = test[..., k].ravel(), truth[..., k].ravel()
        out[..., k] = test[..., k] * (a @ b) / max(a @ a, 1e-30)
    return out


def scores(test: np.ndarray, truth: np.ndarray) -> dict:
    t = test[BORDER:-BORDER, BORDER:-BORDER]
    r = truth[BORDER:-BORDER, BORDER:-BORDER]
    mse = float(np.mean((t - r) ** 2))
    lum = lambda a: 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]  # noqa: E731
    lmse = float(np.mean((lum(t) - lum(r)) ** 2))
    chroma = lambda a: np.stack([a[..., 0] - a[..., 1], a[..., 2] - a[..., 1]], axis=-1)  # noqa: E731
    ce = np.sqrt(np.sum((chroma(t) - chroma(r)) ** 2, axis=-1))
    return {
        "cpsnr": round(10 * np.log10(1.0 / max(mse, 1e-20)), 2),
        "lpsnr": round(10 * np.log10(1.0 / max(lmse, 1e-20)), 2),
        "chroma_mean": round(float(ce.mean()) * 1000, 3),
        "chroma_p99": round(float(np.percentile(ce, 99)) * 1000, 2),
    }


def synthetic_sheet(n: int = 768) -> np.ndarray:
    """Zone plate (left half), coloured discs and a slanted red/cyan edge (right half), values 0.05..0.85."""

    y, x = np.mgrid[0:n, 0 : 2 * n].astype(np.float64)
    out = np.empty((n, 2 * n, 3))
    cy, cx = n / 2, n / 2
    r2 = (y - cy) ** 2 + (x - cx) ** 2
    zp = 0.45 + 0.4 * np.cos(np.pi * r2 / (2.0 * n))  # local frequency reaches 0.5 cycles/px at the edge
    left = x < n
    for k in range(3):
        out[..., k] = np.where(left, zp, 0.45)
    # slanted edge, top right quarter: red one side, cyan the other
    edge = (x - n) * np.cos(0.1) - y * np.sin(0.1) > n / 2
    top = (y < n / 2) & ~left
    out[top & edge] = (0.75, 0.15, 0.12)
    out[top & ~edge] = (0.12, 0.55, 0.7)
    # discs, bottom right: blue, yellow, green on grey
    for i, colour in enumerate(((0.1, 0.15, 0.8), (0.8, 0.75, 0.1), (0.1, 0.7, 0.2))):
        dcx, dcy, rad = n + n / 6 + i * n / 3, 3 * n / 4, n / 8
        disc = ((x - dcx) ** 2 + (y - dcy) ** 2 < rad**2) & ~left & (y >= n / 2)
        out[disc] = colour
    return np.clip(out, 0.0, 1.0)


def binned_truth(path: str, factor: int = 4) -> np.ndarray:
    import rawpy

    raw = rawpy.imread(path)
    rgb = raw.postprocess(
        demosaic_algorithm=rawpy.DemosaicAlgorithm(3),
        output_color=rawpy.ColorSpace.raw,
        gamma=(1, 1),
        no_auto_bright=True,
        output_bps=16,
        use_camera_wb=True,
        user_flip=0,
    ).astype(np.float64) / 65535.0
    h, w = (rgb.shape[0] // factor) * factor, (rgb.shape[1] // factor) * factor
    b = rgb[:h, :w].reshape(h // factor, factor, w // factor, factor, 3).mean(axis=(1, 3))
    return np.clip(b / max(float(np.percentile(b, 99.5)), 1e-6) * 0.8, 0.0, 0.95)


def add_noise(c: np.ndarray, snr: float, seed: int = 0) -> np.ndarray:
    """Poisson-Gaussian sensor-like noise on a mosaic (values 0..1): variance a*x + b, with signal-to-noise
    ``snr`` at 18% grey, 80% of the variance there from shot noise and 20% from read noise."""

    sigma = 0.18 / snr
    a, b = 0.8 * sigma**2 / 0.18, 0.2 * sigma**2
    rng = np.random.default_rng(seed)
    return c + rng.normal(size=c.shape) * np.sqrt(a * np.clip(c, 0.0, None) + b)


def known_truth_rows(path: str, name: str, truth: np.ndarray, pat, variants, snr: float | None = None) -> list[dict]:
    c = mosaic(truth, pat)
    if snr:  # scored against the clean truth; LibRaw is given the noisy mosaic clipped to 0..1
        c = add_noise(c, snr)
        name = f"{name}, noise SNR {snr:g}"
    rows = []
    t0 = time.perf_counter()
    for label, fn in variants:
        t = time.perf_counter()
        test = fn(c, pat)
        rows.append({"truth": name, "method": label, **scores(test, truth), "s": round(time.perf_counter() - t, 2)})
    for q, label in ((0, "libraw linear"), (1, "libraw markesteijn 1-pass"), (3, "libraw markesteijn 3-pass")):
        t = time.perf_counter()
        test = _fit(libraw_demosaic(path, np.clip(c, 0.0, 1.0), q), truth)
        rows.append({"truth": name, "method": label, **scores(test, truth), "s": round(time.perf_counter() - t, 2)})
    del t0
    return rows


def _half(a: np.ndarray) -> np.ndarray:
    h, w = a.shape[0] // 2 * 2, a.shape[1] // 2 * 2
    return a[:h, :w].reshape(h // 2, 2, w // 2, 2, 3).mean(axis=(1, 3))


def half_size_rows(name: str, truth: np.ndarray, pat) -> list[dict]:
    """The developer's X-Trans half size: full demosaic, then 2x2 averages, against the truth's 2x2 averages."""

    c = mosaic(truth, pat)
    th = _half(truth)
    return [
        {"truth": f"{name}, half size", "method": label, **scores(_half(fn(c, pat)), th)}
        for label, fn in (("ours bilinear", ours_bilinear), ("ours directional", ours_directional))
    ]


def real_frame_rows(path: str, variants) -> list[dict]:
    """Ours against LibRaw three-pass on the frame's own sensor data (camera white balance)."""

    import rawpy

    raw = rawpy.imread(path)
    pat = _pattern(raw)
    vis = raw.raw_image_visible.astype(np.float64)
    cols = raw.raw_colors_visible
    black = np.asarray(raw.black_level_per_channel, dtype=np.float64)[cols]
    wb = np.asarray(raw.camera_whitebalance[:3], dtype=np.float64)
    wb = wb / wb[1]
    cm = np.where(cols == 3, 1, cols)
    span = float(raw.white_level) - float(np.mean(raw.black_level_per_channel))
    c = np.clip((vis - black) / span, 0.0, None) * wb[cm]
    ref = raw.postprocess(
        demosaic_algorithm=rawpy.DemosaicAlgorithm(3),
        output_color=rawpy.ColorSpace.raw,
        gamma=(1, 1),
        no_auto_bright=True,
        output_bps=16,
        use_camera_wb=True,
        user_flip=0,
        highlight_mode=rawpy.HighlightMode.Clip,
    ).astype(np.float64) / 65535.0
    h, w = min(ref.shape[0], c.shape[0]), min(ref.shape[1], c.shape[1])
    c, ref = c[:h, :w], ref[:h, :w]
    rows = []
    for label, fn in variants:
        t = time.perf_counter()
        test = np.clip(fn(c, pat), 0.0, 1.0)
        s = time.perf_counter() - t
        fitted = _fit(test, ref)  # one gain per channel: LibRaw's 16-bit scaling
        rows.append({"against": "libraw markesteijn 3-pass (real sensor data)", "method": label, **scores(fitted, ref), "s": round(s, 2)})
    return rows


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("raf", nargs="+")
    ap.add_argument("--skip-real", action="store_true")
    ap.add_argument(
        "--noise-snr", type=float, action="append", default=[],
        help="also score each known truth with sensor-like noise of this SNR at 18%% grey (repeatable)",
    )
    ap.add_argument(
        "--truth-from", action="append", default=[],
        help="also use this raw file's frame (any camera LibRaw reads), binned 4x4, as a known truth (repeatable)",
    )
    ap.add_argument("--truth-crop", default="800x1200", help="rows x columns kept of each --truth-from frame")
    ap.add_argument("--skip-own", action="store_true", help="skip the RAF's own frame and the sheet")
    args = ap.parse_args(argv)
    import rawpy

    crop_h, crop_w = (int(v) for v in args.truth_crop.lower().split("x"))
    borrowed = [
        (f"{t.rsplit('/', 1)[-1]} binned 4x4", binned_truth(t)[:crop_h, :crop_w].copy()) for t in args.truth_from
    ]

    variants = [
        ("ours bilinear", ours_bilinear),
        (
            "ours directional, 2026-11-14 rule (no clamp, homogeneity)",
            lambda c, p: ours_directional(c, p, clamp=False, select="homogeneity"),
        ),
        ("ours directional, no clamp", lambda c, p: ours_directional(c, p, clamp=False)),
        ("ours directional, homogeneity choice", lambda c, p: ours_directional(c, p, select="homogeneity")),
        ("ours directional, no median", lambda c, p: ours_directional(c, p, median_passes=0)),
        ("ours directional (default: one pass, one median)", lambda c, p: ours_directional(c, p)),
        ("ours directional, three passes", lambda c, p: ours_directional(c, p, passes=3)),
        ("ours directional, median sets red and blue only", lambda c, p: ours_directional(c, p, median_green=False)),
    ]
    for path in args.raf:
        raw = rawpy.imread(path)
        pat = _pattern(raw)
        if len(set(pat)) != 3 or raw.raw_pattern.shape != (6, 6):
            print(json.dumps({"file": path, "skipped": "not X-Trans"}))
            continue
        name = path.rsplit("/", 1)[-1]
        sheet = synthetic_sheet()
        own = [] if args.skip_own else [(f"{name} binned 4x4", binned_truth(path)), ("synthetic sheet", sheet)]
        for truth_name, truth in own + [(f"{t} ({name} layout)", tr) for t, tr in borrowed]:
            for row in known_truth_rows(path, truth_name, truth, pat, variants):
                print(json.dumps({"file": name, **row}), flush=True)
            for row in half_size_rows(truth_name, truth, pat):
                print(json.dumps({"file": name, **row}), flush=True)
            for snr in args.noise_snr:
                for row in known_truth_rows(path, truth_name, truth, pat, variants, snr):
                    print(json.dumps({"file": name, **row}), flush=True)
        if not args.skip_real:
            for row in real_frame_rows(path, variants):
                print(json.dumps({"file": name, **row}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
