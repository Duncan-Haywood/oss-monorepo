"""Pentax lens numbers from the maker note, and the lens memory that turns a number into a lensfun lens.

Pentax bodies write no EXIF LensModel or LensSpecification; the lens is only in the maker note, as its number
(LensRec 0x003f, LensInfo 0x0207) and its lens codes. The LensRec and LensInfo bytes below are copied from
four real files (eval/pentax-lens-memory-2026-11-14.md): the K-1 Mark II PEF, the 645D and *ist D JPEGs of
drewnoakes/metadata-extractor-images and ExifTool's t/images/Pentax.jpg (a K10D). The notes around them are
built here in each of the layouts the bodies use. ExifTool's own decode of the K10D file (t/Pentax_2.out) is
the truth for that one: Lens Type 3 44, Lens Focal Length 10.0 mm, Nominal Max Aperture 4.0, Max Aperture 3.9.
"""

from __future__ import annotations

import io
import json
import os
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import lens_profiles as lp
from shootflow import raw_develop as rd
from test_camera_profiles import profile_bytes
from test_canon_lens_range import DB_XML, settings
from test_cr2 import make_cr2
from test_olympus_equipment import ifd_bytes

# (model, LensRec, LensInfo) as the real files hold them.
K1II = ("PENTAX K-1 Mark II", "08e30000",
        "00a8705200e30540030001000000000028de5b5673e50f6f468a7024824172fbffffffe32b73e50f20870763e50c0000bfcee3c0"
        "00a0d600000000000000000001ffce0c5017ffdff5027e0000000003a0228a64008200010952c680000000300000e706c32de59b"
        "5c4b00000000000000000000000000000000000000000000")
P645D = ("PENTAX 645D", "0d120000",
         "012d200012580000000000000018763300008405128059688100ac003100000000122b84061100206a889405710003bffb1268"
         "0000160e0007000000000000000001d073dd5f0028303df67b0000000000030000000000000000")
IST_D = ("PENTAX *ist D", "0418",
         "0418002018944746850512617d385040011c96fbffffff180385050f00840476054c0000")
K10D = ("PENTAX K10D", "032c00",
        "8300002c002894335b5386ea414088503801406c03ffffff00005386ea0000000000000000bfea000000861600000000000000"
        "000000000000000000000000000000000000")


def entries(rec_hex: str, info_hex: str | None) -> list:
    rec, out = bytes.fromhex(rec_hex), []
    out.append((lp.PENTAX_LENS_REC, 1, len(rec), rec))
    if info_hex:
        info = bytes.fromhex(info_hex)
        out.append((lp.PENTAX_LENS_INFO, 7, len(info), info))
    return out


def pentax_note(rec_hex, info_hex, magic=b"PENTAX \0", order=b"II") -> bytes:
    """A "PENTAX \\0" (or "RICOH\\0") note: magic, byte order, then an IFD whose offsets count from the note."""

    start = len(magic) + 2
    return magic + order + ifd_bytes(entries(rec_hex, info_hex), start, "<" if order == b"II" else ">")


def aoc_file(rec_hex, info_hex, order=b"MM") -> tuple[dict, rd.Ifd]:
    """A TIFF whose EXIF IFD holds an "AOC\\0" note at 100: its offsets count from the file's TIFF header."""

    end = "<" if order == b"II" else ">"
    at = 100
    note = b"AOC\0" + order + ifd_bytes(entries(rec_hex, info_hex), at + 6, end)
    file_end = "<"  # the file's own byte order differs from the note's on purpose
    source = b"II" + struct.pack(file_end + "HI", 42, 8) + bytes(at - 8) + note
    exif = rd.Ifd(entries={lp.TAG_MAKER_NOTE: tuple(note)}, byte_order=file_end, source=source)
    exif.offsets[lp.TAG_MAKER_NOTE] = at
    return exif


def ifd0(model: str, extra: dict | None = None) -> dict:
    return {271: tuple(b"PENTAX\0"), 272: tuple(model.encode() + b"\0"), **(extra or {})}


class PentaxLensNumbers(unittest.TestCase):
    def test_k10d_matches_exiftool(self):
        model, rec, info = K10D
        exif = rd.Ifd(entries={lp.TAG_MAKER_NOTE: tuple(pentax_note(rec, info))})
        got = lp.pentax_lens(ifd0(model), exif)
        self.assertEqual((got.series, got.model, got.focal, got.nominal_max), (3, 44, 10.0, 4.0))
        self.assertAlmostEqual(got.max_aperture, 3.9, delta=0.05)
        self.assertEqual(got.key, "Pentax lens 3 44")

    def test_each_layout_against_the_real_files_exif(self):
        # (file, number, EXIF FocalLength, widest f-number at that focal, nominal widest): every decoded value
        # agrees with the file's own EXIF focal length and with the lens ExifTool's table names for the number
        # (8 227 a 60-250mm F4 at 170 mm; 13 18 a 645 55mm F2.8; 4 24 a 77mm F1.8).
        cases = [(K1II, (8, 227), 170.0, 4.0, 4.0), (P645D, (13, 18), 55.0, None, 2.83),
                 (IST_D, (4, 24), 77.5, 1.79, 1.68)]
        for (model, rec, info), number, focal, widest, nominal in cases:
            with self.subTest(model=model):
                exif = rd.Ifd(entries={lp.TAG_MAKER_NOTE: tuple(pentax_note(rec, info))})
                got = lp.pentax_lens(ifd0(model), exif)
                self.assertEqual((got.series, got.model), number)
                self.assertEqual(got.focal, focal)  # the *ist D's 77 mm reads 77.5: LC8 steps by 2.5 mm there
                self.assertEqual(got.max_aperture, widest)
                self.assertEqual(got.nominal_max, nominal)

    def test_aoc_note_offsets_from_the_tiff_header_in_its_own_byte_order(self):
        model, rec, info = K10D
        got = lp.pentax_lens(ifd0(model), aoc_file(rec, info, b"MM"))
        self.assertEqual((got.series, got.model, got.focal), (3, 44, 10.0))
        got = lp.pentax_lens(ifd0(model), aoc_file(rec, info, b"II"))
        self.assertEqual((got.series, got.model, got.focal), (3, 44, 10.0))

    def test_pentax_dng_private_data_and_ricoh_magic(self):
        model, rec, info = K1II
        private = {lp.TAG_DNG_PRIVATE_DATA: tuple(pentax_note(rec, info, order=b"MM"))}
        got = lp.pentax_lens(ifd0(model, private), None)
        self.assertEqual((got.series, got.model, got.source), (8, 227, "Pentax DNG's private maker note"))
        exif = rd.Ifd(entries={lp.TAG_MAKER_NOTE: tuple(pentax_note(rec, info, magic=b"RICOH\0"))})
        self.assertEqual(lp.pentax_lens(ifd0(model), exif).model, 227)

    def test_converted_dng_makn(self):
        model, rec, info = K1II
        note = pentax_note(rec, info)
        makn = b"II" + struct.pack(">I", 1000) + note
        private = tuple(b"Adobe\0MakN" + struct.pack(">I", len(makn)) + makn)
        got = lp.pentax_lens(ifd0(model, {lp.TAG_DNG_PRIVATE_DATA: private}), None)
        self.assertEqual((got.series, got.model, got.source), (8, 227, "converted DNG's Pentax maker note"))

    def test_lens_rec_alone_and_manual_lens(self):
        exif = rd.Ifd(entries={lp.TAG_MAKER_NOTE: tuple(pentax_note("1502", None))})  # the Q-S1's: no LensInfo
        got = lp.pentax_lens(ifd0("PENTAX Q-S1"), exif)
        self.assertEqual((got.series, got.model, got.focal), (21, 2, None))
        manual = rd.Ifd(entries={lp.TAG_MAKER_NOTE: tuple(pentax_note("0000", None))})
        self.assertIsNone(lp.pentax_lens(ifd0("PENTAX K-1"), manual))
        self.assertIsNone(lp.pentax_lens(ifd0("PENTAX K-1"), rd.Ifd(entries={lp.TAG_MAKER_NOTE: tuple(b"x" * 20)})))

    def test_shot_info_carries_the_key(self):
        model, rec, info = K1II
        exif = rd.Ifd(entries={lp.TAG_MAKER_NOTE: tuple(pentax_note(rec, info)), lp.TAG_FOCAL_LENGTH: (170.0,)})
        self.assertEqual(lp.shot_info(ifd0(model), exif).lens_key, "Pentax lens 8 227")


PENTAX_XML = """<lensdatabase version="2">
    <mount><name>Pentax KAF2</name></mount>
    <camera><maker>Pentax</maker><model>K-3 II</model><mount>Pentax KAF2</mount><cropfactor>1.5</cropfactor></camera>
    <lens><maker>Pentax</maker><model>smc Pentax-DA* 60-250mm f/4 ED [IF] SDM</model><mount>Pentax KAF2</mount>
        <cropfactor>1.5</cropfactor><calibration><distortion model="poly3" focal="60" k1="0.01"/>
        <distortion model="poly3" focal="250" k1="-0.01"/></calibration></lens>
</lensdatabase>
"""


class LensMemory(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        with open(os.path.join(self.dir, "pentax.xml"), "w") as fh:
            fh.write(PENTAX_XML)
        self.db = lp.load_db(self.dir)
        self.info = lp.ShotInfo("RICOH IMAGING COMPANY, LTD.", "PENTAX K-3 II", None, None, 170.0, 255.0,
                                5.0, None, None, "Pentax lens 8 227")

    def test_a_number_alone_is_refused_with_the_way_out(self):
        with self.assertRaises(lp.LensProfileError) as cm:
            lp.correction_for(self.db, self.info, 600, 400)
        self.assertIn("only by the body's number for it (Pentax lens 8 227)", str(cm.exception))
        self.assertIn("--lens-memory", str(cm.exception))

    def test_remembered_lens_is_used_and_said(self):
        memory = {"Pentax lens 8 227": "smc Pentax-DA* 60-250mm f/4 ED [IF] SDM"}
        corr = lp.correction_for(self.db, self.info, 600, 400, memory=memory)
        self.assertEqual(corr.lens.name, "smc Pentax-DA* 60-250mm f/4 ED [IF] SDM")
        self.assertTrue(corr.remembered)
        self.assertIn("from the lens memory, remembered for Pentax lens 8 227", corr.notes[0])
        other = lp.ShotInfo(*self.info.__dict__.values())
        other.lens_key = "Pentax lens 8 228"
        with self.assertRaises(lp.LensProfileError):
            lp.correction_for(self.db, other, 600, 400, memory=memory)

    def test_file_round_trip_and_bad_files(self):
        path = os.path.join(self.dir, lp.LENS_MEMORY_FILE)
        self.assertEqual(lp.load_lens_memory(path), {})
        lp.save_lens_memory(path, {"b": "B", "a": "A"})
        self.assertEqual(lp.load_lens_memory(path), {"a": "A", "b": "B"})
        self.assertLess(open(path).read().index('"a"'), open(path).read().index('"b"'))
        for bad in ("[]", '{"version": 2, "lenses": {}}', '{"version": 1, "lenses": {"a": ""}}', "{"):
            with open(path, "w") as fh:
                fh.write(bad)
            with self.subTest(bad=bad), self.assertRaises(lp.LensProfileError):
                lp.load_lens_memory(path)


class WorkspaceLensMemory(unittest.TestCase):
    def test_grade_stage_reads_the_shoots_memory(self):
        from shootflow import production_adapter as pa

        root = Path(tempfile.mkdtemp())
        self.assertIsNone(pa._workspace_lens_memory(root))
        folder = root / lp.LENS_PROFILES_DIR
        folder.mkdir(parents=True)
        lp.save_lens_memory(str(folder / lp.LENS_MEMORY_FILE), {"Pentax lens 8 227": "X"})
        self.assertEqual(pa._workspace_lens_memory(root), {"Pentax lens 8 227": "X"})
        elsewhere = Path(tempfile.mkdtemp()) / "m.json"
        (folder / lp.LENS_MEMORY_FILE).rename(elsewhere)
        (folder / lp.LENS_MEMORY_FILE).symlink_to(elsewhere)
        with self.assertRaises(rd.DevelopError):
            pa._workspace_lens_memory(root)


class DevelopRemembers(unittest.TestCase):
    """`shootflow develop --lens-memory` on a CR2 whose Canon lens type and range fit two lenses."""

    def test_first_frame_names_it_and_the_next_frame_uses_it(self):
        from shootflow.cli import main

        tmp = Path(tempfile.mkdtemp())
        (tmp / "db").mkdir()
        (tmp / "db" / "canon.xml").write_text(DB_XML)
        # 70-200 mm, f/2.8 at the shot (aperture code 96 = f/2.8), lens type 160: fits two lenses in the db.
        cr2 = make_cr2(focal=135, fnumber=2.8, camera_settings=settings(200, 70, 96, lens_type=160))[0]
        src = tmp / "a.cr2"
        src.write_bytes(cr2)
        memory = tmp / "lens-memory.json"
        (tmp / "p.dcp").write_bytes(profile_bytes())
        base = ["develop", str(src), "--dcp", str(tmp / "p.dcp"), "--half", "--lens-db", str(tmp / "db"),
                "--lens-memory", str(memory)]

        runs = []

        def run(*extra):
            out = io.StringIO()
            runs.append(1)
            self.assertEqual(main([*base, "--out", str(tmp / f"out{len(runs)}"), *extra], stdout=out), 0)
            return json.loads(out.getvalue())["developed"][0]

        first = run()
        self.assertIsNone(first["lens"])
        self.assertIn("fits 2 lenses", " ".join(first["lens_notes"]))
        self.assertFalse(memory.exists())
        key = "Canon lens type 160, 70-200 mm"
        named = run("--lens", "Canon EF 70-200mm f/2.8L USM")
        self.assertEqual(named["lens_key"], key, named)
        self.assertEqual(json.loads(memory.read_text())["lenses"], {key: "Canon EF 70-200mm f/2.8L USM"})
        again = run()
        self.assertEqual(again["lens"], "Canon EF 70-200mm f/2.8L USM")
        self.assertIn("from the lens memory", again["lens_notes"][0])


if __name__ == "__main__":
    unittest.main()
