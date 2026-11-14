"""Time and check lossless-JPEG decoding of a point-transform scan, C prediction vs the old route.

Run from ventures/photo-editing:  PYTHONPATH=src:tests python3 eval/point-transform-c.py
Builds a synthetic 1,000 x 750 two-component scan (one Bayer-like tile row pair per MCU, the
shape DNG tiles use) at 14-bit precision with pt = 2, smooth content, for predictors 1, 4 and 6,
and decodes it three ways: the new default (C differences + C prediction + C shift), the route
main took before this change for pt != 0 (C differences, then the numpy or Python prediction and
a Python shift), and the pure reference decoder. All three must give identical samples.
"""

from __future__ import annotations

import hashlib
import random
import statistics
import sys
import time
from array import array

import test_ljpeg_fast as fast
from shootflow import ljpeg_native
from shootflow import raw_develop as rd

W, H, NF, PREC, PT = 1000, 750, 2, 14, 2


def old_route(*a, **k):
    # pt != 0 on main before 2026-11-14: C prediction declined, so ljpeg_native.predict returned None.
    return None


def timed(stream, reps=7):
    times = []
    for _ in range(reps):
        t = time.perf_counter()
        w, h, n, got = rd._decode_lossless_jpeg(stream)  # the array or list parse_raw places
        times.append(time.perf_counter() - t)
    return min(times), statistics.median(times), got


def main():
    if not ljpeg_native.available():
        sys.exit("no C compiler: the native reader is not built")
    rng = random.Random(14)
    for predictor in (1, 4, 6):
        samples = fast._image(rng, W, H, NF, PREC, PT, "smooth")
        stream = fast.encode(samples, W, H, NF, PREC, predictor, 0, PT, [fast.DEEP] * NF)
        rd.HUFFMAN_ENGINE = "native"
        new_best, new_med, new = timed(stream)
        keep = ljpeg_native.predict
        ljpeg_native.predict = old_route
        try:
            old_best, old_med, old = timed(stream)
        finally:
            ljpeg_native.predict = keep
        keep_scan = rd._decode_scan
        rd._decode_scan = rd._decode_scan_reference
        try:
            _, _, _, ref = rd.decode_lossless_jpeg(stream)
        finally:
            rd._decode_scan = keep_scan
        same = list(new) == list(old) == list(ref) == samples
        digest = hashlib.sha256(array("H", list(new)).tobytes()).hexdigest()[:16]
        print(
            f"predictor {predictor}: new best {new_best:.3f} s median {new_med:.3f} s | "
            f"old best {old_best:.3f} s median {old_med:.3f} s | "
            f"x{old_med / new_med:.1f} | identical to reference and source: {same} | sha256 {digest}"
        )
        if not same:
            sys.exit(1)


if __name__ == "__main__":
    main()
