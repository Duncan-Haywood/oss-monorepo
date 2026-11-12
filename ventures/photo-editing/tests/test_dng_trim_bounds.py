"""Tests for ``TrimBounds`` (DNG opcode 6) in ``shootflow.dng_opcodes`` and ``develop``.

TrimBounds crops the stage-2 or stage-3 image to ``top <= y < bottom``,
``left <= x < right``, and the trimmed image's top-left becomes (0, 0) for
every opcode after it (DNG specification 1.4, chapter 7; the SDK's
``dng_simple_image::Trim``). The answers here are written out independently
of the module:

* a trim alone gives the untrimmed develop's pixels inside the rectangle,
  byte for byte (the demosaic runs on the whole active area, a named choice);
* an opcode after a trim gives what it gives when run, unframed, on the
  cropped image; an opcode before it what it gives on the whole image, then
  cropped;
* two trims compose, the second in the first's coordinates;
* a trim outside the image is skipped and said so;
* the DefaultCrop, relative to the active area, moves with the trim.

No camera file carrying TrimBounds is in the evaluation set yet.
"""

from __future__ import annotations

import random
import struct
import unittest
from array import array

from shootflow import dng_opcodes as do
from shootflow import raw_develop as rd
from test_dng_opcodes import HAVE_NUMPY, list_tag
from test_raw_develop import make_dng, patch_sensor

W, H, BLACK, WHITE = 40, 24, 256, 4095
BIG = 1 << 20


def trim(top, left, bottom, right):
    return (6, 0, struct.pack(">4I", top, left, bottom, right))


def area(top=0, left=0, bottom=BIG, right=BIG, plane=0, planes=1, row_pitch=1, col_pitch=1):
    return struct.pack(">8I", top, left, bottom, right, plane, planes, row_pitch, col_pitch)


def scale_rows(values, **kw):
    return (12, 1, area(**kw) + struct.pack(f">I{len(values)}f", len(values), *values))


def f32(v):
    return struct.unpack(">f", struct.pack(">f", v))[0]


def cropped(pixels, width, x, y, w, h):
    """Rows ``y .. y + h``, columns ``x .. x + w`` of an interleaved RGB image (three samples per pixel)."""

    out = []
    for row in range(y, y + h):
        s = (row * width + x) * 3
        out.extend(pixels[s : s + w * 3])
    return out


def develop(blob, **settings):
    return rd.develop(rd.parse_raw(blob), rd.DevelopSettings(**settings))


def sensor():
    rng = random.Random(4)
    return [max(0, min(WHITE, v + rng.randint(-300, 300))) for v in patch_sensor(W, H, black=BLACK, white=WHITE)]


class ParseTests(unittest.TestCase):
    def test_round_trip_into_both_lists(self):
        tags = [list_tag([trim(2, 4, 20, 36)]), list_tag([trim(1, 1, 5, 5)], do.TAG_OPCODE_LIST_3)]
        plan = do.plan(rd.parse_raw(make_dng(sensor(), W, H, extra_raw_tags=tags)).ifd, {})
        self.assertEqual(plan.stage2, [do.TrimBounds(2, 4, 20, 36)])
        self.assertEqual(plan.stage3, [do.TrimBounds(1, 1, 5, 5)])

    def test_empty_or_short_is_unreadable(self):
        for params in (struct.pack(">4I", 5, 0, 5, 9), struct.pack(">4I", 0, 9, 5, 2), b"\0" * 12):
            with self.subTest(params=params):
                with self.assertRaises(do.OpcodeError):
                    do.parse_trim_bounds(do.Opcode(6, 0, 0, params))

    def test_opcode_list_1_names_it(self):
        tag = list_tag([trim(0, 0, 4, 4)], do.TAG_OPCODE_LIST_1)
        got = develop(make_dng(sensor(), W, H, extra_raw_tags=[tag]), engine="python")
        self.assertIn("OpcodeList1: 1 x TrimBounds (required) not applied", got[3].notes)
        self.assertEqual((got[0], got[1]), (W, H))


class FrameTests(unittest.TestCase):
    def test_trims_compose_and_wrap_what_follows(self):
        a, b, c = object(), object(), object()
        notes: list[str] = []
        ops, frame = do.frame_trims([a, do.TrimBounds(2, 3, 20, 30), b, do.TrimBounds(1, 2, 10, 12), c], 24, 40, "L", notes)
        self.assertEqual(ops, [a, do.Framed(b, 2, 3, 18, 27), do.Framed(c, 3, 5, 9, 10)])
        self.assertEqual(frame, (3, 5, 9, 10))
        self.assertEqual(notes, ["L: 2 TrimBounds applied (image trimmed to 10x9 at x 5, y 3)"])

    def test_outside_is_skipped(self):
        notes: list[str] = []
        ops, frame = do.frame_trims([do.TrimBounds(0, 0, 25, 10)], 24, 40, "L", notes)
        self.assertEqual((ops, frame), ([], (0, 0, 24, 40)))
        self.assertEqual(notes, ["L: TrimBounds (0, 0, 25, 10) lies outside the 40x24 image and was skipped"])

    def test_start_frame_and_half_factor(self):
        notes: list[str] = []
        ops, frame = do.frame_trims([do.TrimBounds(2, 4, 10, 12)], 12, 20, "L", notes, start=(1, 1, 10, 18), factor=0.5)
        self.assertEqual(frame, (2, 3, 4, 4))

    def test_op_after_trim_runs_on_the_cropped_image(self):
        rng = random.Random(9)
        w, h = 17, 13
        t, lf, b, r = 2, 3, 11, 15
        scale = (1.8, 1.0, 1.3)
        src = array("d", (rng.random() * scale[i % 3] for i in range(w * h * 3)))
        vig = do.VignetteRadial((0.3, -0.1, 0.05, 0.0, 0.0), 0.4, 0.6)
        warp = do.WarpRectilinear(((1.0, 0.04, -0.01, 0.0, 0.002, -0.001),), 0.45, 0.55)
        gains = tuple(f32(rng.uniform(0.8, 1.2)) for _ in range(b - t))
        rows = do.PerLine(0, 0, b - t, r - lf, 0, 3, 1, 1, "scale", "row", gains)
        before = do.PerLine(0, 0, h, w, 0, 3, 1, 1, "scale", "row", tuple(f32(rng.uniform(0.8, 1.2)) for _ in range(h)))
        ops, frame = do.frame_trims([before, do.TrimBounds(t, lf, b, r), vig, warp, rows], h, w, "L", [])
        got = cropped(do.run_stage3_rgb(ops, array("d", src), w, h, scale), w, lf, t, r - lf, b - t)
        want = do.run_stage3_rgb([before], array("d", src), w, h, scale)
        want = do.run_stage3_rgb([vig, warp, rows], array("d", cropped(want, w, lf, t, r - lf, b - t)), r - lf, b - t, scale)
        self.assertEqual(frame, (t, lf, b - t, r - lf))
        self.assertEqual(list(got), list(want))

    def test_stage2_op_after_trim_sees_trimmed_rows(self):
        rng = random.Random(3)
        w, h = 16, 10
        gm = do.GainMap(0, 0, BIG, BIG, 0, 1, 1, 1, 2, 2, 1.0, 1.0, 0.0, 0.0, 1, tuple(f32(rng.uniform(1.0, 2.0)) for _ in range(4)))
        ops, (t, lf, fh, fw) = do.frame_trims([do.TrimBounds(3, 2, 9, 14), gm], h, w, "L", [])
        plane = [[rng.random() * 0.5 for _ in range(w)] for _ in range(h)]
        got = [list(r) for r in plane]
        for y, row in enumerate(got):
            do.apply_row(ops, y, row, h, w, 1)
        for y in range(fh):
            row = plane[t + y][lf : lf + fw]
            do.apply_row([gm], y, row, fh, fw, 1)
            self.assertEqual(got[t + y][lf : lf + fw], row)


class DevelopTests(unittest.TestCase):
    def test_trim_alone_is_the_plain_develop_cropped(self):
        s = sensor()
        plain = develop(make_dng(s, W, H), engine="python")
        for label, tag in (("OpcodeList2", list_tag([trim(3, 5, 21, 33)])), ("OpcodeList3", list_tag([trim(3, 5, 21, 33)], do.TAG_OPCODE_LIST_3))):
            with self.subTest(list=label):
                got = develop(make_dng(s, W, H, extra_raw_tags=[tag]), engine="python")
                self.assertEqual((got[0], got[1], got[3].width, got[3].height), (28, 18, 28, 18))
                self.assertEqual(list(got[2]), cropped(plain[2], W, 5, 3, 28, 18))
                self.assertIn(f"{label}: 1 TrimBounds applied (image trimmed to 28x18 at x 5, y 3)", got[3].notes)

    def test_list3_trims_inside_list2_trim(self):
        s = sensor()
        tags = [list_tag([trim(2, 4, 22, 36)]), list_tag([trim(1, 2, 11, 30)], do.TAG_OPCODE_LIST_3)]
        got = develop(make_dng(s, W, H, extra_raw_tags=tags), engine="python")
        plain = develop(make_dng(s, W, H), engine="python")
        self.assertEqual(list(got[2]), cropped(plain[2], W, 6, 3, 28, 10))

    def test_half_size_halves_the_rectangle(self):
        s = sensor()
        tag = list_tag([trim(4, 6, 20, 30)], do.TAG_OPCODE_LIST_3)
        got = develop(make_dng(s, W, H, extra_raw_tags=[tag]), engine="python", half=True)
        plain = develop(make_dng(s, W, H), engine="python", half=True)
        self.assertEqual(list(got[2]), cropped(plain[2], W // 2, 3, 2, 12, 8))

    def test_row_gain_after_trim_counts_from_the_trim(self):
        # Rows 4..19 darkened by a per-row factor; a ScalePerRow after the trim, indexed from the trim's top, undoes it.
        s = sensor()
        t, b = 4, 20
        gains = [f32(1.0 + 0.05 * i) for i in range(b - t)]
        dark = [
            v if not t <= i // W < b else int(round(BLACK + (v - BLACK) / gains[i // W - t]))
            for i, v in enumerate(s)
        ]
        tag = list_tag([trim(t, 0, b, W), scale_rows(gains, bottom=b - t)])
        got = develop(make_dng(dark, W, H, extra_raw_tags=[tag]), engine="python")
        plain = develop(make_dng(s, W, H), engine="python")
        want = cropped(plain[2], W, 0, t, W, b - t)
        # The darkened rows' neighbours outside the trim feed the demosaic at its top and bottom edge (a named choice).
        inner = slice(2 * W * 3, (b - t - 2) * W * 3)
        self.assertLessEqual(max(abs(a - c) for a, c in zip(got[2][inner], want[inner])), 3 * 257)

    def test_outside_trim_is_skipped(self):
        s = sensor()
        tag = list_tag([trim(0, 0, H + 1, W)], do.TAG_OPCODE_LIST_3)
        got = develop(make_dng(s, W, H, extra_raw_tags=[tag]), engine="python")
        plain = develop(make_dng(s, W, H), engine="python")
        self.assertEqual(got[2].tobytes(), plain[2].tobytes())
        self.assertIn(f"OpcodeList3: TrimBounds (0, 0, {H + 1}, {W}) lies outside the {W}x{H} image and was skipped", got[3].notes)

    def test_opcodes_off_leaves_it(self):
        s = sensor()
        tag = list_tag([trim(3, 5, 21, 33)], do.TAG_OPCODE_LIST_3)
        got = develop(make_dng(s, W, H, extra_raw_tags=[tag]), engine="python", opcodes=False)
        self.assertEqual((got[0], got[1]), (W, H))

    def test_default_crop_moves_with_the_trim(self):
        s = sensor()
        tag = list_tag([trim(2, 4, 22, 36)], do.TAG_OPCODE_LIST_3)
        plain = develop(make_dng(s, W, H), engine="python")
        cases = (
            ((8, 6), (20, 10), (8, 6, 20, 10)),  # inside the trim: the same pixels as untrimmed
            ((0, 0), (40, 24), (4, 2, 32, 20)),  # the whole frame: cut to the trim
            ((30, 1), (10, 10), (30, 2, 6, 9)),  # over the trim's right and top edges: cut
        )
        for origin, size, (x, y, w, h) in cases:
            with self.subTest(origin=origin, size=size):
                got = develop(make_dng(s, W, H, crop=origin + size, extra_raw_tags=[tag]), engine="python")
                self.assertEqual((got[0], got[1]), (w, h))
                self.assertEqual(list(got[2]), cropped(plain[2], W, x, y, w, h))
        got = develop(make_dng(s, W, H, crop=(37, 0, 3, 3), extra_raw_tags=[tag]), engine="python")
        self.assertIn("DefaultCrop lies outside the image and was ignored", got[3].notes)
        self.assertEqual((got[0], got[1]), (32, 20))


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class EngineTests(unittest.TestCase):
    def test_numpy_gives_the_pure_bytes(self):
        rng = random.Random(31)
        s = sensor()
        list2 = list_tag(
            [
                scale_rows([f32(rng.uniform(0.9, 1.1)) for _ in range(H)], bottom=H),
                trim(2, 3, 22, 37),
                scale_rows([f32(rng.uniform(0.9, 1.1)) for _ in range(20)], bottom=20),
            ]
        )
        list3 = list_tag(
            [
                trim(1, 2, 19, 33),
                (3, 1, struct.pack(">7d", 0.2, -0.05, 0.0, 0.0, 0.0, 0.45, 0.5)),
                (1, 1, struct.pack(">I8d", 1, 1.0, 0.03, -0.01, 0.0, 0.001, 0.0, 0.5, 0.5)),
                trim(1, 1, 15, 25),
            ],
            do.TAG_OPCODE_LIST_3,
        )
        raw = rd.parse_raw(make_dng(s, W, H, crop=(5, 3, 30, 18), extra_raw_tags=[list2, list3]))
        for half in (False, True):
            with self.subTest(half=half):
                py = rd.develop(raw, rd.DevelopSettings(engine="python", half=half))
                npy = rd.develop(raw, rd.DevelopSettings(engine="numpy", half=half))
                self.assertEqual(py[3].notes, npy[3].notes)
                self.assertEqual((py[0], py[1]), (npy[0], npy[1]))
                self.assertEqual(py[2].tobytes(), npy[2].tobytes())
                if not half:
                    self.assertEqual((py[0], py[1]), (24, 14))

    def test_apply_plane_matches_apply_row_with_frames(self):
        import numpy as np

        rng = random.Random(12)
        w, h = 18, 11
        ops, _ = do.frame_trims(
            [
                do.PerLine(0, 0, h, w, 0, 1, 1, 1, "delta", "row", tuple(f32(rng.uniform(-0.1, 0.1)) for _ in range(h))),
                do.TrimBounds(1, 2, 10, 17),
                do.MapTable(0, 0, BIG, BIG, 0, 1, 2, 1, tuple(rng.randrange(65536) for _ in range(900))),
                do.VignetteRadial((0.2, 0.0, 0.0, 0.0, 0.0), 0.5, 0.5),
            ],
            h, w, "L", [],
        )
        plane = np.array([[rng.random() for _ in range(w)] for _ in range(h)], dtype=np.float64)
        rows = [list(r) for r in plane]
        do.apply_plane(ops, plane, h, w, 1)
        for y, row in enumerate(rows):
            do.apply_row(ops, y, row, h, w, 1)
        self.assertEqual(plane.tobytes(), np.array(rows, dtype=np.float64).tobytes())


if __name__ == "__main__":
    unittest.main()
