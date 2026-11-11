"""The two-pass lossless-JPEG decoder against the one-pass reference.

``raw_develop._decode_scan`` reads every Huffman difference first through a
combined code-plus-extra-bits table, then applies the predictor (a running sum
for predictors 1 and 2). ``_decode_scan_reference`` is the original decoder,
one sample at a time. These tests encode random images with code tables that
reach every branch of the fast reader (codes that fit the table, codes whose
extra bits do not, codes longer than the table, size 16, byte stuffing,
restart markers aligned and not aligned to rows) and check that both decoders
give back the encoded samples exactly.
"""

from __future__ import annotations

import random
import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import raw_develop as rd


def _canonical(lengths: dict[int, int]):
    """Counts, symbols and {symbol: (code, length)} for a canonical code."""

    order = sorted(lengths, key=lambda s: (lengths[s], s))
    counts = [0] * 16
    for s in order:
        counts[lengths[s] - 1] += 1
    codes = {}
    code = 0
    k = 0
    for length in range(1, 17):
        for _ in range(counts[length - 1]):
            codes[order[k]] = (code, length)
            code += 1
            k += 1
        code <<= 1
    return bytes(counts), bytes(order), codes


# Short codes for small differences, then one more bit per size up to 16:
# sizes 12-16 have codes longer than the decoder's 12-bit table.
DEEP = {
    0: 2,
    1: 2,
    2: 3,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    10: 10,
    11: 11,
    12: 12,
    13: 13,
    14: 14,
    15: 15,
    16: 16,
}
# A flat table: every size gets a 5-bit code.
FLAT = {s: 5 for s in range(17)}


def encode(samples, width, height, nf, precision, predictor, restart, pt, specs):
    """Lossless JPEG with one DHT per component (``specs[c]``)."""

    out = bytearray(b"\xff\xd8")
    frame = struct.pack(">BHHB", precision, height, width, nf)
    for i in range(nf):
        frame += bytes((i + 1, 0x11, 0))
    out += b"\xff\xc3" + struct.pack(">H", len(frame) + 2) + frame
    tables = [_canonical(spec) for spec in specs]
    for i, (counts, symbols, _) in enumerate(tables):
        dht = bytes((i,)) + counts + symbols
        out += b"\xff\xc4" + struct.pack(">H", len(dht) + 2) + dht
    if restart:
        out += b"\xff\xdd" + struct.pack(">HH", 4, restart)
    sos = bytes((nf,)) + b"".join(bytes((i + 1, i << 4)) for i in range(nf)) + bytes((predictor, 0, pt))
    out += b"\xff\xda" + struct.pack(">H", len(sos) + 2) + sos

    acc = 0
    nbits = 0
    data = bytearray()

    def put(value, n):
        nonlocal acc, nbits
        acc = (acc << n) | value
        nbits += n
        while nbits >= 8:
            nbits -= 8
            byte = (acc >> nbits) & 0xFF
            data.append(byte)
            if byte == 0xFF:
                data.append(0)
        acc &= (1 << nbits) - 1

    def pad():
        if nbits:
            put((1 << (8 - nbits)) - 1, 8 - nbits)

    stored = [v >> pt for v in samples]
    initial = 1 << (precision - pt - 1)
    row_len = width * nf
    mcu = 0
    first_line = 0
    rst = 0
    for y in range(height):
        for x in range(width):
            fresh = mcu == 0
            if restart and mcu and mcu % restart == 0:
                pad()
                data.extend(bytes((0xFF, 0xD0 + rst % 8)))
                rst += 1
                fresh = True
                first_line = y
            mcu += 1
            at = (y * width + x) * nf
            for c in range(nf):
                if fresh:
                    pred = initial
                elif y == first_line:
                    pred = stored[at - nf + c] if x > 0 else stored[at - row_len + c]
                elif x == 0:
                    pred = stored[at - row_len + c]
                else:
                    ra, rb = stored[at - nf + c], stored[at - row_len + c]
                    rc = stored[at - row_len - nf + c]
                    pred = (
                        ra,
                        rb,
                        rc,
                        ra + rb - rc,
                        ra + ((rb - rc) >> 1),
                        rb + ((ra - rc) >> 1),
                        (ra + rb) >> 1,
                    )[predictor - 1]
                diff = (stored[at + c] - pred) & 0xFFFF
                if diff >= 0x8000:
                    diff -= 0x10000
                s = 16 if diff == -32768 else abs(diff).bit_length()
                code, length = tables[c][2][s]
                put(code, length)
                if 0 < s < 16:
                    put(diff if diff >= 0 else diff + (1 << s) - 1, s)
    pad()
    out += data + b"\xff\xd9"
    return bytes(out)


def _image(rng, width, height, nf, precision, pt, kind):
    top = (1 << precision) - 1
    if kind == "noise":
        vals = [rng.randint(0, top) for _ in range(width * height * nf)]
    elif kind == "smooth":
        vals = []
        level = [rng.randint(0, top) for _ in range(nf)]
        for _ in range(width * height):
            for c in range(nf):
                level[c] = min(top, max(0, level[c] + rng.randint(-40, 40)))
                vals.append(level[c])
    else:  # extremes: forces size 16 at 16-bit precision
        vals = [rng.choice((0, top, top // 2, 1)) for _ in range(width * height * nf)]
    return [(v >> pt) << pt for v in vals]


class FastDecoderTests(unittest.TestCase):
    def check(self, width, height, nf, precision, predictor, restart, pt, specs, kind, seed):
        rng = random.Random(seed)
        samples = _image(rng, width, height, nf, precision, pt, kind)
        stream = encode(samples, width, height, nf, precision, predictor, restart, pt, specs)
        w, h, n, got = rd.decode_lossless_jpeg(stream)
        self.assertEqual((w, h, n), (width, height, nf))
        self.assertEqual(got, samples)
        rd._decode_scan, keep = rd._decode_scan_reference, rd._decode_scan
        try:
            _, _, _, ref = rd.decode_lossless_jpeg(stream)
        finally:
            rd._decode_scan = keep
        self.assertEqual(ref, samples)

    def test_every_predictor_layout_and_table(self):
        seed = 0
        for predictor in range(1, 8):
            for nf in (1, 2, 4):
                for restart in (0, 7, 9, 18):  # 9 and 18 are one and two rows of a width-9 image
                    for specs, kind, precision, pt in (
                        ([DEEP] * nf, "noise", 16, 0),
                        ([FLAT] * nf, "smooth", 14, 0),
                        ([DEEP, FLAT, DEEP, FLAT][:nf], "extremes", 16, 0),
                        ([DEEP] * nf, "smooth", 12, 2),
                    ):
                        seed += 1
                        with self.subTest(predictor=predictor, nf=nf, restart=restart, kind=kind, pt=pt):
                            self.check(9, 6, nf, precision, predictor, restart, pt, specs, kind, seed)

    def test_one_column_and_one_row(self):
        for predictor in (1, 2, 4):
            for width, height in ((1, 7), (7, 1), (1, 1)):
                with self.subTest(predictor=predictor, width=width, height=height):
                    self.check(
                        width, height, 2, 16, predictor, 0, 0, [DEEP, DEEP], "noise", width * 10 + height
                    )

    def test_invalid_code_is_refused(self):
        counts, symbols, _ = _canonical({0: 1})  # one 1-bit code "0": a run of 1s is not a code
        stream = bytearray(encode([1 << 15], 1, 1, 1, 16, 1, 0, 0, [DEEP]))
        sos = stream.index(b"\xff\xda")
        dht_at = stream.index(b"\xff\xc4")
        dht = bytes((0,)) + counts + symbols
        stream[dht_at:sos] = b"\xff\xc4" + struct.pack(">H", len(dht) + 2) + dht
        sos = stream.index(b"\xff\xda")
        scan_at = sos + 2 + struct.unpack_from(">H", stream, sos + 2)[0]
        stream[scan_at:] = b"\xfe\xfe\xff\xd9"
        with self.assertRaises(rd.DevelopError):
            rd.decode_lossless_jpeg(bytes(stream))


try:
    import numpy  # noqa: F401

    HAVE_NUMPY = True
except ImportError:
    HAVE_NUMPY = False


@unittest.skipUnless(HAVE_NUMPY, "numpy is optional")
class NumpyPredictionTests(FastDecoderTests):
    """Every case above again with the prediction pass on numpy (``raw_develop_np.predict_rows``).

    The size floor is dropped so the small test images reach it, and the
    engine is pinned to numpy so a silent fall-back to the pure path fails.
    """

    def setUp(self):
        self._keep = rd._NP_PREDICT_MIN, rd.DECODE_ENGINE
        rd._NP_PREDICT_MIN, rd.DECODE_ENGINE = 0, "numpy"

    def tearDown(self):
        rd._NP_PREDICT_MIN, rd.DECODE_ENGINE = self._keep

    def test_numpy_path_is_taken(self):
        from shootflow import raw_develop_np

        calls = []
        real = raw_develop_np.predict_rows

        def spy(*a):
            calls.append(a[4])
            return real(*a)

        raw_develop_np.predict_rows = spy
        try:
            for predictor in (1, 2, 4):
                self.check(9, 6, 2, 16, predictor, 0, 0, [DEEP, DEEP], "noise", 99 + predictor)
        finally:
            raw_develop_np.predict_rows = real
        self.assertEqual(calls, [1, 2])  # predictor 4 stays on the per-sample path

    def test_array_reaches_parse_raw_unconverted(self):
        stream = encode([1 << 15, 7, 9, 65535], 2, 2, 1, 16, 1, 0, 0, [DEEP])
        _, _, _, internal = rd._decode_lossless_jpeg(stream)
        _, _, _, public = rd.decode_lossless_jpeg(stream)
        self.assertEqual(internal.typecode, "H")
        self.assertIsInstance(public, list)
        self.assertEqual(list(internal), public)
        self.assertEqual(public, [1 << 15, 7, 9, 65535])

    def test_dng_storage_variants_through_numpy(self):
        """parse_raw blits the numpy pass's array('H') tiles and strips into the raw image."""

        import test_raw_develop

        suite = unittest.defaultTestLoader.loadTestsFromName(
            "test_storage_variants_decode_identically", test_raw_develop.DevelopContainerTests
        )
        result = unittest.TestResult()
        suite.run(result)
        self.assertEqual((result.testsRun, result.failures, result.errors), (1, [], []))


if __name__ == "__main__":
    unittest.main()
