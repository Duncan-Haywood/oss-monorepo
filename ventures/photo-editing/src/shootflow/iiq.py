"""Read a Phase One IIQ straight into the developer, standard library only (a small C helper when a compiler is present).

An IIQ (and the ``.TIF`` raws of the P25, P30 and P45 backs) is a TIFF whose IFD0 holds Make ("Phase One A/S"),
Model, the EXIF IFD and a small thumbnail. The sensor data sits in a second container that starts at byte 8
with ``"IIII"``: a 4-byte version, then a 4-byte offset (from byte 8) of a directory of 16-byte entries
(tag, type, count, value-or-offset; all little-endian, offsets from byte 8). The entries this reader uses:

* ``0x100`` orientation code (low two bits: 0 none, 1 a quarter turn clockwise, 2 a quarter turn counter-
  clockwise, 3 a half turn; dcraw's ``"0653"`` table)
* ``0x106`` nine float32: the camera-to-ROMM (ProPhoto) matrix for white-balanced data
* ``0x107`` three float32: the as-shot red, green and blue multipliers
* ``0x108``/``0x109`` sensor columns and rows; ``0x10a``/``0x10b`` left and top margin; ``0x10c``/``0x10d``
  image columns and rows
* ``0x10e`` the data format: 3 is "IIQ L" (14-bit), 5 is the 8-bit-coded "IIQ L" of the P+ backs and the H 25
  (codes under 256 are the square of the 14-bit value, ``v * v / 3.969``), 6 is "IIQ S", 8 is the 16-bit
  "IIQ L" of the IQ4 150MP (its "IIQ L 16-bit" and "IIQ L 16 Extended" settings) and the IQ3 100MP Trichromatic
* ``0x10f`` sensor data offset; ``0x21c`` the row offset table (one 4-byte offset per row, from ``0x10f``)
* ``0x21d`` black level (in the 16-bit scale the values are stored at, 1024 on every file at hand)
* ``0x222``/``0x223`` the column where the left and right readout halves meet, and a table of two signed 16-bit
  black offsets per row (left half, right half); ``0x224``/``0x225`` the row where the top and bottom halves meet
  and two offsets per column. Either table may be absent (the IQ150 and IQ3 100MP carry none).

**Format 3 and 5 rows** are coded independently in 32-bit little-endian words read MSB first. Each row starts
with both colour lanes' predictions at 0. Every 8 columns (until the last ``width % 8``, which are always
14-bit) each of the two lanes (even and odd columns) reads up to five bits, stopping at a 1. A 1 straight away keeps
the lane's last length; otherwise the count ``j`` of 0 bits (1-5) and one more bit pick the difference length
``8 7 6 9 11 10 5 12 14 13``[2 (j - 1) + bit]. A length of 14 means a raw 16-bit value follows; otherwise the value is
the lane's last plus ``bits(len) + 1 - 2**(len - 1)``. Stored values are that 14-bit number times four
(LibRaw's ``raw_image`` holds the same). **Format 8** is the same code with 16-bit values: they are stored
as they are, not times four, and white is 65535.

Levels: each stored sensel is the decoded value times four plus its row's offset for its half and its
column's offset for its half (dcraw adds both and subtracts the black level, ``phase_one_load_raw_c``); the
black level stays a level here so the noise below it survives, and white is 65532 (16383 times four).

**Format 6 ("IIQ S")** rows are coded on their own too, in the same 32-bit little-endian words read MSB
first. A row opens with 16 bits whose low three give the row's base precision ``q`` (0-7). Then come blocks of
8 columns, each with a small header and eight samples, the even and odd columns again two lanes:

* each lane's *scale* ``k`` (0-9, 0 at the row's start): a 2-bit prefix ``01``, ``10`` or ``11`` moves it by
  -1, 0 or +1; a prefix ``00`` is followed by a fresh value as a prefix code (``11`` 2, ``10`` 3, ``011`` 4,
  ``010`` 1, ``0011`` 5, ``0010`` 6, ``00011`` 7, ``00010`` 0, ``00001`` 8, ``00000`` 9);
* one shared *refinement* ``r``: a ``1`` means 0, a ``0`` and two bits ``xx`` mean ``xx + 1``;
* eight samples: a lane at scale 9 reads a raw 14-bit value; otherwise ``q + r`` bits ``b`` give the value
  ``last + (b << (k - r)) - (2**(q + k - 1) - 1)``, the bias centring the step on the last value. A refinement
  one or two above the scale occurs on real IQ180 and iXU180 files (880 samples in three frames), always
  with zero sample bits, so the step is 0 under any reading; bits there are refused as corrupt.

The last ``width % 8`` columns are raw 14-bit values. Stored values are the value times four, clamped to
16 bits, before the row and column offsets (which are applied as for IIQ L).

**Not read**: the uncompressed formats 1 and 2, of which no file has been checked against LibRaw here; each is refused with the reason, and the frame falls
back to its preview in the cull. The per-sensor calibration in the block at ``0x110`` (defects, flat fields, the
split-sensor and quadrant curves) is applied by ``shootflow.iiq_calibration`` since 2026-11-19.

The format as dcraw and LibRaw read it (``parse_phase_one``, ``phase_one_load_raw_c``; IIQ S as LibRaw 0.21+
reads it, ``decode_S_type``, LGPL-2.1/CDDL, read for the layout only, itself credited to Daniel Vogelbacher's
work); this is an independent implementation, checked sensel for sensel against LibRaw 0.22 on raw.pixls.us files (``tools/iiq_libraw_check.py``,
``eval/phaseone-iiq-reader-2026-11-18.md``).
"""

from __future__ import annotations

import ctypes
import hashlib
import os
import struct
import subprocess
import sys
import tempfile
import threading
from array import array
from pathlib import Path

from shootflow import raw_develop as rd

BASE = 8
MAGIC = b"IIII"
LENGTHS = (8, 7, 6, 9, 11, 10, 5, 12, 14, 13)
FORMATS = (3, 5, 6, 8)  # the coded formats this reader decodes: "IIQ L" (3, 5, and 16-bit 8) and "IIQ S" (6)
FORMAT_NAMES = {1: "uncompressed (keyed)", 2: "uncompressed", 3: "IIQ L", 5: "IIQ L (8-bit coded)", 6: "IIQ S", 8: "IIQ L 16-bit"}
WHITE = 16383 << 2
WHITE_16 = 65535  # format 8 stores the 16-bit code itself
# The sensor is RGGB at the image's top-left (the 0x10a/0x10b margins), on every body at hand.
RGGB = (0, 1, 1, 2)
# ROMM (ProPhoto) RGB to XYZ, D50 (ISO 22028-2).
ROMM_TO_XYZ = ((0.7976749, 0.1351917, 0.0313534), (0.2880402, 0.7118741, 0.0000857), (0.0, 0.0, 0.8252100))
ORIENTATION = {0: 1, 1: 6, 2: 8, 3: 3}  # 0x100's low two bits to the TIFF Orientation code
ILLUMINANT_D50 = 23

TAG_ORIENT, TAG_ROMM, TAG_MUL = 0x100, 0x106, 0x107
TAG_RAW_W, TAG_RAW_H, TAG_LEFT, TAG_TOP, TAG_W, TAG_H = 0x108, 0x109, 0x10A, 0x10B, 0x10C, 0x10D
TAG_FORMAT, TAG_DATA, TAG_STRIPS, TAG_BLACK = 0x10E, 0x10F, 0x21C, 0x21D
TAG_SPLIT_COL, TAG_BLACK_COL, TAG_SPLIT_ROW, TAG_BLACK_ROW = 0x222, 0x223, 0x224, 0x225
TAG_MODEL_TEXT = 0x301
TAG_MAKE, TAG_MODEL = 271, 272


def curve() -> list[int]:
    """Format 5's code table: codes 0-255 stand for ``round(v * v / 3.969)``; codes from 256 up are themselves."""

    return [int(i * i / 3.969 + 0.5) for i in range(256)] + list(range(256, 65536))


def is_iiq(data: bytes) -> bool:
    if data[:4] != b"II*\0" or data[BASE : BASE + 4] != MAGIC:
        return False
    try:
        return TAG_RAW_W in directory(data)
    except (rd.DevelopError, struct.error):
        return False


def directory(data: bytes) -> dict[int, tuple[int, int, int, int]]:
    """The sensor container's entries: ``{tag: (type, count, value, offset of the value field)}``."""

    if data[BASE : BASE + 4] != MAGIC:
        raise rd.DevelopError("not a Phase One IIQ (no IIII block at byte 8)")
    at = struct.unpack_from("<I", data, BASE + 8)[0] + BASE
    if at + 8 > len(data):
        raise rd.DevelopError("IIQ directory lies past the end of the file")
    n = struct.unpack_from("<I", data, at)[0]
    if n > 4096 or at + 8 + 16 * n > len(data):
        raise rd.DevelopError("IIQ directory is truncated or implausible")
    out = {}
    for k in range(n):
        tag, typ, count, value = struct.unpack_from("<4I", data, at + 8 + 16 * k)
        out[tag] = (typ, count, value, at + 8 + 16 * k + 12)
    return out


def _value(entries, tag: int, default: int = 0) -> int:
    hit = entries.get(tag)
    return default if hit is None else int(hit[2])


def _floats(data: bytes, entries, tag: int, n: int) -> tuple[float, ...] | None:
    hit = entries.get(tag)
    if hit is None or hit[1] < n * 4:
        return None
    at = hit[2] + BASE
    if at + 4 * n > len(data):
        return None
    return struct.unpack_from(f"<{n}f", data, at)


def _text(values) -> str:
    return bytes(v for v in values if isinstance(v, int)).split(b"\0")[0].decode("latin-1").strip() if values else ""


def _tiff(data: bytes) -> tuple[rd._Reader, rd.Ifd] | None:
    try:
        reader = rd._Reader(data)
        ifds = rd._all_ifds(reader)
    except (rd.DevelopError, struct.error):
        return None
    return (reader, ifds[0]) if ifds else None


def camera_model(data: bytes) -> str:
    """The camera name a profile is filed under: 'Phase One IQ180', 'Phase One P45+'."""

    tiff = _tiff(data)
    if tiff is None:
        return ""
    model = _text(tiff[1].get(TAG_MODEL))
    return f"Phase One {model}" if model else ""


def info(data: bytes) -> dict:
    """The sensor container's fields this reader uses."""

    e = directory(data)
    need = (TAG_RAW_W, TAG_RAW_H, TAG_FORMAT, TAG_DATA, TAG_STRIPS)
    missing = [f"{t:#x}" for t in need if t not in e]
    if missing:
        raise rd.DevelopError(f"IIQ directory lacks {', '.join(missing)}")
    width, height = _value(e, TAG_RAW_W), _value(e, TAG_RAW_H)
    left, top = _value(e, TAG_LEFT, 0), _value(e, TAG_TOP, 0)
    return {
        "width": width,
        "height": height,
        "left": left,
        "top": top,
        "image_width": _value(e, TAG_W, width - left),
        "image_height": _value(e, TAG_H, height - top),
        "format": _value(e, TAG_FORMAT),
        "data": _value(e, TAG_DATA) + BASE,
        "strips": _value(e, TAG_STRIPS) + BASE,
        "black": _value(e, TAG_BLACK, 0),
        "split_col": _value(e, TAG_SPLIT_COL, 0),
        "black_col": (_value(e, TAG_BLACK_COL) + BASE) if TAG_BLACK_COL in e else None,
        "split_row": _value(e, TAG_SPLIT_ROW, 0),
        "black_row": (_value(e, TAG_BLACK_ROW) + BASE) if TAG_BLACK_ROW in e else None,
        "orientation": _value(e, TAG_ORIENT, 0),
        "romm": _floats(data, e, TAG_ROMM, 9),
        "mul": _floats(data, e, TAG_MUL, 3),
    }


def _shorts(data: bytes, at: int | None, n: int) -> array:
    """``n`` signed little-endian 16-bit offsets at ``at`` (zeros when the table is absent or cut short)."""

    out = array("h", [0]) * n
    if at is None:
        return out
    blob = data[at : at + 2 * n]
    got = array("h")
    got.frombytes(blob[: len(blob) // 2 * 2])
    if sys.byteorder == "big":
        got.byteswap()
    out[: len(got)] = got
    return out


def _decode_rows_python(data: bytes, start: int, offsets, width: int, height: int, fmt: int,
                        cblack: array, rblack: array, split_col: int, split_row: int) -> array:
    """The reference decoder: every row, levels applied (stored = code * 4 + row and column offsets)."""

    table = curve() if fmt == 5 else None
    shift = 0 if fmt == 8 else 2
    out = array("H", [0]) * (width * height)
    n = len(data)
    whole = width & -8
    for row in range(height):
        pos = start + offsets[row]
        buf = 0
        have = 0
        pred = [0, 0]
        lens = [0, 0]
        base = row * width
        rb = 1 if row >= split_row else 0
        left_off, right_off = cblack[2 * row], cblack[2 * row + 1]
        for col in range(width):
            if col >= whole:
                lens[0] = lens[1] = 14
            elif col & 7 == 0:
                for lane in (0, 1):
                    j = 0
                    while j < 5:
                        if have < 1:
                            buf = ((buf << 32) | (struct.unpack_from("<I", data, pos)[0] if pos + 4 <= n else 0)) & 0xFFFFFFFFFFFFFFFF
                            pos += 4
                            have += 32
                        have -= 1
                        if (buf >> have) & 1:
                            break
                        j += 1
                    if j:
                        if have < 1:
                            buf = ((buf << 32) | (struct.unpack_from("<I", data, pos)[0] if pos + 4 <= n else 0)) & 0xFFFFFFFFFFFFFFFF
                            pos += 4
                            have += 32
                        have -= 1
                        lens[lane] = LENGTHS[2 * (j - 1) + ((buf >> have) & 1)]
            lane = col & 1
            size = lens[lane]
            want = 16 if size == 14 else size
            if want:
                if have < want:
                    buf = ((buf << 32) | (struct.unpack_from("<I", data, pos)[0] if pos + 4 <= n else 0)) & 0xFFFFFFFFFFFFFFFF
                    pos += 4
                    have += 32
                have -= want
                bits = (buf >> have) & ((1 << want) - 1)
            else:
                bits = 0
            if size == 14:
                pred[lane] = bits
            elif size:
                pred[lane] = (pred[lane] + bits + 1 - (1 << (size - 1))) & 0xFFFF
            code = pred[lane]
            if table is not None:
                code = table[code]
            v = (code << shift) + (right_off if col >= split_col else left_off) + rblack[2 * col + rb]
            out[base + col] = 0 if v < 0 else 65535 if v > 65535 else v
    return out


# IIQ S: the fresh-scale prefix code after a ``00`` prefix, as (bits, code, scale).
SCALE_CODES = ((2, 0b11, 2), (2, 0b10, 3), (3, 0b011, 4), (3, 0b010, 1), (4, 0b0011, 5), (4, 0b0010, 6),
               (5, 0b00011, 7), (5, 0b00010, 0), (5, 0b00001, 8), (5, 0b00000, 9))
RAW_SCALE = 9


def _scale_table() -> tuple[list[int], list[int]]:
    """The scale code read from the five bits after ``00``: (scale, bits used) for each 5-bit window."""

    scale, used = [0] * 32, [0] * 32
    for n, code, k in SCALE_CODES:
        for tail in range(1 << (5 - n)):
            w = (code << (5 - n)) | tail
            scale[w], used[w] = k, n
    return scale, used


class _Bits:
    """32-bit little-endian words, read most significant bit first; zeros past the end."""

    __slots__ = ("data", "pos", "end", "buf", "have")

    def __init__(self, data: bytes, pos: int):
        self.data, self.pos, self.end = data, pos, len(data)
        self.buf = 0
        self.have = 0

    def peek(self, n: int) -> int:
        while self.have < n:
            p = self.pos
            w = struct.unpack_from("<I", self.data, p)[0] if 0 <= p and p + 4 <= self.end else 0
            self.buf = ((self.buf << 32) | w) & 0xFFFFFFFFFFFFFFFF
            self.pos = p + 4
            self.have += 32
        return (self.buf >> (self.have - n)) & ((1 << n) - 1)

    def skip(self, n: int):
        self.peek(n)
        self.have -= n

    def get(self, n: int) -> int:
        v = self.peek(n)
        self.have -= n
        return v


def _decode_s_row(bits: _Bits, width: int, out: array, base: int, scale_of=None, used_of=None):
    """One IIQ S row into ``out[base : base + width]`` (value times four, clamped, no offsets)."""

    if scale_of is None:
        scale_of, used_of = _scale_table()
    q = bits.get(16) & 7
    scale = [0, 0]
    last = [0, 0]
    col = 0
    for _ in range(width >> 3):
        for lane in (0, 1):
            prefix = bits.get(2)
            if prefix:
                scale[lane] += prefix - 2
            else:
                w = bits.peek(5)
                scale[lane] = scale_of[w]
                bits.skip(used_of[w])
        refine = bits.get(1)
        refine = 0 if refine else bits.get(2) + 1
        n = q + refine
        for lane in (0, 1):
            if scale[lane] != RAW_SCALE and not (0 <= scale[lane] <= 17 - q):
                raise rd.DevelopError("IIQ S block's scale is out of range (corrupt data)")
        shift = (scale[0] - refine, scale[1] - refine)
        bias = tuple(0xFFFF >> (17 - q - k) if k != RAW_SCALE else 0 for k in scale)
        for i in range(8):
            lane = i & 1
            if scale[lane] == RAW_SCALE:
                v = bits.get(14)
            else:
                b = bits.get(n) if n else 0
                if shift[lane] >= 0:
                    v = last[lane] + (b << shift[lane]) - bias[lane]
                elif b == 0:  # a refinement above the scale: real files send it only with zero bits
                    v = last[lane] - bias[lane]
                else:
                    raise rd.DevelopError("IIQ S sample has bits under a refinement above its scale (corrupt data)")
            last[lane] = v
            v <<= 2
            out[base + col] = 0 if v < 0 else 65535 if v > 65535 else v
            col += 1
    while col < width:
        out[base + col] = bits.get(14) << 2
        col += 1


def _decode_s_python(data: bytes, start: int, offsets, width: int, height: int,
                     cblack: array, rblack: array, split_col: int, split_row: int) -> array:
    """The reference IIQ S decoder: every row, then the row and column offsets as for IIQ L."""

    scale_of, used_of = _scale_table()
    out = array("H", [0]) * (width * height)
    for row in range(height):
        base = row * width
        _decode_s_row(_Bits(data, start + offsets[row]), width, out, base, scale_of, used_of)
        rb = 1 if row >= split_row else 0
        lo, ro = cblack[2 * row], cblack[2 * row + 1]
        if lo or ro or any(rblack):
            for col in range(width):
                v = out[base + col] + (ro if col >= split_col else lo) + rblack[2 * col + rb]
                out[base + col] = 0 if v < 0 else 65535 if v > 65535 else v
    return out


C_SOURCE = r"""
#include <stdint.h>
static const int LENS[10] = {8, 7, 6, 9, 11, 10, 5, 12, 14, 13};
/* One row-coded IIQ L (format 3, or 5 with its code table, or 16-bit 8) to stored values: (code << shift) + offsets,
   clamped; shift is 2 for the 14-bit formats and 0 for format 8. */
long shootflow_iiq_run(const uint8_t *d, long n, long start, const uint32_t *offsets, long width, long height,
                       const uint16_t *table, const int16_t *cblack, const int16_t *rblack,
                       long split_col, long split_row, int shift, uint16_t *out) {
    long whole = width & ~7L;
    for (long row = 0; row < height; row++) {
        long pos = start + (long)offsets[row];
        uint64_t buf = 0; int have = 0;
        int pred[2] = {0, 0}, lens[2] = {0, 0};
        int rb = row >= split_row;
        int lo = cblack[2 * row], ro = cblack[2 * row + 1];
        uint16_t *o = out + row * width;
#define FILL(k) if (have < (k)) { uint32_t w = 0; if (pos >= 0 && pos + 4 <= n) w = (uint32_t)d[pos] | ((uint32_t)d[pos+1] << 8) | ((uint32_t)d[pos+2] << 16) | ((uint32_t)d[pos+3] << 24); buf = (buf << 32) | w; pos += 4; have += 32; }
        for (long col = 0; col < width; col++) {
            if (col >= whole) { lens[0] = lens[1] = 14; }
            else if ((col & 7) == 0) {
                for (int lane = 0; lane < 2; lane++) {
                    int j = 0;
                    while (j < 5) { FILL(1); have -= 1; if ((buf >> have) & 1) break; j++; }
                    if (j) { FILL(1); have -= 1; lens[lane] = LENS[2 * (j - 1) + ((buf >> have) & 1)]; }
                }
            }
            int lane = col & 1, size = lens[lane];
            int want = size == 14 ? 16 : size;
            uint32_t bits = 0;
            if (want) { FILL(want); have -= want; bits = (uint32_t)((buf >> have) & ((1u << want) - 1)); }
            if (size == 14) pred[lane] = (int)bits;
            else if (size) pred[lane] = (pred[lane] + (int)bits + 1 - (1 << (size - 1))) & 0xFFFF;
            int code = pred[lane];
            if (table) code = table[code];
            long v = ((long)code << shift) + (col >= split_col ? ro : lo) + rblack[2 * col + rb];
            o[col] = (uint16_t)(v < 0 ? 0 : v > 65535 ? 65535 : v);
        }
#undef FILL
    }
    return 0;
}

/* IIQ S (format 6): per-lane scale, shared refinement, eight samples per block; then the offsets. */
static const signed char S_SCALE[32] = {9, 8, 0, 7, 6, 6, 5, 5, 1, 1, 1, 1, 4, 4, 4, 4,
                                        3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2};
static const signed char S_USED[32] = {5, 5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3,
                                       2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2};
long shootflow_iiq_s_run(const uint8_t *d, long n, long start, const uint32_t *offsets, long width, long height,
                         const int16_t *cblack, const int16_t *rblack, long split_col, long split_row,
                         int any_offsets, uint16_t *out) {
    long bad = 0;
    for (long row = 0; row < height; row++) {
        long pos = start + (long)offsets[row];
        uint64_t buf = 0; int have = 0;
#define NEED(k) while (have < (k)) { uint32_t w = 0; if (pos >= 0 && pos + 4 <= n) w = (uint32_t)d[pos] | ((uint32_t)d[pos+1] << 8) | ((uint32_t)d[pos+2] << 16) | ((uint32_t)d[pos+3] << 24); buf = (buf << 32) | w; pos += 4; have += 32; }
#define PEEK(k) ((uint32_t)((buf >> (have - (k))) & ((1u << (k)) - 1)))
        uint16_t *o = out + row * width;
        NEED(16); int q = (int)(PEEK(16) & 7); have -= 16;
        int scale[2] = {0, 0}; long last[2] = {0, 0};
        long col = 0;
        for (long blk = 0; blk < (width >> 3); blk++) {
            for (int lane = 0; lane < 2; lane++) {
                NEED(2); int prefix = (int)PEEK(2); have -= 2;
                if (prefix) scale[lane] += prefix - 2;
                else { NEED(5); int w = (int)PEEK(5); scale[lane] = S_SCALE[w]; have -= S_USED[w]; }
            }
            NEED(1); int refine = (int)PEEK(1); have -= 1;
            if (refine) refine = 0; else { NEED(2); refine = (int)PEEK(2) + 1; have -= 2; }
            int nb = q + refine;
            for (int i = 0; i < 8; i++, col++) {
                int lane = i & 1;
                long v;
                if (scale[lane] == 9) { NEED(14); v = (long)PEEK(14); have -= 14; }
                else {
                    int sh = scale[lane] - refine, bk = 17 - q - scale[lane];
                    if (scale[lane] < 0 || bk < 0 || bk > 31) { bad++; bk = bk < 0 ? 0 : bk > 31 ? 31 : bk; }
                    uint32_t b = 0;
                    if (nb) { NEED(nb); b = PEEK(nb); have -= nb; }
                    /* A refinement above the scale comes only with zero bits on real files; bits there are corrupt. */
                    if (sh < 0) { if (b) bad++; sh = 0; b = 0; }
                    v = last[lane] + ((long)b << sh) - (long)(0xFFFF >> bk);
                }
                last[lane] = v;
                v <<= 2;
                o[col] = (uint16_t)(v < 0 ? 0 : v > 65535 ? 65535 : v);
            }
        }
        for (; col < width; col++) { NEED(14); o[col] = (uint16_t)(PEEK(14) << 2); have -= 14; }
#undef NEED
#undef PEEK
        if (any_offsets) {
            int rb = row >= split_row;
            int lo = cblack[2 * row], ro = cblack[2 * row + 1];
            for (long c = 0; c < width; c++) {
                long v = (long)o[c] + (c >= split_col ? ro : lo) + rblack[2 * c + rb];
                o[c] = (uint16_t)(v < 0 ? 0 : v > 65535 ? 65535 : v);
            }
        }
    }
    return bad;
}
"""

_STATE: dict[str, object] = {}
_LOCK = threading.Lock()


def _load():
    if os.environ.get("SHOOTFLOW_NATIVE", "1") == "0" or sys.platform == "win32":
        return None
    from shootflow.ljpeg_native import _cache_dir, _compiler

    digest = hashlib.sha256(C_SOURCE.encode()).hexdigest()[:16]
    suffix = ".dylib" if sys.platform == "darwin" else ".so"
    target = _cache_dir() / f"iiq-{digest}{suffix}"
    try:
        if not target.exists():
            cc = _compiler()
            if cc is None:
                return None
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix="shootflow-cc-") as tmp:
                src = Path(tmp) / "iiq.c"
                src.write_text(C_SOURCE)
                built = Path(tmp) / target.name
                flags = ["-O2"] + (["-dynamiclib"] if sys.platform == "darwin" else ["-shared", "-fPIC"])
                try:
                    subprocess.run([cc, *flags, "-o", str(built), str(src)], check=True, capture_output=True, timeout=60)
                except (OSError, subprocess.SubprocessError):
                    return None
                os.replace(built, target)  # atomic, so a parallel build never loads half a file
        lib = ctypes.CDLL(str(target))
    except OSError:
        return None
    fn = lib.shootflow_iiq_run
    fn.restype = ctypes.c_long
    P, L = ctypes.c_void_p, ctypes.c_long
    fn.argtypes = [ctypes.c_char_p, L, L, P, L, L, P, P, P, L, L, ctypes.c_int, P]
    fn_s = lib.shootflow_iiq_s_run
    fn_s.restype = ctypes.c_long
    fn_s.argtypes = [ctypes.c_char_p, L, L, P, L, L, P, P, L, L, ctypes.c_int, P]
    return fn, fn_s


def _natives():
    if "fn" not in _STATE:
        with _LOCK:
            if "fn" not in _STATE:
                _STATE["fn"] = _load()
    return _STATE["fn"]


def native():
    """The loaded C decoder for IIQ L, or None. Built and loaded once per process."""

    fns = _natives()
    return fns[0] if fns else None


def native_s():
    """The loaded C decoder for IIQ S, or None (the same library as ``native``)."""

    fns = _natives()
    return fns[1] if fns else None


def decode_sensor(data: bytes, fields: dict, use_native: bool = True) -> tuple[array, str]:
    """The stored sensels, row-major, levels applied, and a note naming the decoder."""

    fmt = fields["format"]
    if fmt not in FORMATS:
        name = FORMAT_NAMES.get(fmt, "unknown")
        raise rd.DevelopError(f"this IIQ's data format {fmt} ({name}) is not supported yet; convert to DNG")
    width, height = fields["width"], fields["height"]
    if not width or not height or width * height > 400_000_000:
        raise rd.DevelopError("raw image size is missing or implausible")
    if fields["strips"] + 4 * height > len(data):
        raise rd.DevelopError("IIQ row offset table runs past the end of the file")
    offsets = array("I")
    offsets.frombytes(data[fields["strips"] : fields["strips"] + 4 * height])
    if sys.byteorder == "big":
        offsets.byteswap()
    cblack = _shorts(data, fields["black_col"], 2 * height)
    rblack = _shorts(data, fields["black_row"], 2 * width)
    split_col = fields["split_col"] or width
    split_row = fields["split_row"] or height
    if fmt == 6:
        fn_s = native_s() if use_native else None
        if fn_s is None:
            out = _decode_s_python(data, fields["data"], offsets, width, height, cblack, rblack, split_col, split_row)
            return out, f"IIQ: {FORMAT_NAMES[fmt]}"
        out = array("H", [0]) * (width * height)
        if not isinstance(data, bytes):
            data = bytes(data)
        any_offsets = 1 if (any(cblack) or any(rblack)) else 0
        bad = fn_s(data, len(data), fields["data"], offsets.buffer_info()[0], width, height, cblack.buffer_info()[0],
                   rblack.buffer_info()[0], split_col, split_row, any_offsets, out.buffer_info()[0])
        if bad:
            raise rd.DevelopError(f"IIQ S data has {bad} samples with an out-of-range scale or refinement (corrupt data)")
        return out, f"IIQ: {FORMAT_NAMES[fmt]} (native)"
    fn = native() if use_native else None
    if fn is not None:
        table = array("H", curve()) if fmt == 5 else None
        out = array("H", [0]) * (width * height)
        if not isinstance(data, bytes):
            data = bytes(data)
        fn(data, len(data), fields["data"], offsets.buffer_info()[0], width, height,
           table.buffer_info()[0] if table is not None else None, cblack.buffer_info()[0], rblack.buffer_info()[0],
           split_col, split_row, 0 if fmt == 8 else 2, out.buffer_info()[0])
        return out, f"IIQ: {FORMAT_NAMES[fmt]} (native)"
    out = _decode_rows_python(data, fields["data"], offsets, width, height, fmt, cblack, rblack, split_col, split_row)
    return out, f"IIQ: {FORMAT_NAMES[fmt]}"


def colour_matrix(romm, mul) -> tuple[float, ...] | None:
    """ColorMatrix1 (XYZ D50 to native camera) from the camera-to-ROMM matrix of white-balanced data.

    White-balanced camera data ``diag(mul) c`` goes to ROMM through ``romm``, and ROMM to XYZ D50 is fixed,
    so camera to XYZ is ``ROMM_TO_XYZ . romm . diag(mul)``; its inverse is the DNG ColorMatrix, calibrated at
    D50: the as-shot neutral ``1 / mul`` maps to D50 white whenever ``romm``'s rows sum to one."""

    if not romm or not mul or min(mul) <= 0:
        return None
    m = [list(romm[0:3]), list(romm[3:6]), list(romm[6:9])]
    cam_to_xyz = [[sum(ROMM_TO_XYZ[i][k] * m[k][j] for k in range(3)) * mul[j] for j in range(3)] for i in range(3)]
    try:
        from shootflow import dng_colour as dc

        inv = dc.inverse(cam_to_xyz)
    except Exception:  # singular or malformed: no matrix rather than a wrong one
        return None
    return tuple(float(v) for row in inv for v in row)


def parse_iiq(data: bytes, use_native: bool = True, calibrate: bool = True) -> rd.RawImage:
    """An IIQ's sensor data and DNG-equivalent tags (ColorMatrix1 from the file's own matrix).

    With ``calibrate`` (the default) the back's own sensor calibration from the ``0x110`` block is applied:
    defects, flat fields, readout-half and quadrant curves (``shootflow.iiq_calibration``)."""

    fields = info(data)
    values, note = decode_sensor(data, fields, use_native)
    calibration: list[str] = []
    if calibrate:
        from shootflow import iiq_calibration

        calibration = iiq_calibration.apply(values, data, directory(data), fields, use_native)
    width, height = fields["width"], fields["height"]
    top, left = fields["top"], fields["left"]
    bottom = min(height, top + fields["image_height"])
    right = min(width, left + fields["image_width"])
    if not (0 <= top < bottom and 0 <= left < right):
        top, left, bottom, right = 0, 0, height, width
    notes = [note, *calibration]
    black = float(fields["black"])
    synth = rd.Ifd(byte_order="<")
    synth.entries = {
        rd.TAG_WIDTH: (width,),
        rd.TAG_HEIGHT: (height,),
        rd.TAG_BITS: (16,),
        rd.TAG_SAMPLES: (1,),
        rd.TAG_PHOTOMETRIC: (rd.PHOTOMETRIC_CFA,),
        rd.TAG_CFA_REPEAT: (2, 2),
        rd.TAG_CFA_PATTERN: RGGB,
        rd.TAG_ACTIVE_AREA: (top, left, bottom, right),
        rd.TAG_BLACK_REPEAT: (1, 1),
        rd.TAG_BLACK_LEVEL: (black,),
        rd.TAG_WHITE_LEVEL: (WHITE_16 if fields["format"] == 8 else WHITE,),
    }
    mul = fields["mul"]
    if mul and min(mul) > 0:
        synth.entries[rd.TAG_AS_SHOT_NEUTRAL] = (mul[1] / mul[0], 1.0, mul[1] / mul[2])
    else:
        notes.append("IIQ: no as-shot multipliers: no as-shot white balance")
    tiff = _tiff(data)
    exif = None
    if tiff is not None:
        reader, ifd0 = tiff
        head = rd.Ifd(entries=dict(ifd0.entries), byte_order=reader.end)
        exif = rd.exif_ifd(reader, ifd0)
    else:
        head = rd.Ifd(byte_order="<")
        notes.append("IIQ: no readable TIFF IFD0: no camera name or EXIF")
    # The thumbnail's IFD describes the thumbnail; the sensor's own orientation is 0x100's.
    head.entries[rd.TAG_ORIENTATION] = (ORIENTATION[fields["orientation"] & 3],)
    model = camera_model(data)
    if model:
        head.entries[rd.TAG_UNIQUE_CAMERA_MODEL] = tuple(model.encode("latin-1")) + (0,)
    cm = colour_matrix(fields["romm"], mul)
    if cm is not None:
        head.entries[rd.TAG_COLOR_MATRIX_1] = cm
        head.entries[rd.TAG_ILLUMINANT_1] = (ILLUMINANT_D50,)
        notes.append("IIQ: colour from the file's camera-to-ROMM matrix (ColorMatrix1 at D50)")
    else:
        notes.append("IIQ: no usable camera-to-ROMM matrix; pass a .dcp profile")
    return rd.RawImage(width, height, 1, values, synth, head, source="iiq", notes=notes, exif=exif)


__all__ = ["camera_model", "colour_matrix", "curve", "decode_sensor", "directory", "info", "is_iiq", "parse_iiq"]
