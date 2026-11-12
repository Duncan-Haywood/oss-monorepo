"""Develop a camera-written DNG with ShootFlow and compare the render with LibRaw's.

``cr2_develop_check.py`` does this for Canon CR2s, which carry no colour matrix.
A DNG carries its own, so here both developers read the same file and the same
tags: ShootFlow develops half size with the file's own colour (``--colour
dcraw`` is LibRaw's method: one matrix, white balance in camera space; ``dng``
is the DNG specification's), with ``BaselineExposure``, the profile tables and
the tone curve off, because LibRaw applies none of them. LibRaw's render uses
the camera's white balance, no auto-brightening, the file's white level and the
sRGB curve.

LibRaw (as packaged by rawpy) does not run DNG opcode lists, so the comparison
is made with ShootFlow's opcode lists off too (``--opcodes`` turns them on to
see what they change). ``--preview`` also compares both renders, with the
opcodes on and off, against the camera's own embedded preview, corner by
corner: that is the camera maker's render, lens shading corrected.

Usage (from ``ventures/photo-editing``)::

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    PYTHONPATH=src:tests /tmp/v/bin/python tools/dng_camera_check.py FILE.dng [--colour dcraw|dng] [--preview]

Results: ``eval/camera-dngs-2026-11-12.md``.
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
import time
from pathlib import Path

from shootflow import raw_develop as rd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cr2_develop_check import linear_ratio  # noqa: E402


def with_active_area(raw):
    """A copy with an explicit ActiveArea (the whole image when the file names none)."""

    if raw.ifd.get(rd.TAG_ACTIVE_AREA):
        return raw
    out = copy.copy(raw)
    out.ifd = copy.deepcopy(raw.ifd)
    out.ifd.entries[rd.TAG_ACTIVE_AREA] = (0, 0, raw.height, raw.width)
    return out


def ours(raw, colour: str, opcodes: bool, half: bool = True):
    import numpy as np

    settings = rd.DevelopSettings(
        half=half,
        colour=colour,
        use_baseline_exposure=False,
        profile_tables=False,
        default_tone="never",
        opcodes=opcodes,
    )
    t = time.perf_counter()
    w, h, px, report = rd.develop(raw, settings)
    took = time.perf_counter() - t
    return np.frombuffer(px.tobytes(), dtype=np.uint16).reshape(h, w, 3).astype(float) / 65535, report, took


def best_shift(a, b, reach=8):
    import numpy as np

    hh, ww = min(a.shape[0], b.shape[0]) - reach, min(a.shape[1], b.shape[1]) - reach
    _, dy, dx = min(
        (float(np.abs(a[:hh:4, :ww:4] - b[dy : dy + hh : 4, dx : dx + ww : 4]).mean()), dy, dx)
        for dy in range(reach)
        for dx in range(reach)
    )
    return a[:hh, :ww], b[dy : dy + hh, dx : dx + ww], (dy, dx)


def corner_falloff(img) -> dict:
    """Mean linear luminance of each corner tile over the centre tile (tiles 1/8 of each side)."""

    import numpy as np

    lin = np.where(img <= 0.04045, img / 12.92, ((img + 0.055) / 1.055) ** 2.4)
    y = lin @ np.array([0.2126, 0.7152, 0.0722])
    h, w = y.shape
    th, tw = h // 8, w // 8
    centre = y[h // 2 - th // 2 : h // 2 + th // 2, w // 2 - tw // 2 : w // 2 + tw // 2].mean()
    tiles = {"top_left": y[:th, :tw], "top_right": y[:th, -tw:], "bottom_left": y[-th:, :tw], "bottom_right": y[-th:, -tw:]}
    return {k: round(float(v.mean() / centre), 3) for k, v in tiles.items()}


def largest_jpeg(path: Path):
    """The largest embedded JPEG in the file (the camera's preview), decoded, as floats 0..1."""

    import io

    import numpy as np

    try:
        from PIL import Image
    except ImportError:  # pragma: no cover - optional
        return None
    data = path.read_bytes()
    best = None
    start = data.find(b"\xff\xd8\xff")
    while start != -1:
        try:
            im = Image.open(io.BytesIO(data[start:]))
            im.load()
            if best is None or im.width * im.height > best.width * best.height:
                best = im.convert("RGB")
        except Exception:
            pass
        start = data.find(b"\xff\xd8\xff", start + 3)
    return None if best is None else np.asarray(best, dtype=float) / 255


def main(argv: list[str] | None = None) -> int:
    import numpy as np
    import rawpy

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("dng", type=Path)
    parser.add_argument("--colour", choices=("dcraw", "dng"), default="dcraw")
    parser.add_argument("--opcodes", action="store_true", help="run the DNG opcode lists in ShootFlow's render")
    parser.add_argument("--preview", action="store_true", help="corner falloff against the embedded preview (needs Pillow)")
    args = parser.parse_args(argv)

    raw = with_active_area(rd.read_raw(args.dng))
    model = bytes(raw.ifd0.get(rd.TAG_UNIQUE_CAMERA_MODEL) or b"").rstrip(b"\0").decode("latin-1")
    lib = rawpy.imread(str(args.dng))
    sizes = lib.sizes
    lib_black = [int(v) for v in lib.black_level_per_channel]
    lib_wb, lib_white = [float(v) for v in lib.camera_whitebalance], int(lib.white_level)
    a, report, took = ours(raw, args.colour, args.opcodes)
    white = float(raw.ifd.one(rd.TAG_WHITE_LEVEL))
    theirs = (
        lib.postprocess(
            use_camera_wb=True,
            half_size=True,
            no_auto_bright=True,
            output_bps=16,
            gamma=(2.4, 12.92),
            user_sat=round(white - sum(lib_black) / len(lib_black)),
            output_color=rawpy.ColorSpace.sRGB,
        ).astype(float)
        / 65535
    )
    a2, b2, shift = best_shift(a, theirs)
    diff = np.abs(a2 - b2) * 255
    result = {
        "file": args.dng.name,
        "camera": model,
        "colour": args.colour,
        "opcodes": args.opcodes,
        "develop_half_s": round(took, 2),
        "size_ours_half": [a.shape[1], a.shape[0]],
        "size_libraw_half": [theirs.shape[1], theirs.shape[0]],
        "libraw_visible": [sizes.top_margin, sizes.left_margin, sizes.height, sizes.width],
        "active_area": list(raw.ifd.get(rd.TAG_ACTIVE_AREA)),
        "cfa": report.cfa,
        "black_level": report.black_level,
        "libraw_black_level": lib_black,
        "white_level": white,
        "libraw_white_level": lib_white,
        "white_balance": list(report.white_balance),
        "libraw_camera_wb": lib_wb,
        "shift_half_px": list(shift),
        "p50_8bit": round(float(np.percentile(diff, 50)), 3),
        "p99_8bit": round(float(np.percentile(diff, 99)), 3),
        "channel_means": {"shootflow": a2.mean(axis=(0, 1)).round(4).tolist(), "libraw": b2.mean(axis=(0, 1)).round(4).tolist()},
        "linear_ratio_median": linear_ratio(a2, b2),
        "notes": report.notes,
    }
    if args.preview:
        prev = largest_jpeg(args.dng)
        off, _, _ = ours(raw, args.colour, False)
        on, _, _ = ours(raw, args.colour, True)
        result["corner_over_centre"] = {
            "libraw": corner_falloff(theirs),
            "shootflow_opcodes_off": corner_falloff(off),
            "shootflow_opcodes_on": corner_falloff(on),
        }
        if prev is not None:
            result["corner_over_centre"]["camera_preview"] = corner_falloff(prev)
            result["preview_size"] = [prev.shape[1], prev.shape[0]]
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
