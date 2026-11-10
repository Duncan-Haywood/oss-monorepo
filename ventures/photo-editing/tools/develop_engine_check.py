"""Develop DNGs with both engines and check they give the same bytes; print the times.

Usage (from ``ventures/photo-editing``, numpy installed)::

    PYTHONPATH=src python3 tools/develop_engine_check.py FILE.dng [FILE.dng ...] [--half]

For each file it develops with ``engine="python"`` and ``engine="numpy"``,
compares the 16-bit output byte for byte (and the size and clip fraction), and
prints one JSON line with both wall times. Exit 1 if any file differs.
Results: ``eval/develop-numpy-engine-2026-11-10.md``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

from shootflow import raw_develop as rd


def check(path: Path, half: bool) -> dict:
    t = time.perf_counter()
    raw = rd.read_raw(path)
    read_s = time.perf_counter() - t
    out: dict = {"file": path.name, "half": half, "read_s": round(read_s, 2)}
    results = {}
    for engine in ("numpy", "python"):
        t = time.perf_counter()
        w, h, px, report = rd.develop(raw, rd.DevelopSettings(half=half, engine=engine))
        out[f"{engine}_s"] = round(time.perf_counter() - t, 2)
        results[engine] = (w, h, px.tobytes(), report.clipped_fraction)
    a, b = results["numpy"], results["python"]
    out["size"] = f"{a[0]}x{a[1]}"
    out["sha256"] = hashlib.sha256(a[2]).hexdigest()[:16]
    out["identical"] = a == b
    out["speedup"] = round(out["python_s"] / max(out["numpy_s"], 1e-9), 1)
    return out


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("files", nargs="+")
    parser.add_argument("--half", action="store_true")
    args = parser.parse_args(argv)
    ok = True
    for name in args.files:
        row = check(Path(name), args.half)
        ok &= row["identical"]
        print(json.dumps(row), flush=True)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
