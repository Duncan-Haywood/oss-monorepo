"""Kodak DCR read straight into the developer (``shootflow.kodak``).

A writer here builds DCR files the way the DCS Pro SLR/n lays them out: a big-endian TIFF whose IFD0 holds
Make, Model, Orientation, SubIFDs (the CFA sensor image, compression 65000) and tag 33424 (Kodak's own IFD
with the 2317 linearisation table and the 1021 white-balance record, or the 1020 index and its 2120 + n
entry). An encoder writes compression 65000 the way the decoder reads it, difference blocks and plain
blocks both, so the decoded sensels are checked exactly, in the pure-Python reference and in C. The real
file against LibRaw (every sensel equal): ``tools/dcr_libraw_check.py`` and
``eval/kodak-dcr-reader-2026-11-18.md``.
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

from shootflow import camera_profiles, kodak, ljpeg_native, raw_preview
from shootflow import raw_develop as rd
from shootflow.cli import main
from test_arw import make_profile


def _stored(diff: int) -> tuple[int, int]:
    """(length, stored bits) of one difference, as the decoder reads it back."""

    if diff == 0:
        return 0, 0
    n = abs(diff).bit_length()
    if n > 12:
        raise ValueError("a 65000 difference is at most 12 bits")
    return n, diff if diff > 0 else diff + (1 << n) - 1


def encode_block(codes: list[int], plain: bool = False) -> bytes:
    """One compression-65000 block of ``codes`` (each 0-4095)."""

    count = len(codes)
    size = (count + 3) & ~3
    padded = codes + [codes[-1] if count else 0] * (size - count)
    if plain:
        # Plain blocks are told apart by a bit length over 12 among the first bytes: the top nibble of the
        # first word, which is the first sensel's top four bits, does it when that sensel is 0xD00 or more.
        if padded[0] >> 8 <= 12:
            raise ValueError("a plain block needs a first value of 0xD00 or more to be read as plain")
        words = []
        groups = padded + [0] * (((size + 7) & ~7) - size)
        for i in range(0, len(groups), 8):
            a, b, rest = groups[i], groups[i + 1], groups[i + 2 : i + 8]
            tops = [(a >> 8) & 15, (b >> 8) & 15, (a >> 4) & 15, (b >> 4) & 15, a & 15, b & 15]
            words += [(tops[j] << 12) | rest[j] for j in range(6)]
        return struct.pack(f">{len(words)}H", *words)
    pred = [0, 0]
    lengths, bits = [], []
    for i, code in enumerate(padded):
        diff = code - pred[i & 1]
        pred[i & 1] = code
        n, v = _stored(diff)
        lengths.append(n)
        bits.append(v)
    if any(n > 12 for n in lengths):
        raise ValueError("a 65000 difference is at most 12 bits")
    head = bytes(lengths[i] | lengths[i + 1] << 4 for i in range(0, size, 2))
    # The stream, least significant bit first, and how many 32-bit groups the decoder will fetch.
    stream, total = 0, 0
    for n, v in zip(lengths, bits):
        stream |= v << total
        total += n
    prefix = 16 if (size & 7) == 4 else 0
    nb, groups = prefix, 0
    for n in lengths:
        if nb < n:
            groups += 1
            nb += 32
        nb -= n
    out = bytearray()
    if prefix:
        first = stream & 0xFFFF
        out += bytes((first >> 8, first & 255))
        stream >>= 16
    for _ in range(groups):
        w = stream & 0xFFFFFFFF
        stream >>= 32
        out += bytes(((w >> 8) & 255, w & 255, w >> 24, (w >> 16) & 255))
    return head + bytes(out)


def encode(codes: list[int], width: int, height: int, plain_blocks: frozenset = frozenset()) -> bytes:
    """A whole sensor; ``plain_blocks`` holds (row, block) pairs written plain."""

    out = bytearray()
    for row in range(height):
        for k, col in enumerate(range(0, width, kodak.BLOCK)):
            count = min(kodak.BLOCK, width - col)
            out += encode_block(codes[row * width + col : row * width + col + count], (row, k) in plain_blocks)
    return bytes(out)


def _be_ifd(entries, start: int) -> bytes:
    """A big-endian IFD at ``start`` from ``entries`` [(tag, type, values)]; the next-IFD link is 0."""

    fmt = {1: "B", 2: "B", 3: "H", 4: "I", 7: "B"}
    entries = sorted(entries, key=lambda e: e[0])
    body, extra = bytearray(), bytearray()
    extra_at = start + 2 + 12 * len(entries) + 4
    for tag, typ, values in entries:
        if typ == 5:
            payload = b"".join(struct.pack(">II", int(round(v * 1000)), 1000) for v in values)
        else:
            payload = struct.pack(">" + fmt[typ] * len(values), *values)
        if len(payload) <= 4:
            body += struct.pack(">HHI", tag, typ, len(values)) + payload.ljust(4, b"\0")
        else:
            body += struct.pack(">HHII", tag, typ, len(values), extra_at + len(extra))
            extra += payload
            if len(extra) % 2:
                extra += b"\0"
    return struct.pack(">H", len(entries)) + bytes(body) + struct.pack(">I", 0) + bytes(extra)


def make_dcr(codes=None, w=40, h=6, curve=None, wb_record=(772, 952, 626), wb_index=None, pattern=(1, 0, 2, 1),
             make="Kodak", model="DCS Pro SLR/n", orientation=8, compression=65000, plain_blocks=frozenset(),
             with_kodak_ifd=True):
    rng = random.Random(7)
    if codes is None:
        codes = [rng.randrange(0, 1024) for _ in range(w * h)]
    if curve is None:
        curve = [min(i, 600) + max(0, i - 600) * 4 for i in range(1024)]
    sensor = encode(codes, w, h, plain_blocks)
    # Layout: header, IFD0 at 8, Kodak IFD, sensor IFD, then the sensor data.
    kodak_entries = [(kodak.KODAK_CURVE, 3, tuple(curve))]
    if wb_record is not None:
        record = bytearray(72)
        struct.pack_into(">3H", record, 40, *wb_record)
        kodak_entries.append((kodak.KODAK_WB_RECORD, 7, tuple(record)))
    if wb_index is not None:
        kodak_entries.append((kodak.KODAK_WB_INDEX, 3, (wb_index[0],)))
        kodak_entries.append((kodak.KODAK_WB_BASE + wb_index[0], 5, tuple(wb_index[1])))

    def ifd0_at(kodak_at, sensor_ifd_at):
        entries = [
            (271, 2, tuple(make.encode() + b"\0")),
            (272, 2, tuple(model.encode() + b"\0")),
            (274, 3, (orientation,)),
            (330, 4, (sensor_ifd_at,)),
        ]
        if with_kodak_ifd:
            entries.append((kodak.TAG_KODAK_IFD, 4, (kodak_at,)))
        return _be_ifd(entries, 8)

    def sensor_ifd(at, data_at):
        return _be_ifd(
            [
                (254, 4, (0,)),
                (256, 4, (w,)),
                (257, 4, (h,)),
                (258, 3, (12,)),
                (259, 3, (compression,)),
                (262, 3, (rd.PHOTOMETRIC_CFA,)),
                (273, 4, (data_at,)),
                (277, 3, (1,)),
                (278, 4, (h,)),
                (279, 4, (len(sensor),)),
                (33421, 3, (2, 2)),
                (33422, 1, pattern),
            ],
            at,
        )

    size0 = len(ifd0_at(0, 0))
    kodak_at = 8 + size0
    kifd = _be_ifd(kodak_entries, kodak_at)
    sensor_ifd_at = kodak_at + len(kifd)
    data_at = sensor_ifd_at + len(sensor_ifd(0, 0))
    out = b"MM\0*" + struct.pack(">I", 8) + ifd0_at(kodak_at, sensor_ifd_at) + kifd + sensor_ifd(sensor_ifd_at, data_at)
    assert len(out) == data_at
    return out + sensor, codes, curve


class EncoderTests(unittest.TestCase):
    def test_block_round_trip_every_size(self):
        rng = random.Random(1)
        for count in (1, 2, 3, 4, 5, 7, 8, 12, 100, 164, 255, 256):
            codes = [rng.randrange(0, 4096) for _ in range(count)]
            data = encode_block(codes)
            values, plain, end = kodak.decode_block(data, 0, count)
            self.assertFalse(plain)
            self.assertEqual(end, len(data), count)
            pred, got = [0, 0], []
            for i in range(count):
                pred[i & 1] += values[i]
                got.append(pred[i & 1])
            self.assertEqual(got, codes, count)

    def test_plain_block(self):
        codes = [0xD12] + [random.Random(2).randrange(0, 4096) for _ in range(15)]
        data = encode_block(codes, plain=True)
        values, plain, end = kodak.decode_block(data, 0, 16)
        self.assertTrue(plain)
        self.assertEqual(values[:16], codes)
        self.assertEqual(end, 24)


class ReaderTests(unittest.TestCase):
    def test_sensels_exact_python_and_c(self):
        data, codes, curve = make_dcr(w=600, h=4)  # 256 + 256 + 88 per row
        table = kodak.full_table(tuple(curve))
        want = [table[c] for c in codes]
        raw = kodak.parse_dcr(data, engine="python")
        self.assertEqual(list(raw.values), want)
        self.assertEqual((raw.width, raw.height, raw.source), (600, 4, "dcr"))
        if ljpeg_native.available():
            self.assertEqual(kodak.parse_dcr(data).values, raw.values)

    def test_plain_blocks_mixed_in(self):
        rng = random.Random(4)
        w, h = 300, 3
        codes = [rng.randrange(0, 1024) for _ in range(w * h)]
        codes[0] = 0xE00  # row 0, block 0
        codes[2 * w + 256] = 0xD80  # row 2, block 1 (44 sensels)
        curve = list(range(4096))
        data, _, _ = make_dcr(codes, w, h, curve=curve, plain_blocks=frozenset({(0, 0), (2, 1)}))
        raw = kodak.parse_dcr(data, engine="python")
        self.assertEqual(list(raw.values), codes)
        if ljpeg_native.available():
            self.assertEqual(kodak.parse_dcr(data).values, raw.values)

    def test_tags(self):
        data, _, curve = make_dcr()
        raw = kodak.parse_dcr(data)
        self.assertEqual(raw.ifd.get(rd.TAG_CFA_PATTERN), (1, 0, 2, 1))
        self.assertEqual(raw.ifd.one(rd.TAG_WHITE_LEVEL), curve[-1])
        self.assertEqual(raw.ifd.get(rd.TAG_BLACK_LEVEL), (0.0,) * 4)
        n = raw.ifd.get(rd.TAG_AS_SHOT_NEUTRAL)
        # Multipliers 2048 / (772, 952, 626): R/G and B/G as LibRaw reads the real file.
        self.assertAlmostEqual(1 / n[0], 952 / 772)
        self.assertAlmostEqual(1 / n[2], 952 / 626)
        self.assertEqual(raw.ifd0.one(rd.TAG_ORIENTATION), 8)
        self.assertIn("DCR: as-shot white balance from Kodak entry 1021", raw.notes)

    def test_white_balance_from_index_when_no_record(self):
        data, _, _ = make_dcr(wb_record=None, wb_index=(5, (4725, 5888, 3986)))
        n = kodak.parse_dcr(data).ifd.get(rd.TAG_AS_SHOT_NEUTRAL)
        self.assertAlmostEqual(1 / n[0], 5888 / 4725, places=6)
        self.assertAlmostEqual(1 / n[2], 5888 / 3986, places=6)

    def test_no_kodak_ifd(self):
        data, codes, _ = make_dcr(codes=[i % 1024 for i in range(240)], with_kodak_ifd=False)
        raw = kodak.parse_dcr(data)
        self.assertEqual(list(raw.values), codes)
        self.assertEqual(raw.ifd.one(rd.TAG_WHITE_LEVEL), 4095)
        self.assertIsNone(raw.ifd.get(rd.TAG_AS_SHOT_NEUTRAL))

    def test_detection_and_camera(self):
        data, _, _ = make_dcr()
        self.assertTrue(kodak.is_dcr(data))
        self.assertEqual(kodak.camera_model(data), "Kodak DCS Pro SLR/n")
        self.assertFalse(kodak.is_dcr(make_dcr(make="Nikon")[0]))
        self.assertEqual(rd.parse_raw(data).source, "dcr")

    def test_other_compression_refused(self):
        data, _, _ = make_dcr(compression=262)
        with self.assertRaisesRegex(rd.DevelopError, "compression \\(262\\)"):
            kodak.parse_dcr(data)

    def test_damaged_stream_refused(self):
        # Codes that run below zero (a difference stream from a different predictor) are refused, not wrapped.
        data, _, _ = make_dcr(codes=[5, 5] + [0] * 38, w=40, h=1)
        good = kodak.parse_dcr(data, engine="python")
        self.assertEqual(list(good.values[:2]), [5, 5])
        bad = bytearray(data)
        start = len(data) - len(encode([5, 5] + [0] * 38, 40, 1))
        # First length byte says (lo 3, hi 3); write a stream where the first diff is -7.
        bad[start] = 0x33
        bad[start + 20 : start + 24] = bytes(4)
        with self.assertRaises(rd.DevelopError):
            kodak.parse_dcr(bytes(bad), engine="python")
        if ljpeg_native.available():
            with self.assertRaises(rd.DevelopError):
                kodak.parse_dcr(bytes(bad))


class PipelineTests(unittest.TestCase):
    def test_paths_and_profile_lookup(self):
        self.assertTrue(raw_preview.is_dcr_path(Path("M3XV3143.DCR")))
        self.assertTrue(raw_preview.needs_profile_path(Path("a.dcr")))
        self.assertTrue(raw_preview.is_developable_path(Path("a.dcr")))
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "a.dcr"
            src.write_bytes(make_dcr()[0])
            self.assertEqual(camera_profiles.camera_of(src), "Kodak DCS Pro SLR/n")

    def test_develop_needs_profile_then_develops(self):
        data, _, _ = make_dcr(w=40, h=6)
        raw = kodak.parse_dcr(data)
        with self.assertRaisesRegex(rd.DevelopError, "DCR carries no colour matrix.*Kodak DCS Pro SLR/n"):
            rd.develop(raw)
        with tempfile.TemporaryDirectory() as tmp:
            dcp = Path(tmp) / "k.dcp"
            dcp.write_bytes(make_profile("Kodak DCS Pro SLR/n"))
            w, h, rgb, report = rd.develop(raw, rd.DevelopSettings(dcp=rd.read_dcp(dcp)))
            self.assertEqual((w, h), (6, 40))  # Orientation 8 turns the frame
            self.assertEqual(len(rgb), w * h * 3)

    def test_cli_develop(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "a.dcr"
            src.write_bytes(make_dcr(w=40, h=6)[0])
            dcp = Path(tmp) / "k.dcp"
            dcp.write_bytes(make_profile("Kodak DCS Pro SLR/n"))
            out = Path(tmp) / "out"
            err = io.StringIO()
            code = main(["develop", str(src), "--dcp", str(dcp), "--out", str(out)])
            self.assertEqual(code, 0, err.getvalue())
            self.assertTrue(any(out.iterdir()))


if __name__ == "__main__":
    unittest.main()
