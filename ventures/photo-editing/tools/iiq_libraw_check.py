"""Compare ``shootflow.iiq`` with LibRaw (rawpy) sensel for sensel on real Phase One IIQ files.

LibRaw's ``raw_image`` holds the decoded codes times four, before the per-row and per-column black offsets,
so the decode is compared with both offset tables zeroed; the offsets, CFA, white balance and crop are
reported next to LibRaw's, and the levels (black and offsets applied) as each colour's mean over the image
next to LibRaw's own linear camera-space render. One JSON line per file; a file this reader refuses is reported with the reason.

Usage (from ``ventures/photo-editing``, rawpy and numpy in the environment)::

    PYTHONPATH=src python tools/iiq_libraw_check.py raws/*.IIQ > eval/phaseone-iiq-libraw-2026-11-18.jsonl
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import rawpy

from shootflow import iiq
from shootflow import raw_develop as rd

COLOURS = "RGBG"


def main(argv: list[str]) -> int:
    for name in argv:
        path = Path(name)
        data = path.read_bytes()
        row: dict = {"file": path.name}
        try:
            fields = iiq.info(data)
            row.update(model=iiq.camera_model(data), format=fields["format"], width=fields["width"], height=fields["height"])
            bare = dict(fields, black_col=None, black_row=None)
            t0 = time.perf_counter()
            values, note = iiq.decode_sensor(data, bare)
            row["read_s"] = round(time.perf_counter() - t0, 2)
            row["decoder"] = note
            raw = iiq.parse_iiq(data)
        except rd.DevelopError as exc:
            row["refused"] = str(exc)
            print(json.dumps(row), flush=True)
            continue
        ours = np.frombuffer(values, dtype=np.uint16).reshape(fields["height"], fields["width"])
        ref = rawpy.imread(str(path))
        theirs = ref.raw_image
        row["sensels"] = int(ours.size)
        row["differing"] = int(np.count_nonzero(ours != theirs)) if ours.shape == theirs.shape else None
        # LibRaw reports the colours of its raw_image from the raw origin.
        pat = ref.raw_pattern
        theirs_cfa = "".join(COLOURS[int(pat[i % pat.shape[0], j % pat.shape[1]])] for i in (0, 1) for j in (0, 1))
        top, left = fields["top"], fields["left"]
        # Our pattern is RGGB at the image's top-left; at the raw origin it shifts by the margins' parity.
        ours_cfa = "".join("RGB"[iiq.RGGB[((i - top) % 2) * 2 + (j - left) % 2]] for i in (0, 1) for j in (0, 1))
        row["cfa"] = ours_cfa
        row["cfa_libraw"] = theirs_cfa
        neutral = raw.ifd.get(rd.TAG_AS_SHOT_NEUTRAL)
        wb = ref.camera_whitebalance
        row["wb"] = [round(1 / neutral[0], 4), round(1 / neutral[2], 4)] if neutral else None
        row["wb_libraw"] = [round(wb[0] / wb[1], 4), round(wb[2] / wb[1], 4)]
        s = ref.sizes
        row["crop"] = [top, left, fields["image_height"], fields["image_width"]]
        row["crop_libraw"] = [s.top_margin, s.left_margin, s.height, s.width]
        row["flip"] = raw.ifd0.get(rd.TAG_ORIENTATION)[0]
        row["flip_libraw"] = s.flip
        full = np.frombuffer(raw.values, dtype=np.uint16).reshape(fields["height"], fields["width"]).astype(np.int32)
        offsets = full - ours.astype(np.int32)
        row["offsets_range"] = [int(offsets.min()), int(offsets.max())]
        row["black"] = raw.ifd.get(rd.TAG_BLACK_LEVEL)[0]
        row["white_libraw"] = int(ref.white_level)
        # Levels: the mean of each colour over the image after our black and offsets, against LibRaw's
        # camera-space render (no white balance, linear, half size), as red over green and blue over green.
        img = full[top : top + fields["image_height"], left : left + fields["image_width"]] - row["black"]
        ours_m = [img[0::2, 0::2].mean(), (img[0::2, 1::2].mean() + img[1::2, 0::2].mean()) / 2, img[1::2, 1::2].mean()]
        cam = ref.postprocess(output_color=rawpy.ColorSpace.raw, gamma=(1, 1), user_wb=[1, 1, 1, 1], no_auto_bright=True,
                              output_bps=16, user_flip=0, half_size=True).astype(np.float64)
        theirs_m = [cam[..., c].mean() for c in range(3)]
        row["rg_bg"] = [round(ours_m[0] / ours_m[1], 4), round(ours_m[2] / ours_m[1], 4)]
        row["rg_bg_libraw"] = [round(theirs_m[0] / theirs_m[1], 4), round(theirs_m[2] / theirs_m[1], 4)]
        del cam, full, img
        print(json.dumps(row), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
