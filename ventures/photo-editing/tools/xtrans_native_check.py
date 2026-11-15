"""Check the C path of the directional X-Trans demosaic against the numpy reference on real RAFs.

For each file, the visible sensor data is read through rawpy (LibRaw), black-subtracted, scaled to
0..1 and white-balanced with the file's as-shot multipliers (the plane ``tools/xtrans_demosaic_check.py``
uses), then demosaiced by ``xtrans_demosaic.directional`` with ``native=False`` (numpy) and
``native=True`` (C), default settings (gradient choice, clamp, one pass, one median). Printed per file,
one JSON row: whether the two outputs are equal bit for bit, the largest difference, the best of
``--repeat`` wall times on one thread and on every CPU, and LibRaw's own X-Trans ``postprocess``
(Markesteijn, one pass and three passes) on the same file for scale: single-threaded C that includes
LibRaw's colour and output steps, so a yardstick, not a like-for-like.

Usage (from ``ventures/photo-editing``)::

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    PYTHONPATH=src /tmp/v/bin/python tools/xtrans_native_check.py FILE.RAF [...] > rows.jsonl

Results: ``eval/xtrans-native-2026-11-15.md``.
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
    cols = np.asarray(raw.raw_colors_visible)
    colours = cols[:6, :6].astype(int)
    colours[colours == 3] = 1
    desc = raw.color_desc.decode()
    order = {ch: i for i, ch in enumerate("RGB")}
    pat = tuple(order[desc[v]] if desc[v] in order else 1 for v in colours.ravel())
    vis = np.asarray(raw.raw_image_visible, dtype=np.float64)
    black = np.asarray(raw.black_level_per_channel, dtype=np.float64)[cols]
    wb = np.asarray(raw.camera_whitebalance[:3], dtype=np.float64)
    wb = wb / wb[1]
    span = float(raw.white_level) - float(np.mean(raw.black_level_per_channel))
    c = np.clip((vis - black) / span, 0.0, None) * wb[np.where(cols == 3, 1, cols)]
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
    args = ap.parse_args(argv)

    import rawpy

    from shootflow import xtrans_native
    from shootflow.xtrans_demosaic import directional

    if not xtrans_native.available():
        print("the C path did not build (no C compiler?)", file=sys.stderr)
        return 2
    for path in args.files:
        raw, c, pat = plane(path)
        if len(set(pat)) != 3 or len(pat) != 36:
            print(f"{path}: not an X-Trans layout, skipped", file=sys.stderr)
            continue
        hi = float(np.percentile(c, 99.9)) or 1.0  # one scale for every run
        row = {"file": os.path.basename(path), "size": list(c.shape), "pattern": "".join("RGB"[v] for v in pat)}
        t_np1, a = best(lambda: directional(c, pat, scale=hi, native=False, threads=1), args.repeat)
        t_np, a = best(lambda: directional(c, pat, scale=hi, native=False), args.repeat)
        t_c1, b = best(lambda: directional(c, pat, scale=hi, native=True, threads=1), args.repeat)
        t_c, b = best(lambda: directional(c, pat, scale=hi, native=True), args.repeat)
        row["equal"] = bool(np.array_equal(a, b))
        row["max_abs_diff"] = float(np.max(np.abs(a - b)))
        row["seconds"] = {
            "numpy_1_thread": round(t_np1, 3),
            "numpy_all": round(t_np, 3),
            "c_1_thread": round(t_c1, 3),
            "c_all": round(t_c, 3),
        }
        for q, name in ((1, "libraw_markesteijn_1pass"), (3, "libraw_markesteijn_3pass")):
            t, _ = best(
                lambda: rawpy.imread(path).postprocess(demosaic_algorithm=rawpy.DemosaicAlgorithm(q), output_bps=16),
                args.repeat,
            )
            row["seconds"][name] = round(t, 3)
        row["cpus"] = os.cpu_count()
        raw.close()
        print(json.dumps(row), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
