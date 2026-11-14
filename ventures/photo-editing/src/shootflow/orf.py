"""Read an Olympus or OM System ORF straight into the developer, standard library only (C when present).

An ORF is a TIFF with its own magic number ("IIRO", "MMOR" or "IIRS" where TIFF
has 42) whose first IFD holds the sensor directly. Two storage schemes are read:

* **Olympus compressed** (every E-, PEN, OM-D, OM System and Tough body seen,
  E-30 of 2008 to the OM-1 and TG-7 of 2022-23; the TIFF tags still say
  compression 1, 16 bits, so it is told apart by size, as dcraw does: any strip
  that is not exactly 12 or 16 bits per sensel. A noisy frame can approach 12
  bits per sensel; the TG-4 frame here holds 11.3). After a 7-byte header, one MSB-first bit stream
  codes every row. Each row keeps three running values per column parity
  (reset at the row start): the last magnitude, a smoothed difference, and how
  many small magnitudes ran in a row. Each sensel reads a 3-bit field (two low
  bits of the value and a sign), a unary count of leading zeros (twelve zeros
  escape to a ``16 - nbits``-bit field), then ``nbits`` more bits, where
  ``nbits`` grows with the last magnitude. The value is the prediction plus
  ``(difference << 2) | low``; the prediction is the sensel two to the left or
  two above near the edges, else a median-style choice among left, up and
  up-left (their mean when the gradient is gentle, ``left + up - upleft`` when
  steep). Values are 12-bit.
* **12-bit packed, interlaced** ("IIRS": the C-5050 Zoom, C-8080, SP-350 and
  SP-500 UZ compacts here): MSB-first 12-bit samples, rows stored even rows
  first, then the odd rows from the next 2048-byte boundary. The stored height
  is even: when the TIFF height is odd (1925 on the C-5050 Zoom) one more odd
  row follows the strips the TIFF describes, and it is read too.

What a DNG states in tags, an ORF states in its maker note ("OLYMPUS\\0" +
byte order + 3, "OM SYSTEM\\0\\0\\0" + byte order + 4, or the older "OLYMP\\0"):

* **Black level**: the ImageProcessing sub-IFD (0x2040)'s BlackLevel2 (0x0600),
  four values in the order R, green on red rows, green on blue rows, B; the
  older compacts store black-subtracted data (main-note BlackLevel 0x1012 is 0).
* **As-shot white balance**: ImageProcessing WB_RBLevels (0x0100), red and blue
  on a scale where green is 256; the older compacts carry RedBalance and
  BlueBalance (0x1017, 0x1018) in the main note, the first value of each on the
  same scale.
* **CFA phase**: the EXIF CFAPattern (0xA302: columns and rows as 16-bit
  values, then the colours), as TIFF/EP writes it.
* **Crop**: ImageProcessing CropLeft/Top/Width/Height (0x0612-0x0615), the
  camera JPEG's frame, become DefaultCropOrigin and DefaultCropSize; they leave
  out the masked or dim columns some bodies store at the right edge.
* **White level**: 4095, the 12-bit ceiling. LibRaw lowers it on some bodies
  from a per-model table (E-30: 4028); no tag in these files states it.
* **Colour**: like a CR2, ARW or NEF, an ORF carries no colour matrix the DNG
  colour model can use; developing one needs the camera's ``.dcp`` profile
  ("Olympus E-M10 Adobe Standard.dcp", from Adobe's free DNG Converter).

The format as dcraw and LibRaw read it (Dave Coffin's ``olympus_load_raw`` and
``packed_load_raw``); this is an independent implementation, checked sensel for
sensel against LibRaw 0.22 (``tools/orf_libraw_check.py``,
``eval/olympus-orf-reader-2026-11-14.md``). Other layouts (12-bit packed
without interlace, 16-bit unpacked; the E-1, E-300 and E-500 era) are refused
with the reason: no test file of them was at hand.
"""

from __future__ import annotations

import struct
from array import array

from shootflow import raw_develop as rd

TAG_MAKE = 271
TAG_MODEL = 272
TAG_MAKER_NOTE = 37500
TAG_EXIF_CFA = 0xA302

MN_IMAGE_PROCESSING = 0x2040
IP_WB_RB = 0x0100
IP_BLACK2 = 0x0600
IP_CROP_LEFT, IP_CROP_TOP, IP_CROP_WIDTH, IP_CROP_HEIGHT = 0x0612, 0x0613, 0x0614, 0x0615
MN_BLACK = 0x1012
MN_RED_BALANCE = 0x1017
MN_BLUE_BALANCE = 0x1018

OLYMPUS_HEADER = 7  # bytes before the compressed stream
FIELD_ALIGN = 2048  # where the odd rows of an interlaced packed ORF start


def _text(values) -> str:
    return bytes(values or b"").split(b"\0", 1)[0].decode("latin-1").strip()


def _ifds(data: bytes):
    try:
        reader = rd._Reader(data)
        return reader, rd._all_ifds(reader)
    except (rd.DevelopError, struct.error):
        return None


def is_orf(data: bytes) -> bool:
    """An ORF header (magic 0x4F52 or 0x5352) from an Olympus or OM System camera, with no DNGVersion."""

    found = _ifds(data)
    if not found:
        return False
    reader, ifds = found
    if reader.magic not in rd.ORF_MAGICS or not ifds or ifds[0].one(rd.TAG_DNG_VERSION) is not None:
        return False
    make = _text(ifds[0].get(TAG_MAKE)).upper()
    return make.startswith("OLYMPUS") or make.startswith("OM DIGITAL")


def camera_model(data: bytes) -> str:
    """The camera name a profile is filed under: 'Olympus E-M10', 'OM Digital Solutions OM-1'."""

    found = _ifds(data)
    if not found or not found[1]:
        return ""
    ifd0 = found[1][0]
    model = _text(ifd0.get(TAG_MODEL))
    make = _text(ifd0.get(TAG_MAKE)).upper()
    if not model:
        return ""
    maker = "OM Digital Solutions" if make.startswith("OM DIGITAL") else "Olympus"
    return f"{maker} {model}"


# --------------------------------------------------------------------------
# Maker note


def maker_note(reader: rd._Reader, exif: rd.Ifd | None) -> tuple[rd._Reader, rd.Ifd] | None:
    """The Olympus maker note's main IFD and the reader its offsets resolve through, or None.

    The same three layouts ``lens_profiles.olympus_equipment`` reads: the newer two count offsets from the
    note's start, the older "OLYMP\\0" from the file's TIFF header.
    """

    if exif is None:
        return None
    mn = exif.get(TAG_MAKER_NOTE)
    if not mn or len(mn) < 16:
        return None
    note = bytes(mn)
    try:
        if note.startswith(b"OLYMPUS\0") or note.startswith(b"OM SYSTEM\0"):
            start = 8 if note.startswith(b"OLYMPUS\0") else 12
            order = note[start : start + 2]
            if order not in (b"II", b"MM"):
                return None
            buf = order + struct.pack("<H" if order == b"II" else ">H", 42) + note[4:]
            inner = rd._Reader(buf)
            ifd, _ = inner.read_ifd(start + 4)
            return inner, ifd
        if note.startswith(b"OLYMP\0"):
            at = exif.offsets.get(TAG_MAKER_NOTE)
            if at is None:
                return None
            ifd, _ = reader.read_ifd(at + 8)
            return reader, ifd
    except (rd.DevelopError, struct.error, IndexError, ValueError):
        return None
    return None


def image_processing(found: tuple[rd._Reader, rd.Ifd] | None) -> rd.Ifd | None:
    """The maker note's ImageProcessing sub-IFD (0x2040: a pointer, or the IFD's bytes inline), or None."""

    if found is None:
        return None
    reader, note = found
    ptr = note.get(MN_IMAGE_PROCESSING)
    if not ptr:
        return None
    where = int(ptr[0]) if len(ptr) == 1 else note.offsets.get(MN_IMAGE_PROCESSING)
    if not where:
        return None
    try:
        ifd, _ = reader.read_ifd(where)
    except (rd.DevelopError, struct.error):
        return None
    return ifd


def exif_cfa(exif: rd.Ifd | None, end: str) -> tuple[int, ...] | None:
    """The EXIF CFAPattern as a 2x2 pattern (0 = R, 1 = G, 2 = B), or None."""

    v = exif.get(TAG_EXIF_CFA) if exif is not None else None
    if not v or len(v) < 8:
        return None
    raw = bytes(v)
    cols, rows = struct.unpack_from(end + "HH", raw, 0)
    if (cols, rows) != (2, 2):
        cols, rows = struct.unpack_from(("<" if end == ">" else ">") + "HH", raw, 0)  # written in the other order
    if (cols, rows) != (2, 2):
        return None
    pattern = tuple(raw[4:8])
    return pattern if sorted(pattern) == [0, 1, 1, 2] else None


def black_per_position(levels, pattern) -> tuple[float, ...]:
    """BlackLevel2's (R, green on red rows, green on blue rows, B) placed on the 2x2 CFA positions."""

    out = []
    for pos, colour in enumerate(pattern):
        if colour == 0:
            out.append(float(levels[0]))
        elif colour == 2:
            out.append(float(levels[3]))
        else:
            row = pos // 2
            red_row = 0 in pattern[row * 2 : row * 2 + 2]
            out.append(float(levels[1] if red_row else levels[2]))
    return tuple(out)


def camera_crop(ip: rd.Ifd | None, width: int, height: int) -> tuple[int, int, int, int] | None:
    """ImageProcessing CropLeft, CropTop, CropWidth, CropHeight (0x0612-0x0615) as (x, y, w, h), when inside.

    The size of the camera's own JPEG (4608 x 3456 on the E-M10). It leaves out the stored edge columns that
    are not picture: four masked columns at black level on the 4100-wide E-30, E-600 and E-PL1, and dim
    columns on the 4040-wide TG-6 and TG-7 and 4080-wide E-P3 and E-PM1 (eval/olympus-orf-reader-2026-11-14.md).
    """

    if ip is None:
        return None
    vals = [ip.get(t) for t in (IP_CROP_LEFT, IP_CROP_TOP, IP_CROP_WIDTH, IP_CROP_HEIGHT)]
    if not all(vals):
        return None
    x, y, w, h = (int(v[0]) for v in vals)
    if w <= 0 or h <= 0 or x + w > width or y + h > height:
        return None
    return x, y, w, h


# --------------------------------------------------------------------------
# Sensor data


def _decode_python(buf: bytes, width: int, height: int) -> array:
    """The reference decoder for Olympus compressed data: one sensel at a time."""

    out = array("H", [0]) * (width * height)
    acc = 0
    nb = 0
    pos = OLYMPUS_HEADER
    n = len(buf)

    def bits(k: int) -> int:
        nonlocal acc, nb, pos
        if k <= 0:
            return 0
        while nb < k:
            acc = ((acc << 8) | (buf[pos] if pos < n else 0)) & 0xFFFFFFFFFFFF
            pos += 1
            nb += 8
        nb -= k
        return (acc >> nb) & ((1 << k) - 1)

    for row in range(height):
        carry = [[0, 0, 0], [0, 0, 0]]
        base = row * width
        for col in range(width):
            c = carry[col & 1]
            i = 2 if c[2] < 3 else 0
            nbits = 2 + i
            while (c[0] & 0xFFFF) >> (nbits + i):
                nbits += 1
            s = bits(3)
            low = s & 3
            sign = -1 if s & 4 else 0
            while nb < 12:
                acc = ((acc << 8) | (buf[pos] if pos < n else 0)) & 0xFFFFFFFFFFFF
                pos += 1
                nb += 8
            peek = (acc >> (nb - 12)) & 0xFFF
            if peek == 0:
                nb -= 12
                high = bits(16 - nbits) >> 1
            else:
                high = 12 - peek.bit_length()
                nb -= high + 1
            c[0] = (high << nbits) | bits(nbits)
            diff = (c[0] ^ sign) + c[1]
            c[1] = (diff * 3 + c[1]) >> 5
            c[2] = 0 if c[0] > 16 else c[2] + 1
            if row < 2 and col < 2:
                pred = 0
            elif row < 2:
                pred = out[base + col - 2]
            elif col < 2:
                pred = out[base - 2 * width + col]
            else:
                w = out[base + col - 2]
                up = out[base - 2 * width + col]
                nw = out[base - 2 * width + col - 2]
                if (w < nw < up) or (up < nw < w):
                    if abs(w - nw) > 32 or abs(up - nw) > 32:
                        pred = w + up - nw
                    else:
                        pred = (w + up) >> 1
                else:
                    pred = w if abs(w - nw) > abs(up - nw) else up
            out[base + col] = (pred + ((diff << 2) | low)) & 0xFFFF
    return out


def decode_olympus(buf: bytes, width: int, height: int, engine: str = "auto") -> array:
    """Olympus compressed sensor data (from the strip's first byte, header included), row-major."""

    if engine != "python":
        from shootflow import ljpeg_native

        if ljpeg_native.available():
            got = ljpeg_native.olympus_run(buf, width, height)
            if got is not None:
                return got
        elif engine == "native":
            raise RuntimeError("native decoder is not available")
    return _decode_python(buf, width, height)


def unpack_interlaced12(data: bytes, start: int, width: int, height: int) -> array:
    """12-bit MSB-first rows, even rows from ``start``, odd rows from the next 2048-byte boundary after them."""

    row_bytes = width * 3 // 2
    half = (height + 1) // 2
    second = start + -(-half * row_bytes // FIELD_ALIGN) * FIELD_ALIGN
    need = second + (height // 2) * row_bytes
    if need > len(data):
        raise rd.DevelopError(f"interlaced ORF data runs past the end of the file ({need} > {len(data)} bytes)")
    np_mod = rd._numpy_engine("auto")
    out = array("H", [0]) * (width * height)
    for field, at in ((0, start), (1, second)):
        rows = half if field == 0 else height // 2
        blob = data[at : at + rows * row_bytes]
        vals = np_mod.unpack_bits(blob, 12, rows * width, width) if np_mod else rd._unpack_bits(blob, 12, rows * width, width)
        vals = vals if isinstance(vals, array) else array("H", vals)
        for k in range(rows):
            r = 2 * k + field
            out[r * width : (r + 1) * width] = vals[k * width : (k + 1) * width]
    return out


def parse_orf(data: bytes, engine: str = "auto") -> rd.RawImage:
    """An ORF's sensor data and DNG-equivalent tags."""

    found = _ifds(data)
    if not found or not found[1]:
        raise rd.DevelopError("not a TIFF raw (no IFDs)")
    reader, ifds = found
    if not is_orf(data):
        raise rd.DevelopError("not an Olympus ORF")
    ifd0 = ifds[0]
    width, height = ifd0.one(rd.TAG_WIDTH), ifd0.one(rd.TAG_HEIGHT)
    if not width or not height or width * height > 400_000_000:
        raise rd.DevelopError("raw image size is missing or implausible")
    offsets, sizes = ifd0.get(rd.TAG_STRIP_OFFSETS), ifd0.get(rd.TAG_STRIP_BYTES)
    if not offsets or not sizes or len(offsets) != len(sizes):
        raise rd.DevelopError("ORF has no usable strips")
    compression = ifd0.one(rd.TAG_COMPRESSION, 1)
    if compression != 1:
        raise rd.DevelopError(f"ORF compression {compression} is not supported; convert to DNG")
    total = sum(sizes)
    start = offsets[0]
    if start + total > len(data) and len(offsets) == 1:
        raise rd.DevelopError("ORF raw strip lies outside the file")
    notes: list[str] = []
    exif = rd.exif_ifd(reader, ifd0)
    packed = 2 * total == 3 * width * height
    unpacked = total == 2 * width * height
    if reader.magic == 0x5352 and packed:
        height += height & 1
        values = unpack_interlaced12(data, start, width, height)
        notes.append("ORF: 12-bit packed, interlaced")
    elif not packed and not unpacked:
        values = decode_olympus(data[start : start + total], width, height, engine)
        notes.append("ORF: Olympus compressed (12-bit)")
    else:
        raise rd.DevelopError(
            f"this ORF layout ({total} bytes for {width}x{height} sensels, magic {reader.magic:#x}) is not supported; "
            "convert to DNG"
        )
    white = 4095

    pattern = exif_cfa(exif, reader.end)
    if pattern is None:
        raise rd.DevelopError("ORF has no 2x2 RGB CFAPattern in its EXIF")
    note = maker_note(reader, exif)
    ip = image_processing(note)
    black: tuple[float, ...] = (0.0,) * 4
    as_shot = None
    b2 = ip.get(IP_BLACK2) if ip is not None else None
    if b2 and len(b2) >= 4:
        black = black_per_position(b2[:4], pattern)
    elif note is not None and note[1].get(MN_BLACK) and len(note[1].get(MN_BLACK)) >= 4:
        black = black_per_position(note[1].get(MN_BLACK)[:4], pattern)
    wb = ip.get(IP_WB_RB) if ip is not None else None
    if wb and len(wb) >= 2 and wb[0] > 0 and wb[1] > 0:
        as_shot = (wb[0] / 256.0, 1.0, wb[1] / 256.0)
    elif note is not None:
        red, blue = note[1].get(MN_RED_BALANCE), note[1].get(MN_BLUE_BALANCE)
        if red and blue and red[0] > 0 and blue[0] > 0:
            as_shot = (red[0] / 256.0, 1.0, blue[0] / 256.0)
    if as_shot is None:
        notes.append("no Olympus as-shot white balance (ImageProcessing 0x0100)")

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
    crop = camera_crop(ip, width, height)
    if crop is not None:
        synth.entries[rd.TAG_CROP_ORIGIN] = crop[:2]
        synth.entries[rd.TAG_CROP_SIZE] = crop[2:]
        notes.append(f"ORF: the camera's crop, {crop[2]}x{crop[3]} at ({crop[0]}, {crop[1]})")
    if as_shot is not None:
        synth.entries[rd.TAG_AS_SHOT_NEUTRAL] = tuple(1.0 / v for v in as_shot)
    head = rd.Ifd(entries=dict(ifd0.entries), byte_order=reader.end)
    head.entries[rd.TAG_UNIQUE_CAMERA_MODEL] = tuple(camera_model(data).encode("latin-1")) + (0,)
    return rd.RawImage(width, height, 1, values, synth, head, source="orf", notes=notes, exif=exif)


__all__ = [
    "black_per_position",
    "camera_model",
    "decode_olympus",
    "exif_cfa",
    "image_processing",
    "is_orf",
    "maker_note",
    "parse_orf",
    "unpack_interlaced12",
]
