"""Read a Pentax PEF straight into the developer, standard library only (C when present).

A PEF is a plain TIFF (magic 42; little-endian on the K-1 Mark II checked here)
whose first IFD is the raw image: Photometric 32803 (CFA), 14 bits per sample on
the K-1 Mark II, and Compression 65535, Pentax's own Huffman coding, read here:

* **Compression 65535** (dcraw's ``pentax_load_raw``): one MSB-first bit stream,
  no byte stuffing, of JPEG-style Huffman differences. The code table is not
  fixed: it is stored in the maker note's tag 0x0220 (in the note's byte order):
  a 16-bit value ``v`` whose ``(v + 12) & 15`` is the number of codes ``n``, then
  12 bytes, then ``n`` 16-bit codes left-aligned in 12 bits, then ``n`` one-byte
  code lengths. Code ``c`` means "``c`` difference bits follow" (a difference
  whose top bit is clear is negative: ``d - (2^c - 1)``, as in JPEG). The first
  two columns of a row are predicted from the same columns two rows up (one
  running value per row parity and column), every other sensel from the one two
  columns left. A value outside ``[0, 2^bits)`` is refused.

What a DNG states in tags, a PEF states in its maker note ("PENTAX \\0" + byte
order, ``lens_profiles.pentax_note``) and EXIF:

* **Black level**: maker note 0x0200 (BlackPoint), four values R, G, G, B: 1024 on
  the K-1 Mark II. The file's own masked sensels agree: the 18 rows above the
  picture and the 4 and 8 columns at the left and right edges average 1,024 to
  1,026 (``eval/pentax-pef-reader-2026-11-14.md``).
* **As-shot white balance**: maker note 0x0201 (WhitePoint), R, G, G, B levels; R
  and B over the first G.
* **CFA**: EXIF CFAPattern (0xA302: two 16-bit repeat sizes, then the colours);
  RGGB on the K-1 Mark II, as LibRaw reads it.
* **White level**: ``2 ** BitsPerSample - 1`` (16383), as LibRaw reports.
* **Crop**: the camera's own picture area, the size of its full-size embedded
  JPEG (7360 x 4912 on the K-1 Mark II) at the place that JPEG was cut from. On
  the K-1 Mark II that is (14, 28) of the stored 7392 x 4950, measured by sliding
  the JPEG over the raw (2x2-box luminance, log correlation 0.876; the same shift
  in all four corners, so no scaling): ``MEASURED_CROPS``. A body with no
  measurement gets the JPEG's size centred on the frame, with a note. Both leave
  out every masked row and column. LibRaw takes its margins from a per-model
  table (7376 x 4932 at (6, 18)), so the crop is reported, not gated, by
  ``tools/pef_libraw_check.py``.
* **Colour**: like a CR2, ARW, NEF, ORF, RW2 or SRW, a PEF carries no colour
  matrix the DNG colour model can use, so it develops with the camera's ``.dcp``
  profile ("Pentax K-1 Mark II Adobe Standard.dcp", from Adobe's free DNG
  Converter).

The format as dcraw and LibRaw read it (Dave Coffin's ``pentax_load_raw`` and the
0x0200, 0x0201 and 0x0220 maker note tags in ``parse_makernote``); this is an
independent implementation, checked sensel for sensel against LibRaw 0.22
(``tools/pef_libraw_check.py``). Other storage (uncompressed or packed PEFs of
older bodies, Pixel Shift's four frames) is refused with the reason: no test
file of them was at hand.
"""

from __future__ import annotations

import struct
from array import array

from shootflow import raw_develop as rd

TAG_MAKE = 271
TAG_MODEL = 272
TAG_STRIP_OFFSETS = 273
TAG_STRIP_BYTES = 279
TAG_COMPRESSION = 259
TAG_EXIF_CFA = 0xA302  # EXIF CFAPattern: repeat columns, repeat rows (16-bit each), then the colours

MN_BLACK = 0x0200
MN_WHITE_POINT = 0x0201
MN_HUFFMAN = 0x0220

COMP_PENTAX = 65535
# Model tag -> (x, y, w, h) of the camera's JPEG on the stored frame, measured (eval/pentax-pef-reader-2026-11-14.md).
MEASURED_CROPS = {"PENTAX K-1 Mark II": (14, 28, 7360, 4912)}
MAKES = ("PENTAX", "ASAHI", "RICOH")
DEFAULT_CFA = (0, 1, 1, 2)  # RGGB


def _text(values) -> str:
    return bytes(values or b"").split(b"\0", 1)[0].decode("latin-1").strip()


def _ifds(data: bytes):
    try:
        reader = rd._Reader(data)
        return reader, rd._all_ifds(reader)
    except (rd.DevelopError, struct.error):
        return None


def _raw_ifd(ifds):
    """The largest full-resolution CFA IFD (Photometric 32803, NewSubfileType 0): IFD0 on the K-1 Mark II."""

    best = None
    for ifd in ifds:
        if ifd.one(rd.TAG_PHOTOMETRIC) != rd.PHOTOMETRIC_CFA or ifd.one(rd.TAG_NEW_SUBFILE_TYPE, 0) != 0:
            continue
        if best is None or ifd.one(rd.TAG_WIDTH, 0) * ifd.one(rd.TAG_HEIGHT, 0) > best.one(rd.TAG_WIDTH, 0) * best.one(rd.TAG_HEIGHT, 0):
            best = ifd
    return best


def is_pef(data: bytes) -> bool:
    """A classic TIFF with a CFA raw IFD and no DNGVersion, whose Make is Pentax (or Ricoh Imaging, which
    makes the Pentax bodies since 2011), or a Samsung K-mount body's file in Pentax's compression 65535."""

    found = _ifds(data)
    if not found:
        return False
    reader, ifds = found
    if reader.magic != 42 or not ifds or ifds[0].one(rd.TAG_DNG_VERSION) is not None:
        return False
    raw = _raw_ifd(ifds)
    if raw is None:
        return False
    make = _text(ifds[0].get(TAG_MAKE)).upper()
    if make.startswith(MAKES):
        return True
    return make.startswith("SAMSUNG") and raw.one(TAG_COMPRESSION) == COMP_PENTAX


def camera_model(data: bytes) -> str:
    """The camera name a profile is filed under: 'Pentax K-1 Mark II' (Adobe's own naming; the Model tag says
    'PENTAX K-1 Mark II' and the Make 'RICOH IMAGING COMPANY, LTD.')."""

    found = _ifds(data)
    if not found or not found[1]:
        return ""
    model = _text(found[1][0].get(TAG_MODEL))
    if not model:
        return ""
    head, _, rest = model.partition(" ")
    if head.upper() == "PENTAX" and rest:
        return f"Pentax {rest}"
    if _text(found[1][0].get(TAG_MAKE)).upper().startswith("SAMSUNG"):
        return f"Samsung {model}"
    return f"Pentax {model}"


# --------------------------------------------------------------------------
# The Huffman table and the decoder


def huffman_lut(table: bytes, byte_order: str = "<") -> array:
    """Maker note 0x0220 as a 4096-entry lookup: 12-bit prefix -> ``(code length << 8) | difference bits``.

    Prefixes no code covers stay 0 (length 0), which the decoders refuse."""

    table = bytes(table)
    if len(table) < 2:
        raise rd.DevelopError("PEF: the maker note's Huffman table (0x0220) is empty")
    n = (struct.unpack_from(byte_order + "H", table, 0)[0] + 12) & 15
    if n == 0 or len(table) < 14 + 3 * n:
        raise rd.DevelopError(f"PEF: the maker note's Huffman table (0x0220) is too short for {n} codes")
    codes = struct.unpack_from(f"{byte_order}{n}H", table, 14)
    lengths = table[14 + 2 * n : 14 + 3 * n]
    lut = array("H", [0]) * 4096
    for bits, (code, length) in enumerate(zip(codes, lengths)):
        if not 1 <= length <= 12 or bits > 16:
            raise rd.DevelopError(f"PEF: Huffman code {bits} has length {length}")
        code &= 4095
        for i in range(code, code + (4096 >> length)):
            lut[i & 4095] = (length << 8) | bits
    return lut


def _peek(buf: bytes, pos: int, n: int) -> int:
    """``n`` bits (n <= 32) of the MSB-first stream ``buf`` from bit ``pos``."""

    if n == 0:
        return 0
    at = pos >> 3
    word = int.from_bytes(buf[at : at + 8], "big")
    return (word >> (64 - (pos & 7) - n)) & ((1 << n) - 1)


def _decode_python(buf: bytes, width: int, height: int, bits: int, lut: array) -> array:
    """``pentax_load_raw``: one stream of Huffman differences; per-parity running values for columns 0 and 1."""

    data = bytes(buf) + bytes(16)
    out = array("H", [0]) * (width * height)
    vpred = [[0, 0], [0, 0]]
    hpred = [0, 0]
    pos = 0
    limit = 1 << bits
    k = 0
    for row in range(height):
        vp = vpred[row & 1]
        for col in range(width):
            e = lut[_peek(data, pos, 12)]
            length, n = e >> 8, e & 0xFF
            if not length:
                raise rd.DevelopError(f"PEF: no Huffman code matches at row {row}, column {col}")
            pos += length
            d = _peek(data, pos, n)
            pos += n
            if n and not (d >> (n - 1)):
                d -= (1 << n) - 1
            if col < 2:
                vp[col] += d
                hpred[col] = vp[col]
            else:
                hpred[col & 1] += d
            v = hpred[col & 1]
            if v < 0 or v >= limit:
                raise rd.DevelopError(f"PEF: value {v} out of range at row {row}, column {col}")
            out[k] = v
            k += 1
    return out


def maker_note(reader, ifd0: rd.Ifd) -> rd.Ifd | None:
    """The Pentax maker note's main IFD (``lens_profiles.pentax_note``), or None."""

    from shootflow import lens_profiles

    return lens_profiles.pentax_note(rd.exif_ifd(reader, ifd0))


def decode_pef(data: bytes, raw_ifd: rd.Ifd, note: rd.Ifd | None, engine: str = "auto") -> tuple[array, str, int]:
    """The raw IFD's sensor data, row-major: (values, storage note, bits per sample)."""

    width, height = raw_ifd.one(rd.TAG_WIDTH), raw_ifd.one(rd.TAG_HEIGHT)
    if not width or not height or width * height > 400_000_000:
        raise rd.DevelopError("raw image size is missing or implausible")
    comp = raw_ifd.one(TAG_COMPRESSION, 1)
    bits = raw_ifd.one(rd.TAG_BITS, 12)
    start = raw_ifd.one(TAG_STRIP_OFFSETS)
    if start is None or start >= len(data):
        raise rd.DevelopError("PEF raw data starts outside the file")
    if comp != COMP_PENTAX:
        raise rd.DevelopError(f"this PEF layout (compression {comp}, {bits}-bit) is not supported; convert to DNG")
    if not 8 <= bits <= 16:
        raise rd.DevelopError(f"PEF: {bits} bits per sample is not supported")
    table = note.get(MN_HUFFMAN) if note is not None else None
    if note is None or not table:
        raise rd.DevelopError("PEF: compression 65535 needs the maker note's Huffman table (0x0220), which is missing")
    lut = huffman_lut(bytes(table), note.byte_order)
    size = raw_ifd.one(TAG_STRIP_BYTES, 0)
    stream = data[start : start + size] if size else data[start:]
    got = None
    if engine != "python":
        from shootflow import ljpeg_native

        if ljpeg_native.available():
            got = ljpeg_native.pentax_run(stream, width, height, bits, lut)
        elif engine == "native":
            raise RuntimeError("native decoder is not available")
    values = got if got is not None else _decode_python(stream, width, height, bits, lut)
    return values, f"PEF: Pentax Huffman (65535, {bits}-bit)", bits


def _levels(note: rd.Ifd | None, tag: int) -> tuple[int, int, int, int] | None:
    values = note.get(tag) if note is not None else None
    if not values or len(values) < 4:
        return None
    r, g1, g2, b = (int(v) for v in values[:4])
    return r, g1, g2, b


def cfa_pattern(exif: rd.Ifd | None) -> tuple[int, int, int, int] | None:
    """EXIF CFAPattern (0xA302) as a 2x2 pattern, or None when absent or not 2x2.

    The two repeat sizes are 16-bit in the file's byte order, but a 2 reads as (0, 2) or (2, 0) either way."""

    values = exif.get(TAG_EXIF_CFA) if exif is not None else None
    if not values or len(values) != 8:
        return None
    v = tuple(int(x) for x in values)
    if sorted(v[0:2]) != [0, 2] or sorted(v[2:4]) != [0, 2]:
        return None
    pattern = v[4:8]
    if sorted(pattern) != [0, 1, 1, 2]:
        return None
    return pattern  # type: ignore[return-value]


def preview_crop(ifds, width: int, height: int) -> tuple[int, int, int, int] | None:
    """The full-size embedded JPEG's size centred on the stored frame, as (x, y, w, h), when it fits and is
    at least 90% of the frame each way (``parse_pef`` uses ``MEASURED_CROPS`` first)."""

    best = None
    for ifd in ifds:
        w, h = ifd.one(rd.TAG_WIDTH, 0), ifd.one(rd.TAG_HEIGHT, 0)
        if ifd.one(rd.TAG_PHOTOMETRIC) == rd.PHOTOMETRIC_CFA or ifd.one(TAG_COMPRESSION) not in (6, 7):
            continue
        if 0.9 * width <= w <= width and 0.9 * height <= h <= height and (best is None or w * h > best[0] * best[1]):
            best = (w, h)
    if best is None:
        return None
    w, h = best
    return (width - w) // 2, (height - h) // 2, w, h


def parse_pef(data: bytes, engine: str = "auto") -> rd.RawImage:
    """A PEF's sensor data and DNG-equivalent tags."""

    found = _ifds(data)
    if not found or not found[1]:
        raise rd.DevelopError("not a TIFF raw (no IFDs)")
    reader, ifds = found
    if not is_pef(data):
        raise rd.DevelopError("not a Pentax PEF")
    ifd0, raw_ifd = ifds[0], _raw_ifd(ifds)
    width, height = raw_ifd.one(rd.TAG_WIDTH), raw_ifd.one(rd.TAG_HEIGHT)
    note = maker_note(reader, ifd0)
    values, storage, bits = decode_pef(data, raw_ifd, note, engine)
    notes = [storage]
    exif = rd.exif_ifd(reader, ifd0)

    pattern = cfa_pattern(exif)
    if pattern is None:
        pattern = DEFAULT_CFA
        notes.append("PEF: no 2x2 EXIF CFAPattern; RGGB assumed, as on the K-1 Mark II")
    black_rggb = _levels(note, MN_BLACK)
    if black_rggb is None:
        black: tuple[float, ...] = (0.0,) * 4
        notes.append("no Pentax black level (maker note 0x0200): 0 assumed")
    else:
        greens = iter((black_rggb[1], black_rggb[2]))
        black = tuple(float(black_rggb[0] if p == 0 else black_rggb[3] if p == 2 else next(greens)) for p in pattern)
    white = (1 << bits) - 1
    as_shot = None
    wb = _levels(note, MN_WHITE_POINT)
    if wb and wb[0] > 0 and wb[1] > 0 and wb[3] > 0:
        as_shot = (wb[0] / wb[1], 1.0, wb[3] / wb[1])
    else:
        notes.append("no Pentax as-shot white balance (maker note 0x0201)")

    synth = rd.Ifd(byte_order=reader.end)
    synth.entries = {
        rd.TAG_WIDTH: (width,),
        rd.TAG_HEIGHT: (height,),
        rd.TAG_BITS: (bits,),
        rd.TAG_SAMPLES: (1,),
        rd.TAG_PHOTOMETRIC: (rd.PHOTOMETRIC_CFA,),
        rd.TAG_CFA_REPEAT: (2, 2),
        rd.TAG_CFA_PATTERN: pattern,
        rd.TAG_ACTIVE_AREA: (0, 0, height, width),
        rd.TAG_BLACK_REPEAT: (2, 2),
        rd.TAG_BLACK_LEVEL: black,
        rd.TAG_WHITE_LEVEL: (white,),
    }
    measured = MEASURED_CROPS.get(_text(ifd0.get(TAG_MODEL)))
    if measured and measured[0] + measured[2] <= width and measured[1] + measured[3] <= height:
        crop: tuple[int, int, int, int] | None = measured
        notes.append(f"PEF: the camera's picture area, {measured[2]}x{measured[3]} at ({measured[0]}, {measured[1]}), as measured on its JPEG")
    else:
        crop = preview_crop(ifds, width, height)
        if crop is not None:
            notes.append(f"PEF: the embedded JPEG's size, {crop[2]}x{crop[3]}, centred at ({crop[0]}, {crop[1]}) (no measured picture area for this body)")
    if crop is not None:
        synth.entries[rd.TAG_CROP_ORIGIN] = crop[:2]
        synth.entries[rd.TAG_CROP_SIZE] = crop[2:]
    if as_shot is not None:
        synth.entries[rd.TAG_AS_SHOT_NEUTRAL] = tuple(1.0 / v for v in as_shot)
    head = rd.Ifd(entries=dict(ifd0.entries), byte_order=reader.end)
    head.entries[rd.TAG_UNIQUE_CAMERA_MODEL] = tuple(camera_model(data).encode("latin-1")) + (0,)
    return rd.RawImage(width, height, 1, values, synth, head, source="pef", notes=notes, exif=exif)


__all__ = [
    "camera_model",
    "cfa_pattern",
    "decode_pef",
    "huffman_lut",
    "is_pef",
    "maker_note",
    "parse_pef",
    "preview_crop",
]
