"""What Phase One's per-row and per-column black offset tables do to an IIQ, and how LibRaw differs.

An IIQ can carry two offset tables (sensor tags ``black_col``: two shorts a row, for the columns left and right
of the split column; ``black_row``: two shorts a column, for the rows above and below the split row).
``shootflow.iiq`` adds both to every sensel, as LibRaw's IIQ L and uncompressed loaders do
(``phase_one_subtract_black``). LibRaw 0.22's IIQ S loader (``phase_one_load_raw_s``) never reads them, so
on IIQ S files the two readers differ by the tables themselves.

Per file: the tables' range and their mean over 14 bands of rows (the shape of the row table), and each
colour's mean after black as R/G and B/G in four arms (tables on or zeroed, the 0x110 calibration on or
off) next to LibRaw's linear camera-space render (half size, unit white balance, no maximum adjustment).
The arm that equals LibRaw's levels shows what LibRaw did; which arm is right is a separate question that a
dark frame or a Capture One render of the same file would settle.

One JSON line per file. Usage (from ``ventures/photo-editing``, rawpy and numpy in the environment)::

    PYTHONPATH=src python tools/iiq_offsets_check.py raws/*.IIQ > eval/phaseone-iiq-offsets-2026-11-19.jsonl
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import rawpy

from shootflow import iiq, iiq_calibration


def _levels(values, fields: dict) -> list[float]:
    t, l, h, w = fields["top"], fields["left"], fields["image_height"], fields["image_width"]
    a = np.frombuffer(values, dtype=np.uint16).reshape(fields["height"], fields["width"])[t : t + h, l : l + w]
    a = a.astype(np.float64) - fields["black"]
    # iiq's CFA is RGGB at the image's top-left.
    r, b = a[0::2, 0::2].mean(), a[1::2, 1::2].mean()
    g = (a[0::2, 1::2].mean() + a[1::2, 0::2].mean()) / 2
    return [round(r / g, 4), round(b / g, 4)]


def main(argv: list[str]) -> int:
    for name in argv:
        path = Path(name)
        data = path.read_bytes()
        fields = iiq.info(data)
        directory = iiq.directory(data)
        H, W = fields["height"], fields["width"]
        row: dict = {"file": path.name, "model": iiq.camera_model(data), "format": fields["format"]}
        if not (fields.get("black_col") or fields.get("black_row")):
            row["tables"] = None
            print(json.dumps(row), flush=True)
            continue
        if fields.get("black_col"):
            cb = np.frombuffer(data, dtype="<i2", count=2 * H, offset=fields["black_col"]).reshape(H, 2)
            row["row_table_range"] = [int(cb.min()), int(cb.max())]
            band = -(-H // 14)
            row["row_table_band_means"] = [round(float(cb[r : r + band].mean()), 1) for r in range(0, H, band)]
        if fields.get("black_row"):
            rb = np.frombuffer(data, dtype="<i2", count=2 * W, offset=fields["black_row"]).reshape(W, 2)
            row["column_table_range"] = [int(rb.min()), int(rb.max())]
        zeroed = dict(fields, black_col=None, black_row=None)
        levels = {}
        for arm, f in (("tables", fields), ("zeroed", zeroed)):
            for cal in (False, True):
                values, _ = iiq.decode_sensor(data, f)
                if cal:
                    iiq_calibration.apply(values, data, directory, fields)
                levels[f"{arm}{'+calibration' if cal else ''}"] = _levels(values, fields)
                del values
        ref = rawpy.imread(str(path))
        img = ref.postprocess(demosaic_algorithm=rawpy.DemosaicAlgorithm.LINEAR, output_color=rawpy.ColorSpace.raw,
                              gamma=(1, 1), user_wb=[1, 1, 1, 1], no_auto_bright=True, output_bps=16, user_flip=0,
                              half_size=True, adjust_maximum_thr=0.0)
        m = img.reshape(-1, 3).astype(np.float64).mean(axis=0)
        levels["libraw"] = [round(m[0] / m[1], 4), round(m[2] / m[1], 4)]
        row["levels_rg_bg"] = levels
        print(json.dumps(row), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
