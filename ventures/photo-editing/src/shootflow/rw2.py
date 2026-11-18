"""Read a Panasonic RW2 straight into the developer, standard library only (C when present).

An RW2 is a TIFF with its own magic number ("IIU\\0", 0x55, where TIFF has 42)
whose first IFD carries Panasonic's own low-numbered tags beside the usual
ones. The sensor data starts at RawDataOffset (0x118); StripOffsets is 0xFFFFFFFF.

What a DNG states in tags, an RW2 states in IFD0:

* **Size**: SensorWidth and SensorHeight (0x02, 0x03) are the stored size,
  every row ``SensorWidth`` sensels wide, masked columns included.
* **Crop**: SensorTopBorder, LeftBorder, BottomBorder, RightBorder (0x04-0x07)
  frame the picture; they become DefaultCropOrigin and DefaultCropSize.
* **CFA**: CFAPattern (0x09): 1 = RGGB, 2 = GRBG, 3 = GBRG, 4 = BGGR.
* **Black level**: BlackLevelRed, Green, Blue (0x1C-0x1E) plus 15, as LibRaw
  reads them (128 in the tag is 143 in LibRaw's black on all three 128 bodies
  here; the GF1's 0 is 15).
* **White level**: LinearityLimitRed/Green/Blue (0x0E-0x10) when it is under
  the 12-bit ceiling, else 4095 (the GF1 writes 16383; LibRaw takes 3986 for it
  from a per-model table).
* **As-shot white balance**: WBRedLevel, WBGreenLevel, WBBlueLevel (0x24-0x26),
  or RedBalance and BlueBalance (0x11, 0x12, over 256) on bodies without them.
* **Colour**: like a CR2, ARW, NEF or ORF, an RW2 here develops with the
  camera's ``.dcp`` profile ("Panasonic DMC-GF7 Adobe Standard.dcp", from
  Adobe's free DNG Converter). (Newer RW2s carry a colour matrix in tags
  0x11C-0x120 that this reader does not use yet.)

Storage read: Panasonic's compressed RW2 with RawFormat (0x2D) 4, which every
body in the test set writes (the 2009 GF1 to the 2015 GF7). The data is read in
0x4000-byte blocks, each rotated by 0x2008 bytes (its last 0x1FF8 bytes come
first). Bits are taken from the top of the block downward in 17-bit
positions, little-endian within each 16-byte line. Each run of 14 sensels on a
row resets two predictions (one per column parity); every third sensel
(columns 2, 5, 8 and 11 of the run) reads a 2-bit shift. A sensel whose parity
has seen no non-zero value reads 8 bits (and 4 more when they are non-zero, or
on the run's last two sensels) as its whole value; otherwise it reads 8 bits
as a step of ``j << shift`` from the prediction lowered by ``0x80 << shift``.

The format as dcraw and LibRaw read it (Dave Coffin's ``panasonic_load_raw``
and ``pana_bits``); this is an independent implementation, checked sensel for
sensel against LibRaw 0.22 (``tools/rw2_libraw_check.py``,
``eval/panasonic-rw2-reader-2026-11-14.md``).

Since 2026-11-15 three newer layouts are read too
(``eval/panasonic-rw2-newer-2026-11-15.md``):

* **RawFormat 5** (G9, GH5S): no prediction. Each 16-byte line of the same
  rotated 0x4000-byte block stream holds 10 sensels of 12 bits or 9 of 14,
  taken from the line's lowest bit up (the 16 bytes as one little-endian
  128-bit number).
* **RawFormat 7** (S5): the same 16-byte lines, but stored in order, with no
  block rotation.
* **RawFormat 6** (S1, S1R, S1H): 11 sensels a 16-byte line, read from the
  line's top bit down as 14, 14, then three groups of (2-bit shift code, three
  10-bit values; only two values in the last group). The first value of each column parity is absolute; after it,
  a value is multiplied by ``1 << s`` (s = the code, 3 meaning 4) and, while
  ``0x200 << s`` is below 0x2000 and under the parity's previous value, moved
  up by their difference. 15 is taken off every sensel (0 at most, 0x3FFF on
  overflow), so the black-level tags are used as stored.

On formats 5 to 7 the black-level tags are not raised by 15 and a 14-bit
body's white level is its linearity limit, less 64 on formats 6 and 7 (as
LibRaw: saturated sensels there read anywhere in the top 64 levels). The crop is
the camera's own (tags 0x2F-0x32: an in-camera 1:1 or 16:9 aspect), else the
sensor borders. The older 16-bit RawFormat 2 and 3 are refused, with the reason.

Since 2026-11-15 **RawFormat 8** (GH6, GH7, G9 II, S5 II, S1 II, S9) is read
too (``eval/panasonic-rw2-format8-2026-11-15.md``): tiles across the frame
(tags 0x42-0x48), each a bit stream of Huffman-coded steps over 2x2 blocks
(``_c8_tile_python`` says how). The format as LibRaw 0.22's ``pana8.cpp``
reads it; written here independently, no code copied, and checked sensel for
sensel against LibRaw on ten files from all six bodies. 12- and 14-bit files
take the same white margin as formats 6 and 7; 16-bit files keep 65535.
"""

from __future__ import annotations

import struct
from array import array

from shootflow import raw_develop as rd

TAG_MAKE = 271
TAG_MODEL = 272
PANA_SENSOR_WIDTH = 0x02
PANA_SENSOR_HEIGHT = 0x03
PANA_TOP, PANA_LEFT, PANA_BOTTOM, PANA_RIGHT = 0x04, 0x05, 0x06, 0x07
PANA_CFA = 0x09
PANA_BITS = 0x0A
PANA_COMPRESSION = 0x0B
PANA_LINEARITY = (0x0E, 0x0F, 0x10)
PANA_RED_BALANCE, PANA_BLUE_BALANCE = 0x11, 0x12
PANA_BLACK = (0x1C, 0x1D, 0x1E)
PANA_WB_LEVELS = (0x24, 0x25, 0x26)
PANA_RAW_FORMAT = 0x2D
PANA_RAW_OFFSET = 0x118
PANA_CROP = (0x2F, 0x30, 0x31, 0x32)  # CropTop, CropLeft, CropBottom, CropRight: the in-camera aspect
PANA_JPG_FROM_RAW = 0x2E  # the camera's own JPEG of the frame, with the full EXIF (maker note included)

TAG_EXIF_MAKER_NOTE = 0x927C
TAG_LENS_MODEL = 0xA434
PANA_NOTE_LENS_TYPE = 0x0051  # Panasonic maker note: the lens's name ("LUMIX G 20/F1.7"; ExifTool LensType)
PANA_NOTE_LENS_SERIAL = 0x0052
PANA_NOTE_MAGIC = b"Panasonic\0\0\0"

BLACK_OFFSET = 15  # dcraw and LibRaw add 15 to tags 0x1C-0x1E
BLOCK = 0x4000
SPLIT = 0x2008  # dcraw's load_flags for RW2
RUN = 14
WHITE_MARGIN_14 = 64  # RawFormat 6/7: white = linearity limit less 64 at 14 bits (LibRaw's 16319)
LINE = 16  # RawFormat 5-7: one 16-byte (128-bit) line of packed sensels
C6_PER_LINE = 11
C6_FIELDS = (14, 14, 2, 10, 10, 10, 2, 10, 10, 10, 2, 10, 10, 10)

# CFAPattern (0x09) as the 2x2 pattern (0 = R, 1 = G, 2 = B), row by row.
CFA_CODES = {1: (0, 1, 1, 2), 2: (1, 0, 2, 1), 3: (1, 2, 0, 1), 4: (2, 1, 1, 0)}


def _text(values) -> str:
    return bytes(values or b"").split(b"\0", 1)[0].decode("latin-1").strip()


def _ifds(data: bytes):
    try:
        reader = rd._Reader(data)
        return reader, rd._all_ifds(reader)
    except (rd.DevelopError, struct.error):
        return None


def is_rw2(data: bytes) -> bool:
    """An RW2 header (magic 0x55) with Panasonic's sensor-size tag and no DNGVersion."""

    found = _ifds(data)
    if not found:
        return False
    reader, ifds = found
    if reader.magic != rd.RW2_MAGIC or not ifds or ifds[0].one(rd.TAG_DNG_VERSION) is not None:
        return False
    return ifds[0].one(PANA_SENSOR_WIDTH) is not None


def camera_model(data: bytes) -> str:
    """The camera name a profile is filed under: 'Panasonic DMC-GF7' (Adobe's own naming)."""

    found = _ifds(data)
    if not found or not found[1]:
        return ""
    ifd0 = found[1][0]
    model = _text(ifd0.get(TAG_MODEL))
    make = _text(ifd0.get(TAG_MAKE)) or "Panasonic"
    return f"{make} {model}" if model else ""


# --------------------------------------------------------------------------
# Sensor data


def rotated_blocks(buf: bytes, split: int = SPLIT) -> bytes:
    """Each 0x4000-byte block with its last ``0x4000 - split`` bytes moved first (zeros past the end)."""

    n = -(-len(buf) // BLOCK) * BLOCK
    buf = bytes(buf) + bytes(n - len(buf))
    head = BLOCK - split
    parts = []
    for at in range(0, n, BLOCK):
        parts.append(buf[at + head : at + BLOCK])
        parts.append(buf[at : at + head])
    return b"".join(parts)


def _decode_python(buf: bytes, width: int, height: int) -> array:
    """The reference decoder: ``buf`` is the sensor data from RawDataOffset, ``width`` the stored row width."""

    data = rotated_blocks(buf) + b"\0"
    out = array("H", [0]) * (width * height)
    base = 0  # the current block's first byte in ``data``
    vbits = 0
    first = True

    def bits(n: int) -> int:
        nonlocal vbits, base, first
        if vbits == 0:
            if first:
                first = False
            else:
                base += BLOCK
        vbits = (vbits - n) & 0x1FFFF
        at = base + ((vbits >> 3) ^ 0x3FF0)
        word = data[at] | (data[at + 1] << 8) if at + 1 < len(data) else 0
        return (word >> (vbits & 7)) & ((1 << n) - 1)

    k = 0
    for _row in range(height):
        pred = [0, 0]
        nonz = [0, 0]
        sh = 0
        for col in range(width):
            i = col % RUN
            if i == 0:
                pred[0] = pred[1] = nonz[0] = nonz[1] = 0
            if i % 3 == 2:
                sh = 4 >> (3 - bits(2))
            p = i & 1
            if nonz[p]:
                j = bits(8)
                if j:
                    pred[p] -= 0x80 << sh
                    if pred[p] < 0 or sh == 4:
                        pred[p] &= ~(-1 << sh)
                    pred[p] += j << sh
            else:
                nonz[p] = bits(8)
                if nonz[p] or i > 11:
                    pred[p] = (nonz[p] << 4) | bits(4)
            out[k] = pred[col & 1] & 0xFFFF
            k += 1
    return out


def decode_panasonic(buf: bytes, width: int, height: int, engine: str = "auto") -> array:
    """Panasonic RawFormat 4 sensor data (from RawDataOffset), row-major, ``width`` sensels a row."""

    if engine != "python":
        from shootflow import ljpeg_native

        if ljpeg_native.available():
            got = ljpeg_native.panasonic_run(rotated_blocks(buf), width, height)
            if got is not None:
                return got
        elif engine == "native":
            raise RuntimeError("native decoder is not available")
    return _decode_python(buf, width, height)


def packed_per_line(bits: int) -> int:
    """Sensels in one 16-byte line of RawFormat 5 and 7: 10 of 12 bits, 9 of 14."""

    return 128 // bits


def _packed_python(data: bytes, width: int, height: int, bits: int) -> array:
    """RawFormat 5/7 reference: each 16-byte line, as a little-endian 128-bit number, holds
    ``128 // bits`` sensels from its lowest bit up. ``data`` is already in reading order."""

    per = packed_per_line(bits)
    lines = width // per
    mask = (1 << bits) - 1
    out = array("H", [0]) * (width * height)
    at = 0
    for row in range(height):
        k = row * width
        for _ in range(lines):
            v = int.from_bytes(data[at : at + LINE], "little")
            at += LINE
            for _i in range(per):
                out[k] = v & mask
                v >>= bits
                k += 1
    return out


def _c6_python(data: bytes, width: int, height: int) -> array:
    """RawFormat 6 reference: 11 sensels a 16-byte line (see the module docstring)."""

    lines = width // C6_PER_LINE
    out = array("H", [0]) * (width * height)
    at = 0
    for row in range(height):
        k = row * width
        for _ in range(lines):
            v = int.from_bytes(data[at : at + LINE], "little")
            at += LINE
            pos = 128
            vals = []
            for w in C6_FIELDS:
                pos -= w
                vals.append((v >> pos) & ((1 << w) - 1))
            it = iter(vals)
            first = [0, 0]
            prev = [0, 0]
            mul = base = 0
            for pix in range(C6_PER_LINE):
                if pix % 3 == 2:
                    code = next(it)
                    if code == 3:
                        code = 4
                    mul, base = 1 << code, 0x200 << code
                e = next(it)
                p = pix & 1
                if first[p]:
                    e *= mul
                    if base < 0x2000 and prev[p] > base:
                        e += prev[p] - base
                    prev[p] = e
                else:
                    first[p] = e
                    if e:
                        prev[p] = e
                    else:
                        e = prev[p]
                e -= BLACK_OFFSET
                out[k] = 0 if e < 0 else (e if e <= 0xFFFF else 0x3FFF)
                k += 1
    return out


def decode_newer(buf: bytes, width: int, height: int, fmt: int, bits: int, engine: str = "auto") -> array:
    """RawFormat 5, 6 or 7 sensor data (from RawDataOffset), row-major, ``width`` sensels a row."""

    per = C6_PER_LINE if fmt == 6 else packed_per_line(bits)
    need = width // per * LINE * height
    if fmt == 5:
        data = rotated_blocks(buf[: need + BLOCK])[:need]
    else:
        data = bytes(buf[:need])
    if len(data) < need:
        raise rd.DevelopError(f"RW2: the sensor data is cut short ({len(data)} of {need} bytes)")
    if engine != "python":
        from shootflow import ljpeg_native

        got = None
        if ljpeg_native.available():
            got = (ljpeg_native.panasonic_c6_run(data, width, height) if fmt == 6
                   else ljpeg_native.panasonic_packed_run(data, width, height, bits))
        if got is not None:
            return got
        if engine == "native":
            raise RuntimeError("native decoder is not available")
    return _c6_python(data, width, height) if fmt == 6 else _packed_python(data, width, height, bits)


# --------------------------------------------------------------------------
# RawFormat 8 (GH6 and later): Huffman-coded 2x2 blocks in tiles

C8_TILE_COLS, C8_TILE_ROWS = 0x42, 0x43
C8_TILE_OFFSETS, C8_TILE_LEFT, C8_TILE_BITS = 0x44, 0x45, 0x46
C8_TILE_WIDTH, C8_TILE_HEIGHT = 0x47, 0x48
C8_CURVE_SHIFTS, C8_CURVE_KNEES, C8_CURVE_TOP = 0x39, 0x3A, 0x3B
C8_INITIAL = (0x3C, 0x3D, 0x3E, 0x3F)
C8_CODES, C8_CODE_SHIFTS = 0x40, 0x41
C8_SYMBOLS = 17
C8_MAX_TILES = 12
# Decoding order inside a 2x2 block, as (row, column): top-left, bottom-left, top-right, bottom-right.
C8_ORDER = ((0, 0), (1, 0), (0, 1), (1, 1))
_REVERSED = bytes(int(f"{b:08b}"[::-1], 2) for b in range(256))


class C8Params:
    """The RawFormat 8 tables from IFD0: one Huffman code per symbol (the symbol is how many bits
    the step takes, as in lossless JPEG), a per-symbol shift, the four starting values and the
    tiles. Raises ``DevelopError`` on anything outside what the six checked bodies write."""

    def __init__(self, ifd0: rd.Ifd, width: int, height: int, size: int):
        def counted(tag, item, count):
            raw = bytes(ifd0.entries.get(tag) or b"")
            fmt = ifd0.byte_order
            if len(raw) < 2:
                raise rd.DevelopError(f"RW2 RawFormat 8: tag 0x{tag:X} is missing")
            n = struct.unpack(fmt + "H", raw[:2])[0]
            if n > count or len(raw) < 2 + n * struct.calcsize(item):
                raise rd.DevelopError(f"RW2 RawFormat 8: tag 0x{tag:X} is malformed")
            return list(struct.unpack(fmt + item * n, raw[2 : 2 + n * struct.calcsize(item)]))

        pairs = counted(C8_CODES, "HH", C8_SYMBOLS)
        pairs += [0, 0] * (C8_SYMBOLS - len(pairs) // 2)
        self.lengths = [min(v, 16) for v in pairs[0::2]]
        self.codes = [min(v, 0xFFF) for v in pairs[1::2]]
        shifts = counted(C8_CODE_SHIFTS, "H", C8_SYMBOLS)
        self.shifts = [min(v, 16) for v in shifts] + [0] * (C8_SYMBOLS - len(shifts))
        self.initial = [int(ifd0.one(t, 0) or 0) for t in C8_INITIAL]
        self.top = int(ifd0.one(C8_CURVE_TOP, 0xFFFF) or 0xFFFF)
        self.curve = self._curve(counted(C8_CURVE_SHIFTS, "I", 6), counted(C8_CURVE_KNEES, "HH", 6))
        self.lookup = self._lookup()

        cols, rows = int(ifd0.one(C8_TILE_COLS, 0) or 0), int(ifd0.one(C8_TILE_ROWS, 0) or 0)
        n = cols * rows
        if not 1 <= n <= C8_MAX_TILES:
            raise rd.DevelopError(f"RW2 RawFormat 8: {cols} x {rows} tiles is outside 1-{C8_MAX_TILES}")
        offsets = counted(C8_TILE_OFFSETS, "I", C8_MAX_TILES)
        lefts = counted(C8_TILE_LEFT, "I", C8_MAX_TILES)
        bits = counted(C8_TILE_BITS, "I", C8_MAX_TILES)
        widths = counted(C8_TILE_WIDTH, "H", C8_MAX_TILES)
        heights = counted(C8_TILE_HEIGHT, "H", C8_MAX_TILES)
        if min(len(offsets), len(lefts), len(bits), len(widths), len(heights)) < n:
            raise rd.DevelopError("RW2 RawFormat 8: fewer tile entries than tiles")
        self.tiles = []
        for t in range(n):
            row, col = divmod(t, cols)
            top = sum(heights[k] for k in range(col, t, cols))
            # Tag 0x45 packs the tile's top row into its high 16 bits and its left edge into the low
            # 16: single-row grids only ever show the left, but the S1R II's 177 MP mode (4 x 2
            # tiles) writes 0x16000000 for the second row's first tile, top 5632 and left 0
            # (eval/panasonic-rw2-format8-grid-2026-11-18.md). The stored top must agree with the
            # heights above it.
            stored_top, left = lefts[t] >> 16, lefts[t] & 0xFFFF
            if stored_top != top:
                raise rd.DevelopError(
                    f"RW2 RawFormat 8: tile {t} says it starts at row {stored_top}, the tiles above it end at {top}"
                )
            lefts[t] = left
            w, h = widths[t], heights[t]
            if not w or not h or w % 2 or h % 2 or lefts[t] + w > width or top + h > height:
                raise rd.DevelopError(f"RW2 RawFormat 8: tile {t} ({w} x {h} at {lefts[t]}, {top}) does not fit")
            nbytes = (bits[t] + 7) // 8
            if offsets[t] + nbytes > size:
                raise rd.DevelopError(f"RW2 RawFormat 8: tile {t} runs past the end of the file")
            self.tiles.append((offsets[t], nbytes, lefts[t], top, w, h))
        for r in range(rows):
            if sum(self.tiles[r * cols + c][4] for c in range(cols)) != width:
                raise rd.DevelopError("RW2 RawFormat 8: the tiles do not cover the row")
        for c in range(cols):
            if sum(self.tiles[r * cols + c][5] for r in range(rows)) != height:
                raise rd.DevelopError("RW2 RawFormat 8: the tiles do not cover the column")

    def _curve(self, shifts, knees):
        """The tone curve of tags 0x39/0x3A as a 65536-entry table, or None when it is the identity
        (every checked body). Only the identity is accepted: no file with another curve was at hand,
        so its meaning is unchecked."""

        knees = knees[1::2] + [0] * (6 - len(knees) // 2)
        shifts = shifts + [0] * (6 - len(shifts))
        if any(k for k in knees) or any(s & 0x1F for s in shifts):
            raise rd.DevelopError(
                "RW2 RawFormat 8: this file carries a tone curve (tags 0x39/0x3A) that no checked body uses; "
                "convert to DNG"
            )
        return None

    def _lookup(self) -> bytes:
        """For every value of the next 16 bits, the symbol whose code they start with: the first
        match in table order, 17 when none matches (a corrupt stream)."""

        table = bytearray([17]) * 0x10000
        for sym in range(C8_SYMBOLS - 1, -1, -1):
            n = self.lengths[sym]
            if not n:
                continue
            code = self.codes[sym] & ((1 << n) - 1)
            start = code << (16 - n)
            table[start : start + (1 << (16 - n))] = bytes([sym]) * (1 << (16 - n))
        return bytes(table)


def _c8_tile_python(data: bytes, p: C8Params, width: int, height: int, pairs: int | None = None) -> array:
    """One RawFormat 8 tile: ``width`` x ``height`` sensels, row-major. ``pairs`` stops after that
    many row pairs (for checks on part of a frame).

    The tile is one bit stream, each byte read from its lowest bit. Sensels come in 2x2 blocks,
    left to right along each pair of rows, in the order of ``C8_ORDER``. Each sensel is a
    Huffman symbol k with shift s, then k - s raw bits r (none when k <= s); the step is
    ``r << s`` when r's top bit is set, else ``(r << s) - 2**k`` (+1 when s is 0), plus
    ``2**(s-1)`` when s > 0. When k <= s the step's sign comes from the next bit, which is not
    taken. The step is added to the same position of the block to the left (the first block of a
    row pair: the first block of the pair above; the first pair: tags 0x3C-0x3F), and the sum is
    held to 0..tag 0x3B."""

    stream = data.translate(_REVERSED)  # now most significant bit first
    nbytes = len(stream)
    acc, have, at = 0, 0, 0
    lookup, lengths, shifts = p.lookup, p.lengths, p.shifts
    top = p.top
    rows = height // 2 if pairs is None else min(height // 2, pairs)
    out = array("H", [0]) * (width * rows * 2)
    first = list(p.initial)  # TL, TR, BL, BR
    for pair in range(rows):
        base = list(first)
        r0 = 2 * pair * width
        r1 = r0 + width
        for col in range(0, width, 2):
            block = [0, 0, 0, 0]
            for slot in (0, 2, 1, 3):
                while have < 48:
                    acc = (acc << 8) | (stream[at] if at < nbytes else 0)
                    at += 1
                    have += 8
                sym = lookup[(acc >> (have - 16)) & 0xFFFF]
                if sym >= C8_SYMBOLS:
                    raise rd.DevelopError("RW2 RawFormat 8: a code matches no symbol (corrupt data)")
                have -= lengths[sym]
                s = shifts[sym]
                extra = sym - s
                if extra > 0:
                    have -= extra
                    raw = (acc >> have) & ((1 << extra) - 1)
                    step = raw << s if raw >> (extra - 1) else (raw << s) - (1 << sym) + (0 if s else 1)
                elif sym and not (acc >> (have - 1)) & 1:
                    step = -(1 << sym)
                else:
                    step = 0
                if s:
                    step += 1 << (s - 1)
                acc &= (1 << have) - 1
                v = base[slot] + step
                block[slot] = 0 if v < 0 else top if v > top else v
            base = block
            if col == 0:
                first = list(block)
            out[r0 + col], out[r0 + col + 1], out[r1 + col], out[r1 + col + 1] = block
    return out


def decode_c8(data: bytes, p: C8Params, width: int, height: int, engine: str = "auto", pairs: int | None = None) -> array:
    """A whole RawFormat 8 frame from its tiles, row-major (``pairs``: decode only that many row
    pairs of each tile; the rest stays 0)."""

    out = array("H", [0]) * (width * height)
    native = None
    if engine != "python":
        from shootflow import ljpeg_native

        native = ljpeg_native if ljpeg_native.available() and hasattr(ljpeg_native, "panasonic_c8_tile") else None
        if native is None and engine == "native":
            raise RuntimeError("native decoder is not available")
    for offset, nbytes, left, top_row, w, h in p.tiles:
        chunk = data[offset : offset + nbytes]
        tile = native.panasonic_c8_tile(chunk, p, w, h, pairs) if native is not None else None
        if tile is None:
            tile = _c8_tile_python(chunk, p, w, h, pairs)
        rows = len(tile) // w
        for r in range(rows):
            k = (top_row + r) * width + left
            out[k : k + w] = tile[r * w : (r + 1) * w]
    return out


def black_per_position(levels, pattern, offset: int = BLACK_OFFSET) -> tuple[float, ...]:
    """BlackLevelRed, Green, Blue (+15 on RawFormat 4) placed on the 2x2 CFA positions."""

    return tuple(float(levels[colour] + offset) for colour in pattern)


def parse_rw2(data: bytes, engine: str = "auto") -> rd.RawImage:
    """An RW2's sensor data and DNG-equivalent tags."""

    found = _ifds(data)
    if not found or not found[1]:
        raise rd.DevelopError("not a TIFF raw (no IFDs)")
    reader, ifds = found
    if not is_rw2(data):
        raise rd.DevelopError("not a Panasonic RW2")
    ifd0 = ifds[0]
    width, height = ifd0.one(PANA_SENSOR_WIDTH), ifd0.one(PANA_SENSOR_HEIGHT)
    if not width or not height or width * height > 400_000_000:
        raise rd.DevelopError("raw image size is missing or implausible")
    fmt = ifd0.one(PANA_RAW_FORMAT, 0)
    compression = ifd0.one(PANA_COMPRESSION, 0)
    bits = ifd0.one(PANA_BITS, 12)
    c8 = None
    if fmt == 8:
        if bits not in (12, 14, 16):
            raise rd.DevelopError(f"this RW2 layout (RawFormat 8, {bits}-bit) is not supported; convert to DNG")
        c8 = C8Params(ifd0, width, height, len(data))
    elif fmt not in (4, 5, 6, 7) or compression != 34316 or (fmt == 4 and bits != 12) or bits not in (12, 14) \
            or (fmt == 6 and bits != 14):
        raise rd.DevelopError(
            f"this RW2 layout (RawFormat {fmt}, compression {compression}, {bits}-bit) is not supported; convert to DNG"
        )
    per = RUN if fmt in (4, 8) else C6_PER_LINE if fmt == 6 else packed_per_line(bits)
    if fmt not in (4, 8) and width % per:
        raise rd.DevelopError(
            f"RW2 RawFormat {fmt}: a row of {width} sensels is not whole {per}-sensel lines (no test file); convert to DNG"
        )
    start = ifd0.one(PANA_RAW_OFFSET)
    if c8 is not None:
        values = decode_c8(data, c8, width, height, engine)
        notes = [f"RW2: Panasonic RawFormat 8, {bits}-bit, {len(c8.tiles)} tiles"]
    elif not start or start >= len(data):
        raise rd.DevelopError("RW2 has no RawDataOffset inside the file")
    elif fmt == 4:
        values = decode_panasonic(data[start:], width, height, engine)
        notes = ["RW2: Panasonic compressed (RawFormat 4, 12-bit)"]
    else:
        values = decode_newer(data[start:], width, height, fmt, bits, engine)
        notes = [f"RW2: Panasonic RawFormat {fmt}, {bits}-bit"]

    pattern = CFA_CODES.get(ifd0.one(PANA_CFA, 0))
    if pattern is None:
        raise rd.DevelopError(f"RW2 CFAPattern {ifd0.one(PANA_CFA)} is not one of 1-4")
    levels = [ifd0.one(t) for t in PANA_BLACK]
    offset = BLACK_OFFSET if fmt == 4 else 0
    black = black_per_position(levels, pattern, offset) if all(v is not None for v in levels) else (0.0,) * 4
    top = (1 << bits) - 1
    limits = [ifd0.one(t) for t in PANA_LINEARITY]
    white = min(int(v) for v in limits) if all(limits) else top
    white = min(white, top)
    if fmt in (6, 7) or (fmt == 8 and bits < 16):
        # A saturated photosite reads anywhere in the top 64 levels on these bodies (a real S1 frame:
        # 144,576 sensels at 16352-16355, 32,128 at 16368; an S1 II high-resolution frame: 474,477 at
        # 16381-16382); LibRaw's margin catches all of them. 16-bit RawFormat 8 keeps 65535, as LibRaw.
        white -= WHITE_MARGIN_14 >> (14 - bits)
    as_shot = None
    wb = [ifd0.one(t) for t in PANA_WB_LEVELS]
    if all(wb) and wb[1] > 0:
        as_shot = (wb[0] / wb[1], 1.0, wb[2] / wb[1])
    else:
        red, blue = ifd0.one(PANA_RED_BALANCE), ifd0.one(PANA_BLUE_BALANCE)
        if red and blue:
            as_shot = (red / 256.0, 1.0, blue / 256.0)
    if as_shot is None:
        notes.append("no Panasonic as-shot white balance (0x24-0x26)")

    synth = rd.Ifd(byte_order=reader.end)
    synth.entries = {
        rd.TAG_WIDTH: (width,),
        rd.TAG_HEIGHT: (height,),
        rd.TAG_BITS: (bits,),
        rd.TAG_SAMPLES: (1,),
        rd.TAG_PHOTOMETRIC: (rd.PHOTOMETRIC_CFA,),
        rd.TAG_CFA_REPEAT: (2, 2),
        rd.TAG_CFA_PATTERN: tuple(pattern),
        rd.TAG_ACTIVE_AREA: (0, 0, height, width),
        rd.TAG_BLACK_REPEAT: (2, 2),
        rd.TAG_BLACK_LEVEL: black,
        rd.TAG_WHITE_LEVEL: (white,),
    }
    crop = sensor_crop(ifd0, width, height)
    if crop is not None:
        synth.entries[rd.TAG_CROP_ORIGIN] = crop[:2]
        synth.entries[rd.TAG_CROP_SIZE] = crop[2:4]
        notes.append(f"RW2: {crop[4]}, {crop[2]}x{crop[3]} at ({crop[0]}, {crop[1]})")
    if as_shot is not None:
        synth.entries[rd.TAG_AS_SHOT_NEUTRAL] = tuple(1.0 / v for v in as_shot)
    head = rd.Ifd(entries=dict(ifd0.entries), byte_order=reader.end)
    head.entries[rd.TAG_UNIQUE_CAMERA_MODEL] = tuple(camera_model(data).encode("latin-1")) + (0,)
    exif, lens_note = rw2_exif(data, reader, ifd0)
    if lens_note:
        notes.append(lens_note)
    return rd.RawImage(width, height, 1, values, synth, head, source="rw2", notes=notes, exif=exif)


# --------------------------------------------------------------------------
# The embedded JPEG's EXIF: where an RW2 keeps its lens


def _jpeg_exif(jpg: bytes) -> bytes | None:
    """The TIFF block of a JPEG's first APP1 "Exif" segment, or None."""

    if jpg[:2] != b"\xff\xd8":
        return None
    pos = 2
    while pos + 4 <= len(jpg):
        if jpg[pos] != 0xFF:
            return None
        marker = jpg[pos + 1]
        if marker == 0xFF:  # fill byte
            pos += 1
            continue
        if marker in (0xD9, 0xDA):  # end of image, start of scan: no EXIF before the picture data
            return None
        size = struct.unpack_from(">H", jpg, pos + 2)[0]
        if size < 2:
            return None
        body = jpg[pos + 4 : pos + 2 + size]
        if marker == 0xE1 and body[:6] == b"Exif\0\0":
            return body[6:]
        pos += 2 + size
    return None


def embedded_exif(data: bytes, ifd0: rd.Ifd) -> tuple[rd.Ifd | None, rd.Ifd | None]:
    """The EXIF IFD and the Panasonic maker note of the JPEG an RW2 embeds (tag 0x2E, JpgFromRaw).

    The RW2's own EXIF IFD (0x8769) holds exposure and focal length but, on the four bodies checked here
    (GF1, GF3, GF7, LX7), no LensModel and no maker note. The camera writes the full EXIF into the JPEG
    preview it embeds instead, and its maker note ("Panasonic\\0\\0\\0", then an IFD whose offsets count
    from that EXIF's TIFF header; ExifTool's Panasonic.pm, Exiv2's panasonicmn) names the lens in tag
    0x51, LensType. Either half is None when the file does not have it.
    """

    at = ifd0.offsets.get(PANA_JPG_FROM_RAW)
    values = ifd0.entries.get(PANA_JPG_FROM_RAW)
    if at is None or not values:
        return None, None
    tiff = _jpeg_exif(data[at : at + len(values)])
    if not tiff:
        return None, None
    try:
        reader = rd._Reader(tiff)
        if reader.magic != 42:
            return None, None
        jifd0 = reader.read_ifd(reader.first_ifd_offset())[0]
    except (rd.DevelopError, struct.error):
        return None, None
    exif = rd.exif_ifd(reader, jifd0)
    if exif is None:
        return None, None
    note = None
    note_at = exif.offsets.get(TAG_EXIF_MAKER_NOTE)
    if note_at is not None and tiff[note_at : note_at + len(PANA_NOTE_MAGIC)] == PANA_NOTE_MAGIC:
        try:
            note = reader.read_ifd(note_at + len(PANA_NOTE_MAGIC))[0]
        except (rd.DevelopError, struct.error):
            note = None
    return exif, note


def rw2_exif(data: bytes, reader, ifd0: rd.Ifd) -> tuple[rd.Ifd | None, str | None]:
    """The RW2's EXIF IFD completed from the embedded JPEG's: tags the raw's own EXIF lacks are added, and
    the maker note's LensType becomes LensModel when neither EXIF names the lens. Returns the IFD and a
    note saying where the lens name came from (None when it came from nowhere new)."""

    own = rd.exif_ifd(reader, ifd0)
    jexif, note = embedded_exif(data, ifd0)
    if jexif is None:
        return own, None
    merged = rd.Ifd(byte_order=own.byte_order if own is not None else reader.end)
    if own is not None:
        merged.entries = dict(own.entries)
        merged.offsets, merged.source = dict(own.offsets), own.source
    for tag, values in jexif.entries.items():
        # The JPEG's maker note stays out: its offsets count from the JPEG's EXIF, not from this file.
        if tag not in merged.entries and tag != TAG_EXIF_MAKER_NOTE:
            merged.entries[tag] = values
    lens_note = None
    if _text(merged.get(TAG_LENS_MODEL)):
        if TAG_LENS_MODEL not in (own.entries if own is not None else {}):
            lens_note = f"RW2: lens {_text(merged.get(TAG_LENS_MODEL))!r} from the embedded JPEG's EXIF"
    elif note is not None:
        name = _text(note.get(PANA_NOTE_LENS_TYPE))
        if name:
            merged.entries[TAG_LENS_MODEL] = tuple(name.encode("latin-1")) + (0,)
            lens_note = f"RW2: lens {name!r} from the embedded JPEG's Panasonic maker note (LensType)"
    return merged, lens_note


def sensor_crop(ifd0: rd.Ifd, width: int, height: int):
    """The frame as (x, y, w, h, what): the camera's crop (0x2F-0x32, top, left, bottom, right: the
    aspect ratio chosen in the camera) when present and inside the sensor borders' limits, else the
    sensor borders (0x04-0x07). None when neither fits the stored size."""

    for tags, what in ((PANA_CROP, "the in-camera crop"), ((PANA_TOP, PANA_LEFT, PANA_BOTTOM, PANA_RIGHT), "the sensor borders")):
        top, left, bottom, right = (ifd0.one(t) for t in tags)
        if None in (top, left, bottom, right):
            continue
        if 0 <= left < right <= width and 0 <= top < bottom <= height:
            return left, top, right - left, bottom - top, what
    return None


__all__ = [
    "black_per_position",
    "camera_model",
    "decode_newer",
    "decode_panasonic",
    "embedded_exif",
    "is_rw2",
    "parse_rw2",
    "rotated_blocks",
    "rw2_exif",
    "sensor_crop",
]
