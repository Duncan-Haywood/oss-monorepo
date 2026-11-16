"""Check the C path of the directional Bayer demosaic against the numpy reference on real raw files.

For each file, the visible sensor data is read through rawpy (LibRaw), black-subtracted, scaled to
0..1 and white-balanced with the file's as-shot multipliers (the plane ``raw_develop_np._directional``
hands the demosaic), then demosaiced by ``bayer_demosaic.directional`` with ``native=False`` (numpy)
and ``native=True`` (C). Printed per file, one JSON row: whether the two outputs are equal bit for
bit, the largest difference, and the best of ``--repeat`` wall times on one thread and on every CPU,
with LibRaw's AHD ``postprocess`` time on the same file for scale (single-threaded C, and it includes
LibRaw's colour and output steps, so it is a yardstick, not a like-for-like).

Usage (from ``ventures/photo-editing``)::

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    PYTHONPATH=src /tmp/v/bin/python tools/bayer_native_check.py FILE.ARW [...] > rows.jsonl

``--laplace learned`` checks the learned per-sensel weight instead (and adds the default's C time on
every CPU, ``c_default_all``, for scale).

Results: ``eval/bayer-native-2026-11-15.md``; ``--laplace learned``: ``eval/bayer-learned-native-2026-11-16.md``.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

import numpy as np


def plane(path: str):
    import rawpy

    raw = rawpy.imread(path)
    vis = np.asarray(raw.raw_image_visible, dtype=np.float32)
    cols = np.asarray(raw.raw_colors_visible)
    pat = tuple(int(v) for v in cols[:2, :2].ravel())
    pat = tuple(1 if v == 3 else v for v in pat)  # LibRaw numbers the second green 3
    black = np.asarray(raw.black_level_per_channel, dtype=np.float32)[cols]
    white = float(raw.white_level)
    wb = np.asarray(raw.camera_whitebalance[:3], dtype=np.float32)
    wb = wb / wb[1]
    gains = wb[np.where(cols == 3, 1, cols)]
    c = np.clip((vis - black) / (white - black), 0, None) * gains
    return raw, c.astype(np.float32), pat


def best(fn, repeat: int) -> tuple[float, object]:
    out, t = None, float("inf")
    for _ in range(repeat):
        t0 = time.perf_counter()
        out = fn()
        t = min(t, time.perf_counter() - t0)
    return t, out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("files", nargs="+")
    ap.add_argument("--repeat", type=int, default=2)
    ap.add_argument("--rb", default="weighted", choices=("weighted", "simple"))
    ap.add_argument("--laplace", default="0.1875", help="a fixed weight, or 'learned'")
    args = ap.parse_args(argv)
    lap = args.laplace if args.laplace == "learned" else float(args.laplace)

    import rawpy

    from shootflow import bayer_native
    from shootflow.bayer_demosaic import directional

    if not bayer_native.available():
        print("the C path did not build (no C compiler?)", file=sys.stderr)
        return 2
    for path in args.files:
        raw, c, pat = plane(path)
        row = {"file": os.path.basename(path), "size": list(c.shape), "pattern": pat, "rb": args.rb, "laplace": args.laplace}
        t_np1, a = best(lambda: directional(c, pat, rb=args.rb, laplace=lap, native=False, threads=1), args.repeat)
        t_np, a = best(lambda: directional(c, pat, rb=args.rb, laplace=lap, native=False), args.repeat)
        t_c1, b = best(lambda: directional(c, pat, rb=args.rb, laplace=lap, native=True, threads=1), args.repeat)
        t_c, b = best(lambda: directional(c, pat, rb=args.rb, laplace=lap, native=True), args.repeat)
        row["equal"] = bool(np.array_equal(a, b))
        row["max_abs_diff"] = float(np.max(np.abs(a - b)))
        row["seconds"] = {
            "numpy_1_thread": round(t_np1, 3),
            "numpy_all": round(t_np, 3),
            "c_1_thread": round(t_c1, 3),
            "c_all": round(t_c, 3),
        }
        if lap == "learned":
            row["seconds"]["c_default_all"] = round(best(lambda: directional(c, pat, rb=args.rb, native=True), args.repeat)[0], 3)
        t_ahd, _ = best(
            lambda: rawpy.imread(path).postprocess(demosaic_algorithm=rawpy.DemosaicAlgorithm.AHD, output_bps=16),
            args.repeat,
        )
        row["seconds"]["libraw_ahd_postprocess"] = round(t_ahd, 3)
        row["cpus"] = os.cpu_count()
        raw.close()
        print(json.dumps(row), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
