"""Check the Minolta MRW reader against LibRaw on real files.

For each MRW: read it with ``shootflow.mrw.parse_mrw`` and compare with LibRaw through ``rawpy``:

* every sensel of the stored sensor against LibRaw's ``raw_image`` (gated);
* the CFA pattern at the sensor's corner against ``raw_pattern`` (gated);
* the as-shot white balance (R/G, B/G) against ``camera_whitebalance`` (gated, to 1e-9);
* the black level per 2x2 position against ``black_level_per_channel`` (gated: both 0 on every body).

Reported, not gated: the white level (ours is the clip pile when the frame has one, else 4095; LibRaw's comes
from a per-model table) and the sensor size LibRaw develops.

Usage (from ``ventures/photo-editing``)::

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    PYTHONPATH=src /tmp/v/bin/python tools/mrw_libraw_check.py FILE.MRW [...]

Prints one JSON line per file and exits 1 if anything gated differs. A file refused with a reason prints
that reason and does not fail the run. Real files used on 2026-11-18: raw.pixls.us ``data/Minolta/<body>/``,
``eval/minolta-mrw-reader-2026-11-18.md``.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from shootflow import mrw
from shootflow import raw_develop as rd

CFA_NAMES = {0: "R", 1: "G", 2: "B", 3: "G"}


def check(path: Path) -> dict:
    import numpy as np
    import rawpy

    data = path.read_bytes()
    out: dict = {"file": path.name, "camera": mrw.camera_model(data)}
    t = time.perf_counter()
    try:
        raw = mrw.parse_mrw(data)
    except rd.DevelopError as exc:
        out["refused"] = str(exc)
        return out
    out["seconds"] = round(time.perf_counter() - t, 3)
    ours = np.frombuffer(raw.values, dtype=np.uint16).reshape(raw.height, raw.width)
    with rawpy.imread(str(path)) as lr:
        theirs = lr.raw_image.copy()
        pat = lr.raw_pattern.tolist()
        desc = lr.color_desc.decode()
        wb = list(lr.camera_whitebalance)
        lr_black = list(lr.black_level_per_channel)
        out["libraw_white"] = int(lr.white_level)
        out["libraw_size"] = [lr.sizes.raw_width, lr.sizes.raw_height, lr.sizes.width, lr.sizes.height]
    out["size"] = [raw.width, raw.height]
    out["shape_match"] = list(ours.shape) == list(theirs.shape)
    out["sensels_differ"] = int((ours != theirs).sum()) if out["shape_match"] else None
    ours_pat = "".join(CFA_NAMES[c] for c in raw.ifd.get(rd.TAG_CFA_PATTERN))
    lr_pat = "".join(desc[pat[y][x]] for y in (0, 1) for x in (0, 1))
    out["cfa"] = [ours_pat, lr_pat]
    neutral = raw.ifd.get(rd.TAG_AS_SHOT_NEUTRAL)
    g = (wb[1] + wb[3]) / 2 if wb[3] > 0 else wb[1]
    lr_ratio = [wb[0] / g, wb[2] / g]
    ours_ratio = [1 / neutral[0], 1 / neutral[2]] if neutral else None
    out["wb"] = [ours_ratio and [round(v, 6) for v in ours_ratio], [round(v, 6) for v in lr_ratio]]
    out["white"] = raw.ifd.one(rd.TAG_WHITE_LEVEL)
    out["black"] = [list(raw.ifd.get(rd.TAG_BLACK_LEVEL)), lr_black]
    out["ok"] = bool(
        out["shape_match"]
        and out["sensels_differ"] == 0
        and ours_pat == lr_pat
        and ours_ratio is not None
        and all(abs(a - b) < 1e-9 for a, b in zip(ours_ratio, lr_ratio))
        and all(float(a) == float(b) for a, b in zip(out["black"][0], lr_black))
    )
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("files", nargs="+", type=Path)
    args = ap.parse_args(argv)
    bad = 0
    for path in args.files:
        row = check(path)
        print(json.dumps(row), flush=True)
        bad += "refused" not in row and not row.get("ok")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
