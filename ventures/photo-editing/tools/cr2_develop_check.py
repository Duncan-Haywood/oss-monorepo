"""Develop a Canon CR2 directly and compare the render with LibRaw's.

ShootFlow reads the CR2 itself (``shootflow.cr2``): sensor borders from the
maker note, black level from the masked columns, as-shot white balance from
ColorData, and the CFA phase from the picture. A CR2 has no colour matrix, so
developing needs a camera profile (``.dcp``). For a like-for-like check this
tool writes one from LibRaw's own matrix for the camera (``rgb_xyz_matrix``,
read through rawpy at run time; nothing is copied into ShootFlow), develops
half size with ShootFlow, and compares with LibRaw's half-size render using
the camera's white balance, no auto-brightening and the same white level.

Usage (from ``ventures/photo-editing``)::

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    PYTHONPATH=src:tests /tmp/v/bin/python tools/cr2_develop_check.py FILE.CR2 [--dcp PROFILE.dcp]

With ``--dcp`` the given profile is used instead (an Adobe profile gives a
different colour rendering, so expect larger differences from LibRaw).
"""

from __future__ import annotations

import argparse
import json
import tempfile
import time
from array import array
from pathlib import Path

from shootflow import raw_develop as rd


def libraw_profile(raw, model: str) -> Path:
    from test_dng_profile_tables import make_dcp

    m = tuple(float(v) for v in raw.rgb_xyz_matrix[:3].ravel())
    blob = make_dcp(
        [
            (50721, 10, m),
            (50778, 3, (21,)),
            (50708, 2, tuple(model.encode("latin-1")) + (0,)),
            (50936, 2, tuple(b"LibRaw matrix (check only)\0")),
        ]
    )
    path = Path(tempfile.mkdtemp()) / "libraw-matrix.dcp"
    path.write_bytes(blob)
    return path


def clipped_highlights(raw, settings, ours, white: float, full: float) -> dict:
    """Where the sensor clipped: the render with the clip-level white against full scale."""

    import copy

    import numpy as np

    top, left, bottom, right = (int(v) for v in raw.ifd.get(rd.TAG_ACTIVE_AREA))
    img = np.frombuffer(raw.values, dtype=np.uint16).reshape(-1, raw.width)[top:bottom, left:right]
    hh, ww = img.shape[0] // 2, img.shape[1] // 2
    blocks = img[: 2 * hh, : 2 * ww].reshape(hh, 2, ww, 2).max(axis=(1, 3))
    # Turn the sensor-side mask the way the render was turned (IFD0 orientation).
    flat = np.repeat((blocks >= white).astype(np.uint16).ravel(), 3)
    turned, tw, th = rd._orient(array("H", flat.tobytes()), ww, hh, raw.ifd0.one(rd.TAG_ORIENTATION, 1))
    mask = np.frombuffer(turned.tobytes(), dtype=np.uint16).reshape(th, tw, 3)[..., 0].astype(bool)
    mask = mask[: ours.shape[0], : ours.shape[1]]
    full_raw = copy.copy(raw)
    full_raw.ifd = copy.deepcopy(raw.ifd)
    full_raw.ifd.entries[rd.TAG_WHITE_LEVEL] = (full,)
    w, h, px, _ = rd.develop(full_raw, settings)
    at_full = np.frombuffer(px.tobytes(), dtype=np.uint16).reshape(h, w, 3).astype(float) / 65535

    def stats(pic):
        sel = pic[mask]
        spread = sel.max(axis=1) - sel.min(axis=1)
        return {
            "mean_rgb": sel.mean(axis=0).round(3).tolist(),
            "share_white": round(float((sel.min(axis=1) >= 0.97).mean()), 3),
            "median_spread": round(float(np.median(spread)), 3),
        }

    return {"clipped_pixels": int(mask.sum()), "clip_level_white": stats(ours), "full_scale_white": stats(at_full)}


def main(argv: list[str] | None = None) -> int:
    import numpy as np
    import rawpy

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("cr2", type=Path)
    parser.add_argument("--dcp", type=Path, help="camera profile to develop with (default: one from LibRaw's matrix)")
    args = parser.parse_args(argv)

    t = time.perf_counter()
    ours_raw = rd.read_raw(args.cr2)
    parse_s = time.perf_counter() - t
    model = bytes(ours_raw.ifd0.get(rd.TAG_UNIQUE_CAMERA_MODEL) or b"").rstrip(b"\0").decode("latin-1")
    lib = rawpy.imread(str(args.cr2))
    # Read LibRaw's metadata before postprocess(), which changes the pattern it reports.
    sizes, pattern = lib.sizes, lib.raw_pattern.copy()
    lib_black = [int(v) for v in lib.black_level_per_channel]
    lib_wb, lib_white = [float(v) for v in lib.camera_whitebalance], int(lib.white_level)
    dcp_path = args.dcp or libraw_profile(lib, model)
    settings = rd.DevelopSettings(half=True, dcp=rd.read_dcp(dcp_path), default_tone="never")
    t = time.perf_counter()
    w, h, px, report = rd.develop(ours_raw, settings)
    develop_s = time.perf_counter() - t
    ours = np.frombuffer(px.tobytes(), dtype=np.uint16).reshape(h, w, 3).astype(float) / 65535
    white = int(ours_raw.ifd.one(rd.TAG_WHITE_LEVEL))
    theirs = (
        lib.postprocess(
            use_camera_wb=True,
            half_size=True,
            no_auto_bright=True,
            output_bps=16,
            gamma=(2.4, 12.92),
            user_sat=white,
            output_color=rawpy.ColorSpace.sRGB,
        ).astype(float)
        / 65535
    )
    # LibRaw's visible area and ShootFlow's (SensorInfo) start a few pixels apart: find the shift.
    hh, ww = min(h, theirs.shape[0]) - 8, min(w, theirs.shape[1]) - 8
    best = min(
        (float(np.abs(ours[:hh, :ww] - theirs[dy : dy + hh, dx : dx + ww]).mean()), dy, dx)
        for dy in range(5)
        for dx in range(8)
    )
    _, dy, dx = best
    a, b = ours[:hh, :ww], theirs[dy : dy + hh, dx : dx + ww]
    diff = np.abs(a - b) * 255
    top, left = (int(v) for v in ours_raw.ifd.get(rd.TAG_ACTIVE_AREA)[:2])
    result = {
        "file": args.cr2.name,
        "camera": model,
        "parse_s": round(parse_s, 2),
        "develop_half_s": round(develop_s, 2),
        "active_area": list(ours_raw.ifd.get(rd.TAG_ACTIVE_AREA)),
        "libraw_crop": [sizes.crop_top_margin, sizes.crop_left_margin, sizes.crop_height, sizes.crop_width],
        "black_level": list(ours_raw.ifd.get(rd.TAG_BLACK_LEVEL)),
        "libraw_black_level": lib_black,
        "cfa": report.cfa,
        "libraw_cfa_at_active_origin": "".join(
            "RGBG"[int(pattern[(top + y - sizes.top_margin) % 2][(left + x - sizes.left_margin) % 2])]
            for y in (0, 1)
            for x in (0, 1)
        ),
        "white_balance": list(report.white_balance),
        "libraw_camera_wb": lib_wb,
        "white_level": white,
        "libraw_white_level": lib_white,
        "shift_half_px": [dy, dx],
        "mean_abs_diff_8bit": round(float(diff.mean()), 3),
        "p50_8bit": round(float(np.percentile(diff, 50)), 3),
        "p99_8bit": round(float(np.percentile(diff, 99)), 3),
        "channel_means": {"shootflow": a.mean(axis=(0, 1)).round(4).tolist(), "libraw": b.mean(axis=(0, 1)).round(4).tolist()},
        "notes": report.notes,
    }
    full = float((1 << int(ours_raw.ifd.one(rd.TAG_BITS))) - 1)
    if white < full:
        result["highlights"] = clipped_highlights(ours_raw, settings, ours, white, full)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
