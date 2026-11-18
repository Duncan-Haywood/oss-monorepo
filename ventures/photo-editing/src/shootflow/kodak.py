"""Read a Kodak DCR (DCS Pro SLR/n, SLR/c, Pro 14n, 14nx) straight into the developer, standard library only.

A DCR is a big-endian TIFF. IFD0 is a 375 x 250 YCbCr thumbnail with Make "Kodak", the camera's Model and
two pointers that matter here: SubIFDs (330), one of which is the sensor (Photometric 32803, CFA; 12 bits,
one sample, CFARepeatPatternDim and CFAPattern as in a DNG), and tag 33424, the offset of Kodak's own IFD
(several hundred numbered entries). Three of those entries are read:

* **2317** (0x90d), the linearisation table: up to 1024 16-bit values. The stored codes are 10-bit; a
  sensel's value is the table at its code, so the white level is the table's last entry (3700 on the SLR/n
  file checked; the codes above 1023 never occur).
* **1021** (0x3fd), a 72-byte record whose three 16-bit words at byte 40 are the as-shot white balance as
  2048 / multiplier for R, G and B. When that record is missing, the as-shot set is entry 2120 + n (three
  rationals of the same kind), n being entry 1020's white-balance index.
* Nothing else: black is 0 (the data is black-subtracted, and LibRaw reads 0 too).

The sensor uses **Kodak compression 65000**. Each row is cut into blocks of up to 256 sensels, each block
decoded on its own and with its predictors reset:

* the block's size is rounded up to a multiple of 4, and one byte per pair of sensels gives two 4-bit bit
  lengths (low nibble first);
* if any length is over 12 the block is stored plain instead: from the block's first byte, groups of six
  16-bit words (in the file's byte order) hold eight sensels, the low 12 bits of the six words being sensels
  2-7 and their top four bits, concatenated, sensels 0 and 1; these are values, not differences;
* otherwise the differences follow as a bit stream read least-significant bit first, refilled 32 bits at a
  time from four bytes taken as two 16-bit big-endian words, low word first, after a 16-bit big-endian
  prefix when the rounded size leaves 4 over a multiple of 8. A difference of length n whose top bit is
  clear is negative (n ones are subtracted, as in JPEG); length 0 is 0. Bits left in the buffer at a
  block's end are dropped, so the next block starts at the next unread byte.
* Each sensel is its colour's predictor (two, for the two columns of the CFA; both 0 at a block's start)
  plus its difference, looked up in the 2317 table.

The format as dcraw and LibRaw read it (Dave Coffin's ``kodak_65000_decode`` and ``kodak_65000_load_raw``,
``parse_kodak_ifd`` for the three entries); this is an independent implementation, checked sensel for
sensel against LibRaw 0.22 on the public DCS Pro SLR/n file (``tools/dcr_libraw_check.py``,
``eval/kodak-dcr-reader-2026-11-18.md``). The decoder in C (``ljpeg_native.kodak_run``) gives the same
values; the pure-Python one here is the reference.

Colour: like a CR2 or NEF, a DCR carries no colour matrix the DNG colour model can use, so developing one
needs the camera's ``.dcp`` profile (Adobe's free DNG Converter installs them). Other Kodak compressions
(the DC-series 262 and 32867 ones, the KDC formats) are refused with the reason.
"""

from __future__ import annotations

import struct
from array import array

from shootflow import raw_develop as rd

TAG_MAKE = 271
TAG_MODEL = 272
TAG_KODAK_IFD = 33424

KODAK_CURVE = 2317
KODAK_WB_RECORD = 1021
KODAK_WB_INDEX = 1020
KODAK_WB_BASE = 2120

COMPRESSION_KODAK_65000 = 65000
BLOCK = 256


def _text(values) -> str:
    return bytes(values or b"").split(b"\0", 1)[0].decode("latin-1").strip()


def _ifds(data: bytes) -> tuple[rd._Reader, list[rd.Ifd]] | None:
    if data[:2] not in (b"II", b"MM"):
        return None
    try:
        reader = rd._Reader(data)
        if reader.magic != 42:
            return None
        return reader, rd._all_ifds(reader)
    except (rd.DevelopError, struct.error):
        return None


def is_dcr(data: bytes) -> bool:
    """A TIFF whose IFD0 says Make "Kodak", with no DNGVersion and a CFA sensor image."""

    found = _ifds(data)
    if not found or not found[1]:
        return False
    ifd0 = found[1][0]
    if not _text(ifd0.get(TAG_MAKE)).lower().startswith("kodak") or ifd0.one(rd.TAG_DNG_VERSION) is not None:
        return False
    return any(i.one(rd.TAG_PHOTOMETRIC) == rd.PHOTOMETRIC_CFA for i in found[1])


def camera_model(data: bytes) -> str:
    """The camera name a profile is filed under: 'Kodak DCS Pro SLR/n'."""

    found = _ifds(data)
    if not found or not found[1]:
        return ""
    model = _text(found[1][0].get(TAG_MODEL))
    if not model:
        return ""
    return model if model.lower().startswith("kodak") else f"Kodak {model}"


def kodak_ifd(reader: rd._Reader, ifd0: rd.Ifd) -> rd.Ifd | None:
    """Kodak's own IFD (tag 33424 of IFD0), or None when there is none or it does not read."""

    at = ifd0.one(TAG_KODAK_IFD)
    if not at:
        return None
    try:
        return reader.read_ifd(int(at))[0]
    except (rd.DevelopError, struct.error):
        return None


def curve(kifd: rd.Ifd | None) -> tuple[int, ...] | None:
    """The 2317 linearisation table, or None."""

    if kifd is None:
        return None
    table = kifd.get(KODAK_CURVE)
    if not table or len(table) > 0x10000:
        return None
    return tuple(int(v) for v in table)


def as_shot_multipliers(kifd: rd.Ifd | None, end: str) -> tuple[tuple[float, float, float] | None, str]:
    """The as-shot R, G, B multipliers and where they came from (``""`` when none)."""

    if kifd is None:
        return None, ""
    record = kifd.get(KODAK_WB_RECORD)
    if record is not None and len(record) == 72:
        r, g, b = (2048.0 / max(1.0, float(w)) for w in struct.unpack_from(end + "3H", bytes(record), 40))
        return (r, g, b), "entry 1021"
    index = kifd.one(KODAK_WB_INDEX)
    if index is not None and index >= 0:
        values = kifd.get(KODAK_WB_BASE + int(index))
        if values is not None and len(values) >= 3:
            r, g, b = (2048.0 / max(1.0, float(v)) for v in values[:3])
            return (r, g, b), f"entry {KODAK_WB_BASE + int(index)}"
    return None, ""


def decode_block(data: bytes, pos: int, count: int, end: str = ">") -> tuple[list[int], bool, int]:
    """One compression-65000 block of ``count`` sensels starting at byte ``pos``.

    Returns the block's values (the rounded-up count of them), whether they are plain values (True) or
    differences (False), and the byte where the next block starts.
    """

    size = (count + 3) & ~3
    lengths: list[int] = []
    p = pos
    n = len(data)
    plain = False
    for _ in range(size // 2):
        c = data[p] if p < n else 0
        p += 1
        lo, hi = c & 15, c >> 4
        lengths.append(lo)
        lengths.append(hi)
        if lo > 12 or hi > 12:
            plain = True
            break
    if plain:
        out = [0] * ((size + 7) & ~7)
        p = pos
        fmt = end + "6H"
        for i in range(0, size, 8):
            if p + 12 <= n:
                w = struct.unpack_from(fmt, data, p)
            else:
                w = struct.unpack(fmt, (data[p : p + 12] + bytes(12))[:12])
            p += 12
            out[i] = (w[0] >> 12) << 8 | (w[2] >> 12) << 4 | (w[4] >> 12)
            out[i + 1] = (w[1] >> 12) << 8 | (w[3] >> 12) << 4 | (w[5] >> 12)
            for j in range(6):
                out[i + 2 + j] = w[j] & 0xFFF
        return out, True, p
    acc = 0
    nbits = 0
    if (size & 7) == 4:
        acc = ((data[p] if p < n else 0) << 8) | (data[p + 1] if p + 1 < n else 0)
        p += 2
        nbits = 16
    out = [0] * size
    for i in range(size):
        length = lengths[i]
        if nbits < length:
            b0 = data[p] if p < n else 0
            b1 = data[p + 1] if p + 1 < n else 0
            b2 = data[p + 2] if p + 2 < n else 0
            b3 = data[p + 3] if p + 3 < n else 0
            p += 4
            acc |= ((b0 << 8) | b1 | (b2 << 24) | (b3 << 16)) << nbits
            nbits += 32
        if length:
            diff = acc & ((1 << length) - 1)
            acc >>= length
            nbits -= length
            if not diff & (1 << (length - 1)):
                diff -= (1 << length) - 1
            out[i] = diff
    return out, False, p


def _decode_python(data: bytes, start: int, width: int, height: int, table: array, end: str) -> array:
    """The reference decoder: every sensel, through ``table`` (65536 entries)."""

    out = array("H", [0]) * (width * height)
    p = start
    bad = 0
    for row in range(height):
        base = row * width
        for col in range(0, width, BLOCK):
            count = min(BLOCK, width - col)
            values, plain, p = decode_block(data, p, count, end)
            pred = [0, 0]
            for i in range(count):
                if plain:
                    code = values[i]
                else:
                    pred[i & 1] += values[i]
                    code = pred[i & 1]
                if not 0 <= code <= 0xFFFF:
                    bad += 1
                    code = 0 if code < 0 else 0xFFFF
                out[base + col + i] = table[code]
    if bad:
        raise rd.DevelopError(f"DCR: {bad} sensels decode outside the linearisation table; the stream is damaged")
    return out


def full_table(lin: tuple[int, ...] | None) -> array:
    """The 2317 table extended to 65536 entries with its last value (identity, clipped at 4095, without one)."""

    if not lin:
        return array("H", [min(i, 4095) for i in range(0x10000)])
    table = array("H", lin)
    table.extend([lin[-1]] * (0x10000 - len(lin)))
    return table


def decode(data: bytes, start: int, width: int, height: int, table: array, end: str = ">", engine: str = "auto") -> array:
    """The sensels of a compression-65000 DCR sensor whose data starts at byte ``start``."""

    if engine != "python":
        from shootflow import ljpeg_native

        got = ljpeg_native.kodak_run(data, start, width, height, table, end == ">")
        if got is not None:
            return got
    return _decode_python(data, start, width, height, table, end)


def parse_dcr(data: bytes, engine: str = "auto") -> rd.RawImage:
    """A DCR's sensor data and DNG-equivalent tags."""

    found = _ifds(data)
    if not found or not found[1]:
        raise rd.DevelopError("not a Kodak DCR (no TIFF IFDs)")
    reader, ifds = found
    end = reader.end
    ifd0 = ifds[0]
    sensors = [i for i in ifds if i.one(rd.TAG_PHOTOMETRIC) == rd.PHOTOMETRIC_CFA]
    if not sensors:
        raise rd.DevelopError("DCR has no CFA sensor image")
    sensor = max(sensors, key=lambda i: (i.one(rd.TAG_WIDTH) or 0) * (i.one(rd.TAG_HEIGHT) or 0))
    width, height = sensor.one(rd.TAG_WIDTH), sensor.one(rd.TAG_HEIGHT)
    if not width or not height or width * height > 400_000_000:
        raise rd.DevelopError("raw image size is missing or implausible")
    compression = sensor.one(rd.TAG_COMPRESSION, 1)
    if compression != COMPRESSION_KODAK_65000:
        raise rd.DevelopError(
            f"this DCR's compression ({compression}) is not Kodak's 65000, the one this reader knows; convert to DNG"
        )
    if sensor.one(rd.TAG_SAMPLES, 1) != 1:
        raise rd.DevelopError("DCR sensor image has more than one sample per sensel")
    offsets = sensor.get(rd.TAG_STRIP_OFFSETS)
    if not offsets:
        raise rd.DevelopError("DCR sensor image has no strip offset")
    start = int(offsets[0])
    if start >= len(data):
        raise rd.DevelopError("DCR sensor data starts past the end of the file")
    pattern = tuple(sensor.get(rd.TAG_CFA_PATTERN) or ())
    repeat = tuple(sensor.get(rd.TAG_CFA_REPEAT) or ())
    if repeat != (2, 2) or len(pattern) != 4 or sorted(pattern) != [0, 1, 1, 2]:
        raise rd.DevelopError(f"DCR CFA pattern {pattern} (repeat {repeat}) is not a 2x2 Bayer pattern")

    notes = ["DCR: Kodak compression 65000"]
    kifd = kodak_ifd(reader, ifd0)
    lin = curve(kifd)
    if lin is None:
        notes.append("DCR: no linearisation table (Kodak entry 2317): codes used as values, white 4095")
    table = full_table(lin)
    white = lin[-1] if lin else 4095
    values = decode(data, start, width, height, table, end, engine)

    synth = rd.Ifd(byte_order=end)
    synth.entries = {
        rd.TAG_WIDTH: (width,),
        rd.TAG_HEIGHT: (height,),
        rd.TAG_BITS: (12,),
        rd.TAG_SAMPLES: (1,),
        rd.TAG_PHOTOMETRIC: (rd.PHOTOMETRIC_CFA,),
        rd.TAG_CFA_REPEAT: (2, 2),
        rd.TAG_CFA_PATTERN: pattern,
        rd.TAG_ACTIVE_AREA: (0, 0, height, width),
        rd.TAG_BLACK_REPEAT: (2, 2),
        rd.TAG_BLACK_LEVEL: (0.0, 0.0, 0.0, 0.0),
        rd.TAG_WHITE_LEVEL: (white,),
    }
    mult, source = as_shot_multipliers(kifd, end)
    if mult is not None and all(m > 0 for m in mult):
        r, g, b = mult
        synth.entries[rd.TAG_AS_SHOT_NEUTRAL] = (g / r, 1.0, g / b)
        notes.append(f"DCR: as-shot white balance from Kodak {source}")
    else:
        notes.append("DCR: no as-shot white balance in the Kodak IFD")

    head = rd.Ifd(entries=dict(ifd0.entries), byte_order=end)
    model = camera_model(data)
    if model:
        head.entries[rd.TAG_UNIQUE_CAMERA_MODEL] = tuple(model.encode("latin-1")) + (0,)
    return rd.RawImage(width, height, 1, values, synth, head, source="dcr", notes=notes, exif=rd.exif_ifd(reader, ifd0))


__all__ = [
    "as_shot_multipliers",
    "camera_model",
    "curve",
    "decode",
    "decode_block",
    "full_table",
    "is_dcr",
    "kodak_ifd",
    "parse_dcr",
]
