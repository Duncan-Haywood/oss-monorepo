"""Canon CR3 C-RAW, the wavelet-coded quality (``shootflow.cr3_wavelet``).

The 5/3 inverse is checked against a forward 5/3 written here (lifting with
symmetric edges, columns then rows, so the decoder's rows-then-columns inverse
undoes it exactly), on odd and even sizes. The high-pass band code is checked
by an encoder written here as the decoder's mirror (no value prediction, zero
runs where left, above and above-right are zero, a value after a run coded one
step toward zero, the Rice parameter nudged by the column above). A whole
C-RAW CR3 is then built: each plane of a known sensor run through the forward
transform, the LL band coded like a lossless band, the others with the
high-pass code, a QP grid of all-zero residuals (QP 4, step 1) and subband
headers with step 1; it must read back sensel for sensel on both engines.
Real files against LibRaw: ``tools/cr3_libraw_check.py`` and
``eval/canon-cr3-craw-2026-11-15.md``.
"""

from __future__ import annotations

import random
import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import cr3, cr3_wavelet as cw, ljpeg_native
from shootflow import raw_develop as rd
from test_cr3 import MID, SENSOR_H, SENSOR_W, _emit_error, _emit_run, _Writer, _zig, busy_sensor, differing, encode_band, make_cr3, sensor


def forward_53(x: list[int]) -> tuple[list[int], list[int]]:
    """The reversible 5/3 analysis (JPEG 2000) with symmetric extension: (low, high)."""

    n = len(x)
    if n == 1:
        return [x[0]], []
    ext = lambda i: x[i] if i < n else x[2 * (n - 1) - i]  # noqa: E731
    high = [x[2 * k + 1] - ((x[2 * k] + ext(2 * k + 2)) >> 1) for k in range(n // 2)]
    hx = lambda k: high[k] if k >= 0 else high[0]  # noqa: E731
    low = []
    for k in range((n + 1) // 2):
        right = high[k] if k < len(high) else high[k - 1]
        low.append(x[2 * k] + ((hx(k - 1) + right + 2) >> 2))
    return low, high


def forward_2d(rows: list[list[int]]) -> tuple[list[list[int]], list[list[int]], list[list[int]], list[list[int]]]:
    """Columns then rows: (LL, HL, LH, HH)."""

    h, w = len(rows), len(rows[0])
    lo_cols, hi_cols = [], []
    for x in range(w):
        lo, hi = forward_53([rows[y][x] for y in range(h)])
        lo_cols.append(lo)
        hi_cols.append(hi)
    lo_rows = [[lo_cols[x][y] for x in range(w)] for y in range(len(lo_cols[0]))]
    hi_rows = [[hi_cols[x][y] for x in range(w)] for y in range(len(hi_cols[0]))]
    ll, hl = zip(*(forward_53(r) for r in lo_rows)) if lo_rows else ((), ())
    lh, hh = zip(*(forward_53(r) for r in hi_rows)) if hi_rows else ((), ())
    return [list(r) for r in ll], [list(r) for r in hl], [list(r) for r in lh], [list(r) for r in hh]


def forward_plane(rows: list[list[int]], levels: int) -> list[list[list[int]]]:
    """Subbands in coded order: LL, then HL, LH, HH from the deepest level to the finest."""

    groups = []
    ll = rows
    for _ in range(levels):
        ll, hl, lh, hh = forward_2d(ll)
        groups.append([hl, lh, hh])
    out = [ll]
    for g in reversed(groups):
        out.extend(g)
    return out


def encode_highpass(lines: list[list[int]]) -> bytes:
    """The mirror of ``cr3_wavelet.decode_highpass``."""

    w = _Writer()
    width = len(lines[0])
    state = [0]
    k = 0
    kcol = [0] * (width + 1)

    def nk(k, code, cap):
        return cw._next_k(k, code, cap)

    def zero_run(cur, i, limit):
        r = 0
        while r < limit and cur[i + 1 + r] == 0:
            r += 1
        return r

    cur = [0] + list(lines[0]) + [0]
    i, length = 0, width
    while length > 1:
        if cur[i]:
            code = _zig(cur[i + 1])
            _emit_error(w, code, k)
            k = nk(k, code, 15)
        else:
            r = zero_run(cur, i, length)
            _emit_run(w, state, r, length)
            length -= r
            for _ in range(r):
                kcol[i] = 0
                i += 1
            if length <= 0:
                break
            code = _zig(cur[i + 1]) - 1
            _emit_error(w, code, k)
            k = nk(k, code, 15)
        kcol[i] = k
        i += 1
        length -= 1
    if length == 1:
        code = _zig(cur[i + 1])
        _emit_error(w, code, k)
        k = nk(k, code, 15)
        kcol[i] = k
    above = cur
    above[width + 1] = 0

    def bump(k, i):
        if kcol[i + 1] - k <= 1:
            return 15 if k >= 15 else k
        return k + 1

    for values in lines[1:]:
        cur = [0] + list(values) + [0]
        i, last = 0, width - 1
        while i < last:
            if above[i + 2] | above[i + 1] | cur[i]:
                code = _zig(cur[i + 1])
                _emit_error(w, code, k)
                k = bump(nk(k, code, 0), i)
            else:
                r = zero_run(cur, i, width - i)
                _emit_run(w, state, r, width - i)
                for j in range(i, i + r):
                    kcol[j] = 0
                i += r
                if i >= last:
                    if i == last:
                        code = _zig(cur[i + 1]) - 1
                        _emit_error(w, code, k)
                        k = nk(k, code, 15)
                        kcol[i] = k
                    i += 1
                    continue
                code = _zig(cur[i + 1]) - 1
                _emit_error(w, code, k)
                k = bump(nk(k, code, 0), i)
            kcol[i] = k
            i += 1
        if i == last:
            code = _zig(cur[i + 1])
            _emit_error(w, code, k)
            k = nk(k, code, 15)
            kcol[i] = k
        cur[width + 1] = 0
        above = cur
    return w.data()


def sparse_band(width: int, height: int, seed: int) -> list[list[int]]:
    """Mostly zeros (as high-pass bands are), with isolated values, short bursts, a zero line and large values."""

    rng = random.Random(seed)
    lines = []
    for y in range(height):
        if y % 6 == 3:
            lines.append([0] * width)
            continue
        row = [0] * width
        for x in range(width):
            p = rng.random()
            if p < 0.25:
                row[x] = rng.randint(-40, 40)
            elif p < 0.27:
                row[x] = rng.choice((-70000, 90000, 3000))  # past the 41-zero escape at small K
        if y % 4 == 1:
            row[-1] = rng.choice((5, -5))  # a value in the last column, right after a run
        lines.append(row)
    return lines


def make_craw(values: list[int], levels: int = 3) -> bytes:
    """A whole C-RAW CR3 of ``values`` (SENSOR_W x SENSOR_H), steps all 1, built on ``test_cr3.make_cr3``'s container."""

    w2, h2 = SENSOR_W // 2, SENSOR_H // 2
    qw, qh = (w2 + 7) // 8, (h2 + 1) // 2
    qp = _Writer()
    qp.put((1 << (qw * qh)) - 1, qw * qh)  # every QP residual 0 with K 0: one 1 bit each; QP 0 + 4, step 1
    qp_bytes = qp.data()
    planes = []
    for plane in range(4):
        oy, ox = plane >> 1, plane & 1
        rows = [[values[(2 * y + oy) * SENSOR_W + 2 * x + ox] - MID for x in range(w2)] for y in range(h2)]
        bands = forward_plane(rows, levels)
        planes.append([encode_band(bands[0])] + [encode_highpass(b) if b and b[0] else b"" for b in bands[1:]])
    header = b""
    plane_blobs = []
    for plane, coded in enumerate(planes):
        blob = b"".join(c + bytes(3) for c in coded)  # 3 bytes of padding after each band, stated in its header
        sub = b""
        for b, c in enumerate(coded):
            # 0xFF13: size, band number, step multiplier 0, step base 1, padding, 0.
            sub += struct.pack(">HHIHHIHH", 0xFF13, 16, len(c) + 3, b << 12, 0, 1, 3, 0)
        header += struct.pack(">HHIB3s", 0xFF12, 8, len(blob), (plane << 4) | 8, bytes(3)) + sub
        plane_blobs.append(blob)
    tile = struct.pack(">HHIHHIHH", 0xFF11, 16, len(qp_bytes) + sum(map(len, plane_blobs)), 0, 0x4000, len(qp_bytes), 0, 0)
    header = tile + header + bytes(4)
    sample = header + qp_bytes + b"".join(plane_blobs)
    return make_cr3(values, version=0x200, levels=levels, sample=sample, header_size=len(header))


def make_craw_old(values: list[int], levels: int = 3, qps=None, word_extra: int = 0) -> bytes:
    """A whole C-RAW CR3 in the older layout (CMP1 version 0x100 with wavelet levels, as the EOS R100, M50, RP and
    250D write it): a 0xFF01 tile header with no QP stream, and 0xFF03 subband headers of one 32-bit word each
    (band number in the top four bits, QP in bits 19-26, padding in the low 19). ``qps`` gives each subband's
    QP (default 4: step 1, lossless); the bands are divided by their step here, so a step above 1 is lossy."""

    w2, h2 = SENSOR_W // 2, SENSOR_H // 2
    nb = 3 * levels + 1
    qps = qps or [4] * nb
    header = b""
    plane_blobs = []
    for plane in range(4):
        oy, ox = plane >> 1, plane & 1
        rows = [[values[(2 * y + oy) * SENSOR_W + 2 * x + ox] - MID for x in range(w2)] for y in range(h2)]
        bands = forward_plane(rows, levels)
        coded = []
        for b, band in enumerate(bands):
            step = cw.q_step(qps[b])
            band = [[int(v / step) for v in line] for line in band] if step > 1 else band
            coded.append(encode_band(band) if b == 0 else (encode_highpass(band) if band and band[0] else b""))
        blob = b"".join(c + bytes(3) for c in coded)
        sub = b""
        for b, c in enumerate(coded):
            sub += struct.pack(">HHII", 0xFF03, 8, len(c) + 3, (b << 28) | (qps[b] << 19) | 3 | word_extra)
        header += struct.pack(">HHIB3s", 0xFF02, 8, len(blob), (plane << 4) | 8, bytes(3)) + sub
        plane_blobs.append(blob)
    tile = struct.pack(">HHIHH", 0xFF01, 8, sum(map(len, plane_blobs)), 0, 0)
    header = tile + header + bytes(4)
    sample = header + b"".join(plane_blobs)
    return make_cr3(values, version=0x100, levels=levels, sample=sample, header_size=len(header))


class OldStyleCrawTests(unittest.TestCase):
    """The older C-RAW layout (no QP grid, one step per subband). Real files against LibRaw: EOS R100, M50, M6
    Mark II, EOS R, RP, 250D, 90D, SL3 (``eval/canon-cr3-every-body-2026-11-18.md``)."""

    def test_reads_back_sensel_for_sensel_at_step_one(self):
        values = sensor()
        for levels in (3, 1):
            with self.subTest(levels=levels):
                raw = rd.parse_raw(make_craw_old(values, levels))
                self.assertEqual(list(raw.values), values)

    def test_each_band_takes_its_own_step_on_both_engines(self):
        values = sensor(seed=3)
        qps = [4] + [16, 16, 22] * 2 + [26, 26, 28]  # steps 1, 4, 4, 8, 12, 12, 16
        blob = make_craw_old(values, 3, qps)
        box = cr3.Container(blob)
        sample = blob[box.raw.offset : box.raw.offset + box.raw.size]
        layout = cw.read_layout(sample, box.head.header_size, 3, 4, SENSOR_W // 2, SENSOR_H // 2)
        self.assertEqual([(b.mult, b.base) for b in layout.tiles[0].planes[0].bands], [(0, cw.q_step(q)) for q in qps])
        python = cr3.parse_cr3(blob, engine="python").values
        self.assertGreater(differing(python, values), 0)  # lossy: the steps were applied
        self.assertLess(max(abs(a - b) for a, b in zip(python, values)), 200)
        if ljpeg_native.craw_function() is not None:
            self.assertEqual(differing(cr3.parse_cr3(blob, engine="c").values, python), 0)

    def test_refusals(self):
        with self.assertRaisesRegex(rd.DevelopError, "per-line quantisation"):
            rd.parse_raw(make_craw_old(sensor(), word_extra=0x08000000))
        with self.assertRaisesRegex(rd.DevelopError, "zero step"):
            rd.parse_raw(make_craw_old(sensor(), qps=[0] * 10))
        with self.assertRaisesRegex(rd.DevelopError, "DNG Converter"):
            rd.parse_raw(make_cr3(version=0x200, levels=0))


class TransformTests(unittest.TestCase):
    def test_inverse_undoes_the_forward_53(self):
        rng = random.Random(1)
        for n in range(1, 24):
            with self.subTest(n=n):
                x = [rng.randint(-9000, 9000) for _ in range(n)]
                low, high = forward_53(x)
                self.assertEqual(cw.inverse_53(low, high, n), x)

    def test_inverse_level_undoes_columns_then_rows(self):
        rng = random.Random(2)
        for w, h in ((7, 5), (8, 6), (3, 9), (10, 2), (5, 1)):
            with self.subTest(size=(w, h)):
                rows = [[rng.randint(-3000, 3000) for _ in range(w)] for _ in range(h)]
                self.assertEqual(cw.inverse_level(*forward_2d(rows), w, h), rows)

    def test_band_sizes(self):
        # 3094 x 2060, an EOS R8 plane: the deepest LL is 387 x 258, the finest bands half the plane.
        sizes = cw.band_sizes(3094, 2060, 3)
        self.assertEqual(sizes[0], (387, 258))
        self.assertEqual(sizes[1:4], [(387, 258), (387, 257), (387, 257)])
        self.assertEqual(sizes[7:], [(1547, 1030), (1547, 1030), (1547, 1030)])
        self.assertEqual(cw.band_sizes(7, 5, 1), [(4, 3), (3, 3), (4, 2), (3, 2)])


class QuantisationTests(unittest.TestCase):
    def test_q_step(self):
        self.assertEqual([cw.q_step(q) for q in range(36, 43)], [0x28, 0x2D, 0x33, 0x39, 0x40, 0x48, 0x50])
        self.assertEqual(cw.q_step(4), 1)  # 0x40 >> 6
        self.assertEqual(cw.q_step(0), 0)
        self.assertEqual(cw.q_step(-1), 0)  # C division: -1 / 6 is 0, -1 % 6 is -1, taken as 0
        self.assertEqual(cw.q_step(48), 0xA0)

    def test_step_tables_average_rows_per_level(self):
        grid = [[36, 42], [38, 30], [40, 41], [-3, 5], [36, 36]]
        deepest, middle, finest = cw.step_tables(grid, 3)
        self.assertEqual(finest, [[cw.q_step(q) for q in row] for row in grid])
        self.assertEqual(middle[0], [cw.q_step(37), cw.q_step(36)])
        self.assertEqual(middle[2], [cw.q_step(36), cw.q_step(36)])  # past the end: the last row repeats
        # Four rows summed, then an arithmetic shift with a round toward zero for negative sums.
        self.assertEqual(deepest[0], [cw.q_step((36 + 38 + 40 - 3) >> 2), cw.q_step((42 + 30 + 41 + 5) >> 2)])
        self.assertEqual(len(deepest), 2)

    def test_dequantise(self):
        band = cw.Subband(9, 0, 1, 8, 2)
        band.shift = 2
        band.width, band.height = 5, 1
        lines = [[1, 0, -3, 2, 5]]
        cw.dequantise(lines, band, [[10, 20]])
        # base 2 + (step * 8 >> 3): 12 for columns 0-3, 22 for column 4.
        self.assertEqual(lines, [[12, 0, -36, 24, 110]])
        clamp = cw.Subband(1, 0, 1, 0, -5)
        clamp.width = clamp.height = 1
        lines = [[7]]
        cw.dequantise(lines, clamp, [[1]])
        self.assertEqual(lines, [[7]])  # a step below 1 is held at 1


class HighpassCodeTests(unittest.TestCase):
    def test_round_trip(self):
        for seed, (w, h) in enumerate(((37, 23), (64, 40), (5, 9), (1, 4), (2, 3), (300, 12))):
            with self.subTest(size=(w, h)):
                lines = sparse_band(w, h, seed)
                self.assertEqual(cw.decode_highpass(encode_highpass(lines), w, h), lines)

    def test_all_zero_band_and_runs_to_the_line_end(self):
        lines = [[0] * 50, [0] * 50, [0] * 49 + [3], [4] + [0] * 49, [0] * 50]
        self.assertEqual(cw.decode_highpass(encode_highpass(lines), 50, 5), lines)


class ReadTests(unittest.TestCase):
    def test_c_raw_reads_back_sensel_for_sensel(self):
        values = sensor()
        for levels in (3, 1):
            with self.subTest(levels=levels):
                raw = rd.parse_raw(make_craw(values, levels))
                self.assertEqual(raw.source, "cr3")
                self.assertEqual(list(raw.values), values)
                self.assertEqual(raw.ifd.entries[rd.TAG_BLACK_LEVEL], (2047.0,) * 4)

    def test_engines_agree(self):
        if ljpeg_native.craw_function() is None:
            self.skipTest("no C compiler")
        blob = make_craw(sensor(seed=5))
        python = cr3.parse_cr3(blob, engine="python").values
        self.assertEqual(cr3.parse_cr3(blob, engine="c").values, python)
        self.assertEqual(list(python), sensor(seed=5))

    def test_profile_chooser_takes_a_c_raw_file(self):
        self.assertEqual(cr3.camera_model(make_craw(sensor()), readable=True), "Canon EOS R8")

    def test_damaged_header_is_refused(self):
        blob = bytearray(make_craw(sensor()))
        at = blob.index(b"\xff\x13\x00\x10")
        blob[at + 8] = 0x50  # the first subband claims to be number 5
        with self.assertRaisesRegex(rd.DevelopError, "out of order"):
            rd.parse_raw(bytes(blob))

    def test_unknown_codec_version_is_refused_naming_the_dng_route(self):
        with self.assertRaisesRegex(rd.DevelopError, "DNG Converter"):
            rd.parse_raw(make_cr3(version=0x300, levels=3))


class TiledCrawTests(unittest.TestCase):
    """A C-RAW CR3 whose sensor is stored in several tiles (``tests/craw_tiled.py`` codes them; real R8 and R3
    frames re-stored this way are read back by LibRaw 0.22 in ``tools/cr3_craw_tiled_libraw_check.py``)."""

    def test_one_tile_geometry_is_band_sizes(self):
        for w, h, levels in ((3094, 2060, 3), (27, 23, 3), (60, 50, 2), (31, 22, 1)):
            geo = cw.tile_geometry(w, h, levels, 0)
            self.assertEqual([g[:2] for g in geo], cw.band_sizes(w, h, levels))
            self.assertTrue(all(g[2:] == (0, 0, 0, 0) for g in geo))

    def test_a_left_neighbour_lends_one_high_coefficient(self):
        alone, left = cw.tile_geometry(1548, 2060, 3, 0), cw.tile_geometry(1548, 2060, 3, cw.LEFT)
        for b, (own, lent) in enumerate(zip(alone, left)):
            high_across = b and (b - 1) % 3 != 1  # HL and HH
            self.assertEqual(lent[0], own[0] + (1 if high_across else 0))
            self.assertEqual(lent[2], 1 if high_across else 0)

    def test_inverse_runs_across_a_seam(self):
        import craw_tiled as ct

        rng = random.Random(4)
        x = [rng.randint(-900, 900) for _ in range(120)]
        for start, n in ((27, 29), (40, 30), (33, 22)):
            with self.subTest(start=start, n=n):
                region = x[start - 20 : start + n + 20]
                low, ls, high, hs = ct.forward_1d(region, -20, False, False)
                lo = low[-ls : -ls + (n + 1) // 2 + 2]
                hi = high[-1 - hs : -1 - hs + n // 2 + 3]
                self.assertEqual(cw.inverse_53(lo, hi, n, first=True, last=True), x[start : start + n])

    def _file(self, size, tile, levels, **kw):
        import craw_tiled as ct

        values = busy_sensor(*size)
        sample, header_size = ct.craw_sample(values, *size, tile, levels, MID, **kw)
        return values, make_cr3(values=values, version=0x200, levels=levels, size=size, tile=tile, sample=sample,
                                header_size=header_size)

    def test_tiled_c_raw_reads_back_sensel_for_sensel(self):
        engines = ["python"] + (["c"] if ljpeg_native.craw_function() else [])
        # 2 x 2 uneven, 2 across, 2 down, odd plane tiles (29 and 27) in a 3 x 2 grid, a 3 x 3 grid; 1-3 levels.
        cases = (((120, 100), (64, 52), 3), ((120, 100), (76, 100), 3), ((120, 100), (120, 52), 2),
                 ((172, 108), (58, 54), 3), ((300, 220), (110, 80), 3), ((120, 100), (64, 52), 1))
        for size, tile, levels in cases:
            values, data = self._file(size, tile, levels)
            for engine in engines:
                with self.subTest(size=size, tile=tile, levels=levels, engine=engine):
                    _head, out = cr3.decode_sensor(data, cr3.Container(data), engine=engine)
                    self.assertEqual(differing(out, values), 0)

    def test_quantised_tiles_engines_agree(self):
        if ljpeg_native.craw_function() is None:
            self.skipTest("no C compiler")
        rng = random.Random(9)

        def qp(_y, _x, w, h):
            return [[rng.randint(30, 44) for _ in range((w + 7) // 8)] for _ in range((h + 1) // 2)]

        mults = [(0, 1)] + [(4, 0), (4, 0), (8, 0)] * 2 + [(8, 0), (8, 0), (16, 0)]
        values, data = self._file((172, 108), (58, 54), 3, qp=qp, mults=mults)
        _h, py = cr3.decode_sensor(data, cr3.Container(data), engine="python")
        _h, c = cr3.decode_sensor(data, cr3.Container(data), engine="c")
        self.assertEqual(differing(c, py), 0)
        self.assertGreater(differing(py, values), 0)  # the steps were applied: lossy
        self.assertLess(max(abs(a - b) for a, b in zip(py, values)), 400)

    def test_a_too_narrow_margin_is_refused_by_the_encoder(self):
        import craw_tiled as ct

        values = busy_sensor(120, 100)
        with self.assertRaises(ct.MarginError):
            ct.craw_sample(values, 120, 100, (64, 52), 3, MID, margin=2)

    def test_a_tile_header_naming_another_tile_is_refused(self):
        _values, data = self._file((120, 100), (64, 52), 2)
        blob = bytearray(data)
        at = blob.index(b"\xff\x11\x00\x10", blob.index(b"\xff\x11\x00\x10") + 4)  # the second tile's header
        struct.pack_into(">H", blob, at + 8, 3)
        with self.assertRaisesRegex(rd.DevelopError, "tile header 1 is not valid"):
            rd.parse_raw(bytes(blob))

    def test_parse_raw_develops_a_tiled_c_raw_frame(self):
        values, data = self._file((120, 100), (64, 52), 3)
        raw = rd.parse_raw(data)
        self.assertEqual((raw.width, raw.height), (120, 100))
        self.assertEqual(differing(raw.values, values), 0)
        self.assertEqual(cr3.camera_model(data, readable=True), "Canon EOS R8")
        self.assertTrue(any("stacked one above another" in n for n in raw.notes))  # a 2 x 2 grid has a row seam
        _values, side = self._file((120, 100), (64, 100), 3)
        self.assertFalse(any("stacked" in n for n in rd.parse_raw(side).notes))


if __name__ == "__main__":
    unittest.main()
