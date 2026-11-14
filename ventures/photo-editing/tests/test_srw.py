"""Samsung SRW read straight into the developer (``shootflow.srw``).

Each storage scheme has an encoder here that writes a known sensor through the
decoder's own rules (block layout, prediction, bit lengths, word order), so the
decoded sensels are checked exactly on the C decoders and the Python reference.
Random byte streams then check that the two decoders agree (or both refuse)
on input no encoder made. A small SRW (a TIFF with a Samsung Make, a raw
sub-IFD and a maker note with the encrypted levels) goes through
``parse_srw``, ``parse_raw``, the profile chooser and the CLI. Four real SRWs
against LibRaw (every sensel equal): ``tools/srw_libraw_check.py`` and
``eval/samsung-srw-reader-2026-11-14.md``.
"""

from __future__ import annotations

import io
import random
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import camera_profiles, ljpeg_native, raw_preview, srw
from shootflow import raw_develop as rd
from shootflow.cli import main
from test_arw import make_profile
from test_raw_develop import _ifd_bytes


def engines():
    return ["python", "native"] if ljpeg_native.available() else ["python"]


class _Bits:
    """An MSB-first bit writer."""

    def __init__(self):
        self.bits: list[int] = []

    def put(self, value: int, n: int) -> None:
        for k in range(n - 1, -1, -1):
            self.bits.append((value >> k) & 1)

    def pad(self, multiple: int) -> None:
        while len(self.bits) % multiple:
            self.bits.append(0)

    def big_endian(self) -> bytes:
        self.pad(8)
        return bytes(int("".join(map(str, self.bits[i : i + 8])), 2) for i in range(0, len(self.bits), 8))

    def le_words(self) -> bytes:
        """The stream as 32-bit words stored little-endian (the PH1 order)."""

        self.pad(32)
        be = self.big_endian()
        return b"".join(be[i : i + 4][::-1] for i in range(0, len(be), 4))


def _signed_bits(d: int, n: int) -> int:
    assert -(1 << (n - 1)) <= d < (1 << (n - 1)), (d, n)
    return d & ((1 << n) - 1)


def field(seed: int, width: int, height: int, bits: int = 12) -> list[int]:
    """A smooth sensor with noise and a few hard edges, inside ``bits``."""

    rnd = random.Random(seed)
    top = (1 << bits) - 1
    out = []
    for y in range(height):
        for x in range(width):
            v = int(top * (0.2 + 0.5 * ((x * 7 + y * 3) % 97) / 97)) + rnd.randint(-40, 40)
            if (x // 9 + y // 5) % 7 == 0:
                v = rnd.randint(0, top)
            out.append(max(0, min(top, v)))
    return out


# --------------------------------------------------------------------------
# Encoders, one per scheme


def encode_rows(values: list[int], width: int, height: int, seed: int = 0) -> tuple[bytes, list[int]]:
    """Compression 32770 with a row table: (data, row offsets). Blocks pick the vertical or horizontal predictor
    at random (vertical from row 2), and a mix of explicit, +1, -1 and kept bit lengths."""

    rnd = random.Random(seed)
    # The stored image is the target with each 2x2 cell's second and third sensels swapped back.
    coded = list(values) + [0] * srw.PAD
    for row in range(0, height - 1, 2):
        for col in range(0, width - 1, 2):
            a, b = row * width + col + 1, (row + 1) * width + col
            coded[a], coded[b] = coded[b], coded[a]
    flat = [0] * (width * height + srw.PAD)  # what the decoder holds, overruns included
    data = bytearray()
    offsets = []
    for row in range(height):
        offsets.append(len(data))
        w = _Bits()
        lens = [7] * 4 if row < 2 else [4] * 4
        base = row * width
        for col in range(0, width, 16):
            direction = 1 if row >= 2 and rnd.random() < 0.4 else 0
            preds, diffs = {}, {}
            order = [0, 2, 4, 6, 8, 10, 12, 14, 1, 3, 5, 7, 9, 11, 13, 15]
            for c in order:
                if direction:
                    pred = flat[(row - (2 if c & 1 else 1)) * width + col + c]
                elif col:
                    pred = flat[base + col - (1 if c & 1 else 2)]
                else:
                    pred = 128
                target = coded[base + col + c] if col + c < width else pred  # past the row: no change
                d = target - pred
                diffs[c] = d
                preds[c] = pred
            need = [0] * 4
            for c in order:
                g = ((c & 1) << 1) | (c >> 3)
                need[g] = max(need[g], abs(diffs[c]).bit_length() + 1 if diffs[c] else 0)
            ops = []
            for g in range(4):
                if need[g] <= lens[g] - 1 and rnd.random() < 0.5 and lens[g] > 0:
                    ops.append(2 if need[g] <= lens[g] - 1 else 0)
                elif need[g] == lens[g] + 1:
                    ops.append(1)
                elif need[g] <= lens[g] and rnd.random() < 0.5:
                    ops.append(0)
                else:
                    ops.append(3)
            w.put(direction, 1)
            for op in ops:
                w.put(op, 2)
            for g, op in enumerate(ops):
                if op == 3:
                    lens[g] = max(need[g], rnd.choice((need[g], 13))) if need[g] < 16 else 15
                    w.put(lens[g], 4)
                elif op == 2:
                    lens[g] -= 1
                elif op == 1:
                    lens[g] += 1
            for c in order:
                n = lens[((c & 1) << 1) | (c >> 3)]
                if n:
                    w.put(_signed_bits(diffs[c], n), n)
                else:
                    assert diffs[c] == 0
                flat[base + col + c] = (preds[c] + diffs[c]) & 0xFFFF
        data += w.le_words()
    return bytes(data), offsets


def encode_huffman(values: list[int], width: int, height: int) -> bytes:
    """Compression 32772: per-parity running values, each difference through the fixed table."""

    codes = {}  # difference bits -> (code, length)
    slot = 0
    for entry in srw.HUFF_TAB:
        length, n = entry >> 8, entry & 0xFF
        codes[n] = (slot >> (10 - length), length)
        slot += 1024 >> length
    w = _Bits()
    vpred = [[0, 0], [0, 0]]
    hpred = [0, 0]
    for row in range(height):
        for col in range(width):
            v = values[row * width + col]
            prev = vpred[row & 1][col] if col < 2 else hpred[col & 1]
            d = v - prev
            n = abs(d).bit_length()
            code, length = codes[n]
            w.put(code, length)
            if n:
                w.put(d if d > 0 else d + (1 << n) - 1, n)
            if col < 2:
                vpred[row & 1][col] = v
            hpred[col & 1] = v
    return w.big_endian()


def encode_blocks(values: list[int], width: int, height: int, *, opt: int, init: int = 1000, seed: int = 0) -> bytes:
    """Compression 32773: the 16-byte header (option byte, initial value), then rows on 16-byte boundaries.
    Prediction modes and bit-length codes are picked at random; the magnitude stays 0 (``d * 1 + 0``), kept or
    re-sent as an explicit 12-bit 0. Non-zero magnitudes are covered by the random-stream agreement test and the
    real NX1 file against LibRaw."""

    rnd = random.Random(seed)
    raw = [0] * (2 * width) + [0] * (width * height)
    off = 2 * width
    out = bytearray(16)
    out[9] = opt
    out[12:14] = struct.pack("<H", init)
    for row in range(height):
        w = _Bits()
        pmode = 7
        lent = [[7, 7], [7, 7], [7, 7]] if row < 2 else [[4, 4], [4, 4], [4, 4]]
        lens = [0, 0, 0, 0]
        base = off + row * width
        green = off + (row - 1) * width + (1 - ((row & 1) << 1))
        other = off + (row - 2) * width
        prow = [green, other] if not row & 1 else [other, green]
        for tab in range(0, width - 15, 16):
            if not opt & 4 and not tab & 63:
                if rnd.random() < 0.5:
                    w.put(0, 2)  # keep the magnitude (0)
                else:
                    w.put(3, 2)  # an explicit 12-bit magnitude: 0
                    w.put(0, 12)
            if opt & 2:
                bit = rnd.randint(0, 1)
                w.put(bit, 1)
                pmode = 7 - 4 * bit
            else:
                if rnd.random() < 0.3:
                    w.put(1, 1)
                else:
                    w.put(0, 1)
                    pmode = rnd.randint(0, 7)
                    w.put(pmode, 3)
            # The diffs this block needs, under this pmode.
            cols, preds = [], []
            for c in range(16):
                col = tab + (((c & 7) << 1) ^ (c >> 3) ^ (row & 1))
                if pmode == 7 or row < 2:
                    pred = raw[base + tab - 2 + (col & 1)] if tab else init
                else:
                    p = prow[col & 1] + col
                    pred = (raw[p + srw.PRED_A[pmode]] + raw[p + srw.PRED_B[pmode]] + 1) >> 1
                cols.append(col)
                preds.append(pred)
            diffs = [values[row * width + col] - pred for col, pred in zip(cols, preds)]
            need = [max((abs(d).bit_length() + 1 if d else 0) for d in diffs[4 * g : 4 * g + 4]) for g in range(4)]
            send = opt & 1 or rnd.random() < 0.8 or any(need[g] > lens[g] for g in range(4))
            if not opt & 1:
                w.put(0 if send else 1, 1)
            if send:
                plan = []
                for g in range(4):
                    i = (((row & 1) << 1) | (g & 1)) % 3
                    base_len = lent[i][0]
                    for code, delta in ((0, 0), (1, 1), (2, -1)):
                        if need[g] <= base_len + delta <= 15 and base_len + delta >= 0 and rnd.random() < 0.6:
                            plan.append((code, base_len + delta))
                            break
                    else:
                        plan.append((3, max(need[g], 1) if need[g] < 16 else 15))
                    lens[g] = plan[-1][1]
                    lent[i][0] = lent[i][1]
                    lent[i][1] = lens[g]
                for code, _ in plan:
                    w.put(code, 2)
                for code, n in plan:
                    if code == 3:
                        w.put(n, 4)
            for c in range(16):
                n = lens[c >> 2]
                d = diffs[c]
                assert n >= (abs(d).bit_length() + 1 if d else 0), (row, tab, c, d, n)
                if n:
                    w.put(_signed_bits(d, n), n)
                raw[base + cols[c]] = (preds[c] + d) & 0xFFFF
        words = w.le_words()
        out += words + bytes(-len(words) % 16)
    return bytes(out)


# --------------------------------------------------------------------------
# A whole SRW


KEY = (305, 72, 737, 456, 282, 307, 519, 724, 13, 505, 193)  # the key every real SRW here carries


def make_srw(*, comp=srw.COMP_BLOCKS, width=32, height=8, bits=14, model="NX1", black=128,
             wb=(7552, 4096, 4096, 5760), cfa=(1, 0, 2, 1), crop=(2, 2, 30, 6), values=None, note=True):
    """An SRW: (file bytes, expected sensels). ``crop`` = (left, top, right, bottom) of the picture area."""

    if values is None:
        values = field(7, width, height, bits)
    table_entries = []
    if comp == srw.COMP_BLOCKS:
        payload = encode_blocks(values, width, height, opt=0, seed=3)
    elif comp == srw.COMP_HUFFMAN:
        payload = encode_huffman(values, width, height)
    elif comp == "packed":
        b = bytearray()
        for k in range(0, len(values), 2):
            v0, v1 = values[k], values[k + 1]
            b += bytes((v0 & 0xFF, (v0 >> 8) | ((v1 & 15) << 4), v1 >> 4))
        payload = bytes(b)
        comp = srw.COMP_ROWS
    elif comp == srw.COMP_ROWS:
        payload, offsets = encode_rows(values, width, height, seed=2)
        table_entries = offsets
    else:
        payload = bytes(width * height * 2)

    note_entries = [(srw.MN_KEY, 4, KEY)]
    if black is not None:
        note_entries.append((srw.MN_BLACK, 9, tuple(black + k for k in KEY[:4])))
    if wb is not None:
        note_entries.append((srw.MN_WB_UNCORRECTED, 4, tuple(v + k for v, k in zip(wb, KEY))))
    if crop is not None:
        note_entries.append((srw.MN_CROP, 4, (0, 0, width, height) + tuple(crop)))
    note_blob = _ifd_bytes(note_entries, 0)  # offsets count from the note's first byte

    def layout(exif_at, raw_at, data_at, table_at):
        ifd0 = [(271, 2, tuple(b"SAMSUNG\0")), (272, 2, tuple(model.encode() + b"\0")), (0x14A, 4, (raw_at,))]
        if note:
            ifd0.append((0x8769, 4, (exif_at,)))
        raw = [
            (254, 4, (0,)), (256, 4, (width,)), (257, 4, (height,)), (258, 3, (bits,)), (259, 3, (comp,)),
            (273, 4, (data_at,)), (279, 4, (len(payload),)), (33421, 3, (2, 2)), (33422, 1, tuple(cfa)),
        ]
        if table_entries:
            raw.append((srw.TAG_ROW_TABLE, 4, (table_at,)))
        exif = [(0x829A, 5, (0.01,)), (srw.TAG_MAKER_NOTE, 7, tuple(note_blob))]
        return ifd0, exif, raw

    ifd0, exif, raw = layout(0, 0, 0, 0)
    exif_at = 8 + len(_ifd_bytes(ifd0, 8))
    raw_at = exif_at + len(_ifd_bytes(exif, exif_at))
    data_at = raw_at + len(_ifd_bytes(raw, raw_at))
    table_at = data_at + len(payload)
    ifd0, exif, raw = layout(exif_at, raw_at, data_at, table_at)
    blob = b"II*\0" + struct.pack("<I", 8) + _ifd_bytes(ifd0, 8)
    exif_bytes = _ifd_bytes(exif, exif_at)
    # The maker note's own offsets count from its first byte, so it is placed as written.
    blob += exif_bytes + _ifd_bytes(raw, raw_at) + payload + struct.pack(f"<{len(table_entries)}I", *table_entries)
    return blob, values


# --------------------------------------------------------------------------


class DecoderTests(unittest.TestCase):
    def test_rows_32770_exact_on_both_engines(self):
        # 40 is not a multiple of 16: the last block runs into the next row, as dcraw's does.
        for width, height, seed in ((40, 9, 1), (32, 6, 2), (48, 12, 3)):
            vals = field(seed, width, height)
            payload, offsets = encode_rows(vals, width, height, seed=seed)
            table = struct.pack(f"<{height}I", *offsets)
            data = payload + table
            for e in engines():
                got = srw.decode_srw(data, self._raw_ifd(width, height, srw.COMP_ROWS, len(payload), table_at=len(payload)), e)
                self.assertEqual(list(got[0]), vals, (width, e))

    def test_huffman_32772_exact_and_range_checked(self):
        for width, height, seed in ((30, 7, 1), (64, 5, 2)):
            vals = field(seed, width, height)
            data = encode_huffman(vals, width, height)
            for e in engines():
                got = srw.decode_srw(data, self._raw_ifd(width, height, srw.COMP_HUFFMAN, len(data)), e)
                self.assertEqual(list(got[0]), vals, (width, e))
        # A stream that walks below zero is refused by both.
        bad = _Bits()
        bad.put(0b1111110, 7)  # the 7-bit code: 9 difference bits
        bad.put(0, 9)  # -511
        for e in engines():
            with self.assertRaises(rd.DevelopError):
                srw.decode_srw(bad.big_endian(), self._raw_ifd(2, 1, srw.COMP_HUFFMAN, 3), e)

    def test_blocks_32773_exact_for_every_option(self):
        for opt in (0, 1, 2, 3, 4, 5, 6, 7):
            width, height = 64 + 16 * (opt % 3), 7
            vals = field(opt, width, height, bits=14)
            data = encode_blocks(vals, width, height, opt=opt, seed=opt)
            for e in engines():
                got = srw.decode_srw(data, self._raw_ifd(width, height, srw.COMP_BLOCKS, len(data), bits=14), e)
                self.assertEqual(list(got[0]), vals, (opt, e))

    def test_packed12(self):
        vals = field(4, 10, 3)
        b = bytearray()
        for k in range(0, len(vals), 2):
            b += bytes((vals[k] & 0xFF, (vals[k] >> 8) | ((vals[k + 1] & 15) << 4), vals[k + 1] >> 4))
        self.assertEqual(list(srw.decode_packed12(bytes(b), 10, 3)), vals)
        self.assertEqual(list(srw._packed12_python(bytes(b), 30)), vals)

    def test_engines_agree_on_random_streams(self):
        if len(engines()) < 2:
            self.skipTest("no C compiler")
        rnd = random.Random(11)
        for trial in range(40):
            width, height = rnd.choice((16, 32, 48)), rnd.randint(1, 6)
            junk = bytes(rnd.randrange(256) for _ in range(width * height * 3))
            for comp in (srw.COMP_ROWS, srw.COMP_HUFFMAN, srw.COMP_BLOCKS):
                table_at = len(junk)
                data = junk + struct.pack(f"<{height}I", *sorted(rnd.randrange(len(junk) // 2) for _ in range(height)))
                ifd = self._raw_ifd(width, height, comp, len(junk), table_at=table_at if comp == srw.COMP_ROWS else None)
                outs = []
                for e in engines():
                    try:
                        outs.append(tuple(srw.decode_srw(data, ifd, e)[0]))
                    except rd.DevelopError:
                        outs.append("refused")
                self.assertEqual(outs[0], outs[1], (trial, comp))

    @staticmethod
    def _raw_ifd(width, height, comp, size, *, bits=12, table_at=None):
        ifd = rd.Ifd()
        ifd.entries = {rd.TAG_WIDTH: (width,), rd.TAG_HEIGHT: (height,), rd.TAG_BITS: (bits,),
                       srw.TAG_COMPRESSION: (comp,), srw.TAG_STRIP_OFFSETS: (0,), srw.TAG_STRIP_BYTES: (size,)}
        if table_at is not None:
            ifd.entries[srw.TAG_ROW_TABLE] = (table_at,)
        return ifd


class ParseTests(unittest.TestCase):
    def test_every_scheme_through_parse_srw(self):
        for comp, bits in ((srw.COMP_BLOCKS, 14), (srw.COMP_HUFFMAN, 12), (srw.COMP_ROWS, 12), ("packed", 12)):
            data, expected = make_srw(comp=comp, bits=bits)
            for e in engines():
                raw = srw.parse_srw(data, engine=e)
                self.assertEqual(list(raw.values), expected, (comp, e))
            self.assertEqual(raw.source, "srw")
            self.assertEqual(raw.ifd.entries[rd.TAG_WHITE_LEVEL], ((1 << bits) - 1,))

    def test_offset_32770_start_is_honoured(self):
        # StripOffsets is not 0 in a real file; the row table counts from it. make_srw puts data after the IFDs.
        data, expected = make_srw(comp=srw.COMP_ROWS, bits=12, width=40, height=6)
        self.assertEqual(list(srw.parse_srw(data, engine="python").values), expected)

    def test_decrypted_levels_balance_crop_and_cfa(self):
        raw = srw.parse_srw(make_srw()[0])
        e = raw.ifd.entries
        self.assertEqual(e[rd.TAG_BLACK_LEVEL], (128.0,) * 4)
        r, _, b = (1 / v for v in e[rd.TAG_AS_SHOT_NEUTRAL])
        self.assertAlmostEqual(r, 7552 / 4096)
        self.assertAlmostEqual(b, 5760 / 4096)
        self.assertEqual((e[rd.TAG_CROP_ORIGIN], e[rd.TAG_CROP_SIZE]), ((2, 2), (28, 4)))
        self.assertEqual(e[rd.TAG_CFA_PATTERN], (1, 0, 2, 1))
        # Black per colour onto the GRBG positions: G, R, B, G.
        e2 = srw.parse_srw(make_srw(black=None)[0])
        self.assertEqual(e2.ifd.entries[rd.TAG_BLACK_LEVEL], (0.0,) * 4)
        self.assertTrue(any("black level" in n for n in e2.notes))
        # A wrong or garbage CFA tag is ignored, with a note.
        for bad in ((1, 2, 0, 1), (1, 71, 21, 224)):
            got = srw.parse_srw(make_srw(cfa=bad)[0])
            self.assertEqual(got.ifd.entries[rd.TAG_CFA_PATTERN], (1, 0, 2, 1))
            self.assertTrue(any("CFAPattern tag" in n for n in got.notes))
        no_wb = srw.parse_srw(make_srw(wb=None)[0])
        self.assertNotIn(rd.TAG_AS_SHOT_NEUTRAL, no_wb.ifd.entries)
        outside = srw.parse_srw(make_srw(crop=(0, 0, 99, 8))[0]).ifd.entries
        self.assertNotIn(rd.TAG_CROP_SIZE, outside)
        bare = srw.parse_srw(make_srw(note=False)[0])
        self.assertNotIn(rd.TAG_AS_SHOT_NEUTRAL, bare.ifd.entries)

    def test_black_per_cfa_position(self):
        # Distinct R, G, G, B black levels land on G R / B G.
        note = rd.Ifd()
        note.entries = {srw.MN_KEY: KEY, srw.MN_BLACK: tuple(v + k for v, k in zip((10, 20, 30, 40), KEY))}
        self.assertEqual(srw.decrypted(note, srw.MN_BLACK), (10, 20, 30, 40))
        data, _ = make_srw()
        raw = srw.parse_srw(data)
        self.assertEqual(len(raw.ifd.entries[rd.TAG_BLACK_LEVEL]), 4)

    def test_dispatch_names_and_refusals(self):
        data, _ = make_srw()
        self.assertTrue(srw.is_srw(data))
        self.assertEqual(srw.camera_model(data), "Samsung NX1")
        self.assertEqual(rd.parse_raw(data).source, "srw")
        tiff = b"II*\0" + struct.pack("<I", 8) + _ifd_bytes([(271, 2, tuple(b"SAMSUNG\0"))], 8)
        self.assertFalse(srw.is_srw(tiff))
        with self.assertRaisesRegex(rd.DevelopError, "not a Samsung SRW"):
            srw.parse_srw(tiff)
        with self.assertRaisesRegex(rd.DevelopError, "compression 1.*not supported"):
            srw.parse_srw(make_srw(comp=1, bits=16)[0])
        self.assertTrue(raw_preview.needs_profile_path(Path("SAM_0001.SRW")))
        self.assertTrue(raw_preview.is_raw_path(Path("SAM_0001.srw")))


class DevelopTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        (self.dir / "profiles").mkdir()
        (self.dir / "profiles" / "Samsung NX1 Adobe Standard.dcp").write_bytes(make_profile("Samsung NX1"))

    def test_needs_a_profile(self):
        raw = rd.parse_raw(make_srw()[0])
        with self.assertRaisesRegex(rd.DevelopError, "an SRW carries no colour matrix.*Samsung NX1"):
            rd.develop(raw, rd.DevelopSettings(engine="python"))

    def test_profile_chooser_and_cli(self):
        src = self.dir / "SAM_0001.SRW"
        src.write_bytes(make_srw()[0])
        self.assertEqual(camera_profiles.camera_of(src), "Samsung NX1")
        out, err = io.StringIO(), io.StringIO()
        code = main(["develop", str(src), "--out", str(self.dir / "m"), "--dcp", str(self.dir / "profiles")], stdout=out, stderr=err)
        self.assertEqual(code, 0, err.getvalue())
        master = self.dir / "m" / "SAM_0001.tif"
        tif = rd._Reader(master.read_bytes())
        ifd, _ = tif.read_ifd(tif.first_ifd_offset())
        self.assertEqual((ifd.one(rd.TAG_WIDTH), ifd.one(rd.TAG_HEIGHT)), (28, 4))  # the picture area applied
        self.assertIn("Samsung NX1 Adobe Standard.dcp", out.getvalue())


if __name__ == "__main__":
    unittest.main()
