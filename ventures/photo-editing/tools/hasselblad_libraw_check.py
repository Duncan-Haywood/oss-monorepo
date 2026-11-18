"""Check the Hasselblad 3FR reader against LibRaw on real files.

For each 3FR: read it with ``shootflow.hasselblad.parse_3fr`` and compare with LibRaw through ``rawpy``:

* every sensel of the stored sensor against LibRaw's ``raw_image`` (gated);
* the CFA pattern at the sensor's corner against ``raw_pattern`` (gated);
* the as-shot white balance (R/G, B/G, from the file's AsShotNeutral) against ``camera_whitebalance``
  (gated, to 1e-4: LibRaw rounds the neutral through its own float path);
* the ColorMatrix1 in IFD0 (a Phocus .fff's ColorMatrix2, or the body's own from ``OWN_MATRICES``) against
  LibRaw's ``rgb_xyz_matrix`` (reported).

Phocus ``.fff`` files are read the same way (``eval/hasselblad-fff-reader-2026-11-18.md``).

Reported, not gated: the black and white levels (ours are the file's BlackLevel and WhiteLevel tags), the
crop (ours is the file's DefaultCrop; LibRaw's margins come from its own table) and the read time with the
C decoder and, with ``--python``, the pure-Python reference on a band of rows.

Usage (from ``ventures/photo-editing``)::

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    PYTHONPATH=src /tmp/v/bin/python tools/hasselblad_libraw_check.py FILE.3FR [...]

Prints one JSON line per file and exits 1 if anything gated differs. Real files used on 2026-11-18:
raw.pixls.us ``data/Hasselblad/<body>/``, ``eval/hasselblad-3fr-reader-2026-11-18.md``.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from shootflow import hasselblad
from shootflow import raw_develop as rd

CFA_NAMES = {0: "R", 1: "G", 2: "B", 3: "G"}


def check(path: Path) -> dict:
    import numpy as np
    import rawpy

    data = path.read_bytes()
    out: dict = {"file": path.name, "camera": hasselblad.camera_model(data)}
    t = time.perf_counter()
    try:
        raw = hasselblad.parse_3fr(data)
    except rd.DevelopError as exc:
        out["refused"] = str(exc)
        return out
    out["seconds"] = round(time.perf_counter() - t, 3)
    out["layout"] = raw.notes[0]
    ours = np.frombuffer(raw.values, dtype=np.uint16).reshape(raw.height, raw.width)
    with rawpy.imread(str(path)) as lr:
        theirs = lr.raw_image.copy()
        pat = lr.raw_pattern.tolist()
        desc = lr.color_desc.decode()
        wb = list(lr.camera_whitebalance)
        lr_black = [int(b) for b in lr.black_level_per_channel]
        out["libraw_white"] = int(lr.white_level)
        s = lr.sizes
        out["libraw_crop"] = [s.left_margin, s.top_margin, s.width, s.height]
        lr_cm = [round(float(v), 4) for v in np.asarray(lr.rgb_xyz_matrix)[:3].ravel()]
    out["size"] = [raw.width, raw.height]
    out["shape_match"] = list(ours.shape) == list(theirs.shape)
    out["sensels_differ"] = int((ours != theirs).sum()) if out["shape_match"] else None
    ours_pat = "".join(CFA_NAMES[c] for c in raw.ifd.get(rd.TAG_CFA_PATTERN))
    lr_pat = "".join(desc[pat[y][x]] for y in (0, 1) for x in (0, 1))
    out["cfa"] = [ours_pat, lr_pat]
    # The file's own AsShotNeutral: parse_3fr scales a .fff's by AnalogBalance, which LibRaw does not.
    neutral = hasselblad._ifds(data)[0].get(rd.TAG_AS_SHOT_NEUTRAL)
    g = (wb[1] + wb[3]) / 2 if wb[3] > 0 else wb[1]
    lr_ratio = [wb[0] / g, wb[2] / g]
    ours_ratio = [neutral[1] / neutral[0], neutral[1] / neutral[2]] if neutral else None
    out["wb"] = [ours_ratio and [round(v, 6) for v in ours_ratio], [round(v, 6) for v in lr_ratio]]
    cm = raw.ifd0.get(rd.TAG_COLOR_MATRIX_1) or raw.ifd0.get(rd.TAG_COLOR_MATRIX_2)
    out["cm1_equals_libraw"] = bool(cm) and all(abs(round(a, 4) - b) <= 1e-4 for a, b in zip(cm, lr_cm))
    out["white"] = [raw.ifd.one(rd.TAG_WHITE_LEVEL), out.pop("libraw_white")]
    out["black"] = [raw.ifd.get(rd.TAG_BLACK_LEVEL)[0], lr_black]
    origin, size = raw.ifd.get(rd.TAG_CROP_ORIGIN), raw.ifd.get(rd.TAG_CROP_SIZE)
    out["crop"] = [list(origin or ()) + list(size or ()), out.pop("libraw_crop")]
    out["ok"] = bool(
        out["shape_match"]
        and out["sensels_differ"] == 0
        and ours_pat == lr_pat
        and ours_ratio is not None
        and all(abs(a - b) < 1e-4 for a, b in zip(ours_ratio, lr_ratio))
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
