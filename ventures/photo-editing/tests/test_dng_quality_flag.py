"""Tests for the DNG opcode flag bit 1 in ``shootflow.dng_opcodes.plan`` and ``develop``.

DNG 1.7.1.0 (September 2023), chapter 6, p. 104: "If bit 1 (the second to
least significant bit) is set to 1, the opcode can be skipped when doing
'preview quality' processing, and only needs to be applied when doing 'full
quality' processing." Until 2026-11-13 ``plan`` skipped such opcodes in every
render, so a full-quality develop left out corrections the file asked for.
These tests pin the specification's reading: run at full quality (the
default), skipped and named at preview quality, and the WarpRectilinear2 skip
rule armed only by an opcode that was actually applied.
"""

from __future__ import annotations

import io
import json
import struct
import tempfile
import unittest
from pathlib import Path

from shootflow import dng_opcodes as do
from shootflow import raw_develop as rd
from test_dng_opcodes import gain_map_params, list_tag, shaded
from test_dng_warp import warp_params
from test_dng_warp2 import plane, warp2_params
from test_raw_develop import make_dng, patch_sensor

FULL_ONLY = 2  # flag bit 1
VIG = (do.FIX_VIGNETTE_RADIAL, FULL_ONLY, struct.pack(">7d", 0.1, 0, 0, 0, 0, 0.5, 0.5))
WR = (do.WARP_RECTILINEAR, 0, warp_params([(0.99, 0, 0, 0, 0, 0)]))
WR2_OPT_FULL = (do.WARP_RECTILINEAR_2, 1 | FULL_ONLY, warp2_params([plane((1.01,))]))


def _plan3(ops, preview=False):
    return do.plan({do.TAG_OPCODE_LIST_3: bytes(list_tag(ops, do.TAG_OPCODE_LIST_3)[2])}, {}, preview=preview)


def kinds(p):
    return [type(op).__name__ for op in p.stage3]


class PlanTests(unittest.TestCase):
    def test_flag_is_read_from_bit_1(self):
        ops = do.parse_list(bytes(list_tag([(9, 0, b""), (9, 1, b""), (9, 2, b""), (9, 3, b"")])[2]))
        self.assertEqual([op.full_quality_only for op in ops], [False, False, True, True])
        self.assertEqual([op.optional for op in ops], [False, True, False, True])

    def test_full_quality_runs_the_flagged_opcode(self):
        p = _plan3([VIG])
        self.assertEqual(kinds(p), ["VignetteRadial"])
        self.assertFalse(any("preview-quality" in n for n in p.notes), p.notes)

    def test_preview_quality_skips_it_and_says_so(self):
        p = _plan3([VIG], preview=True)
        self.assertEqual(kinds(p), [])
        self.assertIn(
            "OpcodeList3: 1 x FixVignetteRadial skipped (full quality only; this is a preview-quality render)", p.notes
        )

    def test_preview_quality_keeps_unflagged_opcodes(self):
        self.assertEqual(kinds(_plan3([WR, VIG], preview=True)), ["WarpRectilinear"])

    def test_full_quality_optional_wr2_applies_and_arms_the_skip_rule(self):
        p = _plan3([WR2_OPT_FULL, WR])
        self.assertEqual(kinds(p), ["WarpRectilinear2"])
        self.assertIn("OpcodeList3: 1 fallback warp skipped after an optional WarpRectilinear2 (DNG skip rule)", p.notes)

    def test_preview_quality_skipped_wr2_keeps_the_fallback(self):
        # Not applied, so the reader is in the position of one that does not know WarpRectilinear2:
        # the fallback warp right after it is what the file offers for that case.
        self.assertEqual(kinds(_plan3([WR2_OPT_FULL, WR], preview=True)), ["WarpRectilinear"])


class DevelopTests(unittest.TestCase):
    W, H, BLACK = 48, 16, 256

    def files(self):
        sensor = patch_sensor(self.W, self.H, black=self.BLACK, white=4095)
        dark = shaded(sensor, self.W, self.BLACK, lambda x, y: 0.5)
        ops = [(do.GAIN_MAP, FULL_ONLY, gain_map_params([2.0] * 4, 2, 2))]
        return make_dng(sensor, self.W, self.H), make_dng(dark, self.W, self.H, extra_raw_tags=[list_tag(ops)])

    def test_full_quality_develop_applies_a_flagged_gain_map(self):
        plain, flagged = self.files()
        want = rd.develop(rd.parse_raw(plain), rd.DevelopSettings(engine="python"))
        full = rd.develop(rd.parse_raw(flagged), rd.DevelopSettings(engine="python"))
        preview = rd.develop(rd.parse_raw(flagged), rd.DevelopSettings(engine="python", preview_quality=True))
        self.assertIn("OpcodeList2: 1 GainMap applied (lens shading)", full[3].notes)
        self.assertLessEqual(max(abs(a - b) for a, b in zip(full[2], want[2])), 3 * 257)
        self.assertIn(
            "OpcodeList2: 1 x GainMap skipped (full quality only; this is a preview-quality render)", preview[3].notes
        )
        self.assertGreater(max(abs(a - b) for a, b in zip(preview[2], want[2])), 40 * 257)

    def test_review_still_is_a_preview_quality_render(self):
        _, flagged = self.files()
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "phone.dng"
            src.write_bytes(flagged)
            seen = {}
            real = rd.develop_file

            def spy(source, destination, settings=None, png_bits=8):
                seen["settings"] = settings
                return real(source, destination, settings, png_bits)

            rd.develop_file = spy
            try:
                out = rd.still_for_review(src, tmp)
            finally:
                rd.develop_file = real
            self.assertIsNotNone(out)
            self.assertTrue(seen["settings"].half and seen["settings"].preview_quality)

    def test_cli_flag(self):
        from shootflow.cli import main

        _, flagged = self.files()
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "phone.dng"
            src.write_bytes(flagged)
            notes = []
            for i, extra in enumerate(([], ["--preview-quality"])):
                out = io.StringIO()
                code = main(["develop", str(src), "--out", str(Path(tmp) / f"m{i}"), "--half", *extra], stdout=out, stderr=io.StringIO())
                self.assertEqual(code, 0)
                notes.append(json.loads(out.getvalue())["developed"][0]["notes"])
        self.assertIn("OpcodeList2: 1 GainMap applied (lens shading)", notes[0])
        self.assertTrue(any("skipped (full quality only" in n for n in notes[1]), notes[1])


class FlagsToolTests(unittest.TestCase):
    def test_lists_flags_and_counts_runs_in_both_modes(self):
        import sys

        sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
        import dng_opcode_flags

        _, flagged = DevelopTests().files()
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "phone.dng"
            src.write_bytes(flagged)
            row = dng_opcode_flags.survey(src)
        self.assertEqual(row["lists"]["OpcodeList2"], [{"name": "GainMap", "flags": 2, "optional": False, "full_quality_only": True}])
        self.assertEqual((row["full_runs"], row["preview_runs"]), (1, 0))


if __name__ == "__main__":
    unittest.main()
