"""Check the lossless-JPEG decoder on a camera-written stream, against LibRaw.

A Canon CR2 stores its sensor data as one lossless JPEG (SOF3) written by the
camera, in the raw IFD (the fourth). Canon cuts the sensor into vertical
slices before encoding (tag 0xC640: ``n`` slices of ``width`` columns, then
one of ``last`` columns), so the decoded samples are laid out slice by slice.
This tool:

1. finds that stream in the CR2 and decodes it with
   ``shootflow.raw_develop.decode_lossless_jpeg`` (the decoder DNG tiles go
   through), timing it;
2. optionally decodes it again with the one-pass reference decoder
   (``--reference``) and checks the two agree sample for sample;
3. puts the slices back side by side and compares every sensel with LibRaw's
   ``raw_image`` (through ``rawpy``, an optional dependency of this tool only).

Usage (from ``ventures/photo-editing``)::

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    PYTHONPATH=src /tmp/v/bin/python tools/cr2_ljpeg_check.py FILE.CR2 [--reference]

The ShootFlow side runs on the standard library; numpy and rawpy are only for
the LibRaw comparison (``--no-libraw`` skips it).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from shootflow import raw_develop as rd

TAG_COMPRESSION = 259
TAG_STRIP_OFFSETS = 273
TAG_STRIP_BYTES = 279
TAG_CR2_SLICES = 0xC640


def cr2_stream(data: bytes) -> tuple[bytes, tuple[int, ...]]:
    reader = rd._Reader(data)
    offset = reader.first_ifd_offset()
    ifds = []
    while offset and len(ifds) < 8:
        ifd, offset = reader.read_ifd(offset)
        ifds.append(ifd)
    for ifd in ifds:
        if ifd.one(TAG_COMPRESSION) == 6 and ifd.get(TAG_CR2_SLICES):
            at, size = ifd.one(TAG_STRIP_OFFSETS), ifd.one(TAG_STRIP_BYTES)
            return data[at : at + size], tuple(ifd.get(TAG_CR2_SLICES))
    raise SystemExit("no CR2 raw IFD (compression 6 with a slices tag) in the file")


def unslice(samples: list[int], rows: int, slices: tuple[int, ...]) -> tuple[int, list[list[int]]]:
    count, width, last = slices
    widths = [width] * count + [last]
    total = sum(widths)
    image = [[0] * total for _ in range(rows)]
    k = 0
    x0 = 0
    for sw in widths:
        for y in range(rows):
            image[y][x0 : x0 + sw] = samples[k : k + sw]
            k += sw
        x0 += sw
    return total, image


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("cr2", type=Path)
    parser.add_argument("--reference", action="store_true", help="also time the one-pass reference decoder")
    parser.add_argument("--no-libraw", action="store_true", help="skip the LibRaw comparison")
    args = parser.parse_args(argv)

    stream, slices = cr2_stream(args.cr2.read_bytes())
    t = time.perf_counter()
    width, height, nf, samples = rd.decode_lossless_jpeg(stream)
    decode_s = time.perf_counter() - t
    result = {
        "file": args.cr2.name,
        "stream_bytes": len(stream),
        "frame": {"width": width, "height": height, "components": nf},
        "slices": list(slices),
        "samples": len(samples),
        "decode_s": round(decode_s, 2),
    }
    if args.reference:
        keep = rd._decode_scan
        rd._decode_scan = rd._decode_scan_reference
        try:
            t = time.perf_counter()
            _, _, _, ref = rd.decode_lossless_jpeg(stream)
            result["reference_decode_s"] = round(time.perf_counter() - t, 2)
        finally:
            rd._decode_scan = keep
        result["reference_identical"] = ref == samples
        del ref
    if not args.no_libraw:
        import numpy as np
        import rawpy

        total, image = unslice(samples, height, slices)
        ours = np.array(image, dtype=np.uint16)
        with rawpy.imread(str(args.cr2)) as raw:
            theirs = raw.raw_image.copy()
        h, w = theirs.shape
        result["libraw_raw_image"] = [w, h]
        result["ours_unsliced"] = [total, height]
        if ours.shape[0] < h or ours.shape[1] < w:
            result["libraw_identical"] = False
        else:
            diff = ours[:h, :w] != theirs
            result["libraw_mismatched_sensels"] = int(diff.sum())
            result["libraw_identical"] = not diff.any()
    json.dump(result, sys.stdout, indent=2)
    print()
    ok = result.get("reference_identical", True) and result.get("libraw_identical", True)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
