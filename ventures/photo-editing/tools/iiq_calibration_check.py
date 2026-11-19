"""Compare ShootFlow's Phase One calibration (``shootflow.iiq_calibration``) with LibRaw's, sensel for sensel.

LibRaw applies the ``0x110`` calibration (``phase_one_correct``) only on the way to its render, not to
``raw_image``. So LibRaw renders each file with bilinear demosaicing, its camera space, unit white balance,
linear output, 16 bits and no rotation: at every sensel the native colour's channel is then the calibrated,
black-subtracted value times ``65535 / white`` (truncated), since bilinear demosaicing only fills the other
two. ShootFlow's calibrated sensels (black subtracted, at the same scale and truncation) are compared with
those inside LibRaw's crop, over sensels above black in both and below 60000 in LibRaw's (clipping aside),
and so are its uncalibrated ones, as the baseline the calibration has to beat. Also reported: the gain
LibRaw's calibration applies over a 6 x 6 grid of blocks (the median of calibrated over uncalibrated) and
how far ShootFlow's leaves from it.

One JSON line per file. Usage (from ``ventures/photo-editing``, rawpy and numpy in the environment)::

    PYTHONPATH=src python tools/iiq_calibration_check.py raws/*.IIQ raws/*.TIF > eval/phaseone-iiq-calibration-2026-11-19.jsonl
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import rawpy

from shootflow import iiq, iiq_calibration


def _native(img: np.ndarray, pattern: np.ndarray, top: int, left: int) -> np.ndarray:
    h, w = img.shape[:2]
    out = np.empty((h, w), dtype=np.int32)
    for i in range(2):
        for j in range(2):
            c = int(pattern[(top + i) % 2, (left + j) % 2])
            out[i::2, j::2] = img[i::2, j::2, 1 if c == 3 else c]
    return out


def _compare(pred: np.ndarray, theirs: np.ndarray, mask: np.ndarray) -> dict:
    diff = np.abs(pred[mask] - theirs[mask])
    n = int(mask.sum())
    return {
        "equal": round(float(np.count_nonzero(diff == 0)) / n, 6),
        "within_1": round(float(np.count_nonzero(diff <= 1)) / n, 6),
        "within_1pct": round(float(np.count_nonzero(diff <= 0.01 * theirs[mask])) / n, 6),
        "over_1pct": int(np.count_nonzero(diff > 0.01 * theirs[mask])),
        "max": int(diff.max()),
    }


def main(argv: list[str]) -> int:
    for name in argv:
        path = Path(name)
        data = path.read_bytes()
        fields = iiq.info(data)
        directory = iiq.directory(data)
        row: dict = {"file": path.name, "model": iiq.camera_model(data), "format": fields["format"]}
        steps = iiq_calibration.plan(data, directory, fields)
        row["steps"] = [s[-1] if s[0] in ("table", "flat") else f"{s[0]}:{len(s[1])}" for s in steps]
        # LibRaw's IIQ S loader (``phase_one_load_raw_s``) never reads the per-row and per-column black offset
        # tables, which this reader applies, so for format 6 the decode is compared with them zeroed: the check
        # is of the calibration, and the offsets are measured on their own (tools/iiq_offset_banding.py).
        offsets_skipped = fields["format"] == 6 and bool(fields.get("black_col") or fields.get("black_row"))
        row["offsets_zeroed"] = offsets_skipped
        values, _ = iiq.decode_sensor(data, dict(fields, black_col=None, black_row=None) if offsets_skipped else fields)
        bare = np.frombuffer(values, dtype=np.uint16).astype(np.int32)
        t0 = time.perf_counter()
        iiq_calibration.apply(values, data, directory, fields)
        row["calibrate_s"] = round(time.perf_counter() - t0, 2)
        H, W, black = fields["height"], fields["width"], fields["black"]
        ours = np.frombuffer(values, dtype=np.uint16).astype(np.int32).reshape(H, W) - black
        bare = bare.reshape(H, W) - black
        ref = rawpy.imread(str(path))
        s = ref.sizes
        img = ref.postprocess(demosaic_algorithm=rawpy.DemosaicAlgorithm.LINEAR, output_color=rawpy.ColorSpace.raw,
                              gamma=(1, 1), user_wb=[1, 1, 1, 1], no_auto_bright=True, output_bps=16, user_flip=0,
                              adjust_maximum_thr=0.0)
        top, left = s.top_margin, s.left_margin
        theirs = _native(img, ref.raw_pattern, top, left)
        del img
        h, w = theirs.shape
        scale = np.float32(65535.0) / np.float32(ref.white_level)
        row["libraw_white"] = int(ref.white_level)
        o = ours[top : top + h, left : left + w]
        b = bare[top : top + h, left : left + w]
        pred = np.clip(np.floor(np.maximum(o, 0).astype(np.float32) * scale), 0, 65535).astype(np.int32)
        pred_bare = np.clip(np.floor(np.maximum(b, 0).astype(np.float32) * scale), 0, 65535).astype(np.int32)
        mask = (o > 0) & (b > 0) & (theirs > 0) & (theirs < 60000)
        row["sensels"] = int(mask.sum())
        row["calibrated"] = _compare(pred, theirs, mask)
        row["uncalibrated"] = _compare(pred_bare, theirs, mask)
        # LibRaw's gain over a 6 x 6 grid, and ours, as block medians over sensels well above black.
        bright = mask & (theirs > 2000)
        gains, gaps = [], []
        for by in range(6):
            for bx in range(6):
                sl = (slice(by * h // 6, (by + 1) * h // 6), slice(bx * w // 6, (bx + 1) * w // 6))
                m = bright[sl]
                if m.sum() < 1000:
                    continue
                g_lr = float(np.median(theirs[sl][m] / (pred_bare[sl][m] + 1e-9)))
                g_us = float(np.median(pred[sl][m] / (pred_bare[sl][m] + 1e-9)))
                gains.append(g_lr)
                gaps.append(abs(g_us - g_lr))
        row["libraw_gain_range"] = [round(min(gains), 4), round(max(gains), 4)] if gains else None
        row["block_gain_gap_max"] = round(max(gaps), 5) if gaps else None
        # Where the sensels that differ by over 1% sit: defects (ours or LibRaw's) or elsewhere.
        far = mask & (np.abs(pred - theirs) > 0.01 * theirs)
        ys, xs = np.nonzero(far)
        cols = np.bincount(xs + left, minlength=W) if xs.size else np.zeros(W, dtype=int)
        row["over_1pct_top_columns"] = [[int(c), int(cols[c])] for c in np.argsort(cols)[::-1][:5] if cols[c]]
        # The same comparison with the defect columns left out: the column fill is ShootFlow's own (README).
        dead = [c - left for c in (steps[-1][1] if steps and steps[-1][0] == "columns" else []) if 0 <= c - left < w]
        keep = mask.copy()
        keep[:, dead] = False
        row["defect_columns"] = len(dead)
        row["calibrated_outside_defect_columns"] = _compare(pred, theirs, keep)
        print(json.dumps(row), flush=True)
        del ours, bare, theirs, pred, pred_bare, mask, o, b
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
