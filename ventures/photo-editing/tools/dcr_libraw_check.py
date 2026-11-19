"""Check the Kodak DCR reader against LibRaw on real files.

For each DCR: read it with ``shootflow.kodak.parse_dcr`` (the C decoder, then the pure-Python reference, and
those two must agree) and compare with LibRaw through ``rawpy``:

* every sensel of the stored sensor against LibRaw's ``raw_image`` (gated);
* the CFA pattern at the sensor's corner against ``raw_pattern`` (gated);
* the as-shot white balance (R/G, B/G) against ``camera_whitebalance`` (gated, to 1e-6: LibRaw keeps the
  multipliers as 32-bit floats, so the ratios differ from ours in the seventh place);
* the black level per 2x2 position against ``black_level_per_channel`` (gated);
* the white level (the last entry of Kodak table 2317) against ``white_level`` (gated).

Reported, not gated: the crop LibRaw applies when it develops.

Usage (from ``ventures/photo-editing``)::

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    PYTHONPATH=src /tmp/v/bin/python tools/dcr_libraw_check.py FILE.DCR [...]

Prints one JSON line per file and exits 1 if anything gated differs. A file refused with a reason prints
that reason and does not fail the run. Real file used on 2026-11-18: ``dcr/Kodak DCS Pro SLRn.dcr`` from
github.com/drewnoakes/metadata-extractor-images, ``eval/kodak-dcr-reader-2026-11-18.md``.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from shootflow import kodak
from shootflow import raw_develop as rd

CFA_NAMES = {0: "R", 1: "G", 2: "B", 3: "G"}


def check(path: Path) -> dict:
    import numpy as np
    import rawpy

    data = path.read_bytes()
    out: dict = {"file": path.name, "camera": kodak.camera_model(data)}
    t = time.perf_counter()
    try:
        raw = kodak.parse_dcr(data)
    except rd.DevelopError as exc:
        out["refused"] = str(exc)
        return out
    out["seconds"] = round(time.perf_counter() - t, 3)
    t = time.perf_counter()
    ref = kodak.parse_dcr(data, engine="python")
    out["seconds_python"] = round(time.perf_counter() - t, 3)
    out["c_equals_python"] = ref.values == raw.values
    ours = np.frombuffer(raw.values, dtype=np.uint16).reshape(raw.height, raw.width)
    with rawpy.imread(str(path)) as lr:
        theirs = lr.raw_image.copy()
        pat = lr.raw_pattern.tolist()
        desc = lr.color_desc.decode()
        wb = list(lr.camera_whitebalance)
        lr_black = list(lr.black_level_per_channel)
        out["libraw_white"] = int(lr.white_level)
        s = lr.sizes
        out["libraw_crop"] = [s.crop_left_margin, s.crop_top_margin, s.crop_width, s.crop_height]
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
        and all(abs(a - b) < 1e-6 for a, b in zip(ours_ratio, lr_ratio))
        and all(float(a) == float(b) for a, b in zip(out["black"][0], lr_black))
        and out["white"] == out["libraw_white"]
        and out["c_equals_python"]
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
