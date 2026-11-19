"""Read a Hasselblad 3FR (or Phocus .fff) straight into the developer, standard library only (C when present).

A 3FR is a plain TIFF (``II``, magic 42) written by Hasselblad's H and X bodies and CF/CFV backs. IFD0 is
an 8-bit thumbnail with Make "Hasselblad" and, unlike most makers' raws, DNG colour tags of its own:
ColorMatrix1 (the same nine numbers as Adobe's table for the body), AsShotNeutral and
UniqueCameraModel, but no DNGVersion and no CalibrationIlluminant. The second IFD is the sensor:
Photometric 32803 (CFA), 16 bits, one sample, with DNG-style BlackLevel (50714), WhiteLevel (50717),
DefaultCropOrigin and DefaultCropSize (50719, 50720) and, on the X2D and CFV 100C, MaskedAreas (50830).
There is no CFAPattern tag; every body checked is RGGB from the sensor's first sensel, as LibRaw reads it.

Two sensor layouts, told apart by Compression:

* **1, uncompressed** (X1D, X1D II, X2D, CFV II and CFV 100C): little-endian 16-bit words, row-major.
* **7, Hasselblad's lossless JPEG** (H3D, H4D, CF132, CFV, CFV-50c): a JPEG SOF3 header with one Huffman
  table, but not a JPEG scan. After the SOS segment the bits are read MSB first from little-endian 32-bit
  words with no 0xFF stuffing. Each pair of sensels takes two size codes, then the two differences (a
  difference whose top bit is clear is negative, as in JPEG; a 16-bit 65535 means -32768). A sensel is
  predicted from the same-colour sensel two columns left, 0x8000 at a row's start; when the SOS predictor
  is 11, from the third row on, plus half the sensel two rows up minus half the one left of that.
  StripByteCounts holds the unpacked size (2 bytes a sensel), not the stream's length, on these files.

**Phocus .fff** (Hasselblad's tethering and export software) writes the same layout big-endian (``MM``),
always compression 7, with StripByteCounts the stream's real length; the reader takes it unchanged
(eleven files from nine bodies equal to LibRaw sensel for sensel, ``eval/hasselblad-fff-reader-2026-11-18.md``).
Three things differ from a 3FR, and the reader handles each:

* the colour matrix is written as ColorMatrix2 with no illuminant (the developer uses it alone), or not at
  all (the CFV-50c, X2D 100C, H4D-40 and H6D-100c files checked): ``OWN_MATRICES`` then gives the body's own
  ColorMatrix1, read from a 3FR of that body, or a note says a ``.dcp`` is needed;
* the newer exports multiply R and B by AnalogBalance (50727) and leave AsShotNeutral as it was, so where
  the data carries that gain (``_gain_in_data``: the empty codes a digital gain leaves, channel by channel)
  the neutral is scaled by the same gains; on two frames shot as both 3FR and .fff the developed colour
  then agrees to 0.0001 in chromaticity (0.008-0.017 without it). Older exports carry the tag but not the
  gain, and their neutral is used as written;
* UniqueCameraModel names only the series ('Hasselblad H4D' for an H4D-40), so ``camera_model`` takes the
  Model tag when it extends it.

Levels and crop come from the file's own tags. The black level is the BlackLevel tag (0 when there is
none); where LibRaw differs it is reported, not gated (``eval/hasselblad-3fr-reader-2026-11-18.md``).
One exception is read from the data: a frame whose black-subtracted values went below zero and wrapped
to the top of the 16-bit range (the H4D-60) is shifted up 256 with black 256, as LibRaw does by model.
Colour: the in-file ColorMatrix1 makes a 3FR developable without a ``.dcp``, as a DNG is; a camera
profile passed with ``--dcp`` still replaces it.

The format as dcraw and LibRaw read it (Dave Coffin's ``hasselblad_load_raw``); this is an independent
implementation, checked sensel for sensel against LibRaw 0.22 on ten bodies' files from raw.pixls.us
(``tools/hasselblad_libraw_check.py``). Multi-shot frames (several samples per sensel) and any other
compression are refused with the reason.
"""

from __future__ import annotations

import struct
from array import array
from typing import Any

from shootflow import raw_develop as rd

TAG_MAKE = 271
TAG_MODEL = 272
TAG_DEFAULT_CROP_ORIGIN = 50719
TAG_DEFAULT_CROP_SIZE = 50720
TAG_MASKED_AREAS = 50830

# ColorMatrix1 for bodies whose Phocus .fff exports carry no colour matrix, each read from a 3FR of the
# same body (the body's own numbers, as written in the raw by the camera): the CFV-50c's from its 3FR on
# raw.pixls.us (20200215_BERLIN_OldNew_WestHafen_B0000420.3FR, whose .fff export of the same frame drops
# the matrix), the X2D 100C's from B0000079.3FR (Job_0079.fff is the same frame). Keyed by camera_model().
# eval/hasselblad-fff-reader-2026-11-18.md.
OWN_MATRICES: dict[str, tuple[float, ...]] = {
    "Hasselblad CFV-50c": (
        0.49320617, -0.08351876, 0.01406772, -0.48778443, 1.18683059, 0.34366459, -0.11382371, 0.19610748, 0.70670566,
    ),
    "Hasselblad X2D 100C": (
        0.59505738, -0.14667475, -0.03412952, -0.51592963, 1.26306183, 0.28261109, -0.10382582, 0.16755777, 0.6152086,
    ),
}

COMPRESSION_NONE = 1
COMPRESSION_HASSELBLAD = 7
RGGB = (0, 1, 1, 2)


def _text(values) -> str:
    return bytes(values or b"").split(b"\0", 1)[0].decode("latin-1").strip()


def _ifds(data: bytes) -> list[rd.Ifd] | None:
    if data[:2] not in (b"II", b"MM"):
        return None
    try:
        reader = rd._Reader(data)
        if reader.magic != 42:
            return None
        return rd._all_ifds(reader)
    except (rd.DevelopError, struct.error):
        return None


def is_3fr(data: bytes) -> bool:
    """A TIFF whose IFD0 says Make "Hasselblad", with no DNGVersion and a CFA image."""

    ifds = _ifds(data)
    if not ifds:
        return False
    ifd0 = ifds[0]
    if not _text(ifd0.get(TAG_MAKE)).lower().startswith("hasselblad") or ifd0.one(rd.TAG_DNG_VERSION) is not None:
        return False
    return any(i.one(rd.TAG_PHOTOMETRIC) == rd.PHOTOMETRIC_CFA for i in ifds)


def _full_model(ifd0: rd.Ifd) -> str:
    """IFD0's Model as 'Hasselblad <body>', cut at a '/' ('CFV-50c/Flash Sync' is the CFV-50c)."""

    model = _text(ifd0.get(TAG_MODEL)).split("/", 1)[0].strip()
    if model and not model.lower().startswith("hasselblad"):
        model = f"Hasselblad {model}"
    return model


def camera_model(data: bytes) -> str:
    """The camera name a profile is filed under: 'Hasselblad X1D', 'Hasselblad H5D-50c'.

    UniqueCameraModel first, unless it is only the start of the Model tag: Phocus writes the series there
    ('Hasselblad H4D' on H4D-40 and H4D-50 files, whose sensors and matrices differ; plain 'Hasselblad' on
    a CFV-50), and the Model tag names the body ('Hasselblad H4D-40'). A Model that is not an extension of
    UniqueCameraModel ('X1DM2-50c' beside 'Hasselblad X1D II 50C') leaves UniqueCameraModel in charge.
    """

    ifds = _ifds(data)
    if not ifds:
        return ""
    unique = _text(ifds[0].get(rd.TAG_UNIQUE_CAMERA_MODEL))
    model = _full_model(ifds[0])
    if unique and not (len(model) > len(unique) and model.casefold().startswith(unique.casefold())):
        return unique
    return model or unique


def _sensor_ifd(ifds: list[rd.Ifd]) -> rd.Ifd:
    cfa = [i for i in ifds if i.one(rd.TAG_PHOTOMETRIC) == rd.PHOTOMETRIC_CFA]
    if not cfa:
        raise rd.DevelopError("3FR has no CFA image")
    return max(cfa, key=lambda i: (i.one(rd.TAG_WIDTH) or 0) * (i.one(rd.TAG_HEIGHT) or 0))


def jpeg_header(data: bytes, pos: int) -> tuple[int, int, int, dict[tuple[int, int], int], int]:
    """``(width, height, psv, huffman table, first stream byte)`` from the SOF3 header at ``pos``."""

    if data[pos : pos + 2] != b"\xff\xd8":
        raise rd.DevelopError("3FR compressed sensor data does not start with a JPEG SOI marker")
    pos += 2
    width = height = None
    table = None
    while pos + 4 <= len(data):
        if data[pos] != 0xFF:
            raise rd.DevelopError("3FR JPEG header: a marker was expected")
        if data[pos + 1] == 0xFF:  # a fill byte before the marker (the CFV writes one after SOF3)
            pos += 1
            continue
        marker = data[pos + 1]
        length = struct.unpack_from(">H", data, pos + 2)[0]
        body = data[pos + 4 : pos + 2 + length]
        if marker == 0xC3:
            _precision, height, width, ncomp = struct.unpack_from(">BHHB", body, 0)
            if ncomp != 1:
                raise rd.DevelopError(f"3FR JPEG header names {ncomp} components; one was expected")
        elif marker == 0xC4 and table is None:
            counts = body[1:17]
            table = rd._huffman_table(counts, body[17 : 17 + sum(counts)])
        elif marker == 0xDA:
            ns = body[0]
            psv = body[1 + 2 * ns]
            if width is None or height is None or table is None:
                raise rd.DevelopError("3FR JPEG header has no SOF3 or no Huffman table before the scan")
            return width, height, psv, table, pos + 2 + length
        pos += 2 + length
    raise rd.DevelopError("3FR JPEG header runs out before the scan")


def _decode_python(stream: bytes, width: int, height: int, psv: int, table: dict[tuple[int, int], int]) -> array:
    """The reference decoder (``ljpeg_native.hasselblad_run`` does the same in C)."""

    lut = {}
    for (length, code), size in table.items():
        lut[(length, code)] = size
    max_len = max(length for length, _ in table) if table else 0
    pad = (-len(stream)) % 4
    blob = stream + bytes(pad + 8)
    words = struct.unpack_from(f"<{len(blob) // 4}I", blob)
    state = {"acc": 0, "nb": 0, "w": 0}

    def bits(n: int) -> int:
        while state["nb"] < n:
            w = words[state["w"]] if state["w"] < len(words) else 0
            state["w"] += 1
            state["acc"] = (state["acc"] << 32 | w) & ((1 << 96) - 1)
            state["nb"] += 32
        state["nb"] -= n
        return (state["acc"] >> state["nb"]) & ((1 << n) - 1)

    def size_code() -> int:
        code = 0
        for length in range(1, max_len + 1):
            code = code << 1 | bits(1)
            hit = lut.get((length, code))
            if hit is not None:
                return hit
        raise rd.DevelopError("3FR: the compressed stream holds a code its Huffman table does not assign")

    out = array("H", [0]) * (width * height)
    back = [[0] * width for _ in range(3)]
    for row in range(height):
        cur, up2 = back[row % 3], back[(row + 1) % 3]
        base = row * width
        for col in range(0, width, 2):
            sizes = (size_code(), size_code())
            diffs = []
            for n in sizes:
                v = bits(n) if n else 0
                if n and not v & (1 << (n - 1)):
                    v -= (1 << n) - 1
                if v == 65535:
                    v = -32768
                diffs.append(v)
            for s in range(col, min(col + 2, width)):
                pred = cur[s - 2] if col else 0x8000
                if col and row > 1 and psv == 11:
                    pred += int(up2[s] / 2) - int(up2[s - 2] / 2)
                pred += diffs[s & 1]
                out[base + s] = pred & 0xFFFF
                cur[s] = pred
    return out


def decode_compressed(data: bytes, offset: int, width: int, height: int, engine: str = "auto") -> array:
    """The sensels of a compression-7 3FR whose JPEG header starts at ``offset``."""

    if width % 2:
        raise rd.DevelopError(f"3FR compressed width {width} is odd; the codes come in pairs of sensels")
    jw, jh, psv, table, start = jpeg_header(data, offset)
    if (jw, jh) != (width, height):
        raise rd.DevelopError(f"3FR JPEG header says {jw} x {jh}, the TIFF says {width} x {height}")
    stream = data[start:]
    if engine != "python":
        from shootflow import ljpeg_native

        got = ljpeg_native.hasselblad_run(stream, width, height, psv, ljpeg_native.lut16(table))
        if got is not None:
            return got
    return _decode_python(stream, width, height, psv, table)


# Signed sensor data. The H4D-60's 3FR stores black-subtracted values whose noise goes below zero, so a
# dark sensel at -3 is stored as 65533 and would develop as a white speck. Such a file says white 32767 and
# black 0; its top 256 codes hold 0.5% of the frame while the 16,128 codes below them hold none, a gap no
# real highlight leaves. LibRaw fixes the same files by model (H4D-60 3FR: 256 added, black 256); the gap
# test finds them from the data, so a body with the same habit needs no table entry.
SIGNED_TOP = 32768
SIGNED_OFFSET = 256
WRAP_FLOOR = 65536 - SIGNED_OFFSET  # values here are -256..-1
GAP_FLOOR = 49152  # nothing between this and WRAP_FLOOR on a wrapped frame
WRAP_SHARE = 1e-4


def _numpy() -> Any:
    """numpy when installed, else None (the reader runs on the standard library alone)."""

    try:
        import numpy
    except ImportError:
        return None
    return numpy


def _wraps_below_zero(values: array) -> bool:
    """True when the top 256 codes hold over 0.01% of sensels and the codes 49152-65279 hold none."""

    np = _numpy()
    if np is not None:
        a = np.frombuffer(values, dtype=np.uint16)
        wrapped = int(np.count_nonzero(a >= WRAP_FLOOR))
        if wrapped <= WRAP_SHARE * a.size:
            return False
        return not np.count_nonzero((a >= GAP_FLOOR) & (a < WRAP_FLOOR))
    wrapped = gap = 0
    for v in values:
        if v >= WRAP_FLOOR:
            wrapped += 1
        elif v >= GAP_FLOOR:
            gap += 1
            break
    return not gap and wrapped > WRAP_SHARE * len(values)


def _shift(values: array, offset: int) -> array:
    """Each value plus ``offset``, modulo 2^16: -256..-1 become 0..255, everything else moves up 256."""

    np = _numpy()
    if np is not None:
        a = np.frombuffer(values, dtype=np.uint16) + np.uint16(offset)
        return array("H", a.tobytes())
    return array("H", [(v + offset) & 0xFFFF for v in values])


# A digital gain g > 1 on integer data leaves 1 - 1/g of the codes empty (a 2.8% gain skips one code in 36),
# while a channel at gain 1 has none empty where it is dense. Phocus's newer .fff exports carry exactly that
# signature, channel by channel, at the file's AnalogBalance (CFV-50c, X1D II, H6D-100c, X2D 100C); older
# exports (CFV-50, H4D-40, H4D-50, H5D-40, H5D-50c) carry either no gaps or gaps of another size, and their
# neutral is used as written (eval/hasselblad-fff-reader-2026-11-18.md).
GAIN_WINDOW = 1024  # codes, around the channel's densest
GAIN_MIN_COUNT = 100  # mean sensels per code there, for an empty code to mean anything
GAIN_TOL = 0.25  # of the expected empty share, plus GAIN_SLACK
GAIN_SLACK = 0.003
GAIN_MIN_EMPTY = 0.004  # some channel's expected share must reach this (a gain of 1.004)


def _gain_in_data(values: array, width: int, height: int, pattern: tuple, gains: tuple) -> bool | None:
    """True when every colour's empty-code share matches ``1 - 1/gain``; None when it cannot be told."""

    np = _numpy()
    if np is None or max(1 - 1 / g for g in gains) < GAIN_MIN_EMPTY:
        return None
    a = np.frombuffer(values, dtype=np.uint16).reshape(height, width)
    for colour, gain in enumerate(gains):
        sites = [(y, x) for y in (0, 1) for x in (0, 1) if pattern[2 * y + x] == colour]
        if not sites:
            return None
        hist = np.zeros(65536, dtype=np.int64)
        for y, x in sites:
            hist += np.bincount(a[y::2, x::2].ravel(), minlength=65536)
        run = np.concatenate(([0], np.cumsum(hist)))
        sums = run[GAIN_WINDOW:] - run[:-GAIN_WINDOW]
        start = int(np.argmax(sums))
        window = hist[start : start + GAIN_WINDOW]
        if window.mean() < GAIN_MIN_COUNT:
            return None
        empty = float(np.mean(window == 0))
        want = max(0.0, 1 - 1 / gain)
        if abs(empty - want) > GAIN_TOL * want + GAIN_SLACK:
            return False
    return True


def parse_3fr(data: bytes, engine: str = "auto") -> rd.RawImage:
    """A 3FR's sensor data and DNG-equivalent tags."""

    ifds = _ifds(data)
    if not ifds:
        raise rd.DevelopError("not a Hasselblad 3FR (not a TIFF)")
    ifd0 = ifds[0]
    ifd = _sensor_ifd(ifds)
    width, height = ifd.one(rd.TAG_WIDTH), ifd.one(rd.TAG_HEIGHT)
    if not width or not height or width * height > 400_000_000:
        raise rd.DevelopError("raw image size is missing or implausible")
    if ifd.one(rd.TAG_SAMPLES, 1) != 1:
        raise rd.DevelopError("multi-shot 3FR (several samples per sensel) is not supported; convert to DNG")
    if ifd.one(rd.TAG_BITS, 16) != 16:
        raise rd.DevelopError(f"3FR with {ifd.one(rd.TAG_BITS)}-bit samples is not supported; convert to DNG")
    offsets = ifd.get(rd.TAG_STRIP_OFFSETS)
    if not offsets:
        raise rd.DevelopError("3FR sensor IFD has no strip offset")
    if len(offsets) != 1:
        raise rd.DevelopError("3FR sensor data in several strips is not supported; convert to DNG")
    offset = offsets[0]
    compression = ifd.one(rd.TAG_COMPRESSION, 1)
    notes = []
    if compression == COMPRESSION_NONE:
        need = width * height * 2
        if offset + need > len(data):
            raise rd.DevelopError(f"3FR sensor data runs past the end of the file ({offset + need} > {len(data)} bytes)")
        values = array("H")
        values.frombytes(data[offset : offset + need])
        if (ifd.byte_order == ">") != (array("H", [1]).tobytes() == b"\0\1"):
            values.byteswap()
        notes.append("3FR: uncompressed 16-bit")
    elif compression == COMPRESSION_HASSELBLAD:
        values = decode_compressed(data, offset, width, height, engine)
        notes.append("3FR: Hasselblad lossless JPEG")
    else:
        raise rd.DevelopError(f"3FR compression {compression} is not supported; convert to DNG")

    black = float((ifd.get(rd.TAG_BLACK_LEVEL) or (0,))[0])
    white = ifd.one(rd.TAG_WHITE_LEVEL, 65535)
    if black == 0 and white < SIGNED_TOP and _wraps_below_zero(values):
        values = _shift(values, SIGNED_OFFSET)
        black, white = float(SIGNED_OFFSET), white + SIGNED_OFFSET
        notes.append(
            f"3FR: black-subtracted data dips below zero (it wrapped to the top of the range); "
            f"read with a {SIGNED_OFFSET} offset, black {SIGNED_OFFSET}"
        )
    synth = rd.Ifd(byte_order=ifd.byte_order)
    synth.entries = {
        rd.TAG_WIDTH: (width,),
        rd.TAG_HEIGHT: (height,),
        rd.TAG_BITS: (16,),
        rd.TAG_SAMPLES: (1,),
        rd.TAG_PHOTOMETRIC: (rd.PHOTOMETRIC_CFA,),
        rd.TAG_CFA_REPEAT: (2, 2),
        rd.TAG_CFA_PATTERN: tuple(ifd.get(rd.TAG_CFA_PATTERN) or RGGB),
        rd.TAG_ACTIVE_AREA: (0, 0, height, width),
        rd.TAG_BLACK_REPEAT: (1, 1),
        rd.TAG_BLACK_LEVEL: (black,),
        rd.TAG_WHITE_LEVEL: (white,),
    }
    for tag in (TAG_DEFAULT_CROP_ORIGIN, TAG_DEFAULT_CROP_SIZE, TAG_MASKED_AREAS):
        if ifd.get(tag):
            synth.entries[tag] = ifd.get(tag)
    head = rd.Ifd(entries=dict(ifd0.entries), byte_order=ifd0.byte_order)
    model = camera_model(data)
    if model and not head.get(rd.TAG_UNIQUE_CAMERA_MODEL):
        head.entries[rd.TAG_UNIQUE_CAMERA_MODEL] = tuple(model.encode("latin-1")) + (0,)
    ab, neutral = head.get(rd.TAG_ANALOG_BALANCE), head.get(rd.TAG_AS_SHOT_NEUTRAL)
    if ab and neutral and len(ab) >= 3 and len(neutral) >= 3 and min(ab[:3]) > 0 and any(abs(a - 1) > 1e-6 for a in ab[:3]):
        gains = tuple(float(a) for a in ab[:3])
        scaled = _gain_in_data(values, width, height, tuple(synth.entries[rd.TAG_CFA_PATTERN]), gains)
        listed = ", ".join(f"{a:.4f}" for a in gains)
        if scaled:
            # Phocus's newer .fff: R and B multiplied by AnalogBalance (sensel for sensel against the same
            # frame's 3FR) and AsShotNeutral copied unchanged, so it is the neutral before that gain.
            head.entries[rd.TAG_AS_SHOT_NEUTRAL] = tuple(float(n) * a for n, a in zip(neutral[:3], gains))
            notes.append(f"3FR: AnalogBalance {listed} was applied to the data digitally; AsShotNeutral scaled by it")
        elif scaled is None:
            notes.append(f"3FR: AnalogBalance {listed}; whether the data carries it could not be told (numpy is not "
                         "installed or too few sensels): AsShotNeutral used as written")
        else:
            notes.append(f"3FR: AnalogBalance {listed} is not in the data as a digital gain; AsShotNeutral used as written")
    if not head.get(rd.TAG_COLOR_MATRIX_1) and not head.get(rd.TAG_COLOR_MATRIX_2):
        own = OWN_MATRICES.get(model)
        if own:
            head.entries[rd.TAG_COLOR_MATRIX_1] = own
            notes.append(f"3FR: no colour matrix in the file; the {model}'s own, read from one of its 3FRs")
        else:
            notes.append("3FR: no colour matrix in IFD0: a .dcp camera profile is needed for colour")
    reader = rd._Reader(data)
    return rd.RawImage(width, height, 1, values, synth, head, source="3fr", notes=notes, exif=rd.exif_ifd(reader, ifd0))


__all__ = ["camera_model", "decode_compressed", "is_3fr", "jpeg_header", "parse_3fr"]
