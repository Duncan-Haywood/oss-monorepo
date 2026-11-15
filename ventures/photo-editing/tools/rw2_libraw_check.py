"""Check the Panasonic RW2 reader against LibRaw on real files.

For each RW2: read it with ``shootflow.rw2.parse_rw2`` (the C decoder and the
pure-Python reference with ``--engines native,python``), and compare with
LibRaw through ``rawpy``:

* every sensel of the stored sensor against LibRaw's ``raw_image``;
* the as-shot white balance (R/G, B/G) against ``camera_whitebalance``;
* the black level at each CFA position against ``black_level_per_channel`` of that
  position's channel (``raw_pattern``);
* the CFA pattern against ``raw_pattern``;
* the sensor-border crop against LibRaw's ``crop_*`` sizes.

Usage (from ``ventures/photo-editing``)::

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    PYTHONPATH=src /tmp/v/bin/python tools/rw2_libraw_check.py FILE.RW2 [...] [--engines native,python]

Prints one JSON line per file and exits 1 if any sensel, the balance, the
black level or the CFA differs (the white level is reported, not gated: LibRaw
takes some bodies' from a per-model table). Real files used on 2026-11-14: the
four camera RW2s in drewnoakes/metadata-extractor-images (``rw2/``),
``eval/panasonic-rw2-reader-2026-11-14.md``; on 2026-11-15, one file each from 12 newer bodies on
raw.pixls.us (CC0; RawFormat 4, 5, 6 and 7), ``eval/panasonic-rw2-newer-2026-11-15.md``.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from shootflow import rw2
from shootflow import raw_develop as rd

CFA_NAMES = {0: "R", 1: "G", 2: "B", 3: "G"}


def check(path: Path, engines: list[str]) -> dict:
    import numpy as np
    import rawpy

    data = path.read_bytes()
    lib = rawpy.imread(str(path))
    ref = lib.raw_image
    out: dict = {"file": path.name, "camera": rw2.camera_model(data)}
    for engine in engines:
        t = time.perf_counter()
        raw = rw2.parse_rw2(data, engine=engine)
        out[f"read_s_{engine}"] = round(time.perf_counter() - t, 2)
        ours = np.frombuffer(raw.values, dtype=np.uint16).reshape(raw.height, raw.width)
        same_shape = ours.shape == ref.shape
        out[f"sensels_differing_{engine}"] = int((ours != ref).sum()) if same_shape else "shape differs"
    out["sensels"] = int(ref.size)
    out["storage"] = raw.notes[0] if raw.notes else ""
    e = raw.ifd.entries
    neutral = e.get(rd.TAG_AS_SHOT_NEUTRAL)
    ours_wb = [round(1 / neutral[0], 4), round(1 / neutral[2], 4)] if neutral else None
    cw = lib.camera_whitebalance
    lib_wb = [round(cw[0] / cw[1], 4), round(cw[2] / cw[1], 4)] if cw[1] else None
    out["wb_ours"], out["wb_libraw"] = ours_wb, lib_wb
    # Compared unrounded: 392/256 = 1.53125 shows as 1.5312 from LibRaw's float and 1.5313 from 1 / (1 / x).
    wb_same = bool(neutral) and bool(cw[1]) and all(
        abs(1 / neutral[k] - cw[k] / cw[1]) < 1e-6 for k in (0, 2)
    )
    out["black_ours"] = [int(b) for b in e[rd.TAG_BLACK_LEVEL]]
    out["black_libraw"] = [int(lib.black_level_per_channel[int(p)]) for p in lib.raw_pattern.ravel()]
    pat = e[rd.TAG_CFA_PATTERN]
    out["cfa_ours"] = "".join(CFA_NAMES[p] for p in pat)
    out["cfa_libraw"] = "".join(CFA_NAMES[int(p)] for p in lib.raw_pattern.ravel())
    out["white_ours"], out["white_libraw"] = int(e[rd.TAG_WHITE_LEVEL][0]), int(lib.white_level)
    crop = list(e.get(rd.TAG_CROP_ORIGIN, ())) + list(e.get(rd.TAG_CROP_SIZE, ()))
    sz = lib.sizes
    out["crop_ours"] = crop
    out["crop_libraw"] = [sz.crop_left_margin, sz.crop_top_margin, sz.crop_width, sz.crop_height]
    out["ok"] = (
        out["crop_ours"] == out["crop_libraw"]
        and all(out[f"sensels_differing_{en}"] == 0 for en in engines)
        and wb_same
        and out["black_ours"] == out["black_libraw"]
        and out["cfa_ours"] == out["cfa_libraw"]
    )
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--engines", default="native", help="comma-separated: native, python")
    args = ap.parse_args(argv)
    engines = [e.strip() for e in args.engines.split(",") if e.strip()]
    bad = 0
    for path in args.files:
        row = check(path, engines)
        bad += not row["ok"]
        print(json.dumps(row, sort_keys=True))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
