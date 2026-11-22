"""Nikon NEF read straight into the developer (``shootflow.nef``).

Each test builds a small NEF here: a TIFF whose IFD0 names Nikon, points at a
raw SubIFD and at an EXIF IFD whose type-3 maker note (``Nikon\\0``, version,
its own TIFF) carries the white balance (0x000C), black level (0x003D) and the
linearisation table (0x0096). The sensor is Huffman-coded by an encoder in this
file with the format's fixed code tables (lossless, lossy with a full curve,
lossy with a stepped curve and a split row whose table scales differences), or
stored as packed 12-bit, so every decoded sensel can be checked exactly, and the
C decoder is checked against the Python reference. Seven real NEFs against
LibRaw (every sensel equal): ``tools/nef_libraw_check.py`` and
``eval/nikon-nef-reader-2026-11-14.md``.
"""

from __future__ import annotations

import io
import random
import struct
import sys
import tempfile
import unittest
from array import array
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import camera_profiles, ljpeg_native, nef
from shootflow import raw_develop as rd
from shootflow.cli import main
from test_arw import make_profile
from test_raw_develop import _ifd_bytes

W, H = 40, 12
VPRED = (2000, 2100, 2050, 1990)


class _BitWriter:
    def __init__(self):
        self.acc, self.n, self.out = 0, 0, bytearray()

    def put(self, value: int, n: int) -> None:
        for i in range(n - 1, -1, -1):
            self.acc = (self.acc << 1) | ((value >> i) & 1)
            self.n += 1
            if self.n == 8:
                self.out.append(self.acc)
                self.acc, self.n = 0, 0

    def done(self) -> bytes:
        if self.n:
            self.out.append(self.acc << (8 - self.n))
        return bytes(self.out) + b"\0" * 8


def _codebook(tree: int):
    """symbol -> (length, code), the shortest code for each symbol."""

    book = {}
    for (length, code), sym in sorted(nef._codes(tree).items()):
        book.setdefault(sym, (length, code))
    return book


def _representable(tree: int):
    """diff -> (symbol, extra bits, n extra bits) for every difference the table can code, shortest first."""

    out = {}
    for sym, (length, _code) in sorted(_codebook(tree).items(), key=lambda kv: kv[1][0]):
        ln, shl = sym & 15, sym >> 4
        take = max(0, ln - shl)
        for bits in range(1 << take):
            if not ln:
                d = 0
            else:
                d = (((bits << 1) + 1) << shl) >> 1
                if (d & (1 << (ln - 1))) == 0:
                    d -= (1 << ln) - (0 if shl else 1)
            out.setdefault(d, (sym, bits, take))
    return out


def encode(targets, tree: int, split: int = 0):
    """Code ``targets`` (row-major, pre-curve) the way a camera does; returns (stream, reconstructed values).

    Each difference is coded exactly when the table can, else as the nearest one it can (the lossy split
    table), and the prediction then follows what was coded, as the camera's encoder must.
    """

    w = _BitWriter()
    vpred = [list(VPRED[:2]), list(VPRED[2:])]
    hpred = [0, 0]
    recon = []
    tables = {}
    for row in range(H):
        t = tree + 1 if split and row >= split else tree
        if t not in tables:
            tables[t] = (_codebook(t), _representable(t))
        book, rep = tables[t]
        keys = sorted(rep)
        for col in range(W):
            pred = vpred[row & 1][col] if col < 2 else hpred[col & 1]
            want = targets[row * W + col] - pred
            d = want if want in rep else min(keys, key=lambda k: (abs(k - want), k))
            sym, bits, take = rep[d]
            length, code = book[sym]
            w.put(code, length)
            if take:
                w.put(bits, take)
            v = (pred + d) & 0xFFFF
            if col < 2:
                vpred[row & 1][col] = v
            hpred[col & 1] = v
            recon.append(v)
    return w.done(), recon


def field(seed=7, top=4000):
    rng = random.Random(seed)
    return [max(0, min(top, 1500 + 30 * x + 60 * y + rng.randint(-40, 40) + (900 if (x * y) % 11 == 0 else 0))) for y in range(H) for x in range(W)]


def make_lin(kind: str, bits: int, split: int = 0):
    """(tag 0x0096 bytes, little-endian, and the curve the decoder should build)."""

    head = struct.pack("<4H", *VPRED)
    if kind == "lossless":
        return bytes([0x46, 0x30]) + head + struct.pack("<H", 0) + b"\0" * 32, list(range(0x10000))
    if kind == "full":
        csize = 683 if bits == 12 else 4097
        pts = [min(0xFFF if bits == 12 else 0x3FFF, (i * i) // (csize // 6) + i) for i in range(csize)]
        curve = list(range(0x10000))
        curve[:csize] = pts
        return bytes([0x44, 0x10]) + head + struct.pack("<H", csize) + struct.pack(f"<{csize}H", *pts), curve
    # stepped: csize points every `step` values, linear in between, split row at byte 562.
    # "stepped40" is the Z bodies' 0x44 0x40: the same with step and range quartered.
    maximum = 1 << bits
    csize = 257
    step = maximum // (csize - 1)
    if kind == "stepped40":
        step //= 4
        maximum //= 4
    pts = [min(maximum - 1, int(i * step * 0.9 + (i * i) % 7)) for i in range(csize)]
    blob = bytearray(bytes([0x44, 0x40 if kind == "stepped40" else 0x20]) + head + struct.pack("<H", csize) + struct.pack(f"<{csize}H", *pts))
    blob = blob.ljust(564, b"\0")
    struct.pack_into("<H", blob, 562, split)
    curve = list(range(0x10000))
    for i in range(csize):
        curve[i * step] = pts[i]
    for i in range(maximum):
        r = i % step
        curve[i] = (curve[i - r] * (step - r) + curve[i - r + step] * r) // step
    return bytes(blob), curve


def make_nef(kind="lossless", bits=14, split=0, black=(600, 600, 600, 600), wb=(1.96875, 1.265625), model="NIKON D810"):
    """(file bytes, expected sensor values)."""

    lin_blob, curve = make_lin(kind, bits, split) if kind != "plain" else (b"", None)
    if kind == "plain":
        expected = field(top=4095)
        wr = _BitWriter()
        for v in expected:
            wr.put(v, 12)
        payload = wr.done()[: (W * 12 // 8) * H]
        raw_tags = [(258, 3, (12,)), (259, 3, (1,))]
    else:
        tree = (2 if kind == "lossless" else 0) + (3 if bits == 14 else 0)
        payload, recon = encode(field(top=(1 << bits) - 1), tree, split if kind in ("stepped", "stepped40") else 0)
        expected = [curve[max(0, min(0x3FFF, v - 0x10000 if v & 0x8000 else v))] for v in recon]
        raw_tags = [(258, 3, (bits,)), (259, 3, (34713,))]
    mn_entries = []
    if wb:
        mn_entries.append((0x000C, 5, (wb[0], wb[1], 1.0, 1.0)))
    if black:
        mn_entries.append((0x003D, 3, tuple(black)))
    if lin_blob:
        mn_entries.append((0x0096, 7, tuple(lin_blob)))
    inner = b"II*\0" + struct.pack("<I", 8) + _ifd_bytes(mn_entries, 8)
    note = b"Nikon\0\x02\x10\0\0" + inner
    # Layout: header | IFD0 | EXIF IFD | raw IFD | sensor
    ifd0 = lambda raw_at, exif_at: [  # noqa: E731
        (254, 4, (1,)),
        (271, 2, tuple(b"NIKON CORPORATION\0")),
        (272, 2, tuple(model.encode() + b"\0")),
        (330, 4, (raw_at,)),
        (34665, 4, (exif_at,)),
    ]
    ifd0_at = 8
    exif_at = ifd0_at + len(_ifd_bytes(ifd0(0, 0), ifd0_at))
    exif = _ifd_bytes([(37500, 7, tuple(note))], exif_at)
    raw_at = exif_at + len(exif)
    raw_at += raw_at % 2
    common = [(254, 4, (0,)), (256, 4, (W,)), (257, 4, (H,)), (262, 3, (32803,)), (33421, 3, (2, 2)), (33422, 1, (1, 2, 0, 1))]
    raw = lambda at: _ifd_bytes(common + raw_tags + [(273, 4, (at,)), (279, 4, (len(payload),))], raw_at)  # noqa: E731
    data_at = raw_at + len(raw(0))
    blob = bytearray(b"II*\0" + struct.pack("<I", ifd0_at))
    blob += _ifd_bytes(ifd0(raw_at, exif_at), ifd0_at)
    blob += exif
    blob = blob.ljust(raw_at, b"\0")
    blob += raw(data_at) + payload
    return bytes(blob), expected


def engines():
    return ["python", "native"] if ljpeg_native.available() else ["python"]


class ReadTests(unittest.TestCase):
    def check(self, data, expected, label):
        outs = {}
        for engine in engines():
            raw = nef.parse_nef(data, engine=engine)
            self.assertEqual(list(raw.values), expected, (label, engine))
            outs[engine] = raw
        return outs["python"]

    def test_lossless_12_and_14_bit(self):
        for bits in (12, 14):
            data, expected = make_nef("lossless", bits)
            raw = self.check(data, expected, bits)
            self.assertIn("lossless", raw.notes[0])
            self.assertEqual(raw.ifd.entries[rd.TAG_WHITE_LEVEL], ((1 << bits) - 1,))

    def test_lossy_full_curve(self):
        data, expected = make_nef("full", 12, black=None)
        raw = self.check(data, expected, "full")
        self.assertIn("lossy", raw.notes[0])
        self.assertEqual(raw.ifd.entries[rd.TAG_BLACK_LEVEL], (0.0,) * 4)

    def test_lossy_stepped_curve_and_split_row(self):
        for split in (0, 5):
            data, expected = make_nef("stepped", 14, split=split)
            raw = self.check(data, expected, split)
            self.assertEqual(f"split at row {split}" in raw.notes[0], bool(split))
        # The after-split table scales differences (shl > 0): the nearest codable one is taken.
        self.assertTrue(any(sym >> 4 for sym in nef.NIKON_TREES[4][1]))

    def test_z_body_lossy_quartered_curve_and_split_row(self):
        # 0x44 0x40 (Z 6II and later): read as 0x44 0x20 with the step and range quartered. Before
        # 2026-11-15 it fell to the full-curve branch and 99% of a real Z 6II frame's sensels were wrong.
        for bits in (12, 14):
            for split in (0, 5):
                data, expected = make_nef("stepped40", bits, split=split)
                raw = self.check(data, expected, (bits, split))
                self.assertEqual(f"split at row {split}" in raw.notes[0], bool(split))
        lin = nef.Linearization(make_lin("stepped40", 14)[0], 14, "<")
        self.assertEqual(lin.version, (0x44, 0x40))
        self.assertTrue(lin.has_curve)
        self.assertEqual(lin.curve[:4097], make_lin("stepped40", 14)[1][:4097])

    def test_12_bit_black_level_is_stored_on_a_14_bit_scale(self):
        # Z 6II 12-bit: 1008 stored, 252 in the data (D3400, D5600, Nikon 1 J5 likewise; LibRaw agrees).
        for bits, black in ((12, 252.0), (14, 1008.0)):
            raw = nef.parse_nef(make_nef("lossless", bits, black=(1008,) * 4)[0])
            self.assertEqual(raw.ifd.entries[rd.TAG_BLACK_LEVEL], (black,) * 4, bits)

    def test_uncompressed_packed_12_bit(self):
        data, expected = make_nef("plain")
        raw = nef.parse_nef(data)
        self.assertEqual(list(raw.values), expected)
        self.assertIn("uncompressed", raw.notes[0])

    def test_maker_note_levels_and_balance(self):
        raw = nef.parse_nef(make_nef()[0])
        e = raw.ifd.entries
        self.assertEqual(e[rd.TAG_BLACK_LEVEL], (600.0,) * 4)
        r, g, b = (1 / v for v in e[rd.TAG_AS_SHOT_NEUTRAL])
        self.assertAlmostEqual(r, 1.96875, places=3)
        self.assertAlmostEqual(b, 1.265625, places=3)
        self.assertEqual(e[rd.TAG_CFA_PATTERN], (1, 2, 0, 1))
        self.assertEqual(raw.source, "nef")
        no_wb = nef.parse_nef(make_nef(wb=None)[0])
        self.assertNotIn(rd.TAG_AS_SHOT_NEUTRAL, no_wb.ifd.entries)
        self.assertTrue(any("white balance" in n for n in no_wb.notes))

    def test_code_tables_are_complete_prefix_codes(self):
        # Every 16-bit prefix starts a code in all six tables (Kraft sum exactly 1), so no stream can hold an
        # invalid code: the decoders' invalid-code branch is a guard only.
        for tree in range(6):
            counts, symbols = nef.NIKON_TREES[tree]
            self.assertLessEqual(len(symbols), sum(counts))
            self.assertEqual(sum(1 << (16 - length) for (length, _c) in nef._codes(tree)), 65536, tree)
            self.assertTrue(all(nef.lut16(tree)), tree)

    def test_short_linearisation_table_is_refused(self):
        blob = bytes([0x44, 0x20]) + struct.pack("<4H", *VPRED) + struct.pack("<H", 257) + b"\0" * 100
        with self.assertRaisesRegex(rd.DevelopError, "shorter than its stated size"):
            nef.Linearization(blob, 14, "<")

    def test_truncated_stream_reads_zeros_on_both_decoders(self):
        data, _ = make_nef("lossless", 14)
        raw_ifd = [i for i in nef._ifds(data)[1] if i.one(rd.TAG_NEW_SUBFILE_TYPE, 1) == 0][0]
        at = raw_ifd.one(rd.TAG_STRIP_OFFSETS)
        lin = nef.Linearization(make_lin("lossless", 14)[0], 14, "<")
        cut = data[at : at + 40]
        outs = {e: list(nef.decode_nikon(cut, W, H, lin, engine=e)) for e in engines()}
        self.assertEqual(len(set(map(tuple, outs.values()))), 1)

    def test_dispatch_and_names(self):
        data, _ = make_nef()
        self.assertTrue(nef.is_nef(data))
        self.assertEqual(nef.camera_model(data), "Nikon D810")
        self.assertEqual(nef.camera_model(make_nef(model="D70")[0]), "Nikon D70")
        self.assertEqual(rd.parse_raw(data).source, "nef")
        self.assertFalse(nef.is_nef(b"II*\0" + struct.pack("<I", 8) + _ifd_bytes([(271, 2, tuple(b"Canon\0"))], 8)))
        with self.assertRaisesRegex(rd.DevelopError, "not a Nikon NEF"):
            nef.parse_nef(b"II*\0" + struct.pack("<I", 8) + _ifd_bytes([(271, 2, tuple(b"Canon\0"))], 8))


class DevelopTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        (self.dir / "profiles").mkdir()
        (self.dir / "profiles" / "Nikon D810 Adobe Standard.dcp").write_bytes(make_profile("Nikon D810"))

    def test_needs_a_profile(self):
        raw = rd.parse_raw(make_nef()[0])
        with self.assertRaisesRegex(rd.DevelopError, "an NEF carries no colour matrix.*Nikon D810"):
            rd.develop(raw, rd.DevelopSettings(engine="python"))

    def test_profile_chooser_and_cli(self):
        src = self.dir / "DSC_0001.NEF"
        src.write_bytes(make_nef()[0])
        self.assertEqual(camera_profiles.camera_of(src), "Nikon D810")
        out, err = io.StringIO(), io.StringIO()
        code = main(["develop", str(src), "--out", str(self.dir / "m"), "--dcp", str(self.dir / "profiles")], stdout=out, stderr=err)
        self.assertEqual(code, 0, err.getvalue())
        self.assertTrue((self.dir / "m" / "DSC_0001.tif").exists())
        self.assertIn("Nikon D810 Adobe Standard.dcp", out.getvalue())


def _frame(width=300, height=64, masked=0, pad=0, pad_value=16382, left_masked=0, seed=3):
    """A sensor frame: picture (smooth across columns, varying down the rows), then masked and padding columns."""

    rng = random.Random(seed)
    rows = [3000 + 2500 * ((r * 7919) % 97) / 97 for r in range(height)]
    out = array("H")
    for r in range(height):
        for c in range(width):
            if c < left_masked or width - pad - masked <= c < width - pad:
                v = 600 + rng.randint(-4, 4)
            elif c >= width - pad:
                v = pad_value
            else:
                v = int(rows[r] * (0.8 + 0.4 * c / width)) + rng.randint(-20, 20)
            out.append(max(0, min(16383, v)))
    return out


class VisibleAreaTests(unittest.TestCase):
    """``nef.masked_margins``: real files against LibRaw in eval/nikon-nef-visible-area-2026-11-15.md."""

    def test_masked_and_padding_columns_on_the_right(self):
        self.assertEqual(nef.masked_margins(_frame(masked=14, pad=32), 300, 64, 16383), (0, 46))

    def test_padding_at_white_is_not_a_clipped_edge(self):
        self.assertEqual(nef.masked_margins(_frame(pad=8, pad_value=16383), 300, 64, 16383), (0, 8))

    def test_picture_only_is_left_whole(self):
        self.assertEqual(nef.masked_margins(_frame(), 300, 64, 16383), (0, 0))

    def test_odd_left_margin_rounds_up_to_keep_the_cfa_phase(self):
        self.assertEqual(nef.masked_margins(_frame(left_masked=1, masked=3), 300, 64, 16383), (2, 3))

    def test_flat_frame_and_narrow_frame_are_left_whole(self):
        flat = array("H", [600] * (300 * 64))
        self.assertEqual(nef.masked_margins(flat, 300, 64, 16383), (0, 0))
        self.assertEqual(nef.masked_margins(_frame(width=100, masked=4), 100, 64, 16383), (0, 0))

    def test_busy_picture_edge_correlating_under_0_8_is_kept(self):
        # A textured lossy frame (D3400, D5600): neighbouring same-colour columns correlate 0.70-0.80,
        # which the 0.8 bar used before 2026-11-15 read as masked and cut two picture columns.
        rng = random.Random(11)
        width, height = 300, 64
        rows = [3000 + 2500 * ((r * 7919) % 97) / 97 for r in range(height)]
        frame = array("H", [max(0, min(16383, int(rows[r]) + rng.randint(-850, 850))) for r in range(height) for c in range(width)])
        col = lambda c: [float(frame[r * width + c]) for r in range(0, height, 2)]  # noqa: E731
        self.assertLess(nef._corr(col(0), col(2)), 0.8)
        self.assertGreaterEqual(nef._corr(col(0), col(2)), nef.PICTURE_CORR)
        self.assertEqual(nef.masked_margins(frame, width, height, 16383), (0, 0))

    def test_no_picture_column_within_the_search_leaves_that_side_whole(self):
        self.assertEqual(nef.masked_margins(_frame(masked=80), 300, 64, 16383), (0, 0))

    def test_parse_nef_sets_the_active_area_and_a_note(self):
        data, _ = make_nef("plain")
        raw = nef.parse_nef(data)
        self.assertEqual(raw.ifd.entries[rd.TAG_ACTIVE_AREA], (0, 0, H, W))  # 40 wide: too narrow to search
        with mock.patch.object(nef, "masked_margins", return_value=(2, 5)):
            raw = nef.parse_nef(data)
        self.assertEqual(raw.ifd.entries[rd.TAG_ACTIVE_AREA], (0, 2, H, W - 5))
        self.assertTrue(any("7 edge columns hold no picture" in n for n in raw.notes), raw.notes)


# --------------------------------------------------------------------------
# Coolpix NRW layouts (real files against LibRaw: eval/nikon-nrw-reader-2026-11-18.md)

CW, CH = 48, 16  # a row of 12-bit samples is 72 bytes, a whole number of 32-bit words


def coolpix_field(top=4000, seed=5):
    """A smooth picture with green on the (0,1)/(1,0) diagonal brighter than red and blue (RGGB)."""

    rng = random.Random(seed)
    out = []
    for y in range(CH):
        for x in range(CW):
            green = (x + y) % 2 == 1
            base = 900 + 20 * x + 15 * y + (700 if green else 0)
            out.append(max(0, min(top, base + rng.randint(-10, 10))))
    return out


def _pack12(values) -> bytes:
    wr = _BitWriter()
    for v in values:
        wr.put(v, 12)
    return wr.done()[: len(values) * 12 // 8]


def make_coolpix(payload, compression, model, cfa=(0, 1, 1, 2), nrw_block=None, wb=None):
    mn_entries = []
    if wb:
        mn_entries.append((0x000C, 5, (wb[0], wb[1], 1.0, 1.0)))
    if nrw_block is not None:
        mn_entries.append((0x0014, 7, tuple(nrw_block)))
    inner = b"II*\0" + struct.pack("<I", 8) + _ifd_bytes(mn_entries or [(0x0001, 7, (48, 50, 49, 49))], 8)
    note = b"Nikon\0\x02\x10\0\0" + inner
    ifd0 = lambda raw_at, exif_at: [  # noqa: E731
        (254, 4, (1,)),
        (271, 2, tuple(b"NIKON\0")),
        (272, 2, tuple(model.encode() + b"\0")),
        (330, 4, (raw_at,)),
        (34665, 4, (exif_at,)),
    ]
    ifd0_at = 8
    exif_at = ifd0_at + len(_ifd_bytes(ifd0(0, 0), ifd0_at))
    exif = _ifd_bytes([(37500, 7, tuple(note))], exif_at)
    raw_at = exif_at + len(exif)
    raw_at += raw_at % 2
    common = [(254, 4, (0,)), (256, 4, (CW,)), (257, 4, (CH,)), (258, 3, (12,)), (259, 3, (compression,)),
              (262, 3, (32803,)), (33421, 3, (2, 2)), (33422, 1, tuple(cfa))]
    raw = lambda at: _ifd_bytes(common + [(273, 4, (at,)), (279, 4, (len(payload),))], raw_at)  # noqa: E731
    data_at = raw_at + len(raw(0))
    blob = bytearray(b"II*\0" + struct.pack("<I", ifd0_at))
    blob += _ifd_bytes(ifd0(raw_at, exif_at), ifd0_at)
    blob += exif
    blob = blob.ljust(raw_at, b"\0")
    blob += raw(data_at) + payload
    return bytes(blob)


def nrw_block(version=b"0101", black=200, levels=(400, 256, 256, 300)):
    """The maker note's NRW colour block: black at 0x20, R G G B levels (R and B halved) at 0x38."""

    blob = bytearray(b"NRW " + version + b"\0\0")
    blob = blob.ljust(0x60, b"\0")
    struct.pack_into("<H", blob, 0x20, black)
    struct.pack_into("<4I", blob, 0x38, *levels)
    return bytes(blob)


def _swap_words(payload: bytes) -> bytes:
    return b"".join(payload[i : i + 4][::-1] for i in range(0, len(payload), 4))


class CoolpixTests(unittest.TestCase):
    def test_packed_12_bit_in_little_endian_words_with_nrw_black_and_balance(self):
        expected = coolpix_field()
        data = make_coolpix(_swap_words(_pack12(expected)), 1, "COOLPIX P7000", nrw_block=nrw_block())
        raw = nef.parse_nef(data)
        self.assertEqual(list(raw.values), expected)
        self.assertIn("little-endian 32-bit words", raw.notes[0])
        self.assertEqual(raw.ifd.entries[rd.TAG_BLACK_LEVEL], (200.0,) * 4)
        neutral = raw.ifd.entries[rd.TAG_AS_SHOT_NEUTRAL]
        self.assertAlmostEqual(1 / neutral[0], 800 / 256)
        self.assertAlmostEqual(1 / neutral[2], 600 / 256)

    def test_plain_packed_under_34713_is_not_huffman_decoded(self):
        expected = coolpix_field()
        data = make_coolpix(_pack12(expected), 34713, "COOLPIX P340")
        raw = nef.parse_nef(data)
        self.assertEqual(list(raw.values), expected)
        self.assertEqual(raw.notes[0], "NEF: uncompressed (12-bit)")
        self.assertEqual(raw.ifd.entries[rd.TAG_BLACK_LEVEL], (200.0,) * 4)  # per-model: no level in the file

    def test_top_aligned_big_endian_words_keep_the_low_bits_and_scale_black(self):
        expected = [v << 4 for v in coolpix_field()]
        expected[5] |= 8  # the odd half step these bodies write
        data = make_coolpix(struct.pack(f">{len(expected)}H", *expected), 34713, "COOLPIX P7800")
        raw = nef.parse_nef(data)
        self.assertEqual(list(raw.values), expected)
        self.assertIn("top of big-endian 16-bit words", raw.notes[0])
        self.assertEqual(raw.ifd.entries[rd.TAG_WHITE_LEVEL], (65504,))
        self.assertEqual(raw.ifd.entries[rd.TAG_BLACK_LEVEL], (3200.0,) * 4)

    def test_little_endian_16_bit_words_under_compression_1(self):
        expected = coolpix_field()
        data = make_coolpix(struct.pack(f"<{len(expected)}H", *expected), 1, "COOLPIX A1000")
        raw = nef.parse_nef(data)
        self.assertEqual(list(raw.values), expected)
        self.assertEqual(raw.ifd.entries[rd.TAG_WHITE_LEVEL], (4095,))

    def test_e_series_rows_are_interlaced_and_balance_comes_from_the_2560_byte_block(self):
        expected = coolpix_field()
        rows = [expected[r * CW : (r + 1) * CW] for r in range(CH)]
        stored = [v for r in list(range(0, CH, 2)) + list(range(1, CH, 2)) for v in rows[r]]
        block = bytearray(2560)
        struct.pack_into(">2H", block, 0x4E0, 654, 376)
        data = make_coolpix(_pack12(stored), 1, "E8800", nrw_block=bytes(block))
        raw = nef.parse_nef(data)
        self.assertEqual(list(raw.values), expected)
        self.assertIn("even rows then odd rows", raw.notes[0])
        neutral = raw.ifd.entries[rd.TAG_AS_SHOT_NEUTRAL]
        self.assertAlmostEqual(1 / neutral[0], 654 / 256)
        self.assertAlmostEqual(1 / neutral[2], 376 / 256)

    def test_cfa_tag_that_puts_green_off_the_sensels_green_diagonal_reads_as_rggb(self):
        expected = coolpix_field()
        data = make_coolpix(_swap_words(_pack12(expected)), 1, "COOLPIX P6000", cfa=(1, 2, 0, 1))
        raw = nef.parse_nef(data)
        self.assertEqual(raw.ifd.entries[rd.TAG_CFA_PATTERN], (0, 1, 1, 2))
        self.assertTrue(any("read as RGGB" in n for n in raw.notes))
        # A tag that agrees with the sensels is left alone.
        data = make_coolpix(_swap_words(_pack12(expected)), 1, "COOLPIX P6000", cfa=(2, 1, 1, 0))
        self.assertEqual(nef.parse_nef(data).ifd.entries[rd.TAG_CFA_PATTERN], (2, 1, 1, 0))

    def test_p6000_balance_offset_and_version_0100_has_no_black(self):
        block = bytearray(b"NRW 0100\0\0".ljust(10 + 0x13DE + 16, b"\0"))
        struct.pack_into("<4I", block, 10 + 0x13DE, 448, 256, 256, 440)
        black, wb = nef.coolpix_levels(_mn_with(bytes(block)))
        self.assertIsNone(black)
        self.assertAlmostEqual(wb[0], 3.5)
        self.assertAlmostEqual(wb[1], 3.4375)

    def test_nrw_path_is_developable(self):
        from shootflow import raw_preview

        self.assertTrue(raw_preview.is_developable_path(Path("DSCN0001.NRW")))


def _mn_with(blob: bytes) -> rd.Ifd:
    mn = rd.Ifd(byte_order="<")
    mn.entries = {0x0014: tuple(blob)}
    return mn


if __name__ == "__main__":
    unittest.main()
