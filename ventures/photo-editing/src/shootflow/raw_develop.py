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
* Colour (default ``colour="dng"``, since 2026-11-12): the DNG
  specification's model in ``dng_colour``: the as-shot white found from
  ``AsShotNeutral`` (or ``AsShotWhiteXY``), ``ColorMatrix``,
  ``CameraCalibration`` and ``ForwardMatrix`` interpolated in mired between
  the two calibration illuminants, ``AnalogBalance``, then XYZ D50 to sRGB
  through Bradford. ``colour="dcraw"`` keeps the earlier method: the matrix
  nearest D65 (``ColorMatrix2`` when its ``CalibrationIlluminant2`` is D65 or
  daylight, else ``ColorMatrix1``) through sRGB primaries with each row
  normalised and white balance in camera space, which is what dcraw and
  LibRaw do. The profile hue/sat and look tables are ignored either way.
* Demosaic: bilinear (each missing colour is the mean of the same-colour
  sensels in the 3x3 neighbourhood) at full size, or ``half`` (each 2x2 block
  becomes one pixel, no interpolation, a quarter of the pixels).
* Clamping in LibRaw's order: each sensel at 0 after black subtraction and at
  its white-balanced clip level before demosaicing (so blown areas go white,
  not magenta, and shadow noise is not averaged below black).
* Tone: linear exposure, then the sRGB transfer curve. No
  look, no curve: that is the grade's job.

Pure Python, so speed is the trade: see ``README.md`` for measured times.
With numpy installed, ``develop`` hands the per-pixel work to
``raw_develop_np`` (about 20 times faster, byte-identical output);
``DevelopSettings(engine="python")`` keeps this module's own loops.
"""

from __future__ import annotations

import re
import struct
import sys
import zlib
from array import array
from dataclasses import dataclass, field
from itertools import accumulate
from operator import add
from pathlib import Path

from shootflow import dng_colour as dc

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
TAG_CAMERA_CALIBRATION_1 = 50723
TAG_CAMERA_CALIBRATION_2 = 50724
TAG_ANALOG_BALANCE = 50727
TAG_AS_SHOT_NEUTRAL = 50728
TAG_AS_SHOT_WHITE_XY = 50729
TAG_BASELINE_EXPOSURE = 50730
TAG_ILLUMINANT_1 = 50778
TAG_ILLUMINANT_2 = 50779
TAG_ACTIVE_AREA = 50829
TAG_CAMERA_CALIBRATION_SIGNATURE = 50931
TAG_PROFILE_CALIBRATION_SIGNATURE = 50932
TAG_FORWARD_MATRIX_1 = 50964
TAG_FORWARD_MATRIX_2 = 50965
TAG_UNIQUE_CAMERA_MODEL = 50708
TAG_PROFILE_NAME = 50936
TAG_HUE_SAT_MAP_DIMS = 50937
TAG_HUE_SAT_MAP_DATA_1 = 50938
TAG_HUE_SAT_MAP_DATA_2 = 50939
TAG_PROFILE_TONE_CURVE = 50940
TAG_LOOK_TABLE_DIMS = 50981
TAG_LOOK_TABLE_DATA = 50982
TAG_HUE_SAT_MAP_ENCODING = 51107
TAG_LOOK_TABLE_ENCODING = 51108
TAG_BASELINE_EXPOSURE_OFFSET = 51109
# A .dcp camera profile is a TIFF-structured file with "RC" in place of 42.
DCP_MAGIC = 0x4352

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
        if magic not in (42, DCP_MAGIC):
            raise DevelopError(f"not a classic TIFF/DNG file (magic {magic})")
        self.magic = magic

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

    w, h, nf, samples = _decode_lossless_jpeg(data)
    if not isinstance(samples, list):
        samples = samples.tolist()
    return w, h, nf, samples


def _decode_lossless_jpeg(data: bytes):
    """``decode_lossless_jpeg``, but the samples may come back as an ``array('H')``."""

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
    """Decode a non-subsampled lossless scan in two passes.

    First every Huffman-coded difference is read (``_scan_diffs``), then the
    predictor turns differences into samples (``_predict_scan``). Splitting
    the two lets each pass run at C speed where it can: the bit reader works
    on de-stuffed 32-bit words through a 12-bit table that decodes the code
    and its extra bits in one look-up, and predictors 1 and 2 become a running
    sum or an element-wise add per row. The output is the same sample for
    sample as ``_decode_scan_reference`` (the original one-pass decoder, kept
    for the tests and for unusual layouts).
    """

    if not 1 <= predictor <= 7:
        raise DevelopError(f"lossless JPEG predictor {predictor} is not 1-7")
    nf = len(tables)
    diffs = _scan_diffs(data, pos, width * height, tables, restart)
    initial = 1 << (precision - pt - 1)
    if predictor in (1, 2) and (not restart or restart % width == 0):
        np_predict = _numpy_predict_rows()
        if np_predict is not None and width * height >= _NP_PREDICT_MIN:
            out = np_predict(diffs, width, height, nf, predictor, initial, restart)
        else:
            out = _predict_rows(diffs, width, height, nf, predictor, initial, restart)
    else:
        out = _predict_scan(diffs, width, height, nf, predictor, initial, restart)
    if pt:
        out = [v << pt for v in out]
    return out


# Below about this many pixels the numpy prediction pass costs more in setup
# than it saves; tests set it to 0 to run the numpy path on small cases.
_NP_PREDICT_MIN = 1024
# "auto" uses numpy for the prediction pass when it is importable; "python"
# keeps the pure path (the reference); "numpy" requires it. Same samples.
DECODE_ENGINE = "auto"


def _numpy_predict_rows():
    if DECODE_ENGINE == "python":
        return None
    try:
        from shootflow.raw_develop_np import predict_rows
    except ImportError:
        if DECODE_ENGINE == "numpy":
            raise DevelopError("decode engine 'numpy' needs numpy") from None
        return None
    return predict_rows


_LUT_BITS = 12
_LUT_OFFSET = 1 << 17
_LUT_CACHE: dict[tuple, list[int]] = {}


def _combined_lookup(table: dict[tuple[int, int], int]) -> list[int]:
    """A ``_LUT_BITS``-bit table over the next bits of the stream.

    An entry ``e > 0`` is a whole difference: ``e & 31`` bits (code plus extra
    bits) and the value ``(e >> 5) - _LUT_OFFSET``. ``e < 0`` is a code whose
    extra bits do not fit: ``-e - 1`` packs the code length (low 5 bits) and
    the size category. ``0`` is a code longer than the table.
    """

    key = tuple(sorted(table.items()))
    cached = _LUT_CACHE.get(key)
    if cached is not None:
        return cached
    lb = _LUT_BITS
    lut = [0] * (1 << lb)
    for (length, code), s in table.items():
        if length > lb:
            continue
        free = lb - length
        start = code << free
        if s == 16 or length + s > lb:
            entry = -(((s << 5) | length) + 1)
            lut[start : start + (1 << free)] = [entry] * (1 << free)
            continue
        if s == 0:
            lut[start : start + (1 << free)] = [(_LUT_OFFSET << 5) | length] * (1 << free)
            continue
        rest = free - s
        half = 1 << (s - 1)
        span = (1 << s) - 1
        for v in range(1 << s):
            diff = v if v >= half else v - span
            entry = ((diff + _LUT_OFFSET) << 5) | (length + s)
            at = start + (v << rest)
            lut[at : at + (1 << rest)] = [entry] * (1 << rest)
    if len(_LUT_CACHE) > 256:
        _LUT_CACHE.clear()
    _LUT_CACHE[key] = lut
    return lut


_MARKER = re.compile(rb"\xff[\x01-\xff]")
_RESTART_MARKER = re.compile(rb"\xff[\xd0-\xd7]")


def _segment_words(data: bytes, pos: int) -> tuple[list[int], int]:
    """The entropy-coded bytes from ``pos`` to the next marker, as 32-bit words.

    Stuffed ``FF 00`` pairs become ``FF``; past the marker the stream reads as
    zeros, as ``_Bits`` does. Returns the words and where the marker starts.
    """

    m = _MARKER.search(data, pos)
    stop = m.start() if m else len(data)
    seg = data[pos:stop].replace(b"\xff\x00", b"\xff")
    seg += b"\0" * (-len(seg) % 4)
    words = array("I")
    if words.itemsize != 4:  # pragma: no cover - every CPython platform has a 4-byte 'I'
        words = array("L")
    words.frombytes(seg)
    if sys.byteorder == "little":
        words.byteswap()
    return words.tolist(), stop


def _scan_diffs(data, pos, mcus_total, tables, restart) -> list[int]:
    luts = [(_combined_lookup(t), t) for t in tables]
    out: list[int] = []
    if not restart:
        words, _ = _segment_words(data, pos)
        _huffman_run(words, mcus_total, luts, out)
        return out
    done = 0
    while done < mcus_total:
        if done:
            m = _RESTART_MARKER.search(data, pos)
            pos = m.end() if m else len(data)
        words, pos = _segment_words(data, pos)
        n = min(restart, mcus_total - done)
        _huffman_run(words, n, luts, out)
        done += n
    return out


def _huffman_run(words: list[int], mcus: int, luts, out: list[int]) -> None:
    """Append ``mcus`` MCUs of differences (one per component) to ``out``."""

    app = out.append
    nwords = len(words)
    lb = _LUT_BITS
    lbm = (1 << lb) - 1
    off = _LUT_OFFSET
    acc = 0
    nbits = 0
    wi = 0
    for _ in range(mcus):
        for lut, table in luts:
            if nbits < 32:
                acc = ((acc & ((1 << nbits) - 1)) << 32) | (words[wi] if wi < nwords else 0)
                wi += 1
                nbits += 32
            e = lut[(acc >> (nbits - lb)) & lbm]
            if e > 0:
                nbits -= e & 31
                app((e >> 5) - off)
                continue
            if e < 0:
                e = -e - 1
                nbits -= e & 31
                s = e >> 5
            else:
                code = 0
                s = -1
                for length in range(1, 17):
                    code = (code << 1) | ((acc >> (nbits - length)) & 1)
                    got = table.get((length, code))
                    if got is not None:
                        s = got
                        break
                if s < 0:
                    raise DevelopError("invalid Huffman code in lossless JPEG data")
                nbits -= length
            if s == 0:
                app(0)
            elif s == 16:
                app(32768)
            else:
                nbits -= s
                v = (acc >> nbits) & ((1 << s) - 1)
                if v < (1 << (s - 1)):
                    v -= (1 << s) - 1
                app(v)


def _predict_rows(diffs, width, height, nf, predictor, initial, restart) -> list[int]:
    """Predictors 1 (left) and 2 (above), restart intervals on row boundaries.

    Predictor 1 runs as one running sum per component over the whole image:
    the first difference of each row is rewritten so the sum restarts from
    the sample above (or from ``initial`` on a fresh row) instead of carrying
    on from the previous row's last sample. Sums are taken modulo 2**16 at the
    end, which is the same as masking every step because the predictor only
    adds.
    """

    mask = 0xFFFF
    row_len = width * nf
    out = [0] * (row_len * height)
    fresh_rows = [y == 0 or bool(restart and (y * width) % restart == 0) for y in range(height)]
    if predictor == 1:
        for c in range(nf):
            comp = diffs[c::nf]
            col0 = 0
            total = 0  # running sum so far = previous row's last sample
            for y in range(height):
                at = y * width
                first = comp[at]
                col0 = (initial if fresh_rows[y] else col0) + first
                comp[at] = col0 - total
                total = col0 + sum(comp[at + 1 : at + width]) if width > 1 else col0
            out[c::nf] = list(accumulate(comp))
    else:
        prev: list[int] = []
        for y in range(height):
            base = y * row_len
            row = diffs[base : base + row_len]
            if fresh_rows[y]:
                for c in range(nf):
                    seq = row[c::nf]
                    seq[0] += initial
                    row[c::nf] = list(accumulate(seq))
            else:
                row = list(map(add, prev, row))
            out[base : base + row_len] = row
            prev = row
    if out and (min(out) < 0 or max(out) > mask):
        out = [v & mask for v in out]
    return out


def _predict_scan(diffs, width, height, nf, predictor, initial, restart) -> list[int]:
    """Any predictor, any restart interval: one sample at a time."""

    mask = 0xFFFF
    out = [0] * (width * height * nf)
    row_len = width * nf
    mcu = 0
    k = 0
    first_line = 0
    for y in range(height):
        base = y * row_len
        for x in range(width):
            fresh = mcu == 0
            if restart and mcu and mcu % restart == 0:
                fresh = True
                first_line = y
            mcu += 1
            at = base + x * nf
            for c in range(nf):
                diff = diffs[k]
                k += 1
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
    return out


def _decode_scan_reference(data, pos, width, height, tables, predictor, precision, pt, restart):
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
        w, h, nf, samples = _decode_lossless_jpeg(chunk)
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
    # "auto": the numpy engine when numpy is importable, else pure Python;
    # "python" or "numpy" to choose. Both give the same bytes (raw_develop_np).
    engine: str = "auto"
    # "dng": the DNG specification's colour model (dng_colour); "dcraw": one
    # matrix nearest D65 and camera-space white balance, as dcraw and LibRaw.
    colour: str = "dng"
    # A .dcp camera profile (Adobe, dcamprof, RawTherapee) used in place of
    # the DNG's own profile tags; read with ``read_dcp``. dng colour only.
    dcp: Ifd | None = None
    # Apply the profile's ProfileHueSatMap and ProfileLookTable (dng colour).
    profile_tables: bool = True
    # Apply the profile's ProfileToneCurve (with profile_tables on); off keeps
    # the plain sRGB curve.
    tone_curve: bool = True


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
    engine: str = "python"
    colour: str = "dcraw"
    white_xy: tuple[float, float] | None = None  # as-shot white chromaticity (dng colour)
    cct: float | None = None  # its correlated colour temperature, kelvin
    profile: str | None = None  # "<name>: <tables applied>" when a profile's tables were used


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


_SRGB_WHITE_XY = dc.xyz_to_xy(dc.apply(_XYZ_TO_SRGB_D65, (1.0, 1.0, 1.0)))
# XYZ (D50 white) to linear sRGB (D65 white): Bradford, then the sRGB primaries.
_XYZ_D50_TO_SRGB = dc.matmul(_inverse3(_XYZ_TO_SRGB_D65), dc.bradford(dc.D50_XY, _SRGB_WHITE_XY))


def read_dcp(path: Path | str) -> Ifd:
    """A ``.dcp`` camera profile's tags (one IFD, TIFF layout, "RC" magic)."""

    data = Path(path).read_bytes()
    reader = _Reader(data)
    if reader.magic != DCP_MAGIC:
        raise DevelopError(f"{path}: not a DCP camera profile (expected IIRC or MMCR)")
    ifd, _ = reader.read_ifd(reader.first_ifd_offset())
    if ifd.get(TAG_COLOR_MATRIX_1) is None:
        raise DevelopError(f"{path}: the profile has no ColorMatrix1")
    return ifd


def _text(values) -> str:
    return bytes(values or b"").split(b"\0", 1)[0].decode("latin-1").strip()


def _tables(tag, notes: list[str]):
    """(HueSatMap1, HueSatMap2, LookTable) from the profile tags; a bad table is skipped with a note."""

    out: list[dc.HueSatTable | None] = []
    for dims_tag, data_tag, enc_tag, label in (
        (TAG_HUE_SAT_MAP_DIMS, TAG_HUE_SAT_MAP_DATA_1, TAG_HUE_SAT_MAP_ENCODING, "ProfileHueSatMapData1"),
        (TAG_HUE_SAT_MAP_DIMS, TAG_HUE_SAT_MAP_DATA_2, TAG_HUE_SAT_MAP_ENCODING, "ProfileHueSatMapData2"),
        (TAG_LOOK_TABLE_DIMS, TAG_LOOK_TABLE_DATA, TAG_LOOK_TABLE_ENCODING, "ProfileLookTableData"),
    ):
        data = tag(data_tag)
        if data is None:
            out.append(None)
            continue
        try:
            out.append(dc.HueSatTable.from_tags(tag(dims_tag), data, (tag(enc_tag) or (0,))[0]))
        except dc.ColourError as exc:
            notes.append(f"{label} ignored: {exc}")
            out.append(None)
    return out


def _profile(ifd0: Ifd, ifd: Ifd, dcp: Ifd | None = None, notes: list[str] | None = None) -> dc.Profile | None:
    """The file's colour tags (raw IFD first, then IFD0); None without a ColorMatrix.

    With ``dcp``, the profile's own tags (matrices, illuminants, tables,
    ProfileCalibrationSignature) come from that camera profile instead, while
    the camera's tags (AnalogBalance, CameraCalibration and its signature)
    still come from the DNG, as the specification's external-profile rule says.
    """

    notes = notes if notes is not None else []

    def camera_tag(t):
        return ifd.get(t) or ifd0.get(t)

    def tag(t):
        if dcp is not None and t not in (
            TAG_CAMERA_CALIBRATION_1, TAG_CAMERA_CALIBRATION_2, TAG_CAMERA_CALIBRATION_SIGNATURE, TAG_ANALOG_BALANCE
        ):
            return dcp.get(t)
        return camera_tag(t)

    try:
        cm1, cm2 = dc.as_matrix(tag(TAG_COLOR_MATRIX_1)), dc.as_matrix(tag(TAG_COLOR_MATRIX_2))
        if cm1 is None and cm2 is None:
            return None
        if cm1 is None:
            cm1, cm2, ill1, ill2 = cm2, None, (tag(TAG_ILLUMINANT_2) or (0,))[0], 0
            cc1, cc2 = dc.as_matrix(tag(TAG_CAMERA_CALIBRATION_2)), None
            fm1, fm2 = dc.as_matrix(tag(TAG_FORWARD_MATRIX_2)), None
        else:
            ill1, ill2 = (tag(TAG_ILLUMINANT_1) or (0,))[0], (tag(TAG_ILLUMINANT_2) or (0,))[0]
            cc1, cc2 = dc.as_matrix(tag(TAG_CAMERA_CALIBRATION_1)), dc.as_matrix(tag(TAG_CAMERA_CALIBRATION_2))
            fm1, fm2 = dc.as_matrix(tag(TAG_FORWARD_MATRIX_1)), dc.as_matrix(tag(TAG_FORWARD_MATRIX_2))
    except dc.ColourError as exc:
        raise DevelopError(str(exc)) from None
    ab = tag(TAG_ANALOG_BALANCE)
    sig_cam = bytes(tag(TAG_CAMERA_CALIBRATION_SIGNATURE) or b"").rstrip(b"\0")
    sig_prof = bytes(tag(TAG_PROFILE_CALIBRATION_SIGNATURE) or b"").rstrip(b"\0")
    if dcp is not None:
        want, have = _text(dcp.get(TAG_UNIQUE_CAMERA_MODEL)), _text(camera_tag(TAG_UNIQUE_CAMERA_MODEL))
        if want and have and want != have:
            notes.append(f"camera profile is for {want!r}, the file is from {have!r}")
    hsm1, hsm2, look = _tables(tag, notes)
    if hsm1 is not None and hsm2 is not None and hsm1.dims != hsm2.dims:
        notes.append("ProfileHueSatMapData2 ignored: its shape differs from ProfileHueSatMapData1")
        hsm2 = None
    if hsm1 is None and hsm2 is not None:
        hsm1, hsm2 = hsm2, None
    return dc.Profile(
        color_matrix_1=cm1,
        color_matrix_2=cm2,
        illuminant_1=int(ill1),
        illuminant_2=int(ill2),
        camera_calibration_1=cc1,
        camera_calibration_2=cc2,
        forward_matrix_1=fm1,
        forward_matrix_2=fm2,
        analog_balance=(float(ab[0]), float(ab[1]), float(ab[2])) if ab and len(ab) >= 3 and min(ab[:3]) > 0 else (1.0, 1.0, 1.0),
        use_calibration=sig_cam == sig_prof,
        hue_sat_map_1=hsm1,
        hue_sat_map_2=hsm2,
        look_table=look,
    )


def _dng_colour(profile: dc.Profile, neutral_hat, white_xy, notes: list[str]):
    """Matrix from white-balanced camera RGB to linear sRGB, by the DNG model.

    ``neutral_hat`` is the camera neutral scaled to a largest value of 1; the
    developer multiplies sensels by ``1 / neutral_hat`` before this matrix, so
    the matrix takes back that scaling: ``sRGB = XYZ_D50->sRGB *
    CameraToXYZ_D50 * diag(neutral_hat)``. A white-balanced (1, 1, 1) is
    the neutral and renders as sRGB white.
    """

    try:
        cam_xyz, xy, cct, used_fm = profile.camera_to_xyz_d50(neutral_hat, white_xy)
    except dc.ColourError as exc:
        raise DevelopError(str(exc)) from None
    m = dc.matmul(dc.matmul(_XYZ_D50_TO_SRGB, cam_xyz), dc.diag(neutral_hat))
    base = "ForwardMatrix" if used_fm else "ColorMatrix"
    t1 = dc.ILLUMINANT_CCT.get(profile.illuminant_1, 0.0)
    if profile.color_matrix_2 is not None and profile._pair() is not None:
        g = profile.weight(cct)
        # Within 0.05% of one end (a white a few kelvin off the illuminant's
        # nominal temperature) the name says that end.
        which = "1" if g >= 0.9995 else ("2" if g <= 0.0005 else "1+2")
        name = f"{base}{which} at {cct:.0f} K"
    else:
        name = f"{base}1"
        if profile.color_matrix_2 is not None:
            notes.append("calibration illuminants unknown or equal: ColorMatrix1 used alone")
        elif t1:
            name += f" ({dc.illuminant_name(profile.illuminant_1)})"
    if not profile.use_calibration and (profile.camera_calibration_1 or profile.camera_calibration_2):
        notes.append("CameraCalibration ignored: its signature does not match the profile's")
    return m, name, xy, cct


_PROPHOTO_TO_SRGB = dc.matmul(_XYZ_D50_TO_SRGB, dc.PROPHOTO_TO_XYZ_D50)


def _tone_curve(src: Ifd, settings: DevelopSettings, notes: list[str]):
    """(ToneCurve or None, report label part or None) for the profile's ProfileToneCurve."""

    values = src.get(TAG_PROFILE_TONE_CURVE)
    if not values:
        return None, None
    try:
        tone = dc.ToneCurve.from_tags(values)
    except dc.ColourError as exc:
        notes.append(f"ProfileToneCurve ignored: {exc}")
        return None, None
    label = f"ToneCurve {tone.points} points"
    if not settings.tone_curve:
        notes.append("ProfileToneCurve present but not applied (tone_curve off)")
        return None, label + " off"
    if tone.is_identity():
        return None, label + " (identity)"
    return tone, label


def _profile_look(profile: dc.Profile, settings: DevelopSettings, ifd0: Ifd, cct, gain: float, notes: list[str]):
    """(ProfileLook or None, report label) for the profile's tables and tone curve."""

    hsm = profile.hue_sat_map_at(cct) if cct else profile.hue_sat_map_1
    lt = profile.look_table
    src = settings.dcp if settings.dcp is not None else ifd0
    name = _text(src.get(TAG_PROFILE_NAME)) or ("camera profile" if settings.dcp is not None else "embedded profile")
    has_tone = bool(src.get(TAG_PROFILE_TONE_CURVE))
    if hsm is None and lt is None and not has_tone:
        return None, (name if settings.dcp is not None else None)
    if not settings.profile_tables:
        notes.append("profile tables present but not applied (profile_tables off)")
        return None, f"{name}: tables off"
    parts = []
    if hsm is not None:
        parts.append("HueSatMap {}x{}x{}".format(*hsm.dims))
        if hsm.is_identity():
            hsm = None
    if lt is not None:
        parts.append("LookTable {}x{}x{}".format(*lt.dims))
        if lt.is_identity():
            lt = None
    tone, tone_label = _tone_curve(src, settings, notes)
    if tone_label:
        parts.append(tone_label)
    if not parts:
        return None, (name if settings.dcp is not None else None)
    label = f"{name}: " + ", ".join(parts)
    if hsm is None and lt is None and tone is None:
        # Nothing left to apply: every table is the identity, and the tone
        # curve is absent, the identity or switched off.
        tone_off = tone_label is not None and tone_label.endswith(" off")
        return None, label + ("" if tone_off else " (identity)")
    return dc.ProfileLook(hsm, lt, gain, _PROPHOTO_TO_SRGB, tone), label


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

    if settings.colour not in ("dng", "dcraw"):
        raise DevelopError(f"unknown colour model {settings.colour!r} (dng or dcraw)")
    neutral = ifd.get(TAG_AS_SHOT_NEUTRAL) or ifd0.get(TAG_AS_SHOT_NEUTRAL)
    white_xy_tag = ifd.get(TAG_AS_SHOT_WHITE_XY) or ifd0.get(TAG_AS_SHOT_WHITE_XY)
    if settings.dcp is not None and settings.colour != "dng":
        raise DevelopError("a DCP camera profile needs the dng colour model")
    profile = _profile(ifd0, ifd, settings.dcp, notes) if settings.colour == "dng" else None
    if settings.dcp is not None and profile is None:
        raise DevelopError("the camera profile has no ColorMatrix1")
    given_xy = None
    if (
        profile is not None
        and settings.white_balance is None
        and not (neutral and len(neutral) >= 3 and min(neutral[:3]) > 0)
        and white_xy_tag
        and len(white_xy_tag) >= 2
    ):
        # AsShotWhiteXY: the white is known; its camera neutral follows from the profile.
        given_xy = (float(white_xy_tag[0]), float(white_xy_tag[1]))
        try:
            neutral = profile.xy_to_neutral(given_xy)
        except dc.ColourError as exc:
            raise DevelopError(str(exc)) from None
    if settings.white_balance is not None:
        wb = tuple(float(v) for v in settings.white_balance)
    elif neutral and len(neutral) >= 3 and min(neutral[:3]) > 0:
        inv = [1.0 / float(n) for n in neutral[:3]]
        lo = min(inv)
        wb = tuple(v / lo for v in inv)
    else:
        wb = (1.0, 1.0, 1.0)
        if ifd.get(TAG_AS_SHOT_WHITE_XY) or ifd0.get(TAG_AS_SHOT_WHITE_XY):
            notes.append("AsShotWhiteXY is used only by the dng colour model; rendered without white balance")
        else:
            notes.append("no AsShotNeutral; rendered without white balance")
    white_xy = cct = None
    if profile is not None:
        lo_wb = min(wb)
        neutral_hat = tuple(lo_wb / v for v in wb)
        rgb_cam, matrix_name, white_xy, cct = _dng_colour(
            profile, neutral_hat, given_xy if settings.white_balance is None else None, notes
        )
        colour_model = "dng"
    else:
        rgb_cam, matrix_name = _colour_matrix(ifd0, ifd, notes)
        colour_model = "dcraw"
    ev = settings.exposure_ev
    if settings.use_baseline_exposure:
        base = ifd0.get(TAG_BASELINE_EXPOSURE) or ifd.get(TAG_BASELINE_EXPOSURE)
        if base:
            ev += float(base[0])
        if profile is not None:
            # A profile's own exposure offset rides with it (DNG 1.4).
            src = settings.dcp if settings.dcp is not None else ifd0
            offset = src.get(TAG_BASELINE_EXPOSURE_OFFSET)
            if offset:
                ev += float(offset[0])
    gain = 2.0**ev
    look, profile_label = None, None
    if profile is not None:
        look, profile_label = _profile_look(profile, settings, ifd0, cct, gain, notes)
        if look is not None:
            # Camera to ProPhoto here; the look's own matrix takes ProPhoto to sRGB.
            rgb_cam = dc.matmul(dc.inverse(look.out), rgb_cam)

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

    look_apply = look.apply if look is not None else None

    def encode(r: float, g: float, b: float, out: array) -> None:
        r = hi if r > hi else (0.0 if r < 0 else r)
        g = hi if g > hi else (0.0 if g < 0 else g)
        b = hi if b > hi else (0.0 if b < 0 else b)
        x = m[0][0] * r + m[0][1] * g + m[0][2] * b
        yv = m[1][0] * r + m[1][1] * g + m[1][2] * b
        z = m[2][0] * r + m[2][1] * g + m[2][2] * b
        if look_apply is not None:
            x, yv, z = look_apply(x, yv, z)
        for v in (x, yv, z):
            if v <= 0:
                out.append(0)
            elif v >= 1:
                out.append(65535)
            else:
                out.append(curve[int(v * (lut_size - 1) + 0.5)])

    cfa_name = "LinearRaw" if pat is None else "".join("RGB"[c] for c in pat)
    np_engine = _numpy_engine(settings.engine) if (w >= 2 and h >= 2) else None
    if settings.engine == "numpy" and np_engine is None:
        raise DevelopError("engine 'numpy' needs numpy and an image at least 2x2")
    if np_engine is not None:
        return _develop_numpy(
            np_engine, raw, settings, ifd, ifd0, notes, wb, ev, black, white, cfa_name, matrix_name,
            colour=(colour_model, white_xy, cct, profile_label),
            vals=vals, rw=rw, top=top, left=left, w=w, h=h, spp=spp, lin=lin, black_=black, span=span,
            dh=dh, dv=dv, rr=rr, rc=rc, caplines=caplines, linear_raw=linear_raw, pat=pat,
            half=settings.half, mults=(wbr, wbg, wbb), hi=hi, m=m, curve=curve, lut_size=lut_size,
            look=look,
        )

    out = array("H")
    if linear_raw:
        for y in range(h):
            row = norm_row(y)
            for x in range(w):
                encode(row[3 * x] * wbr, row[3 * x + 1] * wbg, row[3 * x + 2] * wbb, out)
        ow, oh = w, h
    else:
        assert pat is not None
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
        colour=colour_model,
        white_xy=None if white_xy is None else (round(white_xy[0], 5), round(white_xy[1], 5)),
        cct=None if cct is None else round(cct, 1),
        profile=profile_label,
    )
    return report_w, report_h, out, report


def _numpy_engine(engine: str):
    if engine not in ("auto", "python", "numpy"):
        raise DevelopError(f"unknown engine {engine!r} (auto, python or numpy)")
    if engine == "python":
        return None
    try:
        from shootflow import raw_develop_np
    except ImportError:
        return None
    return raw_develop_np


def _develop_numpy(eng, raw, settings, ifd, ifd0, notes, wb, ev, black, white, cfa_name, matrix_name, colour, **kw):
    """``develop``'s rendering half on the numpy engine; same bytes as the pure path."""

    colour_model, white_xy, cct, profile_label = colour

    black_ = kw.pop("black_")
    pixels, ow, oh, clipped = eng.render(black=black_, **kw)
    linear_raw, w, h, spp = kw["linear_raw"], kw["w"], kw["h"], kw["spp"]
    report_w, report_h = ow, oh
    origin = ifd.get(TAG_CROP_ORIGIN)
    size = ifd.get(TAG_CROP_SIZE)
    if origin and size and len(origin) == 2 and len(size) == 2:
        f = 0.5 if (settings.half and not linear_raw) else 1.0
        cx, cy = int(round(float(origin[0]) * f)), int(round(float(origin[1]) * f))
        cw, ch = int(round(float(size[0]) * f)), int(round(float(size[1]) * f))
        if 0 <= cx and 0 <= cy and cw > 0 and ch > 0 and cx + cw <= ow and cy + ch <= oh:
            if (cx, cy, cw, ch) != (0, 0, ow, oh):
                pixels = eng.crop(pixels, cx, cy, cw, ch)
                report_w, report_h = cw, ch
        else:
            notes.append("DefaultCrop lies outside the image and was ignored")
    orientation = ifd0.one(TAG_ORIENTATION, 1)
    if orientation in range(2, 9):
        pixels = eng.orient(pixels, orientation)
        if orientation in (5, 6, 7, 8):
            report_w, report_h = report_h, report_w
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
        engine="numpy",
        colour=colour_model,
        white_xy=None if white_xy is None else (round(white_xy[0], 5), round(white_xy[1], 5)),
        cct=None if cct is None else round(cct, 1),
        profile=profile_label,
    )
    return report_w, report_h, eng.to_array(pixels), report


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
