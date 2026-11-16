"""Read a Canon CRW (CIFF) straight into the developer, standard library only.

A CRW is not a TIFF. It is Canon's Camera Image File Format (CIFF, 1997-2004: the EOS D30,
D60, 10D, 300D and the PowerShot G2 to G6, Pro1 and S30 to S70): a 26-byte header (byte order
``II``, the header length, ``HEAPCCDR``) and then a *heap*. A heap ends with a 4-byte offset to
its record table; the table is a 16-bit count and 10-byte records (type, length, offset from the
heap's start). A record whose type's high byte is 0x28 or 0x30 is itself a heap. The records
read here:

* **0x2005, the raw data**, the first record (at byte 26). Its first ``width * height / 4``
  bytes are the low two bits of every sensel when the body stores 12 bits (four sensels to a
  byte, least significant pair first); the compressed high ten bits follow 514 bytes after the
  record's start, or after the low bits. Whether the low bits are there is read from the stream,
  as dcraw does: Canon's coder follows every 0xFF with 0x00, so a 0xFF followed by anything else
  in the first 16 KB from byte 540 means those bytes are the low bits, not the coded stream.
* **The coded stream** (dcraw's ``canon_load_raw``): JPEG-style byte stuffing (0xFF 0x00 reads
  as 0xFF), MSB first, in blocks of 64 sensels taken in raster order (eight rows at a time).
  Each block is a run-length list of coefficients like a JPEG block: the first through a
  "first" Huffman tree, the rest through a "second" one; a symbol's high nibble is a run of
  zeros to skip, its low nibble the number of difference bits that follow (sign as in JPEG);
  symbol 0 after the first ends the block and 0xFF skips one place. The first coefficient
  carries over from block to block. A block's 64 differences then add, alternately, to two
  running values that restart at 512 at the start of every row. Each value is 10 bits. The
  pair of trees is one of three, chosen by record 0x1835 (``CRW_TREES``: the code lengths and
  symbols as dcraw and LibRaw list them; they are the format's own tables).
* **0x080A**: the make and model, two NUL-ended strings ("Canon", "Canon EOS 10D").
* **0x1031, SensorInfo**: the stored size and the picture's left, top, right and bottom
  (inclusive), as in a CR2's maker note 0x00E0; the columns left of it are masked.
* **0x1810, ImageSpec**: the picture's width and height and its rotation in degrees.
* **0x102A, ShotInfo**: the white balance index the camera was set to (its 8th 16-bit value).
* **The as-shot white balance**, by family (record layouts as LibRaw's ``parse_ciff`` reads them):
  0x10A9 ColorBalance on the D60, 10D and 300D (the Auto levels, then presets the index picks);
  0x102C ColorInfo2 on the G2, S30 and S40 (the shot's levels); 0x0032 ColorInfo1 on the G3, G5,
  G6, Pro1, S45, S50, S60 and S70, a table of preset levels (XOR-keyed on some bodies) of which
  the shot's index picks one. When the camera was on Auto those bodies keep no levels for the
  shot, and the file develops with none (and says so), as LibRaw does.

What this reader works out (as for a CR2):

* **Black level**: the median of the masked columns left of the picture, per 2x2 position.
* **White level**: the clip pile when the frame has one (``cr2._white_from_clipping``; the EOS
  bodies clip near 4,000 of 4,095), else the stream's full scale (1,023 or 4,095).
* **CFA**: every Bayer CIFF body is RGGB at the sensor's first sensel, as LibRaw reads all 15
  checked here; the pattern is restated relative to the picture's corner. The PowerShot G1,
  Pro70 and Pro90 IS have a cyan-magenta-yellow-green filter, which the developer cannot use:
  they are refused with the reason.
* **Colour**: like a CR2, a CRW carries no colour matrix, so it develops with the camera's
  ``.dcp`` profile ("Canon EOS 10D Adobe Standard.dcp", from Adobe's free DNG Converter).

An independent implementation, checked sensel for sensel against LibRaw 0.22 on 20 public files
from 15 bodies (``tools/crw_libraw_check.py``, ``eval/canon-crw-reader-2026-11-16.md``).
"""

from __future__ import annotations

import re
import struct
from array import array

from shootflow import raw_develop as rd

HEADER_MAGIC = b"HEAPCCDR"

REC_RAW = 0x2005
REC_MAKE_MODEL = 0x080A
REC_FIRMWARE = 0x080B
REC_IMAGE_SPEC = 0x1810
REC_SENSOR_INFO = 0x1031
REC_DECODER_TABLE = 0x1835
REC_SHOT_INFO = 0x102A
REC_COLOR_INFO2 = 0x102C
REC_COLOR_INFO1 = 0x0032
REC_COLOR_BALANCE = 0x10A9

# Bodies whose CIFF files carry a cyan, magenta, yellow and green filter (four colours): not developable here.
CMYG_MODELS = ("PowerShot G1", "PowerShot Pro70", "PowerShot Pro90 IS")

# The three pairs of Huffman trees (record 0x1835 picks one): 16 counts of codes of length 1 to 16, then the
# symbols in code order. A symbol is (zero run << 4) | difference bits. Values as in dcraw's and LibRaw's
# ``crw_init_tables``.
FIRST_TREES = (
    (0, 1, 4, 2, 3, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0,
     0x04, 0x03, 0x05, 0x06, 0x02, 0x07, 0x01, 0x08, 0x09, 0x00, 0x0A, 0x0B, 0xFF),
    (0, 2, 2, 3, 1, 1, 1, 1, 2, 0, 0, 0, 0, 0, 0, 0,
     0x03, 0x02, 0x04, 0x01, 0x05, 0x00, 0x06, 0x07, 0x09, 0x08, 0x0A, 0x0B, 0xFF),
    (0, 0, 6, 3, 1, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0,
     0x06, 0x05, 0x07, 0x04, 0x08, 0x03, 0x09, 0x02, 0x00, 0x0A, 0x01, 0x0B, 0xFF),
)
SECOND_TREES = (
    (0, 2, 2, 2, 1, 4, 2, 1, 2, 5, 1, 1, 0, 0, 0, 139,
     0x03, 0x04, 0x02, 0x05, 0x01, 0x06, 0x07, 0x08, 0x12, 0x13, 0x11, 0x14, 0x09, 0x15, 0x22, 0x00, 0x21, 0x16,
     0x0A, 0xF0, 0x23, 0x17, 0x24, 0x31, 0x32, 0x18, 0x19, 0x33, 0x25, 0x41, 0x34, 0x42, 0x35, 0x51, 0x36, 0x37,
     0x38, 0x29, 0x79, 0x26, 0x1A, 0x39, 0x56, 0x57, 0x28, 0x27, 0x52, 0x55, 0x58, 0x43, 0x76, 0x59, 0x77, 0x54,
     0x61, 0xF9, 0x71, 0x78, 0x75, 0x96, 0x97, 0x49, 0xB7, 0x53, 0xD7, 0x74, 0xB6, 0x98, 0x47, 0x48, 0x95, 0x69,
     0x99, 0x91, 0xFA, 0xB8, 0x68, 0xB5, 0xB9, 0xD6, 0xF7, 0xD8, 0x67, 0x46, 0x45, 0x94, 0x89, 0xF8, 0x81, 0xD5,
     0xF6, 0xB4, 0x88, 0xB1, 0x2A, 0x44, 0x72, 0xD9, 0x87, 0x66, 0xD4, 0xF5, 0x3A, 0xA7, 0x73, 0xA9, 0xA8, 0x86,
     0x62, 0xC7, 0x65, 0xC8, 0xC9, 0xA1, 0xF4, 0xD1, 0xE9, 0x5A, 0x92, 0x85, 0xA6, 0xE7, 0x93, 0xE8, 0xC1, 0xC6,
     0x7A, 0x64, 0xE1, 0x4A, 0x6A, 0xE6, 0xB3, 0xF1, 0xD3, 0xA5, 0x8A, 0xB2, 0x9A, 0xBA, 0x84, 0xA4, 0x63, 0xE5,
     0xC5, 0xF3, 0xD2, 0xC4, 0x82, 0xAA, 0xDA, 0xE4, 0xF2, 0xCA, 0x83, 0xA3, 0xA2, 0xC3, 0xEA, 0xC2, 0xE2, 0xE3,
     0xFF, 0xFF),
    (0, 2, 2, 1, 4, 1, 4, 1, 3, 3, 1, 0, 0, 0, 0, 140,
     0x02, 0x03, 0x01, 0x04, 0x05, 0x12, 0x11, 0x06, 0x13, 0x07, 0x08, 0x14, 0x22, 0x09, 0x21, 0x00, 0x23, 0x15,
     0x31, 0x32, 0x0A, 0x16, 0xF0, 0x24, 0x33, 0x41, 0x42, 0x19, 0x17, 0x25, 0x18, 0x51, 0x34, 0x43, 0x52, 0x29,
     0x35, 0x61, 0x39, 0x71, 0x62, 0x36, 0x53, 0x26, 0x38, 0x1A, 0x37, 0x81, 0x27, 0x91, 0x79, 0x55, 0x45, 0x28,
     0x72, 0x59, 0xA1, 0xB1, 0x44, 0x69, 0x54, 0x58, 0xD1, 0xFA, 0x57, 0xE1, 0xF1, 0xB9, 0x49, 0x47, 0x63, 0x6A,
     0xF9, 0x56, 0x46, 0xA8, 0x2A, 0x4A, 0x78, 0x99, 0x3A, 0x75, 0x74, 0x86, 0x65, 0xC1, 0x76, 0xB6, 0x96, 0xD6,
     0x89, 0x85, 0xC9, 0xF5, 0x95, 0xB4, 0xC7, 0xF7, 0x8A, 0x97, 0xB8, 0x73, 0xB7, 0xD8, 0xD9, 0x87, 0xA7, 0x7A,
     0x48, 0x82, 0x84, 0xEA, 0xF4, 0xA6, 0xC5, 0x5A, 0x94, 0xA4, 0xC6, 0x92, 0xC3, 0x68, 0xB5, 0xC8, 0xE4, 0xE5,
     0xE6, 0xE9, 0xA2, 0xA3, 0xE3, 0xC2, 0x66, 0x67, 0x93, 0xAA, 0xD4, 0xD5, 0xE7, 0xF8, 0x88, 0x9A, 0xD7, 0x77,
     0xC4, 0x64, 0xE2, 0x98, 0xA5, 0xCA, 0xDA, 0xE8, 0xF3, 0xF6, 0xA9, 0xB2, 0xB3, 0xF2, 0xD2, 0x83, 0xBA, 0xD3,
     0xFF, 0xFF),
    (0, 0, 6, 2, 1, 3, 3, 2, 5, 1, 2, 2, 8, 10, 0, 117,
     0x04, 0x05, 0x03, 0x06, 0x02, 0x07, 0x01, 0x08, 0x09, 0x12, 0x13, 0x14, 0x11, 0x15, 0x0A, 0x16, 0x17, 0xF0,
     0x00, 0x22, 0x21, 0x18, 0x23, 0x19, 0x24, 0x32, 0x31, 0x25, 0x33, 0x38, 0x37, 0x34, 0x35, 0x36, 0x39, 0x79,
     0x57, 0x58, 0x59, 0x28, 0x56, 0x78, 0x27, 0x41, 0x29, 0x77, 0x26, 0x42, 0x76, 0x99, 0x1A, 0x55, 0x98, 0x97,
     0xF9, 0x48, 0x54, 0x96, 0x89, 0x47, 0xB7, 0x49, 0xFA, 0x75, 0x68, 0xB6, 0x67, 0x69, 0xB9, 0xB8, 0xD8, 0x52,
     0xD7, 0x88, 0xB5, 0x74, 0x51, 0x46, 0xD9, 0xF8, 0x3A, 0xD6, 0x87, 0x45, 0x7A, 0x95, 0xD5, 0xF6, 0x86, 0xB4,
     0xA9, 0x94, 0x53, 0x2A, 0xA8, 0x43, 0xF5, 0xF7, 0xD4, 0x66, 0xA7, 0x5A, 0x44, 0x8A, 0xC9, 0xE8, 0xC8, 0xE7,
     0x9A, 0x6A, 0x73, 0x4A, 0x61, 0xC7, 0xF4, 0xC6, 0x65, 0xE9, 0x72, 0xE6, 0x71, 0x91, 0x93, 0xA6, 0xDA, 0x92,
     0x85, 0x62, 0xF3, 0xC5, 0xB2, 0xA4, 0x84, 0xBA, 0x64, 0xA5, 0xB3, 0xD2, 0x81, 0xE5, 0xD3, 0xAA, 0xC4, 0xCA,
     0xF2, 0xB1, 0xE4, 0xD1, 0x83, 0x63, 0xEA, 0xC3, 0xE2, 0x82, 0xF1, 0xA3, 0xC2, 0xA1, 0xC1, 0xE3, 0xA2, 0xE1,
     0xFF, 0xFF),
)

# ShotInfo's white balance index -> the preset it names (Canon's numbering, as LibRaw's Canon_wbi2std).
WBI_NAMES = ("auto", "daylight", "cloudy", "tungsten", "fluorescent", "flash", "custom", "bw", "shade", "kelvin")
# 0x10A9 ColorBalance: the order of its four-level groups (RGGB) after the Auto one.
_BALANCE_GROUPS = ("auto", "daylight", "shade", "cloudy", "tungsten", "fluorescent", "flash", "custom", "kelvin")
# 0x0032 ColorInfo1: (XOR key, record length) -> (bytes skipped after the 78, the preset of each 8-byte line).
_INFO1_TABLES = {
    (0x0410, 2048): (8, ("custom1", "custom2", "daylight", "cloudy", "tungsten", "fluorescent", None, "flash")),  # Pro1
    (0x0410, 3072): (16, ("custom1", "custom2", "daylight", "cloudy", "tungsten", "fluorescent", "fluorescent_high",
                          None, "underwater", None, "flash")),  # G6, S60, S70
    (0, 2048): (0, ("custom1", "custom2", "daylight", "cloudy", "tungsten", "fluorescent", None, "flash")),  # G3, G5, S45, S50
}
_INFO1_KEY = (0x0410, 0x45F3)
# Degrees in ImageSpec -> the TIFF Orientation tag.
_ORIENTATION = {0: 1, 90: 6, 180: 3, 270: 8}
STREAM_SKIP = 514  # the coded stream starts this far into the raw record when there are no low bits


def is_crw(data: bytes) -> bool:
    return len(data) >= 26 and data[:2] == b"II" and data[6:14] == HEADER_MAGIC


# --------------------------------------------------------------------------
# The heap


class Record:
    __slots__ = ("type", "length", "offset", "depth")

    def __init__(self, type_: int, length: int, offset: int, depth: int):
        self.type, self.length, self.offset, self.depth = type_, length, offset, depth


def records(data: bytes) -> list[Record]:
    """Every record of the file, sub-heaps walked depth first (at most 8 deep, 4,096 records)."""

    if not is_crw(data):
        raise rd.DevelopError("not a Canon CRW (no HEAPCCDR header)")
    hlen = struct.unpack_from("<I", data, 2)[0]
    if not 14 <= hlen < len(data):
        raise rd.DevelopError("CRW: the header length is implausible")
    out: list[Record] = []

    def walk(start: int, length: int, depth: int) -> None:
        end = start + length
        if depth > 8 or length < 6 or end > len(data) or len(out) > 4096:
            return
        table = struct.unpack_from("<I", data, end - 4)[0] + start
        if not start <= table <= end - 6:
            return
        count = struct.unpack_from("<H", data, table)[0]
        if table + 2 + 10 * count > end:
            return
        for i in range(count):
            type_, length_, offset = struct.unpack_from("<HII", data, table + 2 + 10 * i)
            rec = Record(type_, length_, start + offset, depth)
            out.append(rec)
            # A record's storage class is its top two bits: 0x0000 is data in the heap (a sub-heap when the type's
            # high byte is 0x28 or 0x30); 0x4000 is a value held in the record itself (length and offset fields).
            if type_ >> 14 == 0 and (type_ >> 8) in (0x28, 0x30) and rec.offset + length_ <= len(data):
                walk(rec.offset, length_, depth + 1)

    walk(hlen, len(data) - hlen, 0)
    return out


def _find(recs: list[Record], type_: int, data: bytes, min_len: int = 0) -> Record | None:
    for r in recs:
        if r.type == type_ and r.length >= min_len and r.offset + r.length <= len(data):
            return r
    return None


def _strings(data: bytes, rec: Record | None) -> list[str]:
    if rec is None:
        return []
    return [s.decode("latin-1").strip() for s in data[rec.offset : rec.offset + rec.length].split(b"\0")]


def make_model(data: bytes, recs: list[Record] | None = None) -> tuple[str, str]:
    recs = records(data) if recs is None else recs
    parts = _strings(data, _find(recs, REC_MAKE_MODEL, data))
    return (parts[0] if parts else "", parts[1] if len(parts) > 1 else "")


def camera_model(data: bytes) -> str:
    """The camera name a profile is filed under: the model string ("Canon EOS 10D", "Canon PowerShot G2")."""

    try:
        make, model = make_model(data)
    except rd.DevelopError:
        return ""
    if model and make and not model.upper().startswith(make.upper()):
        return f"{make} {model}"
    return model


# --------------------------------------------------------------------------
# The decoder


def huffman_lut(tree) -> tuple[int, array]:
    """A tree (16 counts, then symbols) as ``(max length, lookup)``: the lookup holds ``(length << 8) | symbol``
    for every ``max length``-bit prefix; prefixes no code covers stay 0, which the decoder refuses."""

    counts = tree[:16]
    symbols = tree[16:]
    longest = max((i + 1 for i, n in enumerate(counts) if n), default=0)
    if not longest or sum(counts) > len(symbols):
        raise rd.DevelopError("CRW: a Huffman tree is malformed")
    lut = array("H", [0]) * (1 << longest)
    code = 0
    k = 0
    for length in range(1, longest + 1):
        for _ in range(counts[length - 1]):
            span = 1 << (longest - length)
            start = code << (longest - length)
            if start + span > len(lut):
                raise rd.DevelopError("CRW: a Huffman tree is over-full")
            for i in range(start, start + span):
                lut[i] = (length << 8) | symbols[k]
            code += 1
            k += 1
        code <<= 1
    return longest, lut


def has_low_bits(data: bytes) -> bool:
    """dcraw's ``canon_has_lowbits``: in bytes 540 to 16,383, a 0xFF followed by anything but 0x00 can't be the
    coded stream, so the low bits come first; a 0xFF followed by 0x00 everywhere means they don't."""

    found_stuffed = False
    end = min(len(data), 0x4000) - 1
    i = data.find(b"\xff", 540, end)
    while 0 <= i < end:
        if data[i + 1]:
            return True
        found_stuffed = True
        i = data.find(b"\xff", i + 1, end)
    return not found_stuffed


def destuff(stream: bytes) -> bytes:
    """Drop the 0x00 after each 0xFF; the stream ends at a 0xFF followed by anything else (a marker)."""

    m = re.search(rb"\xff[^\x00]", stream)
    if m is not None:
        stream = stream[: m.start()]
    return stream.replace(b"\xff\x00", b"\xff")


def _decode_python(stream: bytes, width: int, height: int, table: int) -> array:
    """``canon_load_raw``'s high ten bits, row-major."""

    l1, lut1 = huffman_lut(FIRST_TREES[table])
    l2, lut2 = huffman_lut(SECOND_TREES[table])
    buf = destuff(stream)
    total_bits = 8 * len(buf)
    buf = buf + bytes(16)
    frombytes = int.from_bytes
    out = array("H", [0]) * (width * height)
    pos = 0
    carry = 0
    pnum = 0
    base = [512, 512]
    diffs = [0] * 64
    for row in range(0, height, 8):
        nblocks = min(8, height - row) * width >> 6
        at = row * width
        for block in range(nblocks):
            for i in range(64):
                diffs[i] = 0
            i = 0
            while i < 64:
                lut, longest = (lut2, l2) if i else (lut1, l1)
                if pos > total_bits + 64:
                    raise rd.DevelopError(f"CRW: the coded stream ends early (row {row})")
                at8 = pos >> 3
                window = frombytes(buf[at8 : at8 + 8], "big")
                sh = 64 - (pos & 7)
                e = lut[(window >> (sh - longest)) & ((1 << longest) - 1)]
                length = e >> 8
                if not length:
                    raise rd.DevelopError(f"CRW: no Huffman code matches at row {row}, block {block}")
                pos += length
                leaf = e & 0xFF
                if leaf == 0 and i:
                    break
                if leaf == 0xFF:
                    i += 1
                    continue
                i += leaf >> 4
                n = leaf & 15
                if n:
                    d = (window >> (sh - length - n)) & ((1 << n) - 1)
                    pos += n
                    if not d >> (n - 1):
                        d -= (1 << n) - 1
                    if i < 64:
                        diffs[i] = d
                i += 1
            diffs[0] += carry
            carry = diffs[0]
            k = at + (block << 6)
            for i in range(64):
                if pnum % width == 0:
                    base[0] = base[1] = 512
                pnum += 1
                v = base[i & 1] + diffs[i]
                base[i & 1] = v
                if v >> 10:
                    raise rd.DevelopError(f"CRW: value {v} out of range at row {row}, block {block}")
                out[k + i] = v
    return out


def add_low_bits(values: array, low: bytes, width: int, height: int) -> array:
    """Shift the ten high bits up two and add each sensel's low pair (four sensels to a byte, LSB pair first)."""

    n = width * height
    if len(low) < n // 4:
        raise rd.DevelopError("CRW: the low-bits block is shorter than the frame")
    quirk = width == 2672  # LibRaw and dcraw add 2 to values under 512 on this sensor width (G5, S50, S60)
    try:
        import numpy as np
    except ImportError:  # pragma: no cover - exercised without numpy
        np = None  # type: ignore[assignment]
    if np is not None:
        hi = np.frombuffer(values, dtype=np.uint16).astype(np.uint16)
        lb = np.frombuffer(low[: n // 4], dtype=np.uint8)
        pairs = np.stack([(lb >> s) & 3 for s in (0, 2, 4, 6)], axis=1).ravel()
        v = (hi[: pairs.size] << 2) | pairs
        if quirk:
            v = np.where(v < 512, v + 2, v)
        res = hi.copy()
        res[: v.size] = v
        return array("H", res.astype(np.uint16).tobytes())
    out = array("H", values)
    for i in range(min(n, 4 * (n // 4))):
        v = (out[i] << 2) | ((low[i >> 2] >> ((i & 3) << 1)) & 3)
        if quirk and v < 512:
            v += 2
        out[i] = v
    return out


def decode_crw(data: bytes, raw: Record, width: int, height: int, table: int, engine: str = "auto") -> tuple[array, int, str]:
    """The sensor, row-major: (values, bits, storage note)."""

    if not width or not height or width * height > 100_000_000 or width % 8:
        raise rd.DevelopError("CRW: the sensor size is missing or implausible")
    if table > 2:
        table = 2
    low = has_low_bits(data)
    start = raw.offset + STREAM_SKIP + (width * height // 4 if low else 0)
    if start >= len(data):
        raise rd.DevelopError("CRW: the coded stream starts outside the file")
    stream = data[start : raw.offset + raw.length] if raw.offset + raw.length <= len(data) else data[start:]
    if engine == "native":
        raise RuntimeError("the CRW decoder has no native engine: it runs in Python (2 to 5 s a frame)")
    values = _decode_python(stream, width, height, table)
    if low:
        values = add_low_bits(values, data[raw.offset : raw.offset + width * height // 4], width, height)
        return values, 12, f"CRW: Canon CIFF, 10 coded bits + 2 stored low bits (table {table})"
    return values, 10, f"CRW: Canon CIFF, 10-bit (table {table})"


def black_from_mask(values: array, width: int, height: int, x0: int, y0: int, x1: int, y1: int) -> list[float] | None:
    """The median of each 2x2 position over SensorInfo's masked rectangle (inclusive corners), phase relative
    to the sensor's (0, 0), or None when the rectangle is empty, off the sensor or under two sensels wide."""

    from shootflow import cr2

    if not (0 <= x0 < x1 < width and 0 <= y0 < y1 < height) or x1 - x0 < 1 or y1 - y0 < 1:
        return None
    step_y = max(1, (y1 - y0) // 600) * 2
    out = []
    for py in (0, 1):
        for px in (0, 1):
            picks: list[int] = []
            for y in range(y0 + ((py - y0) % 2), y1 + 1, step_y):
                start = y * width + x0 + ((px - x0) % 2)
                picks.extend(values[start : y * width + x1 + 1 : 2])
            if not picks:
                return None
            out.append(cr2._median(picks))
    return out


# --------------------------------------------------------------------------
# White balance


def _u16(data: bytes, at: int, n: int) -> tuple[int, ...]:
    return struct.unpack_from(f"<{n}H", data, at)


def white_balance_index(data: bytes, recs: list[Record]) -> int | None:
    rec = _find(recs, REC_SHOT_INFO, data, 16)
    if rec is None:
        return None
    wbi = _u16(data, rec.offset, 8)[7]
    return wbi if wbi < len(WBI_NAMES) else 0


def _firmware(data: bytes, recs: list[Record]) -> float | None:
    parts = _strings(data, _find(recs, REC_FIRMWARE, data))
    m = re.search(r"(\d+\.\d+)", parts[0]) if parts else None
    return float(m.group(1)) if m else None


def as_shot_levels(data: bytes, recs: list[Record], model: str) -> tuple[tuple[int, int, int, int] | None, str]:
    """The shot's R, G, G, B white balance levels and where they came from, or None and why not."""

    wbi = white_balance_index(data, recs)
    name = WBI_NAMES[wbi] if wbi is not None else "auto"
    if "EOS D30" in model:
        return None, "CRW: the EOS D30 keeps no as-shot white balance this reader knows"
    bal = _find(recs, REC_COLOR_BALANCE, data, 10)
    if bal is not None:
        first = _u16(data, bal.offset, 1)[0]
        n_groups = (first - 2) // 8 - 1
        groups = {}
        for g in range(max(0, min(n_groups, len(_BALANCE_GROUPS)))):
            if bal.offset + 2 + 8 * g + 8 > bal.offset + bal.length:
                break
            groups[_BALANCE_GROUPS[g]] = _u16(data, bal.offset + 2 + 8 * g, 4)
        pick = name if name in groups and n_groups >= 7 else "auto"
        levels = groups.get(pick)
        if levels:
            return levels, f"CRW: as-shot white balance from ColorBalance (0x10A9), {pick}"
    info2 = _find(recs, REC_COLOR_INFO2, data, 108)
    if info2 is not None:
        kind = _u16(data, info2.offset, 1)[0]
        if kind <= 512 and kind != 276:
            g, r, b, g2 = _u16(data, info2.offset + 100, 4)
            if r:
                return (r, g, g2, b), "CRW: as-shot white balance from ColorInfo2 (0x102C)"
    info1 = _find(recs, REC_COLOR_INFO1, data, 2048)
    if info1 is not None:
        key = _u16(data, info1.offset, 1)[0]
        spec = _INFO1_TABLES.get((key, info1.length))
        if spec is None:
            return None, f"CRW: ColorInfo1 (0x0032) layout {key:#x}/{info1.length} is not known: no as-shot white balance"
        skip, lines = spec
        if name in ("auto", "bw"):
            return None, f"CRW: the camera was on {name} white balance, which this body does not record: none applied"
        if key == 0 and (_firmware(data, recs) or 0.0) < 1.02:
            return None, "CRW: firmware before 1.02 does not fill the preset table: no as-shot white balance"
        want = "daylight" if name == "custom" else name
        if want not in lines:
            return None, f"CRW: no {want} line in ColorInfo1: no as-shot white balance"
        xor = _INFO1_KEY if key else (0, 0)
        at = info1.offset + 2 + 78 + skip + 8 * lines.index(want)
        g, r, b, g2 = (v ^ xor[c & 1] for c, v in enumerate(_u16(data, at, 4)))
        if r and b:
            return (r, g, g2, b), f"CRW: as-shot white balance from ColorInfo1 (0x0032), {want}"
    return None, "CRW: no as-shot white balance in the file"


# --------------------------------------------------------------------------


def parse_crw(data: bytes, engine: str = "auto") -> rd.RawImage:
    """A CRW's sensor data and DNG-equivalent tags."""

    from shootflow import cr2

    recs = records(data)
    make, model = make_model(data, recs)
    if any(m in model for m in CMYG_MODELS):
        raise rd.DevelopError(
            f"the {model} has a cyan-magenta-yellow-green filter, which this developer does not read; convert to DNG"
        )
    raw = _find(recs, REC_RAW, data)
    if raw is None:
        raise rd.DevelopError("CRW: no raw data record (0x2005)")
    sensor = _find(recs, REC_SENSOR_INFO, data, 18)
    if sensor is None:
        raise rd.DevelopError("CRW: no SensorInfo record (0x1031), so the sensor size is unknown")
    info = _u16(data, sensor.offset, 9)
    width, height = info[1], info[2]
    table_rec = _find(recs, REC_DECODER_TABLE, data, 4)
    table = struct.unpack_from("<I", data, table_rec.offset)[0] if table_rec else 0
    values, bits, storage = decode_crw(data, raw, width, height, table, engine)
    notes = [storage]

    left, top, right, bottom = info[5], info[6], info[7] + 1, info[8] + 1
    if not (0 <= left < right <= width and 0 <= top < bottom <= height):
        left, top, right, bottom = 0, 0, width, height
        notes.append("CRW: SensorInfo's picture area does not fit the sensor: the whole sensor is developed")
    black = None
    mask = _u16(data, sensor.offset, 13)[9:13] if sensor.length >= 26 else None
    if mask is not None:
        sensor_black = black_from_mask(values, width, height, *mask)
        if sensor_black is not None:
            black = [sensor_black[((top + y) & 1) * 2 + ((left + x) & 1)] for y in (0, 1) for x in (0, 1)]
            notes.append(f"CRW: black level from SensorInfo's masked area, columns {mask[0]}-{mask[2]}, rows {mask[1]}-{mask[3]}")
    if black is None:
        black = cr2._black_levels(values, width, top, left, bottom, right)
        if black is not None:
            notes.append("CRW: no usable masked area in SensorInfo: black level from the columns left of the picture")
    if black is None:
        black = [0.0] * 4
        notes.append("no masked columns left of the picture: black level 0")
    white, white_note = cr2._white_from_clipping(values, width, top, left, bottom, right, black, bits)
    if white_note:
        notes.append(white_note)

    # RGGB at the sensor's (0, 0); restated from the picture's corner.
    rggb = ((0, 1), (1, 2))
    pattern = tuple(rggb[(top + y) & 1][(left + x) & 1] for y in (0, 1) for x in (0, 1))

    levels, wb_note = as_shot_levels(data, recs, model)
    notes.append(wb_note)
    synth = rd.Ifd(byte_order="<")
    synth.entries = {
        rd.TAG_WIDTH: (width,),
        rd.TAG_HEIGHT: (height,),
        rd.TAG_BITS: (bits,),
        rd.TAG_SAMPLES: (1,),
        rd.TAG_PHOTOMETRIC: (rd.PHOTOMETRIC_CFA,),
        rd.TAG_CFA_REPEAT: (2, 2),
        rd.TAG_CFA_PATTERN: pattern,
        rd.TAG_ACTIVE_AREA: (top, left, bottom, right),
        rd.TAG_BLACK_REPEAT: (2, 2),
        rd.TAG_BLACK_LEVEL: tuple(black),
        rd.TAG_WHITE_LEVEL: (white,),
    }
    if levels is not None:
        r, g1, g2, b = levels
        g = (g1 + g2) / 2.0
        if r > 0 and b > 0 and g > 0:
            synth.entries[rd.TAG_AS_SHOT_NEUTRAL] = (g / r, 1.0, g / b)
    head = rd.Ifd(byte_order="<")
    head.entries = {
        rd.TAG_UNIQUE_CAMERA_MODEL: tuple(camera_model(data).encode("latin-1")) + (0,),
        TAG_MAKE: tuple(make.encode("latin-1")) + (0,),
        TAG_MODEL: tuple(model.encode("latin-1")) + (0,),
    }
    spec = _find(recs, REC_IMAGE_SPEC, data, 16)
    if spec is not None:
        degrees = struct.unpack_from("<I", data, spec.offset + 12)[0]
        orientation = _ORIENTATION.get(degrees % 360)
        if orientation and orientation != 1:
            head.entries[rd.TAG_ORIENTATION] = (orientation,)
            notes.append(f"CRW: the camera was turned {degrees} degrees (ImageSpec): orientation {orientation}")
    return rd.RawImage(width, height, 1, values, synth, head, source="crw", notes=notes)


TAG_MAKE = 271
TAG_MODEL = 272

__all__ = [
    "as_shot_levels",
    "camera_model",
    "decode_crw",
    "has_low_bits",
    "huffman_lut",
    "is_crw",
    "make_model",
    "parse_crw",
    "records",
]
