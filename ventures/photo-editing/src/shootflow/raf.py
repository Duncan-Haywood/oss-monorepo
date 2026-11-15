"""Read a Fujifilm RAF straight into the developer, standard library only.

A RAF is not a TIFF. It starts with a fixed big-endian header::

    0   "FUJIFILMCCD-RAW "            magic
    16  format version, camera id     ("0201", "FF116502" ...)
    28  model name, NUL-padded        ("X-E1", "FinePix S5500")
    84  JPEG offset, JPEG length      (the camera's full-size JPEG; its EXIF is the file's EXIF)
    92  RAF header offset, length     (a list of big-endian (tag, size, bytes) records)
    100 CFA offset, length            (the sensor data)

The **RAF header records** used here (as dcraw's ``parse_fuji`` and LibRaw read them):

* 0x0100 raw height, raw width (stored size); 0x0121 the same on older bodies;
* 0x0110 picture origin (top, left) and 0x0111 picture size (height, width): the
  camera's own picture area on the stored frame;
* 0x0130 layout bytes: the first byte's top bit is dcraw's ``fuji_layout`` and a
  clear 0x08 bit in the second is ``fuji_width`` (SuperCCD's 45-degree layout,
  refused here: no test file);
* 0x0131 the X-Trans 6x6 colour layout, 36 bytes, **stored backwards**: byte
  ``35 - k`` is position ``k`` (row-major from the stored frame's origin). Read
  forwards it fits neither real X-Trans file; read backwards it is LibRaw's
  ``raw_pattern`` and the per-position means of the picture area follow it
  (``eval/fujifilm-raf-reader-2026-11-14.md``);
* 0x2ff0 as-shot white balance on older bodies: G, R, G, B levels.

The **CFA block** is one of two things:

* on X-Trans bodies (X-E1, X-E2 checked here) a small little-endian TIFF whose
  only IFD holds tag 0xF000, a sub-IFD of Fujifilm tags: 0xF001 width, 0xF002
  height, 0xF003 bits per sample, 0xF007 data offset (from the TIFF's start),
  0xF008 data length, 0xF00A black levels (36 values, one per 6x6 position),
  0xF00E as-shot white balance (G, R, B levels);
* on older Bayer bodies (FinePix S5500 checked here) the sensor data itself.

**Storage** read here: 16-bit little-endian words (X-E2's 14-bit data, the
S5500's) and 12-bit little-endian packing, two sensels in three bytes, the first
in the low 12 bits (X-E1). The length of the data says which. Fujifilm's lossless
compression (X-Pro2, X-T2 and later, a menu choice on those bodies) is read by
``shootflow.raf_compressed`` (X-T2, X-H1, X-T3 and X-S10 files checked against
LibRaw, ``eval/fujifilm-compressed-raf-2026-11-15.md``), and so is its lossy
compression (header version 0; X-S10 and X-E4 files, ``eval/fujifilm-lossy-raf-2026-11-15.md``).
SuperCCD layouts are refused with the reason.

**Levels** (all as LibRaw 0.22 reports them on the three files): black from
0xF00A, 0 for a Bayer RAF with no such tag (the S5500 has no masked sensels: its
left and right edge columns average 1,050 to 1,570, exposed); white
``2 ** bits - 1`` for X-Trans and 0x3E00 for a Bayer body (dcraw's constant for
them; the S5500's picture area peaks at 13,730; LibRaw gives the GFX 50S the same).

**Colour**: as for every non-DNG raw here, the camera's ``.dcp`` profile
("Fujifilm X-E1 Adobe Standard.dcp", from Adobe's free DNG Converter).

An independent implementation of the format as dcraw and LibRaw read it, checked
sensel for sensel against LibRaw 0.22 (``tools/raf_libraw_check.py``).
"""

from __future__ import annotations

import struct
from array import array
from typing import Any

from shootflow import raw_develop as rd

MAGIC = b"FUJIFILMCCD-RAW "

HDR_RAW_SIZE = 0x0100
HDR_PICTURE_ORIGIN = 0x0110
HDR_PICTURE_SIZE = 0x0111
HDR_RAW_SIZE_OLD = 0x0121
HDR_LAYOUT = 0x0130
HDR_XTRANS = 0x0131
HDR_WB = 0x2FF0

TAG_FUJI_IFD = 0xF000
TAG_F_WIDTH = 0xF001
TAG_F_HEIGHT = 0xF002
TAG_F_BITS = 0xF003
TAG_F_OFFSET = 0xF007
TAG_F_LENGTH = 0xF008
TAG_F_BLACK = 0xF00A
TAG_F_WB = 0xF00E

BAYER_WHITE = 0x3E00  # dcraw's maximum for Fujifilm Bayer bodies
RGGB = (0, 1, 1, 2)
BGGR = (2, 1, 1, 0)
BGGR_WIDTHS = (2848, 3664)  # dcraw: these bodies' Bayer phase is BGGR


def is_raf(data: bytes) -> bool:
    return len(data) >= 108 and bytes(data[:16]) == MAGIC


def _text(raw: bytes) -> str:
    return bytes(raw).split(b"\0", 1)[0].decode("latin-1").strip()


def model_name(data: bytes) -> str:
    """The header's model field: 'X-E1', 'FinePix S5500'."""

    return _text(data[28:60]) if is_raf(data) else ""


def camera_model(data: bytes) -> str:
    """The camera name a profile is filed under: 'Fujifilm X-E1' (Adobe's naming)."""

    model = model_name(data)
    return f"Fujifilm {model}" if model else ""


def _offsets(data: bytes) -> tuple[int, int, int, int, int, int]:
    return struct.unpack_from(">6I", data, 84)


def header_records(data: bytes) -> dict[int, bytes]:
    """The RAF header's records, tag -> bytes (the first of each tag)."""

    _, _, start, length, _, _ = _offsets(data)
    if not start or start + 4 > len(data):
        raise rd.DevelopError("RAF: the header records lie outside the file")
    end = min(len(data), start + length) if length else len(data)
    (count,) = struct.unpack_from(">I", data, start)
    pos = start + 4
    out: dict[int, bytes] = {}
    for _ in range(min(count, 4096)):
        if pos + 4 > end:
            break
        tag, size = struct.unpack_from(">HH", data, pos)
        body = bytes(data[pos + 4 : pos + 4 + size])
        pos += 4 + size
        out.setdefault(tag, body)
    return out


def _pair(records: dict[int, bytes], tag: int) -> tuple[int, int] | None:
    body = records.get(tag)
    if body is None or len(body) < 4:
        return None
    return struct.unpack(">HH", body[:4])


def xtrans_pattern(records: dict[int, bytes]) -> tuple[int, ...] | None:
    """Header record 0x0131 as 36 colours (0 R, 1 G, 2 B), row-major from the stored frame's origin, or None."""

    body = records.get(HDR_XTRANS)
    if body is None or len(body) < 36:
        return None
    pattern = tuple(b & 3 for b in reversed(body[:36]))
    if any(p > 2 for p in pattern) or set(pattern) != {0, 1, 2}:
        raise rd.DevelopError(f"RAF: the X-Trans layout (0x0131) is not an R, G, B pattern: {pattern}")
    return pattern


def _fuji_tiff(data: bytes, start: int) -> tuple[rd._Reader, rd.Ifd] | None:
    """The CFA block's TIFF and its 0xF000 sub-IFD, or None when the block is bare sensor data."""

    head = bytes(data[start : start + 4])
    if head not in (b"II*\0", b"MM\0*"):
        return None
    try:
        reader = rd._Reader(bytes(data[start:]))
        ifd0, _ = reader.read_ifd(reader.first_ifd_offset())
        sub = ifd0.one(TAG_FUJI_IFD)
        if sub is None:
            raise rd.DevelopError("RAF: the CFA block's TIFF has no Fujifilm sub-IFD (0xF000)")
        fuji, _ = reader.read_ifd(int(sub))
    except struct.error:
        raise rd.DevelopError("RAF: the CFA block's TIFF is truncated") from None
    return reader, fuji


def unpack12_le(buf: bytes, count: int) -> array:
    """Two sensels in three bytes, the first in the low 12 bits: (b0 | (b1 & 15) << 8), (b1 >> 4 | b2 << 4)."""

    out = array("H", [0]) * count
    np: Any
    try:
        import numpy

        np = numpy
    except ImportError:
        np = None
    if np is not None:
        b = np.frombuffer(buf, dtype=np.uint8, count=(count // 2) * 3).reshape(-1, 3).astype(np.uint16)
        v = np.empty((b.shape[0], 2), dtype=np.uint16)
        v[:, 0] = b[:, 0] | ((b[:, 1] & 15) << 8)
        v[:, 1] = (b[:, 1] >> 4) | (b[:, 2] << 4)
        out[: 2 * b.shape[0]] = array("H", v.ravel().tobytes())
        done = 2 * b.shape[0]
    else:
        done = 0
        for i in range(0, (count // 2) * 3, 3):
            b0, b1, b2 = buf[i], buf[i + 1], buf[i + 2]
            out[done] = b0 | ((b1 & 15) << 8)
            out[done + 1] = (b1 >> 4) | (b2 << 4)
            done += 2
    if count % 2:
        i = (count // 2) * 3
        out[count - 1] = buf[i] | ((buf[i + 1] & 15) << 8)
    return out


def unpack16_le(buf: bytes, count: int) -> array:
    out = array("H")
    out.frombytes(bytes(buf[: 2 * count]))
    import sys

    if sys.byteorder == "big":
        out.byteswap()
    return out


def decode_sensor(buf: bytes, width: int, height: int, bits: int) -> tuple[array, str]:
    """The stored frame from its data block, by the block's length: 16-bit words or 12-bit packing."""

    count = width * height
    from shootflow import raf_compressed

    if raf_compressed.is_compressed(buf):
        return _decode_compressed(buf, width, height, bits)
    if len(buf) >= 2 * count:
        return unpack16_le(buf, count), f"RAF: uncompressed, 16-bit little-endian words ({bits}-bit data)"
    if bits == 12 and len(buf) >= (count * 3 + 1) // 2:
        return unpack12_le(buf, count), "RAF: uncompressed, 12-bit little-endian packing"
    raise rd.DevelopError(
        f"RAF: {len(buf):,} bytes of sensor data for {width}x{height} at {bits} bits is not an uncompressed layout read "
        "here; convert to DNG"
    )


def _decode_compressed(buf: bytes, width: int, height: int, bits: int) -> tuple[array, str]:
    """Fujifilm's compressed sensor data (``shootflow.raf_compressed``), lossless or lossy."""

    from shootflow import raf_compressed

    head = raf_compressed.Header(buf)
    if head.width != width or head.height != height or head.bits != bits:
        raise rd.DevelopError(
            f"RAF: the compressed header ({head.width}x{head.height}, {head.bits} bits) disagrees with the "
            f"Fujifilm sub-IFD ({width}x{height}, {bits} bits)"
        )
    try:
        _, values = raf_compressed.decode(buf)
    except raf_compressed.CompressedRafError as exc:
        raise rd.DevelopError(f"RAF: {exc}") from None
    kind = "X-Trans" if head.xtrans else "Bayer"
    mode = "lossless" if head.lossless else "lossy"
    return values, f"RAF: Fujifilm {mode} compressed ({kind}, {bits}-bit, {head.blocks} strips of {head.block_size})"


def parse_raf(data: bytes) -> rd.RawImage:
    """A RAF's sensor data and DNG-equivalent tags."""

    if not is_raf(data):
        raise rd.DevelopError("not a Fujifilm RAF")
    jpeg_at, jpeg_len, _, _, cfa_at, cfa_len = _offsets(data)
    if not cfa_at or cfa_at >= len(data):
        raise rd.DevelopError("RAF: the sensor data starts outside the file")
    records = header_records(data)
    notes: list[str] = []
    layout = records.get(HDR_LAYOUT, b"")
    if len(layout) >= 2 and ((layout[0] >> 7) or not (layout[1] & 8)):
        raise rd.DevelopError("RAF: a SuperCCD (45-degree) sensor layout is not supported; convert to DNG")
    xtrans = xtrans_pattern(records)
    tiff = _fuji_tiff(data, cfa_at)
    black_values: tuple[float, ...]
    as_shot = None
    if tiff is not None:
        reader, fuji = tiff
        width, height = fuji.one(TAG_F_WIDTH), fuji.one(TAG_F_HEIGHT)
        bits = int(fuji.one(TAG_F_BITS, 0) or 0)
        offset, length = fuji.one(TAG_F_OFFSET), fuji.one(TAG_F_LENGTH)
        if not width or not height or offset is None or not length:
            raise rd.DevelopError("RAF: the Fujifilm sub-IFD lacks the size or the data offset")
        if not 8 <= bits <= 16:
            raise rd.DevelopError(f"RAF: {bits} bits per sample is not supported")
        start = cfa_at + int(offset)
        buf = bytes(data[start : start + int(length)])
        blk = fuji.get(TAG_F_BLACK)
        # X-Trans clips at 2**bits - 1 (the X-H1's compressed frame has 62,398 sensels at 16383). A Bayer
        # body in this layout (GFX 50S) takes dcraw's 0x3E00, as LibRaw 0.22 reports it; that frame has no
        # clipped highlights to confirm it (eval/fujifilm-compressed-raf-2026-11-15.md).
        white = (1 << bits) - 1 if xtrans is not None else min((1 << bits) - 1, BAYER_WHITE)
        wb = fuji.get(TAG_F_WB)
        if wb and len(wb) >= 3 and min(wb[:3]) > 0:
            g, r, b = (float(v) for v in wb[:3])
            as_shot = (r / g, 1.0, b / g)
    else:
        size = _pair(records, HDR_RAW_SIZE_OLD) or _pair(records, HDR_RAW_SIZE)
        if size is None:
            raise rd.DevelopError("RAF: the header gives no raw size (0x0100 or 0x0121)")
        height, width = size
        bits = 16
        buf = bytes(data[cfa_at : cfa_at + cfa_len]) if cfa_len else bytes(data[cfa_at:])
        blk = None
        white = BAYER_WHITE
        wb = records.get(HDR_WB)
        if wb and len(wb) >= 8:
            g, r, _g2, b = struct.unpack(">4H", wb[:8])
            if g and r and b:
                as_shot = (r / g, 1.0, b / g)
    if not width or not height or width * height > 400_000_000:
        raise rd.DevelopError("raw image size is missing or implausible")
    values, storage = decode_sensor(buf, int(width), int(height), bits)
    notes.insert(0, storage)
    if as_shot is None:
        notes.append("no Fujifilm as-shot white balance (0xF00E or header 0x2FF0)")

    if xtrans is not None:
        pattern: tuple[int, ...] = xtrans
        repeat = (6, 6)
        notes.append("RAF: X-Trans 6x6 layout from header 0x0131 (stored backwards)")
    else:
        pattern = BGGR if int(width) in BGGR_WIDTHS else RGGB
        repeat = (2, 2)
    period = repeat[0]
    if blk and len(blk) >= period * period:
        black_values = tuple(float(v) for v in blk[: period * period])
    elif blk:
        black_values = (float(blk[0]),) * (period * period)
    else:
        black_values = (0.0,) * (period * period)
        if xtrans is not None:
            notes.append("no Fujifilm black level (0xF00A): 0 assumed")

    synth = rd.Ifd(byte_order="<")
    synth.entries = {
        rd.TAG_WIDTH: (int(width),),
        rd.TAG_HEIGHT: (int(height),),
        rd.TAG_BITS: (bits,),
        rd.TAG_SAMPLES: (1,),
        rd.TAG_PHOTOMETRIC: (rd.PHOTOMETRIC_CFA,),
        rd.TAG_CFA_REPEAT: repeat,
        rd.TAG_CFA_PATTERN: pattern,
        rd.TAG_ACTIVE_AREA: (0, 0, int(height), int(width)),
        rd.TAG_BLACK_REPEAT: repeat,
        rd.TAG_BLACK_LEVEL: black_values,
        rd.TAG_WHITE_LEVEL: (white,),
    }
    origin, size = _pair(records, HDR_PICTURE_ORIGIN), _pair(records, HDR_PICTURE_SIZE)
    if origin and size and origin[0] + size[0] <= height and origin[1] + size[1] <= width and min(size) > 0:
        (top, left), (ch, cw) = origin, size
        synth.entries[rd.TAG_CROP_ORIGIN] = (left, top)
        synth.entries[rd.TAG_CROP_SIZE] = (cw, ch)
        notes.append(f"RAF: the camera's picture area, {cw}x{ch} at ({left}, {top}) (header 0x0110, 0x0111)")
    if as_shot is not None:
        synth.entries[rd.TAG_AS_SHOT_NEUTRAL] = tuple(1.0 / v for v in as_shot)

    # The full-size JPEG's EXIF (APP1 at JPEG + 4, its TIFF at JPEG + 12) is the file's EXIF: Make, Model,
    # Orientation, lens and exposure.
    head = rd.Ifd(entries={}, byte_order=">")
    exif = None
    if jpeg_at and jpeg_at + 20 < len(data) and bytes(data[jpeg_at + 6 : jpeg_at + 12]) == b"Exif\0\0":
        try:
            ereader = rd._Reader(bytes(data[jpeg_at + 12 : jpeg_at + jpeg_len]))
            e0, _ = ereader.read_ifd(ereader.first_ifd_offset())
            head = rd.Ifd(entries=dict(e0.entries), byte_order=ereader.end)
            exif = rd.exif_ifd(ereader, e0)
        except (rd.DevelopError, struct.error):
            notes.append("RAF: the embedded JPEG's EXIF could not be read")
    head.entries[rd.TAG_UNIQUE_CAMERA_MODEL] = tuple(camera_model(data).encode("latin-1")) + (0,)
    return rd.RawImage(int(width), int(height), 1, values, synth, head, source="raf", notes=notes, exif=exif)


__all__ = [
    "camera_model",
    "decode_sensor",
    "header_records",
    "is_raf",
    "model_name",
    "parse_raf",
    "unpack12_le",
    "unpack16_le",
    "xtrans_pattern",
]
