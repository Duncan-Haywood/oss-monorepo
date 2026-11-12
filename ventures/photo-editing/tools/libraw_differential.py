"""Check ``shootflow.raw_develop`` against LibRaw on a real camera file.

Real DNG samples are hard to reach from the build sandbox (raw.pixls.us and
rawsamples.ch answer 403), but rawpy's test folder on GitHub has real Canon
CR2 and Nikon NEF files. This tool:

1. reads one with LibRaw (through ``rawpy``, an optional dependency of this
   tool only; ShootFlow itself stays stdlib-only): the sensor values, the CFA
   pattern, per-channel black, white level, the camera's as-shot white balance
   and Adobe's XYZ-to-camera matrix for that model;
2. writes those into an uncompressed DNG (``ActiveArea`` = LibRaw's visible
   area, ``ColorMatrix2`` at D65, ``AsShotNeutral`` = 1 / camera multipliers);
3. develops the DNG with ShootFlow (bilinear, full size) and the camera file
   with LibRaw's own pipeline set to the same steps (bilinear demosaic, camera
   white balance, highlights clipped, no auto-brightening, sRGB primaries and
   sRGB curve, 16 bit);
4. prints how far apart the two renders are, per channel, in 8-bit steps.

Usage (from ``ventures/photo-editing``)::

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    PYTHONPATH=src /tmp/v/bin/python tools/libraw_differential.py CAMERA_FILE [--half] [--keep DIR]

It measures the developer's container reading, levels, white balance, matrix,
demosaic and curve against an independent implementation on real sensor
data. It does not test this module's own DNG tag reading on a camera-written
DNG (the DNG here is written by this tool), nor lossless-JPEG DNG tiles.
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
import time
from pathlib import Path


def _ifd(entries, start):
    fmt = {1: "B", 3: "H", 4: "I"}
    entries = sorted(entries, key=lambda e: e[0])
    head = struct.pack("<H", len(entries))
    extra = bytearray()
    extra_at = start + 2 + 12 * len(entries) + 4
    body = bytearray()
    for tag, typ, values in entries:
        if typ in (5, 10):
            payload = b"".join(
                struct.pack("<" + ("I" if typ == 5 else "i") * 2, int(round(v * 1_000_000)), 1_000_000)
                for v in values
            )
        else:
            payload = struct.pack("<" + fmt[typ] * len(values), *values)
        if len(payload) <= 4:
            body += struct.pack("<HHI", tag, typ, len(values)) + payload.ljust(4, b"\0")
        else:
            body += struct.pack("<HHII", tag, typ, len(values), extra_at + len(extra))
            extra += payload
            if len(extra) % 2:
                extra += b"\0"
    return head + bytes(body) + struct.pack("<I", 0) + bytes(extra)


def dng_from_libraw(raw, numpy) -> tuple[bytes, dict]:
    sensor = numpy.ascontiguousarray(raw.raw_image, dtype="<u2")
    full_h, full_w = sensor.shape
    sizes = raw.sizes
    top, left = sizes.top_margin, sizes.left_margin
    vis_h, vis_w = sizes.height, sizes.width
    # CFA pattern at the visible area's origin, as R=0, G=1, B=2.
    desc = raw.color_desc.decode()
    pattern = raw.raw_pattern
    cfa = []
    for dy in (0, 1):
        for dx in (0, 1):
            letter = desc[int(pattern[(dy) % pattern.shape[0], (dx) % pattern.shape[1]])]
            cfa.append({"R": 0, "G": 1, "B": 2}[letter])
    # Per-CFA-position black (LibRaw reports per channel index 0..3).
    blacks = [
        int(raw.black_level_per_channel[int(pattern[dy % 2, dx % 2])]) for dy in (0, 1) for dx in (0, 1)
    ]
    white = int(raw.white_level)
    wb = [float(v) for v in raw.camera_whitebalance[:3]]
    neutral = [wb[1] / v for v in wb]
    matrix = [float(v) for row in raw.rgb_xyz_matrix[:3] for v in row]
    info = {
        "full": [full_w, full_h],
        "visible": [vis_w, vis_h],
        "margins": [top, left],
        "cfa": "".join("RGB"[c] for c in cfa),
        "black": blacks,
        "white": white,
        "camera_wb": wb,
        "matrix_xyz_to_cam": matrix,
    }
    blob = bytearray(b"II*\0\0\0\0\0")
    data_at = len(blob)
    blob += sensor.tobytes()
    raw_tags = [
        (254, 4, (0,)),
        (256, 4, (full_w,)),
        (257, 4, (full_h,)),
        (258, 3, (16,)),
        (259, 3, (1,)),
        (262, 3, (32803,)),
        (273, 4, (data_at,)),
        (277, 3, (1,)),
        (278, 4, (full_h,)),
        (279, 4, (full_w * full_h * 2,)),
        (33421, 3, (2, 2)),
        (33422, 1, tuple(cfa)),
        (50713, 3, (2, 2)),
        (50714, 4, tuple(blacks)),
        (50717, 4, (white,)),
        (50829, 4, (top, left, top + vis_h, left + vis_w)),
    ]
    ifd0 = [
        (50706, 1, (1, 4, 0, 0)),
        (274, 3, (1,)),
        (50722, 10, tuple(matrix)),
        (50779, 3, (21,)),
        (50728, 5, tuple(neutral)),
    ]
    at = len(blob)
    blob += _ifd(raw_tags + ifd0, at)
    struct.pack_into("<I", blob, 4, at)
    return bytes(blob), info


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("camera_file")
    parser.add_argument("--half", action="store_true")
    parser.add_argument("--keep", help="Folder to keep the DNG and both renders in.")
    args = parser.parse_args(argv)

    import numpy
    import rawpy

    from shootflow import raw_develop as rd

    path = Path(args.camera_file)
    with rawpy.imread(str(path)) as raw:
        blob, info = dng_from_libraw(raw, numpy)
        t0 = time.perf_counter()
        ref = raw.postprocess(
            demosaic_algorithm=rawpy.DemosaicAlgorithm.LINEAR,
            use_camera_wb=True,
            no_auto_bright=True,
            highlight_mode=rawpy.HighlightMode.Clip,
            output_color=rawpy.ColorSpace.sRGB,
            gamma=(2.4, 12.92),
            output_bps=16,
            user_flip=0,
            half_size=args.half,
        )
        libraw_seconds = time.perf_counter() - t0
    t0 = time.perf_counter()
    width, height, pixels, report = rd.develop(rd.parse_raw(blob), rd.DevelopSettings(half=args.half, colour="dcraw"))
    ours_seconds = time.perf_counter() - t0
    ours = numpy.frombuffer(pixels.tobytes(), dtype=numpy.uint16).reshape(height, width, 3)
    h = min(ours.shape[0], ref.shape[0])
    w = min(ours.shape[1], ref.shape[1])
    a = ours[:h, :w].astype(numpy.float64) / 257.0
    b = ref[:h, :w].astype(numpy.float64) / 257.0
    # Skip a 4-pixel border: edge handling differs by design.
    a, b = a[4:-4, 4:-4], b[4:-4, 4:-4]
    diff = numpy.abs(a - b)
    result = {
        "file": path.name,
        "libraw": info,
        "shapes": {"shootflow": list(ours.shape), "libraw": list(ref.shape)},
        "seconds": {"shootflow": round(ours_seconds, 1), "libraw": round(libraw_seconds, 2)},
        "mean_abs_diff_8bit": [round(float(diff[..., c].mean()), 3) for c in range(3)],
        "p99_abs_diff_8bit": [round(float(numpy.percentile(diff[..., c], 99)), 2) for c in range(3)],
        "max_abs_diff_8bit": [round(float(diff[..., c].max()), 2) for c in range(3)],
        "share_within_1_step": round(float((diff.max(axis=2) <= 1.0).mean()), 6),
        "pixels_over_1_step": int((diff.max(axis=2) > 1.0).sum()),
        # Away from highlights (both renders under 230 of 255 in every channel),
        # where clipping order cannot matter.
        "share_within_1_step_below_highlights": round(
            float((diff.max(axis=2)[(numpy.maximum(a, b).max(axis=2) < 230)] <= 1.0).mean()), 6
        ),
        "mean_abs_diff_by_level_8bit": {
            f"{lo}-{hi}": round(float(diff[(b.mean(axis=2) >= lo) & (b.mean(axis=2) < hi)].mean()), 3)
            for lo, hi in ((0, 16), (16, 64), (64, 128), (128, 192), (192, 256))
            if ((b.mean(axis=2) >= lo) & (b.mean(axis=2) < hi)).any()
        },
        "mean_level_8bit": {"shootflow": round(float(a.mean()), 2), "libraw": round(float(b.mean()), 2)},
        "report": {k: v for k, v in report.__dict__.items()},
    }
    if args.keep:
        keep = Path(args.keep)
        keep.mkdir(parents=True, exist_ok=True)
        (keep / (path.stem + ".dng")).write_bytes(blob)
        rd.write_png(keep / (path.stem + ".shootflow.png"), width, height, pixels)
        import array

        flat = array.array("H", ref.astype(numpy.uint16).ravel().tolist())
        rd.write_png(keep / (path.stem + ".libraw.png"), ref.shape[1], ref.shape[0], flat)
    json.dump(result, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
