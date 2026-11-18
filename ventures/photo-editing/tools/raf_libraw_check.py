"""Check the Fujifilm RAF reader against LibRaw on real files.

For each RAF: read it with ``shootflow.raf.parse_raf`` and compare with LibRaw
through ``rawpy``:

* every sensel of the stored sensor against LibRaw's ``raw_image``;
* the as-shot white balance (R/G, B/G) against ``camera_whitebalance``;
* the black level at each CFA position (36 on X-Trans) against
  ``black_level_per_channel`` of that position's channel (``raw_pattern``);
* the CFA pattern (6x6 on X-Trans, 2x2 on Bayer) against ``raw_pattern``,
  shifted by LibRaw's margins so both are read from the stored frame's origin;
* the white level against ``white_level``.

The crop is reported, not gated: ours is the file's own picture area (header
records 0x0110 and 0x0111); LibRaw moves an X-Trans origin onto the 6x6 grid.

Usage (from ``ventures/photo-editing``)::

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    PYTHONPATH=src /tmp/v/bin/python tools/raf_libraw_check.py FILE.RAF [...]

Prints one JSON line per file and exits 1 if any sensel, the balance, the black
level, the white level or the CFA differs. Real files used on 2026-11-14: the
three RAFs in drewnoakes/metadata-extractor-images (``raf/``),
``eval/fujifilm-raf-reader-2026-11-14.md``; on 2026-11-15 four lossless compressed
RAFs and two lossy ones from raw.pixls.us (CC0), ``eval/fujifilm-compressed-raf-2026-11-15.md``;
the lossy ones are read since the same day (``eval/fujifilm-lossy-raf-2026-11-15.md``). A file the
reader refuses by design prints ``"ok": null`` with the reason (none known now).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from shootflow import raf
from shootflow import raw_develop as rd

CFA_NAMES = {0: "R", 1: "G", 2: "B", 3: "G"}


def check(path: Path) -> dict:
    import numpy as np
    import rawpy

    data = path.read_bytes()
    lib = rawpy.imread(str(path))
    ref = lib.raw_image
    out: dict = {"file": path.name, "camera": raf.camera_model(data)}
    t = time.perf_counter()
    raw = raf.parse_raf(data)
    out["read_s"] = round(time.perf_counter() - t, 2)
    ours = np.frombuffer(raw.values, dtype=np.uint16).reshape(raw.height, raw.width)
    out["sensels_differing"] = int((ours != ref).sum()) if ours.shape == ref.shape else "shape differs"
    out["sensels"] = int(ref.size)
    out["storage"] = raw.notes[0] if raw.notes else ""
    e = raw.ifd.entries
    neutral = e.get(rd.TAG_AS_SHOT_NEUTRAL)
    cw = lib.camera_whitebalance
    out["wb_ours"] = [round(1 / neutral[0], 4), round(1 / neutral[2], 4)] if neutral else None
    out["wb_libraw"] = [round(cw[0] / cw[1], 4), round(cw[2] / cw[1], 4)] if cw[1] else None
    wb_same = bool(neutral) and bool(cw[1]) and all(abs(1 / neutral[k] - cw[k] / cw[1]) < 1e-6 for k in (0, 2))
    period = int(e[rd.TAG_CFA_REPEAT][0])
    sz = lib.sizes
    # raw_pattern is read from the visible origin (top_margin, left_margin): shift it to the stored origin.
    lp = np.array(lib.raw_pattern)
    n = lp.shape[0]
    stored = [[int(lp[(r - sz.top_margin) % n, (c - sz.left_margin) % n]) for c in range(period)] for r in range(period)]
    pat = list(e[rd.TAG_CFA_PATTERN])
    out["cfa_ours"] = "".join(CFA_NAMES[p] for p in pat)
    out["cfa_libraw"] = "".join(CFA_NAMES[p] for row in stored for p in row)
    out["black_ours"] = sorted({int(b) for b in e[rd.TAG_BLACK_LEVEL]})
    lib_black = [int(lib.black_level_per_channel[p]) for row in stored for p in row]
    out["black_libraw"] = sorted(set(lib_black))
    black_same = [int(b) for b in e[rd.TAG_BLACK_LEVEL]] == lib_black
    out["white_ours"], out["white_libraw"] = int(e[rd.TAG_WHITE_LEVEL][0]), int(lib.white_level)
    out["crop_ours"] = list(e.get(rd.TAG_CROP_ORIGIN, ())) + list(e.get(rd.TAG_CROP_SIZE, ()))
    out["crop_libraw"] = [
        sz.crop_left_margin,
        sz.crop_top_margin,
        sz.crop_width,
        sz.crop_height,
    ]
    out["visible_libraw"] = [sz.left_margin, sz.top_margin, sz.width, sz.height]
    out["ok"] = (
        out["sensels_differing"] == 0
        and wb_same
        and black_same
        and out["cfa_ours"] == out["cfa_libraw"]
        and out["white_ours"] == out["white_libraw"]
    )
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("files", nargs="+", type=Path)
    args = ap.parse_args(argv)
    bad = 0
    for path in args.files:
        try:
            row = check(path)
        except rd.DevelopError as exc:
            # A refusal is a result, not a crash: Fujifilm's lossy compression is refused by design.
            row = {"file": path.name, "ok": False, "refused": str(exc)}
            refused = "lossy compressed" in str(exc)
            row["ok"] = None if refused else False
        bad += row["ok"] is False
        print(json.dumps(row, sort_keys=True))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
