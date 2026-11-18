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
  (codes under 256 are the square of the 14-bit value, ``v * v / 3.969``), 6 is "IIQ S"
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
(LibRaw's ``raw_image`` holds the same).

Levels: each stored sensel is the decoded value times four plus its row's offset for its half and its
column's offset for its half (dcraw adds both and subtracts the black level, ``phase_one_load_raw_c``); the
black level stays a level here so the noise below it survives, and white is 65532 (16383 times four).

**Not read**: "IIQ S" (format 6; the IQ180, iXU180 and IQ3 100MP's small files) and the uncompressed formats 1
and 2, of which no public file was at hand; each is refused with the reason, and the frame falls back to its
preview in the cull. The per-sensor corrections in the metadata block at ``0x110`` (defect columns, the
flat-field and the split-sensor curves LibRaw's ``phase_one_correct`` applies) are not applied.

The format as dcraw and LibRaw read it (``parse_phase_one``, ``phase_one_load_raw_c``); this is an independent
implementation, checked sensel for sensel against LibRaw 0.22 on raw.pixls.us files (``tools/iiq_libraw_check.py``,
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
FORMATS = (3, 5)  # the coded "IIQ L" formats this reader decodes
FORMAT_NAMES = {1: "uncompressed (keyed)", 2: "uncompressed", 3: "IIQ L", 5: "IIQ L (8-bit coded)", 6: "IIQ S", 8: "IIQ L 16-bit"}
WHITE = 16383 << 2
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


def _value(entries, tag: int, default: int | None = None) -> int | None:
    hit = entries.get(tag)
    return default if hit is None else hit[2]


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
            v = (code << 2) + (right_off if col >= split_col else left_off) + rblack[2 * col + rb]
            out[base + col] = 0 if v < 0 else 65535 if v > 65535 else v
    return out


C_SOURCE = r"""
#include <stdint.h>
static const int LENS[10] = {8, 7, 6, 9, 11, 10, 5, 12, 14, 13};
/* One row-coded IIQ L (format 3, or 5 with its code table) to stored values: code * 4 + offsets, clamped. */
long shootflow_iiq_run(const uint8_t *d, long n, long start, const uint32_t *offsets, long width, long height,
                       const uint16_t *table, const int16_t *cblack, const int16_t *rblack,
                       long split_col, long split_row, uint16_t *out) {
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
            long v = ((long)code << 2) + (col >= split_col ? ro : lo) + rblack[2 * col + rb];
            o[col] = (uint16_t)(v < 0 ? 0 : v > 65535 ? 65535 : v);
        }
#undef FILL
    }
    return 0;
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
    fn.argtypes = [ctypes.c_char_p, L, L, P, L, L, P, P, P, L, L, P]
    return fn


def native():
    """The loaded C decoder, or None. Built and loaded once per process."""

    if "fn" not in _STATE:
        with _LOCK:
            if "fn" not in _STATE:
                _STATE["fn"] = _load()
    return _STATE["fn"]


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
    fn = native() if use_native else None
    if fn is not None:
        table = array("H", curve()) if fmt == 5 else None
        out = array("H", [0]) * (width * height)
        if not isinstance(data, bytes):
            data = bytes(data)
        fn(data, len(data), fields["data"], offsets.buffer_info()[0], width, height,
           table.buffer_info()[0] if table is not None else None, cblack.buffer_info()[0], rblack.buffer_info()[0],
           split_col, split_row, out.buffer_info()[0])
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


def parse_iiq(data: bytes, use_native: bool = True) -> rd.RawImage:
    """An IIQ's sensor data and DNG-equivalent tags (ColorMatrix1 from the file's own matrix)."""

    fields = info(data)
    values, note = decode_sensor(data, fields, use_native)
    width, height = fields["width"], fields["height"]
    top, left = fields["top"], fields["left"]
    bottom = min(height, top + fields["image_height"])
    right = min(width, left + fields["image_width"])
    if not (0 <= top < bottom and 0 <= left < right):
        top, left, bottom, right = 0, 0, height, width
    notes = [note]
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
        rd.TAG_WHITE_LEVEL: (WHITE,),
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
