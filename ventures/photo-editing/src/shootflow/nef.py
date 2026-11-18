"""Read a Nikon NEF straight into the developer, standard library only (C or numpy when present).

A NEF is a TIFF whose SubIFDs hold a JPEG preview and the full-size sensor
(PhotometricInterpretation 32803, NewSubfileType 0). Nikon stores the sensor
two ways, and both are read here:

* **Nikon compressed (compression 34713)**, every body from the D1X/D100 on. A
  Huffman-coded difference per sensel, MSB first, with no JPEG byte stuffing.
  Columns 0 and 1 of a row predict from the same column two rows up (one
  running value per row parity and column), every other sensel from the sensel
  two columns to its left; sums wrap at 16 bits, are clamped to 0..0x3FFF and
  looked up in a linearisation curve. Each symbol ``i`` of the code is a pair:
  ``len = i & 15`` extra bits, scaled by ``shl = i >> 4`` (zero in every table
  but the two "after split" ones, where the difference is
  ``((bits << 1) + 1) << shl >> 1``). Six code tables are fixed by the format:
  12- and 14-bit, each lossy, lossy after a split row, and lossless.
  What the stream needs comes from the maker note's tag 0x0096
  (NEFLinearizationTable): two version bytes (0x46 = lossless; 0x44 0x10 =
  lossy with a full curve; 0x44 0x20 = lossy with a stepped curve and a split
  row at byte 562; 0x44 0x40 = the Z bodies' lossy form, the same with the
  step and range quartered), the four starting predictions, then the curve.
* **Uncompressed (compression 1)**: 12- or 14-bit samples packed MSB first,
  each row starting on a byte, or 16-bit words in the file's byte order.

What a DNG states in tags, a NEF states in its maker note (type 3: ``Nikon\\0``,
a version, then a TIFF of its own whose offsets count from that header):

* **As-shot white balance**: tag 0x000C (WB_RBLevels), the red and blue
  multipliers against green.
* **Black level**: tag 0x003D (BlackLevel, four values) on bodies from about
  2014 (D810: 600), on a 14-bit scale even in a 12-bit file (divided by 4
  there); older bodies store black-subtracted data and the level is 0.
* **White level**: the top of the linearisation curve where one is stored (the
  last value before the curve flattens), else 2^bits - 1.
* **CFA phase**: the raw IFD's TIFF/EP CFAPattern tag, as in a DNG.
* **Visible area**: a NEF's stored width often includes columns that are not
  picture: optically masked sensels, then padding the camera fills with one
  value (D800E: 7,424 stored, 46 not picture; D90: 42; D5100: 44). Nothing in
  the file says where the picture ends (the maker note's CropHiSpeed, 0x001B,
  names the stored size), and dcraw and LibRaw trim by a per-model table.
  ``masked_margins`` finds them from the data instead: a picture column moves
  with its same-colour neighbour two columns in (correlation over rows near 1)
  and varies as much as the middle of the frame; a masked or padding column
  does neither. The result becomes the ActiveArea, so the developer skips them.
* **Colour**: a NEF carries no colour matrix the DNG colour model can use.
  Like a CR2 or an ARW, developing one needs the camera's ``.dcp`` profile
  (Adobe's free DNG Converter installs one per camera, "Nikon D810 Adobe
  Standard.dcp").

The format as dcraw and LibRaw read it (Dave Coffin's ``nikon_load_raw``, its
code tables and curve rules); this is an independent implementation, checked
sensel for sensel against LibRaw 0.22 (``tools/nef_libraw_check.py``,
``eval/nikon-nef-reader-2026-11-14.md``). Nikon's newer high-efficiency (TicoRAW,
compression 34892 in a NEF) and the Coolpix "E" packed layouts are refused with
the reason.
"""

from __future__ import annotations

import struct
from array import array

from shootflow import raw_develop as rd

TAG_MAKE = 271
TAG_MODEL = 272
TAG_EXIF_IFD = 34665
TAG_MAKER_NOTE = 37500
MN_WB_RB = 0x000C
MN_BLACK = 0x003D
MN_COMPRESSION = 0x0093
MN_LINEARIZATION = 0x0096

COMPRESSION_NIKON = 34713

# Code-length counts (lengths 1-16), then the symbols, for the six tables (dcraw's nikon_tree).
NIKON_TREES = (
    ((0, 1, 5, 1, 1, 1, 1, 1, 1, 2, 0, 0, 0, 0, 0, 0), (5, 4, 3, 6, 2, 7, 1, 0, 8, 9, 11, 10, 12)),  # 12-bit lossy
    (
        (0, 1, 5, 1, 1, 1, 1, 1, 1, 2, 0, 0, 0, 0, 0, 0),
        (0x39, 0x5A, 0x38, 0x27, 0x16, 5, 4, 3, 2, 1, 0, 11, 12, 12),
    ),  # 12-bit lossy after split
    ((0, 1, 4, 2, 3, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0), (5, 4, 6, 3, 7, 2, 8, 1, 9, 0, 10, 11, 12)),  # 12-bit lossless
    ((0, 1, 4, 3, 1, 1, 1, 1, 1, 2, 0, 0, 0, 0, 0, 0), (5, 6, 4, 7, 8, 3, 9, 2, 1, 0, 10, 11, 12, 13, 14)),  # 14-bit lossy
    (
        (0, 1, 5, 1, 1, 1, 1, 1, 1, 1, 2, 0, 0, 0, 0, 0),
        (8, 0x5C, 0x4B, 0x3A, 0x29, 7, 6, 5, 4, 3, 2, 1, 0, 13, 14),
    ),  # 14-bit lossy after split
    ((0, 1, 4, 2, 2, 3, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0), (7, 6, 8, 5, 9, 4, 10, 3, 11, 12, 2, 0, 1, 13, 14)),  # 14-bit lossless
)


def _text(values) -> str:
    return bytes(values or b"").split(b"\0", 1)[0].decode("latin-1").strip()


def _ifds(data: bytes):
    try:
        reader = rd._Reader(data)
        return reader, rd._all_ifds(reader)
    except (rd.DevelopError, struct.error):
        return None


def is_nef(data: bytes) -> bool:
    """A Nikon TIFF raw with no DNGVersion (a Nikon DNG, from a Coolpix or a converter, is read as a DNG)."""

    found = _ifds(data)
    if not found:
        return False
    _, ifds = found
    if not ifds or ifds[0].one(rd.TAG_DNG_VERSION) is not None:
        return False
    return _text(ifds[0].get(TAG_MAKE)).upper().startswith("NIKON")


def camera_model(data: bytes) -> str:
    """The camera name a profile is filed under: 'Nikon D810' (Model 'NIKON D810' with the maker in Adobe's case)."""

    found = _ifds(data)
    if not found or not found[1]:
        return ""
    model = _text(found[1][0].get(TAG_MODEL))
    if model.upper().startswith("NIKON"):
        model = model[5:].strip()
    return f"Nikon {model}".strip() if model else ""


# --------------------------------------------------------------------------
# Maker note


def maker_note(reader: rd._Reader, ifd0: rd.Ifd) -> rd.Ifd | None:
    """The type-3 Nikon maker note's IFD (``Nikon\\0`` + version + its own TIFF header), or None."""

    exif = rd.exif_ifd(reader, ifd0)
    mn = exif.get(TAG_MAKER_NOTE) if exif is not None else None
    if not mn or len(mn) < 18:
        return None
    note = bytes(mn)
    if not note.startswith(b"Nikon\0\x02"):
        return None
    try:
        inner = rd._Reader(note[10:])
        ifd, _ = inner.read_ifd(inner.first_ifd_offset())
    except (rd.DevelopError, struct.error):
        return None
    return ifd


class Linearization:
    """What tag 0x0096 says about the stream: table index, starting predictions, curve, split row."""

    def __init__(self, blob: bytes | None, bits: int, end: str):
        self.version = (0, 0)
        self.vpred = (0, 0, 0, 0)
        self.curve = list(range(0x10000))
        self.split = 0
        self.has_curve = False
        maximum = (1 << bits) & 0x7FFF
        tree = 0
        if blob and len(blob) >= 14:
            v0, v1 = blob[0], blob[1]
            self.version = (v0, v1)
            pos = 2
            if v0 == 0x49 or v1 == 0x58:
                pos += 2110
            if v0 == 0x46:
                tree = 2
            if pos + 10 <= len(blob):
                self.vpred = struct.unpack_from(end + "4H", blob, pos)
                csize = struct.unpack_from(end + "H", blob, pos + 8)[0]
                pos += 10
                step = maximum // (csize - 1) if csize > 1 else 0
                if v0 == 0x44 and (v1 == 0x20 or (v1 == 0x40 and step > 3)) and step > 0:
                    if v1 == 0x40:
                        # Z-series lossy (Z 6II, 2020 on): the stored points cover the bottom quarter
                        # of the range, a quarter of the step apart (as LibRaw reads it).
                        step //= 4
                        maximum //= 4
                    if pos + 2 * csize > len(blob):
                        raise rd.DevelopError("Nikon linearisation table is shorter than its stated size")
                    pts = struct.unpack_from(end + f"{csize}H", blob, pos)
                    for i in range(csize):
                        self.curve[i * step] = pts[i]
                    c = self.curve
                    for i in range(maximum):
                        r = i % step
                        c[i] = (c[i - r] * (step - r) + c[i - r + step] * r) // step
                    if 564 <= len(blob):
                        self.split = struct.unpack_from(end + "H", blob, 562)[0]
                    self.has_curve = True
                elif v0 != 0x46 and csize <= 0x4001:
                    n = min(csize, (len(blob) - pos) // 2)
                    self.curve[:n] = list(struct.unpack_from(end + f"{n}H", blob, pos))
                    maximum = csize
                    self.has_curve = n > 0
        if bits == 14:
            tree += 3
        self.tree = tree
        top = maximum
        while top > 2 and self.curve[top - 2] == self.curve[top - 1]:
            top -= 1
        self.white = self.curve[top - 1] if self.has_curve else (1 << bits) - 1


# --------------------------------------------------------------------------
# Sensor data


def _codes(tree: int) -> dict[tuple[int, int], int]:
    """Canonical code (length, code) -> symbol for one of the six tables."""

    counts, symbols = NIKON_TREES[tree]
    table: dict[tuple[int, int], int] = {}
    code = 0
    k = 0
    for length in range(1, 17):
        for _ in range(counts[length - 1]):
            table[(length, code)] = symbols[k] if k < len(symbols) else 0  # dcraw's table pads with zeros
            code += 1
            k += 1
        code <<= 1
    return table


def lut16(tree: int) -> array:
    """A 16-bit prefix table for one code table: entry ``(length << 8) | symbol``, 0 where no code starts."""

    lut = array("H", [0]) * 65536
    for (length, code), sym in _codes(tree).items():
        free = 16 - length
        lut[code << free : (code + 1) << free] = array("H", [(length << 8) | sym]) * (1 << free)
    return lut


def _decode_python(buf: bytes, width: int, height: int, lin: Linearization) -> array:
    """The reference decoder: one sensel at a time."""

    out = array("H", [0]) * (width * height)
    lut = lut16(lin.tree)
    curve = lin.curve
    vpred = [[lin.vpred[0], lin.vpred[1]], [lin.vpred[2], lin.vpred[3]]]
    hpred = [0, 0]
    acc = 0
    nbits = 0
    pos = 0
    n = len(buf)
    for row in range(height):
        if lin.split and row == lin.split:
            lut = lut16(lin.tree + 1)
        base = row * width
        for col in range(width):
            while nbits < 32:
                acc = ((acc << 8) | (buf[pos] if pos < n else 0)) & 0xFFFFFFFFFF
                pos += 1
                nbits += 8
            e = lut[(acc >> (nbits - 16)) & 0xFFFF]
            if not e:
                raise rd.DevelopError(f"Nikon compressed data: invalid code at row {row}, column {col}")
            nbits -= e >> 8
            sym = e & 0xFF
            length, shl = sym & 15, sym >> 4
            take = length - shl
            if take > 0:
                nbits -= take
                bits = (acc >> nbits) & ((1 << take) - 1)
            else:
                bits = 0
            diff = (((bits << 1) + 1) << shl) >> 1
            if length and (diff & (1 << (length - 1))) == 0:
                diff -= (1 << length) - (0 if shl else 1)
            elif not length:
                diff = 0
            if col < 2:
                v = (vpred[row & 1][col] + diff) & 0xFFFF
                vpred[row & 1][col] = v
                hpred[col] = v
            else:
                v = (hpred[col & 1] + diff) & 0xFFFF
                hpred[col & 1] = v
            s = v - 0x10000 if v & 0x8000 else v
            out[base + col] = curve[0 if s < 0 else (0x3FFF if s > 0x3FFF else s)]
    return out


def decode_nikon(buf: bytes, width: int, height: int, lin: Linearization, engine: str = "auto") -> array:
    """Nikon compressed sensor data to curve-mapped values, row-major."""

    if engine != "python":
        from shootflow import ljpeg_native

        if ljpeg_native.available():
            got = ljpeg_native.nikon_run(
                buf, width, height, lut16(lin.tree), lut16(lin.tree + 1) if lin.split else None,
                lin.split, lin.vpred, lin.curve,
            )
            if got is not None:
                return got
        elif engine == "native":
            raise RuntimeError("native decoder is not available")
    return _decode_python(buf, width, height, lin)


MARGIN_MAX = 64  # widest masked edge searched; a side with no picture column within it is left whole
# A varying edge column counts as picture when it correlates this well with the same-colour column
# two further in. 0.8 until 2026-11-15 cut two picture columns of busy 12- and 14-bit lossy frames
# (D3400, D5600: their first column correlates 0.70-0.80); the only masked column that varies as much
# as picture (the D70's) correlates -0.005 (eval/nikon-nef-split-row-2026-11-15.md).
PICTURE_CORR = 0.5


def _column(values, width: int, rows, c: int) -> list[float]:
    return [float(values[r * width + c]) for r in rows]


def _stats(v: list[float]) -> tuple[float, float]:
    n = len(v)
    mean = sum(v) / n
    return mean, (sum((x - mean) ** 2 for x in v) / n) ** 0.5


def _corr(a: list[float], b: list[float]) -> float:
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    sab = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    saa = sum((x - ma) ** 2 for x in a)
    sbb = sum((y - mb) ** 2 for y in b)
    return sab / (saa * sbb) ** 0.5 if saa > 0 and sbb > 0 else 0.0


def masked_margins(values, width: int, height: int, white: float) -> tuple[int, int]:
    """Columns at the left and right edge that hold no picture, found from the sensels.

    A column counts as picture when it varies over the rows at least a tenth as
    much as the middle of the frame and correlates (``PICTURE_CORR``, 0.5, or
    more) with the same-colour column two further in; or when it sits at 90% of white and is
    not one constant value (a clipped edge is picture; the D800E pads with
    columns of 16,382, every row the same). Scanning in from each edge, the first picture
    column ends the margin. The left margin is rounded up to even so the CFA
    phase stays the file's. Returns (0, 0) for a frame too flat to tell
    (middle columns varying by under 8 levels), and 0 for a side with no
    picture column within ``MARGIN_MAX``. Even rows only (one colour per
    column), at most about 1,200 of them.
    """

    if width < 4 * MARGIN_MAX or height < 16:
        return 0, 0
    step = 2 * max(1, height // 2400)
    rows = range(0, height, step)
    mid = width // 2 & ~1
    ref = sorted(_stats(_column(values, width, rows, c))[1] for c in range(mid - 8, mid + 8))[8]
    if ref < 8:
        return 0, 0
    floor = max(2.0, 0.1 * ref)

    def picture(c: int, inward: int) -> bool:
        v = _column(values, width, rows, c)
        mean, sd = _stats(v)
        if sd == 0:
            return False
        if mean >= 0.9 * white:
            return True
        return sd >= floor and _corr(v, _column(values, width, rows, inward)) >= PICTURE_CORR

    left = 0
    for c in range(MARGIN_MAX):
        if picture(c, c + 2):
            left = c
            break
    right = 0
    for k in range(1, MARGIN_MAX + 1):
        if picture(width - k, width - k - 2):
            right = k - 1
            break
    return left + (left & 1), right


def parse_nef(data: bytes, engine: str = "auto") -> rd.RawImage:
    """A NEF's sensor data and DNG-equivalent tags."""

    found = _ifds(data)
    if not found or not found[1]:
        raise rd.DevelopError("not a TIFF raw (no IFDs)")
    reader, ifds = found
    ifd0 = ifds[0]
    if not _text(ifd0.get(TAG_MAKE)).upper().startswith("NIKON") or ifd0.one(rd.TAG_DNG_VERSION) is not None:
        raise rd.DevelopError("not a Nikon NEF")
    raws = [i for i in ifds if i.one(rd.TAG_PHOTOMETRIC) == rd.PHOTOMETRIC_CFA and i.one(rd.TAG_NEW_SUBFILE_TYPE, 0) == 0]
    if not raws:
        raise rd.DevelopError("no Nikon raw IFD (a full-size CFA image); Coolpix NEFs are not supported, convert to DNG")
    ifd = max(raws, key=lambda i: i.one(rd.TAG_WIDTH, 0) * i.one(rd.TAG_HEIGHT, 0))
    width, height = ifd.one(rd.TAG_WIDTH), ifd.one(rd.TAG_HEIGHT)
    bits = ifd.one(rd.TAG_BITS, 12)
    if not width or not height or width * height > 400_000_000:
        raise rd.DevelopError("raw image size is missing or implausible")
    if bits not in (12, 14, 16):
        raise rd.DevelopError(f"{bits}-bit Nikon sensor data is not supported")
    mn = maker_note(reader, ifd0)
    compression = ifd.one(rd.TAG_COMPRESSION, 1)
    notes: list[str] = []
    lin = None
    layout = ""
    level_scale = 1
    offsets, sizes = ifd.get(rd.TAG_STRIP_OFFSETS), ifd.get(rd.TAG_STRIP_BYTES)
    if not offsets or not sizes or len(offsets) != len(sizes):
        raise rd.DevelopError("Nikon raw IFD has no usable strips")
    fixed = compression == COMPRESSION_NIKON and not (mn is not None and mn.get(MN_LINEARIZATION)) and _fixed_size(sizes, width, height)
    if compression == COMPRESSION_NIKON and not fixed:
        at, size = offsets[0], sum(sizes) if len(offsets) > 1 else sizes[0]
        if at + size > len(data):
            raise rd.DevelopError("Nikon raw strip lies outside the file")
        blob = mn.get(MN_LINEARIZATION) if mn is not None else None
        lin = Linearization(bytes(blob) if blob else None, 14 if bits == 14 else 12, mn.byte_order if mn else ">")
        values = decode_nikon(data[at : at + size], width, height, lin, engine)
        kind = {2: "lossless", 5: "lossless"}.get(lin.tree, "lossy")
        notes.append(f"NEF: Nikon compressed ({kind}, {bits}-bit{', split at row %d' % lin.split if lin.split else ''})")
        white = lin.white
    elif compression == 1 or fixed:
        chunks = []
        for at, size in zip(offsets, sizes):
            if at + size > len(data):
                raise rd.DevelopError("Nikon raw strip lies outside the file")
            chunks.append(data[at : at + size])
        values, white, layout, level_scale = _uncompressed(b"".join(chunks), width, height, bits, reader.end, compression)
        if _text(ifd0.get(TAG_MODEL)).upper().startswith("E") and layout.startswith("12-bit"):
            values = _deinterlace(values, width, height)
            layout += ", even rows then odd rows"
        notes.append(f"NEF: uncompressed ({layout})")
    else:
        raise rd.DevelopError(f"Nikon raw compression {compression} is not supported; convert to DNG")

    black: tuple[float, ...] = (0.0,) * 4
    if mn is not None:
        b = mn.get(MN_BLACK)
        if b and len(b) >= 4:
            # Stored on a 14-bit scale whatever the file's depth: a 12-bit frame's level is a
            # quarter of it (Z 6II 12-bit: 1008 stored, 252 in the data; LibRaw agrees).
            scale = 1 << (14 - bits) if bits < 14 else 1
            black = tuple(float(v) / scale for v in b[:4])
    nrw_black, nrw_wb = coolpix_levels(mn)
    model_name = _text(ifd0.get(TAG_MODEL)).upper()
    if black == (0.0,) * 4 and nrw_black:
        black = (float(nrw_black),) * 4
        notes.append(f"NEF: Coolpix black level {nrw_black} from the maker note's NRW colour block (0x0014)")
    elif black == (0.0,) * 4 and model_name in COOLPIX_BLACK:
        level = COOLPIX_BLACK[model_name] * level_scale
        black = (float(level),) * 4
        notes.append(f"NEF: black level {level} for the {model_name} (no level in the file; per-model value)")
    as_shot = None
    wb = mn.get(MN_WB_RB) if mn is not None else None
    if wb and len(wb) >= 2 and wb[0] > 0 and wb[1] > 0:
        as_shot = (float(wb[0]), 1.0, float(wb[1]))
    elif nrw_wb:
        as_shot = (nrw_wb[0], 1.0, nrw_wb[1])
        notes.append("NEF: as-shot white balance from the maker note's NRW colour block (0x0014)")
    else:
        notes.append("no Nikon as-shot white balance (maker note 0x000C)")

    pattern = ifd.get(rd.TAG_CFA_PATTERN)
    if ifd.get(rd.TAG_CFA_REPEAT) != (2, 2) or not pattern or len(pattern) != 4 or sorted(pattern) != [0, 1, 1, 2]:
        raise rd.DevelopError("Nikon raw has no 2x2 RGB CFAPattern")
    if "32-bit words" in layout and green_diagonal(values, width, height) not in (None, _tag_green(pattern)):
        # The P6000 states GBRG; its sensels put green on the other diagonal, and every body in this layout is
        # RGGB (as LibRaw reads them all).
        notes.append(f"NEF: CFAPattern {tuple(pattern)} puts green where the sensels say it is not; read as RGGB")
        pattern = (0, 1, 1, 2)

    left, right = masked_margins(values, width, height, white)
    if left or right:
        notes.append(
            f"NEF: {left + right} edge columns hold no picture (masked or padding: {left} left, {right} right),"
            " found from the sensels and left out"
        )
    synth = rd.Ifd(byte_order=reader.end)
    synth.entries = {
        rd.TAG_WIDTH: (width,),
        rd.TAG_HEIGHT: (height,),
        rd.TAG_BITS: (16 if white > 0x3FFF else 14 if white > 0xFFF else 12,),
        rd.TAG_SAMPLES: (1,),
        rd.TAG_PHOTOMETRIC: (rd.PHOTOMETRIC_CFA,),
        rd.TAG_CFA_REPEAT: (2, 2),
        rd.TAG_CFA_PATTERN: tuple(pattern),
        rd.TAG_ACTIVE_AREA: (0, left, height, width - right),
        rd.TAG_BLACK_REPEAT: (2, 2),
        rd.TAG_BLACK_LEVEL: black,
        rd.TAG_WHITE_LEVEL: (int(white),),
    }
    if as_shot is not None:
        synth.entries[rd.TAG_AS_SHOT_NEUTRAL] = tuple(1.0 / v for v in as_shot)
    head = rd.Ifd(entries=dict(ifd0.entries), byte_order=reader.end)
    head.entries[rd.TAG_UNIQUE_CAMERA_MODEL] = tuple(camera_model(data).encode("latin-1")) + (0,)
    exif = rd.exif_ifd(reader, ifd0)
    return rd.RawImage(width, height, 1, values, synth, head, source="nef", notes=notes, exif=exif)


# --------------------------------------------------------------------------
# Coolpix NRW (and older Coolpix NEF) layouts
#
# A Coolpix raw is a NEF in all but name (``.NRW`` from the P6000 on), but its
# sensor is rarely Huffman-coded, even when the raw IFD says 34713:
#
# * 12-bit samples packed MSB first, as in a D-series uncompressed NEF (P330 and
#   P340 under compression 34713, the E8800 under 1);
# * 12-bit samples packed MSB first inside little-endian 32-bit words (P6000,
#   P7000, P7100, P950, P1000, B700): each four bytes reversed, then unpacked;
# * one 16-bit word per sensel (A1000 little-endian under compression 1; P330,
#   P7700, P7800 big-endian under 34713), on the P330/P7700/P7800 with the
#   12-bit value in the word's top bits (every low nibble zero).
#
# Nothing in the file names the layout. The byte count says packed or 16-bit,
# and which byte order is read by trying each on a band of rows from the middle
# of the frame: the right one is a picture, whose same-colour neighbours two
# columns apart differ by a small fraction of what they do in the wrong one's
# noise. The older E-series bodies (E8800) store the even rows, then the odd
# ones. The black level is in the maker note's NRW colour block (tag 0x0014,
# "NRW 0101" and later: a 16-bit value at byte 0x20), and so is the as-shot
# balance when tag 0x000C is missing ("NRW 0100": four 32-bit R, G, G, B levels
# at byte 0x13E8; later versions at 0x38; R and B are stored halved). The
# 4032-wide P330, P340, P7700 and P7800 carry no level at all; their black is
# 200 on the 12-bit scale (LibRaw's per-model table; their dark corners read
# at it, eval/nikon-nrw-reader-2026-11-18.md). Layouts, levels and balances
# as LibRaw 0.22 reads them; checked sensel for sensel against it on eleven
# Coolpix files from raw.pixls.us (CC0), tools/nef_libraw_check.py.

COOLPIX_BLACK = {"COOLPIX P330": 200, "COOLPIX P340": 200, "COOLPIX P7700": 200, "COOLPIX P7800": 200}
MN_NRW_COLOUR = 0x0014


def _fixed_size(sizes, width: int, height: int) -> bool:
    """A 34713 raw IFD whose strips hold exactly a packed-12 or 16-bit frame is not Huffman-coded."""

    total = sum(sizes)
    return total in (width * height * 2, width * height * 3 // 2) and (width * height * 3) % 2 == 0


def _roughness(values, width: int, rows: int) -> float:
    total = 0
    n = 0
    for r in range(rows):
        base = r * width
        for c in range(0, width - 2, 3):
            total += abs(values[base + c] - values[base + c + 2])
            n += 1
    return total / n if n else 0.0


def _swap32(blob: bytes) -> bytes:
    words = array("I")
    if words.itemsize != 4:  # pragma: no cover - every supported platform has a 4-byte 'I'
        words = array("L")
    usable = len(blob) - len(blob) % 4
    words.frombytes(blob[:usable])
    words.byteswap()
    return words.tobytes() + blob[usable:]


def _unpack12(blob: bytes, width: int, height: int) -> array:
    count = width * height
    np_mod = rd._numpy_engine("auto")
    vals = np_mod.unpack_bits(blob, 12, count, width) if np_mod else rd._unpack_bits(blob, 12, count, width)
    return vals if isinstance(vals, array) else array("H", vals)


def _words16(blob: bytes, count: int, big_endian: bool) -> array:
    values = array("H", blob[: 2 * count])
    if big_endian == (array("H", b"\x01\x00")[0] == 1):
        values.byteswap()
    return values


BAND_ROWS = 8


def _uncompressed(blob: bytes, width: int, height: int, bits: int, end: str, compression: int):
    """(values, white level, layout note) for an uncompressed Nikon frame, choosing the byte order from the data."""

    count = width * height
    if bits == 16 or (bits < 16 and len(blob) >= 2 * count and compression == COMPRESSION_NIKON) or (
        bits < 16 and len(blob) == 2 * count
    ):
        # One 16-bit word per sensel: the file's order first, then the other if it is clearly smoother.
        if len(blob) < 2 * count:
            raise rd.DevelopError(f"Nikon uncompressed strips hold {len(blob)} bytes for {width}x{height} 16-bit sensels")
        mid = max(0, height // 2 - BAND_ROWS // 2) * width
        band = blob[2 * mid : 2 * (mid + BAND_ROWS * width)]
        rows = min(BAND_ROWS, height)
        first_big = (end == ">") if compression == 1 else True
        a = _words16(band, rows * width, first_big)
        b = _words16(band, rows * width, not first_big)
        big = first_big if _roughness(a, width, rows) <= 2 * _roughness(b, width, rows) else not first_big
        values = _words16(blob, count, big)
        order = "big-endian" if big else "little-endian"
        shift = 16 - bits
        low = sum(1 for v in values[mid : mid + rows * width] if v & ((1 << shift) - 1))
        if 0 < shift and max(values) > (1 << bits) - 1 and low * 1000 <= rows * width:
            # The value sits in the word's top bits (P330, P7700, P7800: under 0.1% of words have a low bit set,
            # always 8, a half step). Kept as stored, so nothing is rounded; the black level scales with it and
            # the white level is the top code these bodies write, 4094 << 4 (65,504; LibRaw's maximum).
            return values, ((1 << bits) - 2) << shift, f"{bits}-bit in the top of {order} 16-bit words", 1 << shift
        if bits == 16:
            return values, 0xFFFF, f"16-bit, {order}", 1
        return values, (1 << bits) - 1, f"{bits}-bit in {order} 16-bit words", 1
    row_bytes = (width * bits + 7) // 8
    if len(blob) < row_bytes * height:
        raise rd.DevelopError(f"Nikon uncompressed strips hold {len(blob)} bytes for {width}x{height} {bits}-bit sensels")
    if bits != 12 or row_bytes % 4:
        np_mod = rd._numpy_engine("auto")
        vals = np_mod.unpack_bits(blob, bits, count, width) if np_mod else rd._unpack_bits(blob, bits, count, width)
        return (vals if isinstance(vals, array) else array("H", vals)), (1 << bits) - 1, f"{bits}-bit", 1
    rows = min(BAND_ROWS, height)
    start = max(0, height // 2 - rows // 2) * row_bytes
    band = blob[start : start + rows * row_bytes]
    plain = rd._unpack_bits(band, 12, rows * width, width)
    swapped = rd._unpack_bits(_swap32(band), 12, rows * width, width)
    if _roughness(swapped, width, rows) * 2 < _roughness(plain, width, rows):
        return _unpack12(_swap32(blob[: row_bytes * height]), width, height), 4095, "12-bit, in little-endian 32-bit words", 1
    return _unpack12(blob, width, height), 4095, "12-bit", 1


def _deinterlace(values, width: int, height: int) -> array:
    """Stored rows 0, 2, 4, ... then 1, 3, 5, ... back into order (the E-series Coolpix bodies)."""

    half = (height + 1) // 2
    out = array("H", bytes(2 * width * height))
    for i in range(height):
        row = 2 * i if i < half else 2 * (i - half) + 1
        out[row * width : (row + 1) * width] = values[i * width : (i + 1) * width]
    return out


def _tag_green(pattern) -> int:
    """0 when the CFA's greens sit at (0,0) and (1,1), 1 when at (0,1) and (1,0)."""

    return 0 if pattern[0] == 1 else 1


def green_diagonal(values, width: int, height: int, rows: int = 64) -> int | None:
    """Which diagonal of the 2x2 cell the sensels say is green: 0 for (0,0)/(1,1), 1 for (0,1)/(1,0).

    The two green sites of a cell see the same colour, so over a band of the frame their values agree far
    more closely than either diagonal's sites do on the other diagonal (R against B). None when the band
    cannot tell (a flat or tiny frame).
    """

    if width < 8 or height < 8:
        return None
    rows = min(rows, height - height % 2)
    top = (height // 2 - rows // 2) & ~1
    diff = [0.0, 0.0]
    for r in range(top, top + rows, 2):
        a = r * width
        b = a + width
        for c in range(0, width - 1, 2):
            diff[0] += abs(values[a + c] - values[b + c + 1])
            diff[1] += abs(values[a + c + 1] - values[b + c])
    if max(diff) == 0:
        return None
    lo, hi = sorted(diff)
    if lo * 1.5 > hi:
        return None
    return 0 if diff[0] < diff[1] else 1


def coolpix_levels(mn: rd.Ifd | None) -> tuple[int | None, tuple[float, float] | None]:
    """(black level, (R, B) as-shot multipliers) from a Coolpix maker note's NRW colour block, where present."""

    if mn is None:
        return None, None
    blob = mn.get(MN_NRW_COLOUR)
    if not blob or len(blob) < 0x48:
        return None, None
    raw = bytes(blob)
    if len(raw) == 2560 and raw[:4] != b"NRW ":
        # E5400, E8400, E8700, E8800: R and B multipliers x256, big-endian, at byte 0x4E0.
        r, b = struct.unpack_from(">2H", raw, 0x4E0)
        return None, ((r / 256.0, b / 256.0) if r and b else None)
    if raw[:4] != b"NRW ":
        return None, None
    order = mn.byte_order
    black = None
    if raw[4:8] == b"0100":
        at = 10 + 0x13DE
    else:
        black = struct.unpack_from(order + "H", raw, 0x20)[0]
        at = 0x38
    wb = None
    if at + 16 <= len(raw):
        r, g0, g1, b = struct.unpack_from(order + "4I", raw, at)
        if r and g0 and g1 and b:
            wb = (2.0 * r / g0, 2.0 * b / g0)
    return (black or None), wb


__all__ = ["COOLPIX_BLACK", "Linearization", "camera_model", "coolpix_levels", "decode_nikon", "is_nef", "lut16", "maker_note", "masked_margins", "parse_nef"]
