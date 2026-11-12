"""Tests for the DNG developer (``shootflow.raw_develop``).

The DNGs here are written by the test itself: a known scene in linear sRGB is
taken through a real camera's published-style colour matrix (XYZ to camera),
mosaicked, offset by a black level and scaled to a white level, then stored
uncompressed (16-bit or packed 12-bit) or as lossless JPEG (our own encoder,
and separately ffmpeg's ``ljpeg`` encoder as an independent stream). The
developer must give the scene back.
"""

from __future__ import annotations

import shutil
import struct
import subprocess
import tempfile
import unittest
import zlib
from pathlib import Path

from shootflow import raw_develop as rd

# XYZ -> camera matrix in the shape DNG ColorMatrix2 (D65) carries for a
# typical Bayer DSLR. Values of this kind (positive diagonal, negative
# off-diagonals) are what Adobe publishes per camera.
CAMERA_MATRIX = (0.6018, -0.0617, -0.0965, -0.8645, 1.5881, 0.2975, -0.1530, 0.1719, 0.7642)
SRGB_TO_XYZ = rd._XYZ_TO_SRGB_D65


def _mul(m, v):
    return tuple(sum(m[r][c] * v[c] for c in range(3)) for r in range(3))


def _cam_matrix():
    return tuple(tuple(CAMERA_MATRIX[3 * r + c] for c in range(3)) for r in range(3))


def _camera_unscaled(rgb_linear):
    return _mul(_cam_matrix(), _mul(SRGB_TO_XYZ, rgb_linear))


def camera_response(rgb_linear):
    """Camera RGB for a linear sRGB colour.

    Scaled so a perfect white's strongest camera channel is 1.0, the
    normalisation DNG uses for the camera matrix: a neutral that just reaches
    the white level renders as 1.0.
    """

    top = max(_camera_unscaled((1.0, 1.0, 1.0)))
    return tuple(v / top for v in _camera_unscaled(rgb_linear))


def as_shot_neutral():
    white = camera_response((1.0, 1.0, 1.0))
    top = max(white)
    return tuple(v / top for v in white)


# --------------------------------------------------------------- encoders


def _huff_spec():
    # Symbols 0..6 get 3-bit codes, 7..16 get 7-bit codes (prefix 111).
    counts = [0] * 16
    counts[2] = 7
    counts[6] = 10
    symbols = list(range(17))
    codes = {}
    code = 0
    k = 0
    for length in range(1, 17):
        for _ in range(counts[length - 1]):
            codes[symbols[k]] = (code, length)
            code += 1
            k += 1
        code <<= 1
    return bytes(counts), bytes(symbols), codes


def encode_lossless_jpeg(samples, width, height, nf, precision=16, predictor=1, restart=0):
    counts, symbols, codes = _huff_spec()
    out = bytearray(b"\xff\xd8")
    frame = struct.pack(">BHHB", precision, height, width, nf)
    for i in range(nf):
        frame += bytes((i + 1, 0x11, 0))
    out += b"\xff\xc3" + struct.pack(">H", len(frame) + 2) + frame
    dht = bytes((0x00,)) + counts + symbols
    out += b"\xff\xc4" + struct.pack(">H", len(dht) + 2) + dht
    if restart:
        out += b"\xff\xdd" + struct.pack(">HH", 4, restart)
    sos = bytes((nf,)) + b"".join(bytes((i + 1, 0x00)) for i in range(nf)) + bytes((predictor, 0, 0))
    out += b"\xff\xda" + struct.pack(">H", len(sos) + 2) + sos

    bits = []
    data = bytearray()

    def flush(pad=False):
        nonlocal bits
        while len(bits) >= 8 or (pad and bits):
            chunk = bits[:8]
            bits = bits[8:]
            while len(chunk) < 8:
                chunk.append(1)
            byte = int("".join(map(str, chunk)), 2)
            data.append(byte)
            if byte == 0xFF:
                data.append(0)

    initial = 1 << (precision - 1)
    row_len = width * nf
    mcu = 0
    first_line = 0
    rst = 0
    for y in range(height):
        for x in range(width):
            fresh = mcu == 0
            if restart and mcu and mcu % restart == 0:
                flush(pad=True)
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
                    pred = samples[at - nf + c] if x > 0 else samples[at - row_len + c]
                elif x == 0:
                    pred = samples[at - row_len + c]
                else:
                    ra, rb = samples[at - nf + c], samples[at - row_len + c]
                    rc = samples[at - row_len - nf + c]
                    pred = {
                        1: ra,
                        2: rb,
                        3: rc,
                        4: ra + rb - rc,
                        5: ra + ((rb - rc) >> 1),
                        6: rb + ((ra - rc) >> 1),
                        7: (ra + rb) >> 1,
                    }[predictor]
                diff = (samples[at + c] - pred) & 0xFFFF
                if diff >= 0x8000:
                    diff -= 0x10000
                if diff == -32768:
                    s = 16
                else:
                    s = abs(diff).bit_length()
                code, length = codes[s]
                bits.extend(int(b) for b in format(code, f"0{length}b"))
                if 0 < s < 16:
                    v = diff if diff >= 0 else diff + (1 << s) - 1
                    bits.extend(int(b) for b in format(v, f"0{s}b"))
                flush()
    flush(pad=True)
    out += data + b"\xff\xd9"
    return bytes(out)


def _ifd_bytes(entries, start):
    """Serialise ``entries`` [(tag, type, values)] as an IFD at ``start``."""

    fmt = {1: "B", 2: "B", 3: "H", 4: "I", 7: "B", 9: "i", 11: "f"}
    entries = sorted(entries, key=lambda e: e[0])
    head = struct.pack("<H", len(entries))
    extra = bytearray()
    extra_at = start + 2 + 12 * len(entries) + 4
    body = bytearray()
    for tag, typ, values in entries:
        if typ in (5, 10):
            payload = b"".join(
                struct.pack("<" + ("I" if typ == 5 else "i") * 2, *_rational(v, typ == 10)) for v in values
            )
        else:
            payload = struct.pack("<" + fmt[typ] * len(values), *values)
        if len(payload) <= 4:
            body += struct.pack("<HHI", tag, typ, len(values)) + payload.ljust(4, b"\0")
        else:
            body += struct.pack("<HHII", tag, typ, len(values), extra_at + len(extra))
            extra += payload
            if len(extra) % 2:
                extra += b"\0"
    return head + bytes(body) + struct.pack("<I", 0) + bytes(extra)


def _rational(v, signed):
    den = 10000
    return (int(round(v * den)), den)


def make_dng(
    sensor,
    width,
    height,
    *,
    cfa=(0, 1, 1, 2),
    black=256,
    white=4095,
    compression=1,
    bits=16,
    tiles=None,
    predictor=1,
    restart=0,
    orientation=1,
    active=None,
    crop=None,
    linearization=None,
    subifd=False,
    neutral=None,
    baseline_exposure=0.0,
    lossless_nf=1,
    extra_raw_tags=(),
    photometric=rd.PHOTOMETRIC_CFA,
    spp=1,
    colour_tags=None,
):
    """A little-endian DNG holding ``sensor`` (row-major ints)."""

    def pack(chunk_samples, cw, ch):
        if compression == 7:
            nf = lossless_nf
            return encode_lossless_jpeg(chunk_samples, cw * spp // nf, ch, nf, 16, predictor, restart)
        if bits == 16:
            return struct.pack("<" + "H" * len(chunk_samples), *chunk_samples)
        # packed MSB-first, each row on a byte boundary
        out = bytearray()
        per_row = cw * spp
        for r in range(ch):
            acc = 0
            n = 0
            for v in chunk_samples[r * per_row : (r + 1) * per_row]:
                acc = (acc << bits) | v
                n += bits
                while n >= 8:
                    n -= 8
                    out.append((acc >> n) & 0xFF)
            if n:
                out.append((acc << (8 - n)) & 0xFF)
        return bytes(out)

    chunks = []
    if tiles:
        tw, tl = tiles
        for ty in range(0, height, tl):
            for tx in range(0, width, tw):
                tile = []
                for r in range(tl):
                    for c in range(tw):
                        yy, xx = min(ty + r, height - 1), min(tx + c, width - 1)
                        tile.extend(sensor[(yy * width + xx) * spp : (yy * width + xx) * spp + spp])
                chunks.append(pack(tile, tw, tl))
    else:
        chunks.append(pack(list(sensor), width, height))

    neutral = neutral or as_shot_neutral()
    raw_tags = [
        (254, 4, (0,)),
        (256, 4, (width,)),
        (257, 4, (height,)),
        (258, 3, (bits,) * spp),
        (259, 3, (compression,)),
        (262, 3, (photometric,)),
        (277, 3, (spp,)),
        (50717, 4, (white,) * spp),
    ]
    if black is not None:
        raw_tags.append((50714, 4, (black,) * spp))
    if photometric == rd.PHOTOMETRIC_CFA:
        raw_tags += [(33421, 3, (2, 2)), (33422, 1, cfa)]
    if active:
        raw_tags.append((50829, 4, active))
    if crop:
        raw_tags += [(50719, 4, crop[:2]), (50720, 4, crop[2:])]
    if linearization:
        raw_tags.append((50712, 3, linearization))
    raw_tags += list(extra_raw_tags)
    if colour_tags is None:
        colour_tags = [
            (50721, 10, CAMERA_MATRIX),
            (50722, 10, CAMERA_MATRIX),
            (50778, 3, (17,)),
            (50779, 3, (21,)),
            (50728, 5, neutral),
        ]
    ifd0_tags = [
        (50706, 1, (1, 4, 0, 0)),
        (274, 3, (orientation,)),
        (50730, 10, (baseline_exposure,)),
        *colour_tags,
    ]

    # Layout: header | chunks | raw IFD (if sub) | IFD0
    blob = bytearray(b"II*\0\0\0\0\0")
    offsets = []
    for chunk in chunks:
        offsets.append(len(blob))
        blob += chunk
        if len(blob) % 2:
            blob += b"\0"
    sizes = tuple(len(c) for c in chunks)
    if tiles:
        raw_tags += [(322, 4, (tiles[0],)), (323, 4, (tiles[1],)), (324, 4, tuple(offsets)), (325, 4, sizes)]
    else:
        raw_tags += [(273, 4, tuple(offsets)), (278, 4, (height,)), (279, 4, sizes)]
    if subifd:
        sub_at = len(blob)
        blob += _ifd_bytes(raw_tags, sub_at)
        if len(blob) % 2:
            blob += b"\0"
        thumb = [(254, 4, (1,)), (256, 4, (1,)), (257, 4, (1,)), (262, 3, (2,)), (330, 4, (sub_at,))]
        tags = ifd0_tags + thumb
    else:
        tags = ifd0_tags + raw_tags
    ifd0_at = len(blob)
    blob += _ifd_bytes(tags, ifd0_at)
    struct.pack_into("<I", blob, 4, ifd0_at)
    return bytes(blob)


# --------------------------------------------------------------- scenes

PATCHES = [
    (0.18, 0.18, 0.18),  # mid grey
    (0.40, 0.10, 0.08),  # red
    (0.08, 0.30, 0.10),  # green
    (0.06, 0.08, 0.35),  # blue
    (0.45, 0.40, 0.10),  # yellow
    (0.60, 0.60, 0.60),  # light grey
]


def patch_sensor(width, height, cfa=(0, 1, 1, 2), black=256, white=4095, patch_w=8, gain=1.0):
    """Vertical stripes of PATCHES, each ``patch_w`` sensels wide, mosaicked."""

    out = []
    span = white - black
    for y in range(height):
        for x in range(width):
            rgb = PATCHES[(x // patch_w) % len(PATCHES)]
            cam = camera_response(tuple(v * gain for v in rgb))
            c = cfa[(y % 2) * 2 + (x % 2)]
            out.append(max(0, min(white, int(round(black + cam[c] * span)))))
    return out


def read_pixel(width, pixels, x, y):
    s = (y * width + x) * 3
    return tuple(rd.srgb_to_linear(pixels[s + i] / 65535) for i in range(3))


class DevelopColourTests(unittest.TestCase):
    def assertColour(self, got, want, tol=0.01):
        for g, w in zip(got, want):
            self.assertAlmostEqual(g, w, delta=tol, msg=f"got {got}, want {want}")

    def _develop(self, blob, **settings):
        raw = rd.parse_raw(blob)
        return rd.develop(raw, rd.DevelopSettings(**settings))

    def test_patches_come_back_through_matrix_and_white_balance(self):
        w, h = 48, 8
        blob = make_dng(patch_sensor(w, h), w, h)
        ow, oh, px, report = self._develop(blob)
        self.assertEqual((ow, oh), (w, h))
        self.assertEqual(report.cfa, "RGGB")
        # Both matrices are the same here, so the blend at the D65 white is that matrix.
        self.assertTrue(report.matrix.startswith("ColorMatrix2 at 650"), report.matrix)
        self.assertEqual(report.colour, "dng")
        self.assertAlmostEqual(report.cct, 6504, delta=5)
        for i, want in enumerate(PATCHES):
            self.assertColour(read_pixel(ow, px, i * 8 + 4, 4), want)
        ow, oh, px, report = self._develop(blob, colour="dcraw")
        self.assertEqual(report.matrix, "ColorMatrix2")
        self.assertEqual(report.colour, "dcraw")
        for i, want in enumerate(PATCHES):
            self.assertColour(read_pixel(ow, px, i * 8 + 4, 4), want)

    def test_every_bayer_phase(self):
        w, h = 48, 8
        for cfa in ((0, 1, 1, 2), (2, 1, 1, 0), (1, 0, 2, 1), (1, 2, 0, 1)):
            with self.subTest(cfa=cfa):
                blob = make_dng(patch_sensor(w, h, cfa=cfa), w, h, cfa=cfa)
                ow, oh, px, _ = self._develop(blob)
                for i, want in enumerate(PATCHES):
                    self.assertColour(read_pixel(ow, px, i * 8 + 3, 3), want)

    def test_half_size_averages_blocks(self):
        w, h = 48, 8
        blob = make_dng(patch_sensor(w, h), w, h)
        ow, oh, px, _ = self._develop(blob, half=True)
        self.assertEqual((ow, oh), (24, 4))
        for i, want in enumerate(PATCHES):
            self.assertColour(read_pixel(ow, px, i * 4 + 2, 2), want)

    def test_neutral_grey_stays_neutral_and_exposure_scales(self):
        w, h = 16, 4
        sensor = [0] * (w * h)
        cam = camera_response((0.1, 0.1, 0.1))
        for y in range(h):
            for x in range(w):
                c = (0, 1, 1, 2)[(y % 2) * 2 + x % 2]
                sensor[y * w + x] = int(round(256 + cam[c] * (4095 - 256)))
        blob = make_dng(sensor, w, h, baseline_exposure=0.5)
        ow, _, px, report = self._develop(blob, exposure_ev=0.5)
        self.assertAlmostEqual(report.exposure_ev, 1.0)
        got = read_pixel(ow, px, 8, 2)
        self.assertColour(got, (0.2, 0.2, 0.2))
        # BaselineExposure can be ignored on request
        ow, _, px, _ = self._develop(blob, use_baseline_exposure=False)
        self.assertColour(read_pixel(ow, px, 8, 2), (0.1, 0.1, 0.1))

    def test_blown_highlights_render_white_not_magenta(self):
        w, h = 8, 4
        blob = make_dng([4095] * (w * h), w, h)
        ow, _, px, report = self._develop(blob)
        r, g, b = (px[(2 * ow + 4) * 3 + i] for i in range(3))
        self.assertEqual((r, g, b), (65535, 65535, 65535))
        self.assertGreater(report.clipped_fraction, 0.9)

    def test_black_level_below_black_is_clamped(self):
        w, h = 8, 4
        blob = make_dng([0] * (w * h), w, h)
        _, _, px, _ = self._develop(blob)
        self.assertEqual(max(px), 0)

    def test_per_channel_black_repeat_pattern(self):
        w, h = 48, 8
        blacks = (200, 256, 260, 300)  # per CFA position, as Canon and Nikon files carry
        white = 4095
        sensor = []
        for y in range(h):
            for x in range(w):
                pos = (y % 2) * 2 + x % 2
                cam = camera_response(PATCHES[(x // 8) % len(PATCHES)])
                c = (0, 1, 1, 2)[pos]
                sensor.append(int(round(blacks[pos] + cam[c] * (white - blacks[pos]))))
        blob = make_dng(sensor, w, h, black=None, extra_raw_tags=[(50713, 3, (2, 2)), (50714, 4, blacks)])
        ow, _, px, _ = self._develop(blob)
        for i, want in enumerate(PATCHES):
            self.assertColour(read_pixel(ow, px, i * 8 + 4, 4), want)

    def test_linearization_table_is_applied(self):
        w, h = 48, 4
        sensor = patch_sensor(w, h)
        # store sqrt-coded values, table squares them back
        table = [min(4095, int(round((i / 255) ** 2 * 4095))) for i in range(256)]
        inv = {}
        coded = []
        for v in sensor:
            if v not in inv:
                inv[v] = min(range(256), key=lambda i: abs(table[i] - v))
            coded.append(inv[v])
        blob = make_dng(coded, w, h, linearization=table)
        ow, _, px, _ = self._develop(blob)
        for i, want in enumerate(PATCHES):
            self.assertColour(read_pixel(ow, px, i * 8 + 4, 2), want, tol=0.03)


class DevelopContainerTests(unittest.TestCase):
    def _pixels(self, blob, **settings):
        return rd.develop(rd.parse_raw(blob), rd.DevelopSettings(**settings))

    def test_storage_variants_decode_identically(self):
        w, h = 48, 12
        sensor = patch_sensor(w, h)
        reference = rd.parse_raw(make_dng(sensor, w, h)).values.tolist()
        self.assertEqual(reference, sensor)
        variants = {
            "packed12": dict(bits=12),
            "packed14": dict(bits=14, white=16383),
            "tiles16": dict(tiles=(16, 8)),
            "ljpeg": dict(compression=7),
            "ljpeg_tiles_2comp": dict(compression=7, tiles=(16, 8), lossless_nf=2),
            "ljpeg_pred6": dict(compression=7, predictor=6),
            "ljpeg_restart": dict(compression=7, restart=48),
            "subifd": dict(subifd=True),
        }
        for name, opts in variants.items():
            for predictor in (1, 2, 3, 4, 5, 7) if name == "ljpeg" else (None,):
                with self.subTest(variant=name, predictor=predictor):
                    if predictor:
                        opts = dict(opts, predictor=predictor)
                    raw = rd.parse_raw(make_dng(sensor, w, h, **opts))
                    self.assertEqual(raw.values.tolist(), sensor)

    def test_active_area_and_default_crop(self):
        w, h = 52, 12
        inner = patch_sensor(48, 8)
        sensor = [0] * (w * h)
        for y in range(8):
            for x in range(48):
                sensor[(y + 2) * w + x + 4] = inner[y * 48 + x]
        blob = make_dng(sensor, w, h, active=(2, 4, 10, 52), crop=(8, 2, 32, 4))
        ow, oh, px, _ = self._pixels(blob)
        self.assertEqual((ow, oh), (32, 4))
        # crop starts at active x=8: patch index 1 (red) at crop x 0..7
        got = read_pixel(ow, px, 4, 1)
        for g, want in zip(got, PATCHES[1]):
            self.assertAlmostEqual(g, want, delta=0.01)
        ow, oh, _, _ = self._pixels(blob, half=True)
        self.assertEqual((ow, oh), (16, 2))

    def test_orientation_rotates_the_master(self):
        w, h = 48, 8
        sensor = patch_sensor(w, h)
        _, _, flat, _ = self._pixels(make_dng(sensor, w, h))
        ow, oh, rot, _ = self._pixels(make_dng(sensor, w, h, orientation=6))
        self.assertEqual((ow, oh), (h, w))
        # orientation 6: source (x, y) lands at (h-1-y, x)
        for x, y in ((0, 0), (20, 3), (47, 7)):
            s = (y * w + x) * 3
            d = (x * ow + (h - 1 - y)) * 3
            self.assertEqual(rot[d : d + 3].tolist(), flat[s : s + 3].tolist())

    def test_linear_raw(self):
        w, h = 6, 2
        sensor = []
        for _ in range(h):
            for x in range(w):
                cam = camera_response(PATCHES[x])
                sensor.extend(int(round(256 + v * (4095 - 256))) for v in cam)
        blob = make_dng(sensor, w, h, photometric=rd.PHOTOMETRIC_LINEAR_RAW, spp=3)
        ow, oh, px, report = self._pixels(blob)
        self.assertEqual(report.cfa, "LinearRaw")
        for x, want in enumerate(PATCHES):
            for g, wv in zip(read_pixel(ow, px, x, 1), want):
                self.assertAlmostEqual(g, wv, delta=0.01)

    def test_refusals_say_why(self):
        w, h = 8, 4
        sensor = patch_sensor(w, h)
        cases = {
            "not a TIFF": b"hello world, not a raw file",
            "not a DNG": make_dng(sensor, w, h).replace(
                struct.pack("<HH", 50706, 1), struct.pack("<HH", 50000, 1)
            ),
            "lossy DNG": make_dng(sensor, w, h, compression=34892),
            "three-colour": make_dng(sensor, w, h, cfa=(0, 1, 3, 2)),
        }
        for want, blob in cases.items():
            with self.subTest(want):
                with self.assertRaises(rd.DevelopError) as ctx:
                    raw = rd.parse_raw(blob)
                    rd.develop(raw)
                self.assertIn(want.split()[-1].lower(), str(ctx.exception).lower())

    def test_truncated_file_is_refused_not_crashed(self):
        blob = make_dng(patch_sensor(16, 4), 16, 4, compression=7)
        for cut in (10, 40, len(blob) // 2, len(blob) - 30):
            with self.subTest(cut=cut):
                try:
                    raw = rd.parse_raw(blob[:cut])
                    rd.develop(raw)
                except (rd.DevelopError, struct.error, IndexError):
                    pass


class LosslessJpegInteropTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg not installed")
    def test_decodes_ffmpeg_ljpeg_streams(self):
        """An independent encoder: ffmpeg's ljpeg, fed raw yuvj444p planes.

        Planar 4:4:4 input goes in untouched (no colour conversion), and the
        stream holds the three planes as interleaved components.
        """

        w, h = 24, 10
        planes = [
            bytes((x * 9 + y * 7 + 41 * p + (x * y) % 13) % 256 for y in range(h) for x in range(w))
            for p in range(3)
        ]
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "in.yuv"
            src.write_bytes(b"".join(planes))
            want = [planes[c][i] for i in range(w * h) for c in range(3)]
            for pred in ("left", "plane", "median"):
                with self.subTest(pred=pred):
                    out = Path(tmp) / f"{pred}.jpg"
                    subprocess.run(
                        [
                            "ffmpeg",
                            "-loglevel",
                            "error",
                            "-y",
                            "-f",
                            "rawvideo",
                            "-pix_fmt",
                            "yuvj444p",
                            "-s",
                            f"{w}x{h}",
                            "-i",
                            str(src),
                            "-c:v",
                            "ljpeg",
                            "-pred",
                            pred,
                            "-frames:v",
                            "1",
                            str(out),
                        ],
                        check=True,
                    )
                    width, height, nf, samples = rd.decode_lossless_jpeg(out.read_bytes())
                    self.assertEqual((width, height, nf), (w, h, 3))
                    self.assertEqual(samples, want)


class DevelopFileTests(unittest.TestCase):
    def test_writes_tiff_and_png_and_never_overwrites(self):
        w, h = 48, 8
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "IMG_0001.dng"
            src.write_bytes(make_dng(patch_sensor(w, h), w, h, compression=7))
            tif = Path(tmp) / "out" / "IMG_0001.tif"
            report = rd.develop_file(src, tif)
            self.assertEqual((report.width, report.height), (w, h))
            data = tif.read_bytes()
            self.assertEqual(data[:4], b"II*\0")
            self.assertEqual(len(data), 8 + 2 + 11 * 12 + 4 + 6 + w * h * 6)
            png = Path(tmp) / "IMG_0001.png"
            rd.develop_file(src, png)
            blob = png.read_bytes()
            self.assertEqual(blob[:8], b"\x89PNG\r\n\x1a\n")
            idat = blob.index(b"IDAT")
            length = struct.unpack(">I", blob[idat - 4 : idat])[0]
            raw = zlib.decompress(blob[idat + 4 : idat + 4 + length])
            self.assertEqual(len(raw), h * (1 + w * 3))
            with self.assertRaises(rd.DevelopError):
                rd.develop_file(src, tif)
            with self.assertRaises(rd.DevelopError):
                rd.develop_file(src, Path(tmp) / "x.jpg")

    @unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg not installed")
    def test_ffmpeg_reads_the_master(self):
        w, h = 48, 8
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "a.dng"
            src.write_bytes(make_dng(patch_sensor(w, h), w, h))
            tif = Path(tmp) / "a.tif"
            rd.develop_file(src, tif)
            probe = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "stream=width,height,pix_fmt",
                    "-of",
                    "csv=p=0",
                    str(tif),
                ],
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertEqual(probe.stdout.strip(), f"{w},{h},rgb48le")


class DevelopCliTests(unittest.TestCase):
    def test_cli_develops_and_reports(self):
        import io
        import json

        from shootflow.cli import main

        w, h = 48, 8
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "IMG_0002.dng"
            src.write_bytes(make_dng(patch_sensor(w, h), w, h, compression=7, tiles=(16, 8)))
            out, err = io.StringIO(), io.StringIO()
            code = main(
                ["develop", str(src), "--out", str(Path(tmp) / "masters"), "--half"], stdout=out, stderr=err
            )
            self.assertEqual(code, 0, err.getvalue())
            result = json.loads(out.getvalue())["developed"][0]
            self.assertEqual((result["width"], result["height"]), (24, 4))
            self.assertTrue(Path(result["master"]).is_file())
            self.assertTrue(result["matrix"].startswith("ColorMatrix"), result["matrix"])
            self.assertEqual(result["colour"], "dng")
            # a second run refuses to overwrite and exits 1 with a reason
            out, err = io.StringIO(), io.StringIO()
            code = main(["develop", str(src), "--out", str(Path(tmp) / "masters")], stdout=out, stderr=err)
            self.assertEqual(code, 1)
            self.assertIn("never overwritten", err.getvalue())
            code = main(["develop", str(src), "--out", tmp, "--wb", "1,2"], stdout=out, stderr=err)
            self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
