"""Measure Bayer demosaics against a known truth, and against LibRaw on the real frames.

The Bayer twin of ``tools/xtrans_demosaic_check.py`` (same scores, same truths, same way of running
LibRaw on a mosaic of our choosing), on real Bayer raw files read through rawpy (LibRaw) and numpy:

**Known truth.** A truth picture is mosaicked with the file's own Bayer phase and demosaiced by ours
(bilinear, the developer's method until 2026-11-15, and ``bayer_demosaic.directional`` with its
variants) and by LibRaw's Bayer methods (linear, VNG, PPG, AHD, DCB, DHT, AAHD), run by writing the
mosaic into the file's visible sensor data in memory and calling ``postprocess``. Truths: each file's
own frame rendered by LibRaw (AHD) and binned 4 x 4 (real edges, textures and colours, with the
demosaic error and noise binned away), and the synthetic sheet (zone plate, coloured discs, slanted
colour edge). ``--noise-snr`` adds Poisson-Gaussian noise to the mosaic (scored against the clean
truth).

**Real frames.** Ours against LibRaw's AHD on the frame's own sensor data: closeness, not quality.

Usage (from ``ventures/photo-editing``)::

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    PYTHONPATH=src:tools /tmp/v/bin/python tools/bayer_demosaic_check.py FILE.CR2 [...] > rows.jsonl

Files and results: ``eval/bayer-directional-demosaic-2026-11-15.md``.
"""

from __future__ import annotations

import argparse
import json
import sys
import time

import numpy as np
from xtrans_demosaic_check import (  # tools/ on PYTHONPATH
    _fit,
    add_noise,
    mosaic,
    ours_bilinear,
    scores,
    synthetic_sheet,
)

LIBRAW = ((0, "libraw linear"), (1, "libraw VNG"), (2, "libraw PPG"), (3, "libraw AHD"), (4, "libraw DCB"),
          (11, "libraw DHT"), (12, "libraw AAHD"))


def libraw_demosaic(path: str, region: np.ndarray, quality: int) -> np.ndarray:
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


def known_truth_rows(path, name, truth, pat, variants, snr=None, libraw=True):
    c = mosaic(truth, pat)
    if snr:
        c = add_noise(c, snr)
        name = f"{name}, noise SNR {snr:g}"
    rows = []
    for label, fn in variants:
        t = time.perf_counter()
        test = np.asarray(fn(c, pat), dtype=np.float64)
        rows.append({"truth": name, "method": label, **scores(test, truth), "s": round(time.perf_counter() - t, 2)})
    if libraw:
        for q, label in LIBRAW:
            t = time.perf_counter()
            test = _fit(libraw_demosaic(path, np.clip(c, 0.0, 1.0), q), truth)
            rows.append({"truth": name, "method": label, **scores(test, truth), "s": round(time.perf_counter() - t, 2)})
    return rows


def real_frame_rows(path: str, variants) -> list[dict]:
    import rawpy

    raw = rawpy.imread(path)
    pat = _pattern_bayer(raw)
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
        test = np.clip(np.asarray(fn(c, pat), dtype=np.float64), 0.0, 1.0)
        s = time.perf_counter() - t
        rows.append({"against": "libraw AHD (real sensor data)", "method": label, **scores(_fit(test, ref), ref),
                     "s": round(s, 2), "size": [w, h]})
    return rows


def _pattern_bayer(raw) -> tuple[int, ...]:
    colours = np.asarray(raw.raw_colors_visible[:2, :2]).astype(int)
    colours[colours == 3] = 1
    desc = raw.color_desc.decode()
    order = {ch: i for i, ch in enumerate("RGB")}
    return tuple(order.get(desc[v], 1) for v in colours.ravel())


def variants_for(names: list[str] | None, candidate: tuple[float, ...] | None = None):
    from shootflow.bayer_demosaic import directional

    allv = {
        "bilinear": ("ours bilinear", ours_bilinear),
        "default": ("ours directional (default)", lambda c, p: directional(c, p)),
        "laplace-quarter": ("ours directional, Hamilton-Adams 1/4 (2026-11-15 first)", lambda c, p: directional(c, p, laplace=0.25)),
        "laplace-eighth": ("ours directional, Laplacian 1/8", lambda c, p: directional(c, p, laplace=0.125)),
        "laplace-adaptive": ("ours directional, per-sensel Laplacian weight (2026-11-16)", lambda c, p: directional(c, p, laplace="adaptive")),
        "laplace-learned": ("ours directional, learned Laplacian weight (2026-11-16)", lambda c, p: directional(c, p, laplace="learned")),
        "simple-rb": ("ours directional, simple red/blue", lambda c, p: directional(c, p, rb="simple")),
        "median": ("ours directional, one median", lambda c, p: directional(c, p, median_passes=1)),
        "power1": ("ours directional, power 1", lambda c, p: directional(c, p, power=1.0)),
        "power4": ("ours directional, power 4", lambda c, p: directional(c, p, power=4.0)),
        "window1": ("ours directional, window 3x3", lambda c, p: directional(c, p, window=1)),
        "window3": ("ours directional, window 7x7", lambda c, p: directional(c, p, window=3)),
    }
    if candidate is not None:  # a fit not yet in LEARNED_LAPLACE (--learned-fit), scored as its own variant
        allv["laplace-candidate"] = ("ours directional, candidate learned weight (--learned-fit)",
                                     lambda c, p: directional(c, p, laplace=candidate))
    keys = names or list(allv)
    return [allv[k] for k in keys]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("raw", nargs="+")
    ap.add_argument("--skip-real", action="store_true")
    ap.add_argument("--skip-sheet", action="store_true")
    ap.add_argument("--no-libraw", action="store_true", help="score ours only (fast tuning runs)")
    ap.add_argument("--variant", action="append", help="variant keys (default: all)")
    ap.add_argument("--noise-snr", type=float, action="append", default=[])
    ap.add_argument("--learned-fit", help="a tools/bayer_laplace_train.py output; adds the laplace-candidate variant")
    args = ap.parse_args(argv)
    import rawpy

    candidate = None
    if args.learned_fit:
        with open(args.learned_fit) as fh:
            fits = [json.loads(line) for line in fh if line.strip().startswith("{") and '"fit"' in line]
        candidate = tuple(fits[-1]["fit"])
    variants = variants_for(args.variant, candidate)
    for path in args.raw:
        raw = rawpy.imread(path)
        if raw.raw_pattern is None or raw.raw_pattern.shape != (2, 2):
            print(json.dumps({"file": path, "skipped": "not a 2x2 Bayer CFA"}))
            continue
        pat = _pattern_bayer(raw)
        name = path.rsplit("/", 1)[-1]
        truths = [(f"{name} binned 4x4", binned_truth(path))]
        if not args.skip_sheet:
            truths.append(("synthetic sheet", synthetic_sheet()))
        for truth_name, truth in truths:
            for row in known_truth_rows(path, truth_name, truth, pat, variants, libraw=not args.no_libraw):
                print(json.dumps({"file": name, "cfa": "".join("RGB"[v] for v in pat), **row}), flush=True)
            for snr in args.noise_snr:
                for row in known_truth_rows(path, truth_name, truth, pat, variants, snr, libraw=not args.no_libraw):
                    print(json.dumps({"file": name, **row}), flush=True)
        if not args.skip_real:
            for row in real_frame_rows(path, variants):
                print(json.dumps({"file": name, **row}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
