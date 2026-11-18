"""The optional native Huffman reader (``shootflow.ljpeg_native``) against the pure loop.

Every encoder case in ``test_ljpeg_fast`` runs again with
``raw_develop.HUFFMAN_ENGINE = "native"`` (so a silent fall-back to the pure
loop fails), with and without the numpy prediction pass. The class is skipped
where no C compiler can build the reader; the pure path's tests still run.
"""

from __future__ import annotations

import os
import random
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
        real = ljpeg_native.scan_run

        def spy(data, pos, mcus, tables, restart=0):
            calls.append((mcus, restart))
            return real(data, pos, mcus, tables, restart)

        with mock.patch.object(ljpeg_native, "scan_run", spy):
            self.check(9, 6, 2, 16, 1, 0, 0, [fast.DEEP, fast.DEEP], "noise", 5)
            self.check(9, 6, 1, 16, 4, 7, 0, [fast.DEEP], "noise", 6)
        # One call per scan: the restart intervals are walked inside C.
        self.assertEqual(calls, [(54, 0), (54, 7)])

    def test_per_interval_path_is_still_called_when_scan_is_off(self):
        calls = []
        real = ljpeg_native.huffman_run

        def spy(words, mcus, tables):
            calls.append(mcus)
            return real(words, mcus, tables)

        with (
            mock.patch.dict(os.environ, {"SHOOTFLOW_NATIVE_SCAN": "0"}),
            mock.patch.object(ljpeg_native, "huffman_run", spy),
        ):
            self.check(9, 6, 2, 16, 1, 0, 0, [fast.DEEP, fast.DEEP], "noise", 5)
            self.check(9, 6, 1, 16, 4, 7, 0, [fast.DEEP], "noise", 6)
        self.assertEqual(calls[0], 54)
        self.assertEqual(calls[1:], [7] * 7 + [5])  # 54 MCUs in restart intervals of 7, per call

    def test_scan_reader_matches_the_word_reader_on_hostile_bytes(self):
        """Stuffing, markers, FF FF runs, a trailing FF, restart markers and short data.

        The pure loop over ``_segment_words`` is the reference: every random byte
        string must give the same differences (or both an invalid code).
        """

        import random

        rng = random.Random(1313)
        counts, symbols, _ = fast._canonical(fast.DEEP)
        tables_sets = [
            [rd._huffman_table(counts, symbols)],
            [rd._huffman_table(*fast._canonical(fast.FLAT)[:2]), rd._huffman_table(counts, symbols)],
            # Every code 12 bits or shorter: no 16-bit table is built, a 12-bit miss is invalid.
            [rd._huffman_table(*fast._canonical(fast.FLAT)[:2])],
        ]
        self.assertIsNotNone(ljpeg_native._lut_buffers(tables_sets[0])[0])
        self.assertIsNone(ljpeg_native._lut_buffers(tables_sets[2])[0])
        alphabet = [0x00, 0xFF, 0xD0, 0xD3, 0xD7, 0xD9, 0x01, 0x7F, 0x80, 0xAA]
        checked = invalid = 0
        for trial in range(1500):
            tables = tables_sets[trial % 3]
            n = rng.randrange(0, 40)
            data = bytes(rng.choice(alphabet) if rng.random() < 0.6 else rng.randrange(256) for _ in range(n))
            pos = rng.randrange(0, n + 1)
            mcus = rng.randrange(0, 30)
            restart = rng.choice([0, 0, 1, 2, 3, 7])
            luts = [(rd._combined_lookup(t), t) for t in tables]
            pure: list[int] | None = []
            try:
                if not restart:
                    words, _ = rd._segment_words(data, pos)
                    rd._huffman_run(words, mcus, luts, pure)
                else:
                    done, p = 0, pos
                    while done < mcus:
                        if done:
                            m = rd._RESTART_MARKER.search(data, p)
                            p = m.end() if m else len(data)
                        words, p = rd._segment_words(data, p)
                        k = min(restart, mcus - done)
                        rd._huffman_run(words, k, luts, pure)
                        done += k
            except rd.DevelopError:
                pure = None
            got = ljpeg_native.scan_run(data, pos, mcus, tables, restart)
            if pure is None:
                self.assertIsNone(got, (data.hex(), pos, mcus, restart))
                invalid += 1
            else:
                self.assertIsNotNone(got, (data.hex(), pos, mcus, restart))
                self.assertEqual(got.tolist(), pure, (data.hex(), pos, mcus, restart))
                checked += 1
        self.assertGreater(checked, 300)

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


@unittest.skipUnless(HAVE_NATIVE, "no C compiler to build the native reader")
class NativePredictionTests(fast.FastDecoderTests):
    """Every encoder case with the prediction pass pinned to C (``ljpeg_native.predict``).

    Point-transform cases run in C too (shifted there since 2026-11-14); a silent
    fall-back on any case raises, so the test fails.
    """

    HUFFMAN = "native"

    def setUp(self):
        self._keep = rd.DECODE_ENGINE
        rd.DECODE_ENGINE = "native"

    def tearDown(self):
        rd.DECODE_ENGINE = self._keep

    def test_c_prediction_is_taken(self):
        calls = []
        real = ljpeg_native.predict

        def spy(*a):
            got = real(*a)
            calls.append(got is not None)
            return got

        with mock.patch.object(ljpeg_native, "predict", spy):
            for predictor in (1, 4, 7):
                self.check(9, 6, 2, 16, predictor, 7, 0, [fast.DEEP, fast.DEEP], "noise", predictor)
        self.assertEqual(calls, [True, True, True])

    def test_c_prediction_is_taken_with_a_point_transform(self):
        calls = []
        real = ljpeg_native.predict

        def spy(*a):
            got = real(*a)
            calls.append((a[-1], got is not None))
            return got

        with mock.patch.object(ljpeg_native, "predict", spy):
            for pt, precision in ((1, 16), (2, 12), (4, 14), (15, 16)):
                for predictor in (1, 6):
                    self.check(9, 6, 2, precision, predictor, 7, pt, [fast.DEEP, fast.DEEP], "noise", pt * 10 + predictor)
        self.assertEqual([c for c in calls if not c[1]], [])
        self.assertEqual(sorted({c[0] for c in calls}), [1, 2, 4, 15])

    def test_point_transform_shift_matches_python_and_declines_overflow(self):
        # Differences straight into the C pass: shifted samples equal the Python pass's
        # (out << pt); a stored sample whose shift would pass 16 bits makes C decline.
        rng = random.Random(5)
        width, height, nf = 7, 5, 2
        for pt in (1, 3, 8):
            top = (1 << (16 - pt)) - 1
            samples = [rng.randint(0, top) for _ in range(width * height * nf)]
            diffs = _diffs_for(samples, width, height, nf, 4, 1 << (15 - pt), 0)
            got = ljpeg_native.predict(array("i", diffs), width, height, nf, 4, 1 << (15 - pt), 0, pt)
            self.assertEqual(list(got), [v << pt for v in samples])
            wide = samples[:]
            wide[17] = top + 1  # one bit too many for this pt
            diffs = _diffs_for(wide, width, height, nf, 4, 1 << (15 - pt), 0)
            self.assertIsNone(ljpeg_native.predict(array("i", diffs), width, height, nf, 4, 1 << (15 - pt), 0, pt))
        self.assertIsNone(ljpeg_native.predict(array("i", [0, 0]), 1, 1, 2, 1, 1, 0, 16))

    def test_predict_declines_python_lists(self):
        self.assertIsNone(ljpeg_native.predict([0, 0], 1, 1, 2, 1, 1 << 15, 0))


@unittest.skipUnless(HAVE_NATIVE and fast.HAVE_NUMPY, "needs the native reader and numpy")
class NativeNumpyTests(fast.NumpyPredictionTests):
    HUFFMAN = "native"


def _diffs_for(samples, width, height, nf, predictor, initial, restart):
    """The differences that ``_predict_scan`` turns back into ``samples`` (16-bit wrap).

    Sample i's prediction reads only samples before it, so each difference is solved in
    order by re-running the reference pass with the differences found so far.
    """

    diffs = []
    for i in range(len(samples)):
        probe = diffs + [0] + [0] * (len(samples) - i - 1)
        pred = rd._predict_scan(probe, width, height, nf, predictor, initial, restart)[i]
        diffs.append((samples[i] - pred) & 0xFFFF)
    return diffs


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
