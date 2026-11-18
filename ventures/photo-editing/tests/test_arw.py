"""Sony ARW read straight into the developer (``shootflow.arw``).

Each test builds a small ARW here: a TIFF whose IFD0 names Sony, points at a
raw SubIFD and, through DNGPrivateData, at an SR2Private IFD whose encrypted
SR2SubIFD holds the black level and as-shot white balance. The sensor is
stored the three ways Sony stores it (compressed 8-bit blocks with the tone
curve, uncompressed 16-bit, lossless JPEG tiles of 2x2 cells), written by an
encoder in this file, so every decoded sensel can be checked exactly.
Six real ARWs against LibRaw (every sensel equal, white balance equal):
``tools/arw_libraw_check.py`` and ``eval/sony-arw-reader-2026-11-14.md``.
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

from shootflow import arw, camera_profiles
from shootflow import raw_develop as rd
from shootflow.cli import main
from test_raw_develop import _ifd_bytes, encode_lossless_jpeg

W, H = 64, 8
KNEES = (8000, 10400, 12900, 14100)
WB = (2612, 1024, 1024, 1596)
KEY = 0x44332211


def codes(seed=3):
    """11-bit codes per sensel: a smooth field plus noise, a few blocks with a wide spread."""

    rng = random.Random(seed)
    out = []
    for y in range(H):
        for x in range(W):
            v = 300 + 20 * x + 40 * y + rng.randint(-6, 6)
            if (x // 32 + y) % 3 == 0 and x % 7 == 0:
                v += rng.randint(300, 1200)  # spread > 0x80 << s for some s
            out.append(max(0, min(0x7FF, v)))
    return out


def encode_block(vals):
    """One 16-byte block of 16 same-colour codes, and the codes the camera's decoder gets back."""

    hi, lo = max(vals), min(vals)
    imax = vals.index(hi)
    imin = next((i for i, v in enumerate(vals) if v == lo and i != imax), (imax + 1) % 16)
    sh = 0
    while sh < 4 and (0x80 << sh) <= hi - lo:
        sh += 1
    bits = hi | lo << 11 | imax << 22 | imin << 26
    back = list(vals)
    pos = 30
    for i, v in enumerate(vals):
        if i in (imax, imin):
            back[i] = hi if i == imax else lo
            continue
        d = min(0x7F, (v - lo) >> sh)
        bits |= d << pos
        back[i] = min(0x7FF, (d << sh) + lo)
        pos += 7
    return bits.to_bytes(16, "little"), back


def encode_craw(code_rows):
    out, back = bytearray(), [0] * (W * H)
    for y in range(H):
        row = code_rows[y * W : (y + 1) * W]
        for span in range(0, W, 32):
            for parity in (0, 1):
                cols = list(range(span + parity, span + 32, 2))
                block, got = encode_block([row[c] for c in cols])
                out += block
                for c, g in zip(cols, got):
                    back[y * W + c] = g
    return bytes(out), back


def sensor14(seed=5):
    rng = random.Random(seed)
    return [rng.randint(512, 16000) for _ in range(W * H)]


def lossless_tiles(values, tile=32):
    """Sony's lossless layout: tiles of 2x2 cells, each one four-component lossless JPEG."""

    streams = []
    for ty in range(0, H, tile):
        for tx in range(0, W, tile):
            samples = []
            for r in range(tile // 2):
                for c in range(tile // 2):
                    for dy, dx in ((0, 0), (0, 1), (1, 0), (1, 1)):
                        y, x = ty + 2 * r + dy, tx + 2 * c + dx
                        samples.append(values[y * W + x] if y < H and x < W else 0)
            streams.append(encode_lossless_jpeg(samples, tile // 2, tile // 2, 4, precision=14))
    return streams


def make_arw(storage="craw", model="ILCE-7M3", encrypted=True, wb=WB, tile=32, extra_raw_tags=()):
    """(file bytes, expected sensor values)."""

    if storage == "craw":
        payload, back = encode_craw(codes())
        curve = arw.tone_curve(KNEES)
        expected = [curve[c << 1] for c in back]
        raw_tags = [(258, 3, (12,)), (259, 3, (32767,)), (0x7000, 3, (2,)), (0x7010, 3, KNEES)]
        chunks = [payload]
    elif storage == "plain":
        expected = sensor14()
        chunks = [struct.pack(f"<{W * H}H", *expected)]
        raw_tags = [(258, 3, (14,)), (259, 3, (1,))]
    else:
        expected = sensor14()
        chunks = lossless_tiles(expected, tile)
        raw_tags = [(258, 3, (14,)), (259, 3, (7,)), (0x7000, 3, (4,)), (322, 3, (tile,)), (323, 3, (tile,))]
    # Layout: header | IFD0 | SR2Private IFD | SR2SubIFD (encrypted) | raw IFD | sensor chunks
    ifd0_tags = lambda sub_at, sr2_at: [  # noqa: E731
        (254, 4, (1,)),
        (271, 2, tuple(b"SONY\0")),
        (272, 2, tuple(model.encode() + b"\0")),
        (330, 4, (sub_at,)),
        (50740, 1, tuple(struct.pack("<I", sr2_at))),
    ]
    ifd0_at = 8
    sr2_at = ifd0_at + len(_ifd_bytes(ifd0_tags(0, 0), ifd0_at))
    sr2_tags = lambda off, n: [(0x7200, 4, (off,)), (0x7201, 4, (n,)), (0x7221, 7, tuple(struct.pack("<I", KEY)))]  # noqa: E731
    sub_at = sr2_at + len(_ifd_bytes(sr2_tags(0, 0), sr2_at))
    sub_entries = [(0x7310, 3, (510, 512, 514, 516))] + ([(0x7313, 3, wb)] if wb else [])
    sub = bytearray(_ifd_bytes(sub_entries, sub_at))
    while len(sub) % 4:
        sub += b"\0"
    sealed = arw.sr2_crypt(bytes(sub), KEY) if encrypted else bytes(sub)
    raw_at = sub_at + len(sealed)
    common = [(254, 4, (0,)), (256, 4, (W,)), (257, 4, (H,)), (262, 3, (32803,)), (33421, 3, (2, 2)), (33422, 1, (0, 1, 1, 2))]

    def raw_ifd(data_at):
        offs, at = [], data_at
        for c in chunks:
            offs.append(at)
            at += len(c)
        if storage == "tiles":
            where = [(324, 4, tuple(offs)), (325, 4, tuple(len(c) for c in chunks))]
        else:
            where = [(273, 4, (offs[0],)), (279, 4, (len(chunks[0]),))]
        return _ifd_bytes(common + raw_tags + list(extra_raw_tags) + where, raw_at)

    data_at = raw_at + len(raw_ifd(0))
    blob = bytearray(b"II*\0" + struct.pack("<I", ifd0_at))
    blob += _ifd_bytes(ifd0_tags(raw_at, sr2_at), ifd0_at)
    blob += _ifd_bytes(sr2_tags(sub_at, len(sealed)), sr2_at)
    blob += sealed + raw_ifd(data_at) + b"".join(chunks)
    return bytes(blob), expected


def make_profile(camera="Sony ILCE-7M3"):
    from test_dng_profile_tables import make_dcp

    m = rd._inverse3(rd._XYZ_TO_SRGB_D65)
    flat = tuple(m[r][c] for r in range(3) for c in range(3))
    return make_dcp([(50721, 10, flat), (50778, 3, (21,)), (50708, 2, tuple(camera.encode() + b"\0"))])


def engines():
    out = ["python"]
    try:
        import numpy  # noqa: F401

        out.append("numpy")
    except ImportError:
        pass
    return out


class ReadTests(unittest.TestCase):
    def test_compressed_blocks_decode_exactly_on_both_engines(self):
        data, expected = make_arw("craw")
        for engine in engines():
            raw = arw.parse_arw(data, engine=engine)
            self.assertEqual(list(raw.values), expected, engine)
        self.assertEqual(raw.source, "arw")

    def test_uncompressed_and_lossless_tiles(self):
        for storage in ("plain", "tiles"):
            data, expected = make_arw(storage)
            for engine in engines():
                self.assertEqual(list(arw.parse_arw(data, engine=engine).values), expected, (storage, engine))

    def test_partial_edge_tiles(self):
        data, expected = make_arw("tiles", tile=24)  # 64 x 8 in 24 x 24 tiles: the right and bottom ones are cut
        for engine in engines():
            self.assertEqual(list(arw.parse_arw(data, engine=engine).values), expected, engine)

    def test_encrypted_sub_ifd_gives_black_and_balance(self):
        raw = arw.parse_arw(make_arw()[0])
        e = raw.ifd.entries
        self.assertEqual(e[rd.TAG_BLACK_LEVEL], (510.0, 512.0, 514.0, 516.0))
        self.assertEqual(e[rd.TAG_WHITE_LEVEL], (16383,))
        r, g, b = (1 / v for v in e[rd.TAG_AS_SHOT_NEUTRAL])
        self.assertAlmostEqual(r, 2612 / 1024)
        self.assertAlmostEqual(b, 1596 / 1024)
        self.assertEqual(e[rd.TAG_CFA_PATTERN], (0, 1, 1, 2))

    def test_unencrypted_sub_ifd_is_not_read_as_plain(self):
        # Decrypting plain bytes scrambles them: no balance, and the reader says so rather than inventing one.
        raw = arw.parse_arw(make_arw(encrypted=False)[0])
        self.assertNotIn(rd.TAG_AS_SHOT_NEUTRAL, raw.ifd.entries)
        self.assertTrue(any("white balance" in n for n in raw.notes))

    def test_pad_and_curve_known_values(self):
        # Pinned from the implementation that decrypted six real ARWs to LibRaw's white balance.
        pad = arw.sr2_pad(KEY)
        self.assertEqual(pad[:4], [0xCF7A56AE, 0x0DB85837, 0xA506297C, 0x0CE5301A])
        self.assertEqual(pad[126], 0x5B287A3E)
        curve = arw.tone_curve(KNEES)
        self.assertEqual([curve[i] for i in (2000, 2001, 2600, 3225, 3525, 4094)], [2000, 2002, 3200, 5700, 8100, 17204])
        self.assertEqual(arw.sr2_crypt(arw.sr2_crypt(b"0123456789abcdef", 7), 7), b"0123456789abcdef")

    def test_dispatch_and_names(self):
        data, _ = make_arw()
        self.assertTrue(arw.is_arw(data))
        self.assertEqual(arw.camera_model(data), "Sony ILCE-7M3")
        self.assertEqual(rd.parse_raw(data).source, "arw")
        self.assertFalse(arw.is_arw(b"II*\0" + struct.pack("<I", 8) + _ifd_bytes([(271, 2, tuple(b"Canon\0"))], 8)))

    def test_refusals(self):
        data, _ = make_arw()
        with self.assertRaisesRegex(rd.DevelopError, "multiple of 32"):
            arw.decode_craw(bytes(48 * 2), 48, 2, arw.tone_curve(KNEES))
        with self.assertRaisesRegex(rd.DevelopError, "shorter"):
            arw.decode_craw(bytes(10), 32, 2, arw.tone_curve(KNEES))
        with self.assertRaisesRegex(rd.DevelopError, "not a Sony ARW"):
            arw.parse_arw(b"II*\0" + struct.pack("<I", 8) + _ifd_bytes([(271, 2, tuple(b"Canon\0"))], 8))


class DevelopTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        (self.dir / "profiles").mkdir()
        (self.dir / "profiles" / "Sony ILCE-7M3 Adobe Standard.dcp").write_bytes(make_profile())

    def test_needs_a_profile(self):
        raw = rd.parse_raw(make_arw()[0])
        with self.assertRaisesRegex(rd.DevelopError, "an ARW carries no colour matrix.*Sony ILCE-7M3"):
            rd.develop(raw, rd.DevelopSettings(engine="python"))

    def test_develops_with_a_profile_and_engines_agree(self):
        raw = rd.parse_raw(make_arw("plain")[0])
        dcp = rd.read_dcp(self.dir / "profiles" / "Sony ILCE-7M3 Adobe Standard.dcp")
        outs = {}
        for engine in engines():
            w, h, px, report = rd.develop(raw, rd.DevelopSettings(engine=engine, dcp=dcp, default_tone="never", demosaic="bilinear"))
            outs[engine] = px.tobytes()
        self.assertEqual((w, h), (W, H))
        self.assertEqual(report.cfa, "RGGB")
        self.assertEqual(len(set(outs.values())), 1)

    def test_profile_chooser_and_cli(self):
        src = self.dir / "DSC00001.ARW"
        src.write_bytes(make_arw()[0])
        self.assertEqual(camera_profiles.camera_of(src), "Sony ILCE-7M3")
        out, err = io.StringIO(), io.StringIO()
        code = main(["develop", str(src), "--out", str(self.dir / "m"), "--dcp", str(self.dir / "profiles")], stdout=out, stderr=err)
        self.assertEqual(code, 0, err.getvalue())
        self.assertTrue((self.dir / "m" / "DSC00001.tif").exists())
        self.assertIn("Sony ILCE-7M3 Adobe Standard.dcp", out.getvalue())


if __name__ == "__main__":
    unittest.main()
