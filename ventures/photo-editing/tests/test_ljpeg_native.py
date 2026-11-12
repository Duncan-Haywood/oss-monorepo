"""The optional native Huffman reader (``shootflow.ljpeg_native``) against the pure loop.

Every encoder case in ``test_ljpeg_fast`` runs again with
``raw_develop.HUFFMAN_ENGINE = "native"`` (so a silent fall-back to the pure
loop fails), with and without the numpy prediction pass. The class is skipped
where no C compiler can build the reader; the pure path's tests still run.
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from array import array
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import test_ljpeg_fast as fast
from shootflow import ljpeg_native
from shootflow import raw_develop as rd

HAVE_NATIVE = ljpeg_native.available()


@unittest.skipUnless(HAVE_NATIVE, "no C compiler to build the native Huffman reader")
class NativeDecoderTests(fast.FastDecoderTests):
    HUFFMAN = "native"

    def test_native_reader_is_called(self):
        calls = []
        real = ljpeg_native.huffman_run

        def spy(words, mcus, tables):
            calls.append(mcus)
            return real(words, mcus, tables)

        with mock.patch.object(ljpeg_native, "huffman_run", spy):
            self.check(9, 6, 2, 16, 1, 0, 0, [fast.DEEP, fast.DEEP], "noise", 5)
            self.check(9, 6, 1, 16, 4, 7, 0, [fast.DEEP], "noise", 6)
        self.assertEqual(calls[0], 54)
        self.assertEqual(calls[1:], [7] * 7 + [5])  # 54 MCUs in restart intervals of 7, per call

    def test_differences_match_the_pure_loop(self):
        import random

        for nf, specs in ((1, [fast.DEEP]), (3, [fast.DEEP, fast.FLAT, fast.DEEP])):
            rng = random.Random(nf)
            samples = fast._image(rng, 40, 30, nf, 16, 0, "noise")
            stream = fast.encode(samples, 40, 30, nf, 16, 1, 0, 0, specs)
            tables = [rd._huffman_table(*fast._canonical(s)[:2]) for s in specs]
            sos = stream.index(b"\xff\xda")
            pos = sos + 2 + int.from_bytes(stream[sos + 2 : sos + 4], "big")
            words, _ = rd._segment_words(stream, pos, as_list=False)
            native = ljpeg_native.huffman_run(words, 1200, tables)
            pure: list[int] = []
            rd._huffman_run(words.tolist(), 1200, [(rd._combined_lookup(t), t) for t in tables], pure)
            self.assertEqual(native.tolist(), pure)

    def test_invalid_code_falls_back_and_is_refused(self):
        # The C reader returns None, the pure loop runs and raises as before.
        self.test_invalid_code_is_refused()


@unittest.skipUnless(HAVE_NATIVE and fast.HAVE_NUMPY, "needs the native reader and numpy")
class NativeNumpyTests(fast.NumpyPredictionTests):
    HUFFMAN = "native"


class NativeSwitchTests(unittest.TestCase):
    def test_off_switch_and_missing_compiler_fall_back(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = {"SHOOTFLOW_CACHE": tmp, "SHOOTFLOW_NATIVE": "0"}
            with mock.patch.dict(os.environ, env):
                self.assertIsNone(ljpeg_native._load())
            with (
                mock.patch.dict(os.environ, {"SHOOTFLOW_CACHE": tmp}),
                mock.patch.object(ljpeg_native, "_compiler", return_value=None),
            ):
                self.assertIsNone(ljpeg_native._load())
                self.assertEqual(os.listdir(tmp), [])

    def test_engine_native_without_reader_is_an_error(self):
        keep = rd.HUFFMAN_ENGINE
        rd.HUFFMAN_ENGINE = "native"
        try:
            with (
                mock.patch.object(ljpeg_native, "reader", return_value=None),
                self.assertRaises(rd.DevelopError),
            ):
                rd._native_huffman()
        finally:
            rd.HUFFMAN_ENGINE = keep

    def test_lut16_marks_every_prefix_of_a_complete_code(self):
        counts, symbols, _ = fast._canonical(fast.DEEP)
        lut = array("H", ljpeg_native.lut16(rd._huffman_table(counts, symbols)))
        self.assertEqual(len(lut), 65536)
        # Exactly the prefixes no code covers stay 0 (DEEP's Kraft sum is under 1).
        unused = 65536 - sum(1 << (16 - n) for n in fast.DEEP.values())
        self.assertEqual(sum(1 for e in lut if e == 0), unused)
        self.assertEqual(lut[-1], 0)
        self.assertEqual(lut[0], (2 << 8) | 0)


if __name__ == "__main__":
    unittest.main()
