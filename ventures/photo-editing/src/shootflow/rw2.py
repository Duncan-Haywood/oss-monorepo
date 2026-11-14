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
``eval/panasonic-rw2-reader-2026-11-14.md``). RawFormat 2, 3, 5, 6, 7 and 8
(older 16-bit, the newer 14-bit and 12-bit blocks of the GH5 era on) are
refused with the reason: no test file of them was at hand.
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


def black_per_position(levels, pattern) -> tuple[float, ...]:
    """BlackLevelRed, Green, Blue (+15) placed on the 2x2 CFA positions."""

    return tuple(float(levels[colour] + BLACK_OFFSET) for colour in pattern)


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
    if fmt != 4 or compression != 34316:
        raise rd.DevelopError(
            f"this RW2 layout (RawFormat {fmt}, compression {compression}) is not supported; convert to DNG"
        )
    start = ifd0.one(PANA_RAW_OFFSET)
    if not start or start >= len(data):
        raise rd.DevelopError("RW2 has no RawDataOffset inside the file")
    values = decode_panasonic(data[start:], width, height, engine)
    notes = ["RW2: Panasonic compressed (RawFormat 4, 12-bit)"]

    pattern = CFA_CODES.get(ifd0.one(PANA_CFA, 0))
    if pattern is None:
        raise rd.DevelopError(f"RW2 CFAPattern {ifd0.one(PANA_CFA)} is not one of 1-4")
    levels = [ifd0.one(t) for t in PANA_BLACK]
    black = black_per_position(levels, pattern) if all(v is not None for v in levels) else (0.0,) * 4
    limits = [ifd0.one(t) for t in PANA_LINEARITY]
    white = min(int(v) for v in limits) if all(limits) else 4095
    if white > 4095:
        white = 4095
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
        rd.TAG_BITS: (12,),
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
        synth.entries[rd.TAG_CROP_SIZE] = crop[2:]
        notes.append(f"RW2: the sensor borders, {crop[2]}x{crop[3]} at ({crop[0]}, {crop[1]})")
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


def sensor_crop(ifd0: rd.Ifd, width: int, height: int) -> tuple[int, int, int, int] | None:
    """SensorTopBorder, LeftBorder, BottomBorder, RightBorder (0x04-0x07) as (x, y, w, h), when inside."""

    top, left, bottom, right = (ifd0.one(t) for t in (PANA_TOP, PANA_LEFT, PANA_BOTTOM, PANA_RIGHT))
    if None in (top, left, bottom, right):
        return None
    if not (0 <= left < right <= width and 0 <= top < bottom <= height):
        return None
    return left, top, right - left, bottom - top


__all__ = [
    "black_per_position",
    "camera_model",
    "decode_panasonic",
    "embedded_exif",
    "is_rw2",
    "parse_rw2",
    "rotated_blocks",
    "rw2_exif",
    "sensor_crop",
]
