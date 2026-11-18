"""How far the develop's sRGB encode is from the exact curve, and how many 16-bit levels it reaches.

Usage (from ``ventures/photo-editing``, numpy installed)::

    PYTHONPATH=src python3 tools/srgb_table_check.py [--old OLD_SRC] [--half] FILE [FILE ...]

``--curve`` alone (no files) prints the table's error against the exact sRGB curve on a dense grid,
for the old nearest-entry 4,096 table and interpolated tables of several sizes.

With files, each is developed on the numpy engine three ways: with this ``src`` (the interpolated
table), with this ``src`` and a 1,048,576-entry interpolated table (the reference: within 0.0002
codes of the exact curve), and, with ``--old``, with another ``src`` tree run in a subprocess (main
before the change). One JSON line per file: distinct values per channel, and each output's largest
difference from the reference and share of values off it. Results:
``eval/srgb-table-interp-2026-11-17.md``.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np


def exact(v):
    v = np.asarray(v, dtype=np.float64)
    return np.where(v <= 0.0031308, 12.92 * v, 1.055 * np.power(np.maximum(v, 1e-300), 1 / 2.4) - 0.055)


def curve_table() -> list[dict]:
    x = np.linspace(0.0, 1.0, 20_000_001)
    ref = exact(x) * 65535
    rows = []
    t = np.round(exact(np.arange(4096) / 4095) * 65535)
    nn = t[(x * 4095 + 0.5).astype(np.int64)]
    rows.append({"table": "4096 nearest (old)", "max_err": round(float(np.abs(nn - ref).max()), 3),
                 "levels": int(len(np.unique(nn))), "off_share": float((nn != np.floor(ref + 0.5)).mean())})
    for n in (4096, 16384, 65536):
        t = exact(np.arange(n) / (n - 1)) * 65535
        y = x * (n - 1)
        i = np.minimum(y.astype(np.int64), n - 2)
        lin = t[i] + (y - i) * (t[i + 1] - t[i])
        rows.append({"table": f"{n} interpolated", "max_err": round(float(np.abs(lin - ref).max()), 4),
                     "levels": int(len(np.unique(np.floor(lin + 0.5)))),
                     "off_share": float((np.floor(lin + 0.5) != np.floor(ref + 0.5)).mean())})
    return rows


def develop(path: str, half: bool, size: int | None = None) -> np.ndarray:
    from shootflow import raw_develop as rd

    if size is not None:
        rd.SRGB_TABLE_SIZE = size
    raw = rd.read_raw(Path(path))
    w, h, px, _ = rd.develop(raw, rd.DevelopSettings(half=half, engine="numpy"))
    return np.frombuffer(px, dtype=np.uint16).reshape(h, w, 3).copy()


def compare(out: np.ndarray, ref: np.ndarray) -> dict:
    d = np.abs(out.astype(np.int64) - ref.astype(np.int64))
    return {"max_diff": int(d.max()), "off_share": round(float((d > 0).mean()), 6),
            "levels": [int(len(np.unique(out[..., c]))) for c in range(3)]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*")
    ap.add_argument("--old", help="another src tree (main before the change)")
    ap.add_argument("--half", action="store_true")
    ap.add_argument("--curve", action="store_true")
    ap.add_argument("--_dump", help=argparse.SUPPRESS)
    args = ap.parse_args()
    if args._dump:  # subprocess mode: develop one file with whatever src is on the path
        np.save(args._dump, develop(args.files[0], args.half))
        return 0
    if args.curve:
        for row in curve_table():
            print(json.dumps(row))
    for name in args.files:
        new = develop(name, args.half)
        ref = develop(name, args.half, size=1 << 20)
        from shootflow import raw_develop as rd

        rd.SRGB_TABLE_SIZE = 16384
        row = {"file": Path(name).name, "size": f"{new.shape[1]}x{new.shape[0]}",
               "ref_levels": [int(len(np.unique(ref[..., c]))) for c in range(3)], "new": compare(new, ref)}
        if args.old:
            with tempfile.TemporaryDirectory() as tmp:
                dump = str(Path(tmp) / "old.npy")
                cmd = [sys.executable, __file__, "--_dump", dump, name] + (["--half"] if args.half else [])
                subprocess.run(cmd, check=True, env={"PYTHONPATH": args.old, "PATH": "/usr/bin:/bin"})
                row["old"] = compare(np.load(dump), ref)
        print(json.dumps(row), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
