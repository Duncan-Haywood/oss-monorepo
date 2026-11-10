"""Develop an Adobe DNG into a graded-ready master, stdlib only.

``raw_preview`` scores RAW stills from the camera's embedded JPEG, which is
fine for culling but is not a master: it is 8-bit, already tone-mapped by the
camera, and often smaller than the sensor. This module reads the sensor data
itself and renders a 16-bit TIFF (or PNG) master the grade stage can take.

Scope, stated plainly:

* **DNG only.** DNG is the open format (Adobe's published specification),
  every phone that shoots RAW writes it, and Adobe's free DNG Converter turns
  CR2/CR3/NEF/ARW into it. Maker formats are not parsed here.
* Sensor data stored uncompressed (8 or 16 bit, or packed 10/12/14 bit) or as
  lossless JPEG (compression 7, SOF3, any of the seven predictors, interleaved
  components, restart markers), in strips or tiles, in IFD0 or a SubIFD.
  Lossy DNG (compression 34892), deflate/floating-point DNG and four-colour
  CFAs are refused with a reason, never guessed.
* Colour Filter Array data with any 2x2 three-colour pattern (RGGB, BGGR,
  GRBG, GBRG), and LinearRaw (already demosaiced, three samples per pixel).
* The DNG rendering steps a viewer needs: linearization table, black level
  (repeat pattern and per-row/column deltas), white level, active area, default
  crop, as-shot white balance (``AsShotNeutral``), the camera colour matrix,
  ``BaselineExposure`` and the IFD0 orientation.
* Colour: the camera matrix nearest D65 (``ColorMatrix2`` when its
  ``CalibrationIlluminant2`` is D65 or daylight, else ``ColorMatrix1``) taken
  through sRGB primaries with each row normalised, so a white-balanced neutral
  stays neutral (the method dcraw uses). Matrices are not interpolated by
  colour temperature, and ``ForwardMatrix``, ``CameraCalibration`` and the
  profile hue/sat maps are ignored. Expect hues close to, not identical to,
  Adobe's rendering.
* Demosaic: bilinear (each missing colour is the mean of the same-colour
  sensels in the 3x3 neighbourhood) at full size, or ``half`` (each 2x2 block
  becomes one pixel, no interpolation, a quarter of the pixels).
* Clamping in LibRaw's order: each sensel at 0 after black subtraction and at
  its white-balanced clip level before demosaicing (so blown areas go white,
  not magenta, and shadow noise is not averaged below black).
* Tone: linear exposure, then the sRGB transfer curve. No
  look, no curve: that is the grade's job.

Pure Python, so speed is the trade: see ``README.md`` for measured times.
"""

from __future__ import annotations

import struct
import zlib
from array import array
from dataclasses import dataclass, field
from pathlib import Path

# --------------------------------------------------------------------------
# TIFF / DNG container
# --------------------------------------------------------------------------

_TYPE_SIZES = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4, 16: 8}
_TYPE_FMT = {1: "B", 3: "H", 4: "I", 6: "b", 8: "h", 9: "i", 11: "f", 12: "d", 13: "I", 16: "Q"}

TAG_NEW_SUBFILE_TYPE = 254
TAG_WIDTH = 256
TAG_HEIGHT = 257
TAG_BITS = 258
TAG_COMPRESSION = 259
TAG_PHOTOMETRIC = 262
TAG_STRIP_OFFSETS = 273
TAG_ORIENTATION = 274
TAG_SAMPLES = 277
TAG_ROWS_PER_STRIP = 278
TAG_STRIP_BYTES = 279
TAG_PLANAR = 284
TAG_TILE_WIDTH = 322
TAG_TILE_LENGTH = 323
TAG_TILE_OFFSETS = 324
TAG_TILE_BYTES = 325
TAG_SUB_IFDS = 330
TAG_CFA_REPEAT = 33421
TAG_CFA_PATTERN = 33422
TAG_DNG_VERSION = 50706
TAG_LINEARIZATION = 50712
TAG_BLACK_REPEAT = 50713
TAG_BLACK_LEVEL = 50714
TAG_BLACK_DELTA_H = 50715
TAG_BLACK_DELTA_V = 50716
TAG_WHITE_LEVEL = 50717
TAG_CROP_ORIGIN = 50719
TAG_CROP_SIZE = 50720
TAG_COLOR_MATRIX_1 = 50721
TAG_COLOR_MATRIX_2 = 50722
TAG_AS_SHOT_NEUTRAL = 50728
TAG_AS_SHOT_WHITE_XY = 50729
TAG_BASELINE_EXPOSURE = 50730
TAG_ILLUMINANT_1 = 50778
TAG_ILLUMINANT_2 = 50779
TAG_ACTIVE_AREA = 50829

PHOTOMETRIC_CFA = 32803
PHOTOMETRIC_LINEAR_RAW = 34892

# EXIF LightSource codes that are D65 or close to it (daylight, cloudy, D65,
# D75, fine weather): the matrix to prefer for an sRGB rendering.
_DAYLIGHT_ILLUMINANTS = frozenset({1, 9, 10, 21, 22})


class DevelopError(ValueError):
    """The file is not a DNG this developer can render; the message says why."""


@dataclass
class Ifd:
    entries: dict[int, tuple] = field(default_factory=dict)

    def get(self, tag: int, default=None):
        values = self.entries.get(tag)
        return default if values is None else values

    def one(self, tag: int, default=None):
        values = self.entries.get(tag)
        return default if not values else values[0]


class _Reader:
    def __init__(self, data: bytes):
        self.data = data
        if data[:2] == b"II":
            self.end = "<"
        elif data[:2] == b"MM":
            self.end = ">"
        else:
            raise DevelopError("not a TIFF/DNG file (no II/MM byte-order mark)")
        magic = struct.unpack_from(self.end + "H", data, 2)[0]
        if magic != 42:
            raise DevelopError(f"not a classic TIFF/DNG file (magic {magic})")

    def first_ifd_offset(self) -> int:
        return struct.unpack_from(self.end + "I", self.data, 4)[0]

    def read_ifd(self, offset: int) -> tuple[Ifd, int]:
        data, end = self.data, self.end
        if offset <= 0 or offset + 2 > len(data):
            raise DevelopError(f"IFD offset {offset} is outside the file")
        count = struct.unpack_from(end + "H", data, offset)[0]
        ifd = Ifd()
        pos = offset + 2
        for _ in range(count):
            if pos + 12 > len(data):
                raise DevelopError("IFD runs past the end of the file")
            tag, typ, n = struct.unpack_from(end + "HHI", data, pos)
            size = _TYPE_SIZES.get(typ)
            if size is not None and n < 1 << 28:
                total = size * n
                at = pos + 8 if total <= 4 else struct.unpack_from(end + "I", data, pos + 8)[0]
                if at + total <= len(data):
                    ifd.entries[tag] = self._values(typ, n, at)
            pos += 12
        following = struct.unpack_from(end + "I", data, pos)[0] if pos + 4 <= len(data) else 0
        return ifd, following

    def _values(self, typ: int, n: int, at: int) -> tuple:
        data, end = self.data, self.end
        if typ in (2, 7):
            return tuple(data[at : at + n])
        if typ in (5, 10):
            fmt = end + ("I" if typ == 5 else "i") * (2 * n)
            raw = struct.unpack_from(fmt, data, at)
            return tuple((raw[i] / raw[i + 1]) if raw[i + 1] else 0.0 for i in range(0, 2 * n, 2))
        return struct.unpack_from(end + _TYPE_FMT[typ] * n, data, at)


def _all_ifds(reader: _Reader) -> list[Ifd]:
    found: list[Ifd] = []
    seen: set[int] = set()
    queue = [reader.first_ifd_offset()]
    while queue and len(found) < 64:
        offset = queue.pop(0)
        if offset in seen or offset == 0:
            continue
        seen.add(offset)
        ifd, following = reader.read_ifd(offset)
        found.append(ifd)
        queue.extend(ifd.get(TAG_SUB_IFDS, ()))
        if following:
            queue.append(following)
    return found


def _raw_ifd(ifds: list[Ifd]) -> Ifd:
    candidates = [
        ifd
        for ifd in ifds
        if ifd.one(TAG_PHOTOMETRIC) in (PHOTOMETRIC_CFA, PHOTOMETRIC_LINEAR_RAW)
        and ifd.one(TAG_NEW_SUBFILE_TYPE, 0) == 0
    ]
    if not candidates:
        raise DevelopError("no raw image IFD (CFA or LinearRaw, full resolution) in the file")
    return max(candidates, key=lambda ifd: ifd.one(TAG_WIDTH, 0) * ifd.one(TAG_HEIGHT, 0))


# --------------------------------------------------------------------------
# Lossless JPEG (ITU T.81 process 14, SOF3), as DNG stores sensor tiles
# --------------------------------------------------------------------------


def _huffman_table(counts: bytes, symbols: bytes) -> dict[tuple[int, int], int]:
    table: dict[tuple[int, int], int] = {}
    code = 0
    k = 0
    for length in range(1, 17):
        for _ in range(counts[length - 1]):
            table[(length, code)] = symbols[k]
            code += 1
            k += 1
        code <<= 1
    return table


def decode_lossless_jpeg(data: bytes) -> tuple[int, int, int, list[int]]:
    """Return ``(width, height, components, samples)`` for a SOF3 stream.

    ``samples`` is row-major with components interleaved, which is how DNG
    lays a lossless-JPEG tile onto the raw image.
    """

    if data[:2] != b"\xff\xd8":
        raise DevelopError("lossless JPEG tile does not start with SOI")
    pos = 2
    tables: dict[int, dict[tuple[int, int], int]] = {}
    precision = width = height = 0
    comp_ids: list[int] = []
    sampling: list[tuple[int, int]] = []
    restart = 0
    while pos + 4 <= len(data):
        if data[pos] != 0xFF:
            raise DevelopError("corrupt lossless JPEG marker stream")
        marker = data[pos + 1]
        if marker == 0xFF:
            pos += 1
            continue
        length = struct.unpack_from(">H", data, pos + 2)[0]
        body = data[pos + 4 : pos + 2 + length]
        if marker in (0xC0, 0xC1, 0xC2, 0xC9, 0xCA):
            raise DevelopError("lossy JPEG sensor data is not supported (lossy DNG)")
        if marker == 0xC3:
            precision, height, width, nf = struct.unpack_from(">BHHB", body, 0)
            comp_ids = [body[6 + 3 * i] for i in range(nf)]
            sampling = [(body[7 + 3 * i] >> 4, body[7 + 3 * i] & 0x0F) for i in range(nf)]
        elif marker == 0xC4:
            q = 0
            while q < len(body):
                tc_th = body[q]
                counts = body[q + 1 : q + 17]
                n = sum(counts)
                if tc_th >> 4 == 0:  # lossless JPEG uses DC-class tables only; skip AC ones
                    tables[tc_th & 0x0F] = _huffman_table(counts, body[q + 17 : q + 17 + n])
                q += 17 + n
        elif marker == 0xDD:
            restart = struct.unpack_from(">H", body, 0)[0]
        elif marker == 0xDA:
            ns = body[0]
            selectors = []
            for i in range(ns):
                cid, tdta = body[1 + 2 * i], body[2 + 2 * i]
                if cid not in comp_ids:
                    raise DevelopError("scan names a component the frame does not have")
                selectors.append(tdta >> 4)
            predictor = body[1 + 2 * ns]
            point_transform = body[3 + 2 * ns] & 0x0F
            if not width or not height or ns != len(comp_ids):
                raise DevelopError("lossless JPEG scan before its frame header, or a partial scan")
            missing = [t for t in selectors if t not in tables]
            if missing:
                raise DevelopError(f"lossless JPEG uses an undefined Huffman table {missing[0]}")
            if any(f != (1, 1) for f in sampling):
                if len(set(sampling)) != 1 or restart:
                    raise DevelopError("subsampled lossless JPEG is not supported (DNG does not use it)")
                samples = _decode_scan_blocks(
                    data,
                    pos + 2 + length,
                    width,
                    height,
                    [tables[t] for t in selectors],
                    predictor,
                    precision,
                    point_transform,
                    sampling[0],
                )
                return width, height, len(comp_ids), samples
            samples = _decode_scan(
                data,
                pos + 2 + length,
                width,
                height,
                [tables[t] for t in selectors],
                predictor,
                precision,
                point_transform,
                restart,
            )
            return width, height, len(comp_ids), samples
        pos += 2 + length
    raise DevelopError("lossless JPEG has no scan")


class _Bits:
    __slots__ = ("data", "pos", "acc", "nbits", "end")

    def __init__(self, data: bytes, pos: int):
        self.data = data
        self.pos = pos
        self.acc = 0
        self.nbits = 0
        self.end = len(data)

    def _fill(self) -> None:
        data = self.data
        while self.nbits <= 24:
            if self.pos >= self.end:
                self.acc = (self.acc << 8) & 0xFFFFFFFFFF
                self.nbits += 8
                continue
            byte = data[self.pos]
            if byte == 0xFF:
                nxt = data[self.pos + 1] if self.pos + 1 < self.end else 0
                if nxt == 0x00:
                    self.pos += 2
                else:  # a marker: feed zeros, do not consume it
                    byte = 0
            else:
                self.pos += 1
            self.acc = ((self.acc << 8) | byte) & 0xFFFFFFFFFF
            self.nbits += 8

    def bits(self, n: int) -> int:
        if n == 0:
            return 0
        if self.nbits < n:
            self._fill()
        self.nbits -= n
        return (self.acc >> self.nbits) & ((1 << n) - 1)

    def restart(self) -> None:
        self.acc = 0
        self.nbits = 0
        data = self.data
        while self.pos + 1 < self.end:
            if data[self.pos] == 0xFF and 0xD0 <= data[self.pos + 1] <= 0xD7:
                self.pos += 2
                return
            self.pos += 1


def _fast_lookup(table: dict[tuple[int, int], int]) -> tuple[list[int], list[int], dict]:
    """A 9-bit lookahead table: (symbol, length) for every code up to 9 bits."""

    size = 1 << 9
    symbols = [-1] * size
    lengths = [0] * size
    for (length, code), symbol in table.items():
        if length <= 9:
            start = code << (9 - length)
            for i in range(start, start + (1 << (9 - length))):
                symbols[i] = symbol
                lengths[i] = length
    return symbols, lengths, table


def _decode_diff(reader: _Bits, fast) -> int:
    symbols, lengths, table = fast
    if reader.nbits < 9:
        reader._fill()
    peek = (reader.acc >> (reader.nbits - 9)) & 0x1FF
    length = lengths[peek]
    if length:
        reader.nbits -= length
        s = symbols[peek]
    else:
        code = 0
        s = -1
        for length in range(1, 17):
            code = (code << 1) | reader.bits(1)
            got = table.get((length, code))
            if got is not None:
                s = got
                break
        if s < 0:
            raise DevelopError("invalid Huffman code in lossless JPEG data")
    if s == 0:
        return 0
    if s == 16:
        return 32768
    v = reader.bits(s)
    if v < (1 << (s - 1)):
        v -= (1 << s) - 1
    return v


def _predict(plane, pw, x, y, predictor, initial):
    if x == 0 and y == 0:
        return initial
    if y == 0:
        return plane[x - 1]
    if x == 0:
        return plane[(y - 1) * pw]
    ra, rb, rc = plane[y * pw + x - 1], plane[(y - 1) * pw + x], plane[(y - 1) * pw + x - 1]
    return (ra, rb, rc, ra + rb - rc, ra + ((rb - rc) >> 1), rb + ((ra - rc) >> 1), (ra + rb) >> 1)[
        predictor - 1
    ]


def _decode_scan_blocks(data, pos, width, height, tables, predictor, precision, pt, factors):
    """Interleaved scan whose MCU holds HxV samples of every component.

    Only equal factors for all components (no real subsampling): ffmpeg's
    ljpeg encoder writes 4:4:4 this way. Returns pixels interleaved like the
    1x1 path.
    """

    if not 1 <= predictor <= 7:
        raise DevelopError(f"lossless JPEG predictor {predictor} is not 1-7")
    hf, vf = factors
    nf = len(tables)
    fasts = [_fast_lookup(t) for t in tables]
    reader = _Bits(data, pos)
    initial = 1 << (precision - pt - 1)
    pw = -(-width // hf) * hf
    ph = -(-height // vf) * vf
    planes = [[0] * (pw * ph) for _ in range(nf)]
    for my in range(ph // vf):
        for mx in range(pw // hf):
            for c in range(nf):
                plane = planes[c]
                for v in range(vf):
                    for hh in range(hf):
                        x, y = mx * hf + hh, my * vf + v
                        diff = _decode_diff(reader, fasts[c])
                        pred = _predict(plane, pw, x, y, predictor, initial)
                        plane[y * pw + x] = (pred + diff) & 0xFFFF
    out = [0] * (width * height * nf)
    for y in range(height):
        for x in range(width):
            for c in range(nf):
                out[(y * width + x) * nf + c] = planes[c][y * pw + x] << pt
    return out


def _decode_scan(data, pos, width, height, tables, predictor, precision, pt, restart):
    if not 1 <= predictor <= 7:
        raise DevelopError(f"lossless JPEG predictor {predictor} is not 1-7")
    nf = len(tables)
    fasts = [_fast_lookup(t) for t in tables]
    reader = _Bits(data, pos)
    mask = (1 << 16) - 1
    initial = 1 << (precision - pt - 1)
    out = [0] * (width * height * nf)
    row_len = width * nf
    mcu = 0
    first_line = 0  # the row a scan or restart interval started on: predicts from the left
    for y in range(height):
        base = y * row_len
        for x in range(width):
            fresh = mcu == 0
            if restart and mcu and mcu % restart == 0:
                reader.restart()
                fresh = True
                first_line = y
            mcu += 1
            at = base + x * nf
            for c in range(nf):
                diff = _decode_diff(reader, fasts[c])
                if fresh:
                    pred = initial
                elif y == first_line:
                    pred = out[at - nf + c] if x > 0 else out[at - row_len + c]
                elif x == 0:
                    pred = out[at - row_len + c]
                else:
                    ra = out[at - nf + c]
                    rb = out[at - row_len + c]
                    if predictor == 1:
                        pred = ra
                    elif predictor == 2:
                        pred = rb
                    else:
                        rc = out[at - row_len - nf + c]
                        if predictor == 3:
                            pred = rc
                        elif predictor == 4:
                            pred = ra + rb - rc
                        elif predictor == 5:
                            pred = ra + ((rb - rc) >> 1)
                        elif predictor == 6:
                            pred = rb + ((ra - rc) >> 1)
                        else:
                            pred = (ra + rb) >> 1
                out[at + c] = (pred + diff) & mask
    if pt:
        out = [v << pt for v in out]
    return out


# --------------------------------------------------------------------------
# Reading the sensor data
# --------------------------------------------------------------------------


@dataclass
class RawImage:
    width: int
    height: int
    samples_per_pixel: int
    values: array  # 'H' (or 'I'), row-major, samples interleaved
    ifd: Ifd
    ifd0: Ifd


def _unpack_bits(chunk: bytes, bits: int, count: int, row_samples: int) -> list[int]:
    """Unpack MSB-first ``bits``-wide samples; each row starts on a byte."""

    out: list[int] = []
    row_bytes = (row_samples * bits + 7) // 8
    rows = (count + row_samples - 1) // row_samples
    mask = (1 << bits) - 1
    for r in range(rows):
        acc = 0
        nbits = 0
        pos = r * row_bytes
        want = min(row_samples, count - r * row_samples)
        for _ in range(want):
            while nbits < bits:
                acc = (acc << 8) | (chunk[pos] if pos < len(chunk) else 0)
                pos += 1
                nbits += 8
            nbits -= bits
            out.append((acc >> nbits) & mask)
            acc &= (1 << nbits) - 1
    return out


def _decode_chunk(
    chunk: bytes, compression: int, bits: int, spp: int, cw: int, ch: int, end: str
) -> list[int]:
    count = cw * ch * spp
    if compression == 1:
        if bits == 8:
            vals = list(chunk[:count])
        elif bits == 16:
            vals = list(struct.unpack_from(end + "H" * min(count, len(chunk) // 2), chunk, 0))
        elif bits == 32:
            vals = list(struct.unpack_from(end + "I" * min(count, len(chunk) // 4), chunk, 0))
        elif 8 < bits < 16:
            vals = _unpack_bits(chunk, bits, count, cw * spp)
        else:
            raise DevelopError(f"{bits}-bit uncompressed sensor data is not supported")
        if len(vals) < count:
            vals.extend([0] * (count - len(vals)))
        return vals
    if compression == 7:
        w, h, nf, samples = decode_lossless_jpeg(chunk)
        if w * h * nf < count:
            raise DevelopError("lossless JPEG tile holds fewer samples than the tile size")
        return samples[:count]
    if compression == 34892:
        raise DevelopError("lossy DNG (compression 34892) is not supported; developing needs the sensor data")
    if compression == 8:
        raise DevelopError("deflate-compressed (floating point) DNG is not supported")
    raise DevelopError(f"compression {compression} is not supported")


def read_raw(path: Path | str) -> RawImage:
    data = Path(path).read_bytes()
    return parse_raw(data)


def parse_raw(data: bytes) -> RawImage:
    reader = _Reader(data)
    ifds = _all_ifds(reader)
    if not ifds:
        raise DevelopError("the file has no IFDs")
    ifd0 = ifds[0]
    if ifd0.one(TAG_DNG_VERSION) is None:
        raise DevelopError("not a DNG (no DNGVersion tag); convert maker RAW files with Adobe DNG Converter")
    ifd = _raw_ifd(ifds)
    width = ifd.one(TAG_WIDTH)
    height = ifd.one(TAG_HEIGHT)
    spp = ifd.one(TAG_SAMPLES, 1)
    bits = ifd.one(TAG_BITS, 1)
    compression = ifd.one(TAG_COMPRESSION, 1)
    if ifd.one(TAG_PLANAR, 1) != 1 and spp > 1:
        raise DevelopError("planar (separate plane) LinearRaw is not supported")
    if not width or not height or width * height > 400_000_000:
        raise DevelopError("raw image size is missing or implausible")
    values = array("I" if bits > 16 else "H", bytes((4 if bits > 16 else 2) * width * height * spp))
    if TAG_TILE_OFFSETS in ifd.entries:
        tw = ifd.one(TAG_TILE_WIDTH)
        tl = ifd.one(TAG_TILE_LENGTH)
        offsets = ifd.get(TAG_TILE_OFFSETS)
        sizes = ifd.get(TAG_TILE_BYTES)
        across = (width + tw - 1) // tw
        for i, (off, size) in enumerate(zip(offsets, sizes)):
            ty, tx = divmod(i, across)
            tile = _decode_chunk(data[off : off + size], compression, bits, spp, tw, tl, reader.end)
            _blit(values, width, height, spp, tile, tw, tl, tx * tw, ty * tl)
    elif TAG_STRIP_OFFSETS in ifd.entries:
        rps = ifd.one(TAG_ROWS_PER_STRIP, height)
        offsets = ifd.get(TAG_STRIP_OFFSETS)
        sizes = ifd.get(TAG_STRIP_BYTES)
        for i, (off, size) in enumerate(zip(offsets, sizes)):
            y0 = i * rps
            rows = min(rps, height - y0)
            if rows <= 0:
                break
            strip = _decode_chunk(data[off : off + size], compression, bits, spp, width, rows, reader.end)
            _blit(values, width, height, spp, strip, width, rows, 0, y0)
    else:
        raise DevelopError("raw IFD has neither strips nor tiles")
    return RawImage(width, height, spp, values, ifd, ifd0)


def _blit(dst: array, width, height, spp, src: list[int], cw, ch, x0, y0) -> None:
    w = min(cw, width - x0)
    if w <= 0:
        return
    for r in range(min(ch, height - y0)):
        s = r * cw * spp
        d = ((y0 + r) * width + x0) * spp
        dst[d : d + w * spp] = array(dst.typecode, src[s : s + w * spp])


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------

_XYZ_TO_SRGB_D65 = (
    (0.412453, 0.357580, 0.180423),
    (0.212671, 0.715160, 0.072169),
    (0.019334, 0.119193, 0.950227),
)


def _matmul(a, b):
    return tuple(
        tuple(sum(a[i][k] * b[k][j] for k in range(len(b))) for j in range(len(b[0]))) for i in range(len(a))
    )


def _inverse3(m):
    (a, b, c), (d, e, f), (g, h, i) = m
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    if abs(det) < 1e-12:
        raise DevelopError("camera colour matrix is singular")
    return (
        ((e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det),
        ((f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det),
        ((d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det),
    )


@dataclass
class DevelopSettings:
    half: bool = False
    exposure_ev: float = 0.0
    white_balance: tuple[float, float, float] | None = None  # camera multipliers; None = as shot
    use_baseline_exposure: bool = True


@dataclass
class DevelopReport:
    width: int
    height: int
    cfa: str
    white_balance: tuple[float, float, float]
    matrix: str
    black_level: float
    white_level: float
    exposure_ev: float
    clipped_fraction: float
    notes: list[str] = field(default_factory=list)


def _cfa_pattern(ifd: Ifd) -> tuple[int, int, int, int]:
    dims = ifd.get(TAG_CFA_REPEAT, (2, 2))
    pattern = ifd.get(TAG_CFA_PATTERN)
    if pattern is None:
        raise DevelopError("CFA raw has no CFAPattern")
    if tuple(dims) != (2, 2) or len(pattern) < 4:
        raise DevelopError(f"only 2x2 CFA patterns are supported (found {tuple(dims)})")
    pat = tuple(int(p) for p in pattern[:4])
    if sorted(set(pat)) != [0, 1, 2]:
        raise DevelopError(f"only three-colour (R, G, B) CFAs are supported (pattern {pat})")
    return pat  # type: ignore[return-value]


def _colour_matrix(ifd0: Ifd, ifd: Ifd, notes: list[str]):
    def tag(t):
        return ifd.get(t) or ifd0.get(t)

    cm1, cm2 = tag(TAG_COLOR_MATRIX_1), tag(TAG_COLOR_MATRIX_2)
    ill2 = (ifd.get(TAG_ILLUMINANT_2) or ifd0.get(TAG_ILLUMINANT_2) or (0,))[0]
    if cm2 and len(cm2) >= 9 and ill2 in _DAYLIGHT_ILLUMINANTS:
        chosen, name = cm2, "ColorMatrix2"
    elif cm1 and len(cm1) >= 9:
        chosen, name = cm1, "ColorMatrix1"
    elif cm2 and len(cm2) >= 9:
        chosen, name = cm2, "ColorMatrix2"
    else:
        notes.append("no ColorMatrix: camera RGB treated as sRGB (colours will be off)")
        return ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)), "identity"
    if len(chosen) != 9:
        raise DevelopError("colour matrix is not 3x3 (four-colour cameras are not supported)")
    cam_xyz = tuple(tuple(float(chosen[3 * r + c]) for c in range(3)) for r in range(3))
    cam_rgb = _matmul(cam_xyz, _XYZ_TO_SRGB_D65)
    normalised = []
    for row in cam_rgb:
        s = sum(row)
        if abs(s) < 1e-9:
            raise DevelopError("camera colour matrix row sums to zero")
        normalised.append(tuple(v / s for v in row))
    return _inverse3(tuple(normalised)), name


def _levels(raw: RawImage, top: int, left: int, h: int, w: int, colours: int):
    """Per-pixel black and per-sample white for the active area."""

    ifd, ifd0 = raw.ifd, raw.ifd0
    lin = ifd.get(TAG_LINEARIZATION) or ifd0.get(TAG_LINEARIZATION)
    rep = ifd.get(TAG_BLACK_REPEAT, (1, 1))
    rr, rc = int(rep[0]) or 1, int(rep[1]) or 1
    bl = ifd.get(TAG_BLACK_LEVEL, (0,))
    spp = raw.samples_per_pixel
    black = [[[0.0] * spp for _ in range(rc)] for _ in range(rr)]
    for r in range(rr):
        for c in range(rc):
            for s in range(spp):
                k = (r * rc + c) * spp + s
                black[r][c][s] = float(bl[k] if k < len(bl) else bl[-1])
    dh = ifd.get(TAG_BLACK_DELTA_H) or ()
    dv = ifd.get(TAG_BLACK_DELTA_V) or ()
    wl = ifd.get(TAG_WHITE_LEVEL)
    bits = ifd.one(TAG_BITS, 16)
    if wl:
        white = [float(wl[s] if s < len(wl) else wl[-1]) for s in range(spp)]
    else:
        white = [float((1 << bits) - 1)] * spp
    return lin, black, list(dh), list(dv), white, rr, rc


def _srgb_curve(v: float) -> float:
    if v <= 0.0031308:
        return 12.92 * v if v > 0 else 0.0
    return 1.055 * v ** (1 / 2.4) - 0.055


def develop(raw: RawImage, settings: DevelopSettings | None = None) -> tuple[int, int, array, DevelopReport]:
    """Render ``raw`` to linear-light-free sRGB, 16 bits per channel.

    Returns ``(width, height, rgb16, report)`` with ``rgb16`` an ``array('H')``
    of ``width * height * 3`` values, already rotated by the orientation tag.
    """

    settings = settings or DevelopSettings()
    ifd, ifd0 = raw.ifd, raw.ifd0
    notes: list[str] = []
    photometric = ifd.one(TAG_PHOTOMETRIC)
    linear_raw = photometric == PHOTOMETRIC_LINEAR_RAW
    if linear_raw and raw.samples_per_pixel != 3:
        raise DevelopError("LinearRaw with other than three samples per pixel is not supported")
    if not linear_raw and raw.samples_per_pixel != 1:
        raise DevelopError("CFA raw with more than one sample per pixel is not supported")
    active = ifd.get(TAG_ACTIVE_AREA)
    if active and len(active) == 4:
        top, left, bottom, right = (int(v) for v in active)
    else:
        top, left, bottom, right = 0, 0, raw.height, raw.width
    if not (0 <= top < bottom <= raw.height and 0 <= left < right <= raw.width):
        raise DevelopError("ActiveArea lies outside the raw image")
    h, w = bottom - top, right - left
    lin, black, dh, dv, white, rr, rc = _levels(raw, top, left, h, w, 3)

    neutral = ifd.get(TAG_AS_SHOT_NEUTRAL) or ifd0.get(TAG_AS_SHOT_NEUTRAL)
    if settings.white_balance is not None:
        wb = tuple(float(v) for v in settings.white_balance)
    elif neutral and len(neutral) >= 3 and min(neutral[:3]) > 0:
        inv = [1.0 / float(n) for n in neutral[:3]]
        lo = min(inv)
        wb = tuple(v / lo for v in inv)
    else:
        wb = (1.0, 1.0, 1.0)
        if ifd.get(TAG_AS_SHOT_WHITE_XY) or ifd0.get(TAG_AS_SHOT_WHITE_XY):
            notes.append("AsShotWhiteXY is not used; rendered without white balance")
        else:
            notes.append("no AsShotNeutral; rendered without white balance")
    rgb_cam, matrix_name = _colour_matrix(ifd0, ifd, notes)
    ev = settings.exposure_ev
    if settings.use_baseline_exposure:
        base = ifd0.get(TAG_BASELINE_EXPOSURE) or ifd.get(TAG_BASELINE_EXPOSURE)
        if base:
            ev += float(base[0])
    gain = 2.0**ev

    spp = raw.samples_per_pixel
    vals = raw.values
    rw = raw.width
    # Normalised 0..1 sample for active-area pixel (y, x), sample s.
    # Each CFA position's black is subtracted and its own span to white scaled
    # to 1, so per-channel blacks do not tint the picture.
    span = [
        [[1.0 / max(white[s] - black[r][c][s], 1e-9) for s in range(spp)] for c in range(rc)]
        for r in range(rr)
    ]
    scale = span[0][0]

    # Each sensel is clamped before demosaicing, as LibRaw and dcraw do: at 0
    # after black subtraction, and at the level where, white-balanced, it
    # reaches the weakest channel's clip (so blown highlights stay neutral).
    lo_wb = min(wb)
    clipped = 0  # sensels at or over their clip level
    pat = None if linear_raw else _cfa_pattern(ifd)
    if pat is None:
        caplines = [[lo_wb / wb[s % 3] for s in range(w * spp)]] * 2
    else:
        caplines = [[lo_wb / wb[pat[py * 2 + (x % 2)]] for x in range(w)] for py in (0, 1)]

    def norm_row(y: int) -> list[float]:
        start = ((top + y) * rw + left) * spp
        row: list[int] | array = vals[start : start + w * spp]
        if lin:
            n = len(lin)
            row = [lin[v] if v < n else lin[-1] for v in row]
        b = black[y % rr]
        sp = span[y % rr]
        dvy = float(dv[y]) if y < len(dv) else 0.0
        caps = caplines[y % 2]
        if spp == 1 and rc == 1 and not dh:
            off = b[0][0] + dvy
            sc = scale[0]
            out = [(v - off) * sc for v in row]
        else:
            out = [0.0] * (w * spp)
            for x in range(w):
                dhx = float(dh[x]) if x < len(dh) else 0.0
                bx = b[x % rc]
                sx = sp[x % rc]
                for s in range(spp):
                    out[x * spp + s] = (row[x * spp + s] - bx[s] - dvy - dhx) * sx[s]
        nonlocal clipped
        clipped += sum(1 for v, c in zip(out, caps) if v >= c)
        return [0.0 if v < 0.0 else (c if v > c else v) for v, c in zip(out, caps)]

    m = rgb_cam
    wbr, wbg, wbb = (wb[0] * gain, wb[1] * gain, wb[2] * gain)
    clip_r, clip_g, clip_b = gain * wb[0], gain * wb[1], gain * wb[2]
    # Highlight clip: a sensel at white level, white-balanced, is clipped to the
    # smallest channel's white so blown highlights render neutral.
    hi = min(clip_r, clip_g, clip_b)
    lut_size = 4096
    curve = [round(_srgb_curve(i / (lut_size - 1)) * 65535) for i in range(lut_size)]

    def encode(r: float, g: float, b: float, out: array) -> None:
        r = hi if r > hi else (0.0 if r < 0 else r)
        g = hi if g > hi else (0.0 if g < 0 else g)
        b = hi if b > hi else (0.0 if b < 0 else b)
        x = m[0][0] * r + m[0][1] * g + m[0][2] * b
        yv = m[1][0] * r + m[1][1] * g + m[1][2] * b
        z = m[2][0] * r + m[2][1] * g + m[2][2] * b
        for v in (x, yv, z):
            if v <= 0:
                out.append(0)
            elif v >= 1:
                out.append(65535)
            else:
                out.append(curve[int(v * (lut_size - 1) + 0.5)])

    out = array("H")
    if linear_raw:
        cfa_name = "LinearRaw"
        for y in range(h):
            row = norm_row(y)
            for x in range(w):
                encode(row[3 * x] * wbr, row[3 * x + 1] * wbg, row[3 * x + 2] * wbb, out)
        ow, oh = w, h
    else:
        assert pat is not None
        cfa_name = "".join("RGB"[c] for c in pat)
        # Pattern phase is relative to the active area (DNG spec, ActiveArea).
        mults = (wbr, wbg, wbb)
        if settings.half:
            ow, oh = w // 2, h // 2
            for by in range(oh):
                r0 = norm_row(2 * by)
                r1 = norm_row(2 * by + 1)
                for bx in range(ow):
                    acc = [0.0, 0.0, 0.0]
                    cnt = [0, 0, 0]
                    for dy, row in ((0, r0), (1, r1)):
                        for dx in (0, 1):
                            c = pat[dy * 2 + dx]
                            acc[c] += row[2 * bx + dx]
                            cnt[c] += 1
                    encode(
                        acc[0] / cnt[0] * mults[0],
                        acc[1] / cnt[1] * mults[1],
                        acc[2] / cnt[2] * mults[2],
                        out,
                    )
        else:
            ow, oh = w, h
            _bilinear(norm_row, w, h, pat, mults, encode, out)

    report_w, report_h = ow, oh
    # Default crop (relative to the active area), in output pixels.
    origin = ifd.get(TAG_CROP_ORIGIN)
    size = ifd.get(TAG_CROP_SIZE)
    if origin and size and len(origin) == 2 and len(size) == 2:
        f = 0.5 if (settings.half and not linear_raw) else 1.0
        cx, cy = int(round(float(origin[0]) * f)), int(round(float(origin[1]) * f))
        cw, ch = int(round(float(size[0]) * f)), int(round(float(size[1]) * f))
        if 0 <= cx and 0 <= cy and cw > 0 and ch > 0 and cx + cw <= ow and cy + ch <= oh:
            if (cx, cy, cw, ch) != (0, 0, ow, oh):
                out = _crop(out, ow, cx, cy, cw, ch)
                report_w, report_h = cw, ch
        else:
            notes.append("DefaultCrop lies outside the image and was ignored")
    orientation = ifd0.one(TAG_ORIENTATION, 1)
    out, report_w, report_h = _orient(out, report_w, report_h, orientation)
    total = max(1, w * h * spp)
    report = DevelopReport(
        width=report_w,
        height=report_h,
        cfa=cfa_name,
        white_balance=tuple(round(v, 4) for v in wb),  # type: ignore[arg-type]
        matrix=matrix_name,
        black_level=round(black[0][0][0], 3),
        white_level=white[0],
        exposure_ev=round(ev, 3),
        clipped_fraction=round(clipped / total, 6),
        notes=notes,
    )
    return report_w, report_h, out, report


def _bilinear(norm_row, w, h, pat, mults, encode, out) -> None:
    """Bilinear demosaic, three rows in memory at a time."""

    # For each phase (row parity, column parity) and colour, the 3x3 offsets
    # holding that colour.
    offsets: dict[tuple[int, int, int], list[tuple[int, int]]] = {}
    for py in (0, 1):
        for px in (0, 1):
            for colour in (0, 1, 2):
                offsets[(py, px, colour)] = [
                    (dy, dx)
                    for dy in (-1, 0, 1)
                    for dx in (-1, 0, 1)
                    if pat[((py + dy) % 2) * 2 + (px + dx) % 2] == colour
                ]
    rows = {0: norm_row(0)}
    if h > 1:
        rows[1] = norm_row(1)
    for y in range(h):
        if y + 1 < h and (y + 1) not in rows:
            rows[y + 1] = norm_row(y + 1)
        rows.pop(y - 2, None)
        py = y % 2
        for x in range(w):
            px = x % 2
            own = pat[py * 2 + px]
            rgb = [0.0, 0.0, 0.0]
            for colour in (0, 1, 2):
                if colour == own:
                    rgb[colour] = rows[y][x]
                    continue
                total = 0.0
                n = 0
                for dy, dx in offsets[(py, px, colour)]:
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w:
                        total += rows[yy][xx]
                        n += 1
                if n == 0:  # a 1-pixel-wide image edge: borrow the reflected neighbour
                    for dy, dx in offsets[(py, px, colour)]:
                        yy, xx = min(max(y - dy, 0), h - 1), min(max(x - dx, 0), w - 1)
                        total += rows.get(yy, rows[y])[xx]
                        n += 1
                rgb[colour] = total / n if n else 0.0
            encode(rgb[0] * mults[0], rgb[1] * mults[1], rgb[2] * mults[2], out)


def _crop(pixels: array, width: int, cx: int, cy: int, cw: int, ch: int) -> array:
    out = array("H")
    for y in range(cy, cy + ch):
        s = (y * width + cx) * 3
        out.extend(pixels[s : s + cw * 3])
    return out


def _orient(pixels: array, w: int, h: int, orientation: int) -> tuple[array, int, int]:
    if orientation in (1, 0) or orientation not in range(2, 9):
        return pixels, w, h
    swap = orientation in (5, 6, 7, 8)
    nw, nh = (h, w) if swap else (w, h)
    out = array("H", bytes(2 * 3 * w * h))
    for y in range(h):
        for x in range(w):
            if orientation == 2:
                tx, ty = w - 1 - x, y
            elif orientation == 3:
                tx, ty = w - 1 - x, h - 1 - y
            elif orientation == 4:
                tx, ty = x, h - 1 - y
            elif orientation == 5:
                tx, ty = y, x
            elif orientation == 6:  # rotate 90 clockwise
                tx, ty = h - 1 - y, x
            elif orientation == 7:
                tx, ty = h - 1 - y, w - 1 - x
            else:  # 8: rotate 90 counter-clockwise
                tx, ty = y, w - 1 - x
            s = (y * w + x) * 3
            d = (ty * nw + tx) * 3
            out[d : d + 3] = pixels[s : s + 3]
    return out, nw, nh


# --------------------------------------------------------------------------
# Writing masters
# --------------------------------------------------------------------------


def write_tiff16(path: Path, width: int, height: int, rgb16: array) -> None:
    """Uncompressed little-endian 16-bit RGB TIFF, one strip."""

    pixels = array("H", rgb16)
    if pixels.itemsize != 2:
        raise DevelopError("internal: 16-bit samples expected")
    import sys

    if sys.byteorder != "little":
        pixels.byteswap()
    body = pixels.tobytes()
    entries = []
    n_entries = 11
    ifd_offset = 8
    extra = ifd_offset + 2 + n_entries * 12 + 4
    bits_offset = extra
    data_offset = bits_offset + 6

    def entry(tag, typ, count, value):
        return struct.pack("<HHII", tag, typ, count, value)

    entries = [
        entry(256, 4, 1, width),
        entry(257, 4, 1, height),
        entry(258, 3, 3, bits_offset),
        entry(259, 3, 1, 1),
        entry(262, 3, 1, 2),
        entry(273, 4, 1, data_offset),
        entry(274, 3, 1, 1),
        entry(277, 3, 1, 3),
        entry(278, 4, 1, height),
        entry(279, 4, 1, len(body)),
        entry(284, 3, 1, 1),
    ]
    header = b"II" + struct.pack("<HI", 42, ifd_offset)
    ifd = struct.pack("<H", n_entries) + b"".join(entries) + struct.pack("<I", 0)
    Path(path).write_bytes(header + ifd + struct.pack("<HHH", 16, 16, 16) + body)


def write_png(path: Path, width: int, height: int, rgb16: array, bits: int = 8) -> None:
    if bits not in (8, 16):
        raise DevelopError("PNG bit depth must be 8 or 16")
    raw = bytearray()
    stride = width * 3
    for y in range(height):
        raw.append(0)
        row = rgb16[y * stride : (y + 1) * stride]
        if bits == 16:
            raw += struct.pack(">" + "H" * stride, *row)
        else:
            raw += bytes((v * 255 + 32767) // 65535 for v in row)

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload))
        )

    ihdr = struct.pack(">IIBBBBB", width, height, bits, 2, 0, 0, 0)
    # sRGB chunk: rendering intent perceptual, so viewers do not re-guess.
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"sRGB", b"\x00")
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 6)) + chunk(b"IEND", b"")
    Path(path).write_bytes(png)


def develop_file(
    source: Path | str, destination: Path | str, settings: DevelopSettings | None = None, png_bits: int = 8
) -> DevelopReport:
    """Develop ``source`` (a DNG) to ``destination`` (.tif/.tiff or .png)."""

    source, destination = Path(source), Path(destination)
    suffix = destination.suffix.lower()
    if suffix not in (".tif", ".tiff", ".png"):
        raise DevelopError("output must end in .tif, .tiff or .png")
    if destination.exists():
        raise DevelopError(f"{destination} exists; masters are never overwritten")
    raw = read_raw(source)
    width, height, pixels, report = develop(raw, settings)
    destination.parent.mkdir(parents=True, exist_ok=True)
    tmp = destination.with_name(destination.name + ".part")
    if suffix == ".png":
        write_png(tmp, width, height, pixels, png_bits)
    else:
        write_tiff16(tmp, width, height, pixels)
    tmp.replace(destination)
    return report


def still_for_review(source: Path | str, scratch: Path | str) -> Path | None:
    """A decodable picture of a RAW still for proxies and analysis.

    The camera's embedded JPEG preview when there is one (fast, and what the
    camera showed); otherwise, for a DNG, a half-size development of its sensor
    data written into ``scratch``. ``None`` when neither exists (a non-DNG RAW
    with no preview). Raises ``DevelopError`` when a preview-less DNG cannot be
    developed.
    """

    from shootflow.raw_preview import extract_preview, is_dng_path

    source, scratch = Path(source), Path(scratch)
    preview = extract_preview(source)
    if preview is not None:
        jpeg = scratch / "preview.jpg"
        jpeg.write_bytes(preview)
        return jpeg
    if not is_dng_path(source):
        return None
    developed = scratch / "developed-half.tif"
    develop_file(source, developed, DevelopSettings(half=True))
    return developed


def srgb_to_linear(v: float) -> float:
    """Inverse of the sRGB curve, for tests and callers measuring output."""

    if v <= 0.04045:
        return v / 12.92
    return ((v + 0.055) / 1.055) ** 2.4


__all__ = [
    "DevelopError",
    "DevelopReport",
    "DevelopSettings",
    "RawImage",
    "decode_lossless_jpeg",
    "develop",
    "develop_file",
    "parse_raw",
    "read_raw",
    "srgb_to_linear",
    "still_for_review",
    "write_png",
    "write_tiff16",
]
