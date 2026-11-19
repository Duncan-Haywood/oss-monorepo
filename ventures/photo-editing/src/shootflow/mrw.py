"""Read a Minolta or Konica Minolta MRW straight into the developer, standard library only (numpy when present).

An MRW is not a TIFF. It opens with ``"\\0MRM"`` (big-endian; ``"\\0MRI"`` would be little-endian, no file
of that order was at hand) and a 4-byte length: the sensor data starts that many bytes past byte 8, and the
bytes before it are a chain of blocks, each a 4-byte name and a 4-byte length:

* ``\\0PRD`` (picture raw dimensions): an 8-byte version string, then the sensor's rows and columns, the
  image's rows and columns (8 fewer each way), the data size (12 or 16 bits per stored sensel), the pixel
  size (12), the storage method (``0x59`` packed, ``0x52`` not packed), two unknown bytes and the Bayer
  pattern (``0x0001`` RGGB, ``0x0004`` GBRG).
* ``\\0WBG`` (white balance gains): 4 bytes of scale codes, then four 16-bit gains in the 2x2 order of the
  Bayer pattern (R, G, G, B on RGGB bodies; G, B, R, G on the GBRG DiMAGE A200).
* ``\\0TTW``: a whole TIFF (byte order, IFD0 with Make, Model and Orientation, the EXIF IFD, the maker note,
  a thumbnail) whose offsets count from the block's first byte.
* ``\\0RIF`` (camera settings) and ``\\0PAD`` (padding) are skipped.

Two sensor layouts are read, each told apart by the PRD's storage method and checked against the bytes left
in the file:

* **12-bit packed** (``0x59``; DiMAGE A1, A2 and A200, the Dynax / Maxxum / Alpha-7 Digital): MSB-first
  12-bit samples, two sensels in three bytes, every row on a byte boundary.
* **16-bit unpacked** (``0x52``; DiMAGE 7, 7i and 7Hi): big-endian 16-bit words holding 12-bit values.

Levels, as LibRaw reads these files:

* **Black level** 0: the bodies store black-subtracted data, and nothing in the file states another level.
* **White level**: the clip pile when the frame has one (``cr2._white_from_clipping``), else 4095. LibRaw
  takes it from a per-model table (DiMAGE 7: 3965, 7D: 4091, A2: 3983) that no tag in the file states; the
  pile finds the same level on a frame with clipped highlights.
* **As-shot white balance**: the WBG gains, green over red and over blue.
* **Crop**: none. The PRD's image size is 8 rows and 8 columns short of the sensor, but it does not say
  where the 8 come off, and LibRaw develops the whole sensor too.
* **Colour**: like a CR2, ORF or NEF, an MRW carries no colour matrix the DNG colour model can use;
  developing one needs the camera's ``.dcp`` profile (Adobe's free DNG Converter installs them).

The format as dcraw and LibRaw read it (Dave Coffin's ``parse_minolta``, ``packed_load_raw`` and
``unpacked_load_raw``); this is an independent implementation, checked sensel for sensel against LibRaw
0.22 on nine bodies' files from raw.pixls.us (``tools/mrw_libraw_check.py``,
``eval/minolta-mrw-reader-2026-11-18.md``). The DiMAGE Z2's ".MRW" holds no MRW header (dcraw names it by
its file size alone) and is refused with the reason, as is any PRD layout not listed above.
"""

from __future__ import annotations

import struct
from array import array

from shootflow import raw_develop as rd

MAGIC_BE = b"\0MRM"
MAGIC_LE = b"\0MRI"
BLOCK_PRD = b"\0PRD"
BLOCK_WBG = b"\0WBG"
BLOCK_TTW = b"\0TTW"

STORAGE_PACKED = 0x59
STORAGE_UNPACKED = 0x52
# PRD Bayer pattern codes: the CFA colours (0 red, 1 green, 2 blue) at the sensor's top-left 2x2.
BAYER = {0x0001: (0, 1, 1, 2), 0x0004: (1, 2, 0, 1)}

TAG_MAKE = 271
TAG_MODEL = 272


def _text(values) -> str:
    return bytes(values or b"").split(b"\0", 1)[0].decode("latin-1").strip()


def blocks(data: bytes) -> tuple[str, int, dict[bytes, tuple[int, int]]]:
    """The byte order (``">"`` or ``"<"``), where the sensor data starts, and each block's (offset, length).

    Raises ``DevelopError`` when the header is not an MRW's or its block chain runs out of the file.
    """

    if data[:4] == MAGIC_BE:
        end = ">"
    elif data[:4] == MAGIC_LE:
        end = "<"
    else:
        raise rd.DevelopError("not a Minolta MRW (no \\0MRM header)")
    if len(data) < 8:
        raise rd.DevelopError("MRW header is cut short")
    start = struct.unpack_from(end + "I", data, 4)[0] + 8
    if start > len(data):
        raise rd.DevelopError("MRW header runs past the end of the file")
    found: dict[bytes, tuple[int, int]] = {}
    pos = 8
    while pos + 8 <= start:
        name = data[pos : pos + 4]
        length = struct.unpack_from(end + "I", data, pos + 4)[0]
        if pos + 8 + length > start:
            raise rd.DevelopError(f"MRW block {name!r} runs past the header")
        found.setdefault(name, (pos + 8, length))
        pos += 8 + length
    return end, start, found


def is_mrw(data: bytes) -> bool:
    """An MRW header with a PRD block."""

    if data[:4] not in (MAGIC_BE, MAGIC_LE):
        return False
    try:
        return BLOCK_PRD in blocks(data)[2]
    except (rd.DevelopError, struct.error):
        return False


def _ttw(data: bytes, found) -> tuple[rd._Reader, rd.Ifd] | None:
    """The TTW block's TIFF reader and IFD0, or None when there is none or it does not read."""

    at = found.get(BLOCK_TTW)
    if at is None:
        return None
    try:
        reader = rd._Reader(data[at[0] : at[0] + at[1]])
        ifds = rd._all_ifds(reader)
    except (rd.DevelopError, struct.error):
        return None
    return (reader, ifds[0]) if ifds else None


def make_model(data: bytes) -> tuple[str, str]:
    """The TTW TIFF's Make and Model ("KONICA MINOLTA", "DYNAX 7D"), empty when there is none."""

    try:
        found = blocks(data)[2]
    except (rd.DevelopError, struct.error):
        return "", ""
    tiff = _ttw(data, found)
    if tiff is None:
        return "", ""
    return _text(tiff[1].get(TAG_MAKE)), _text(tiff[1].get(TAG_MODEL))


def camera_model(data: bytes) -> str:
    """The camera name a profile is filed under: 'Minolta DiMAGE A1', 'Konica Minolta DYNAX 7D'."""

    make, model = make_model(data)
    if not model:
        return ""
    maker = "Konica Minolta" if make.upper().startswith("KONICA") else "Minolta"
    return f"{maker} {model}"


def prd(data: bytes, end: str, found) -> dict:
    """The PRD block's fields: sensor and image rows and columns, data size, pixel size, storage, pattern."""

    at = found.get(BLOCK_PRD)
    if at is None or at[1] < 24:
        raise rd.DevelopError("MRW has no PRD block, so the sensor size is unknown")
    h, w, ih, iw, datasize, pixelsize, storage, _u1, _u2, bayer = struct.unpack_from(
        end + "HHHHBBBBHH", data, at[0] + 8
    )
    return {
        "version": data[at[0] : at[0] + 8].decode("latin-1"),
        "height": h,
        "width": w,
        "image_height": ih,
        "image_width": iw,
        "datasize": datasize,
        "pixelsize": pixelsize,
        "storage": storage,
        "bayer": bayer,
    }


def wb_gains(data: bytes, end: str, found) -> tuple[int, int, int, int] | None:
    """The WBG block's four gains, in the 2x2 order of the Bayer pattern, or None."""

    at = found.get(BLOCK_WBG)
    if at is None or at[1] < 12:
        return None
    return struct.unpack_from(end + "4H", data, at[0] + 4)


def decode_sensor(data: bytes, start: int, width: int, height: int, info: dict, end: str = ">") -> tuple[array, str]:
    """The stored sensels, row-major, and a note naming the layout."""

    count = width * height
    if info["storage"] == STORAGE_PACKED and info["datasize"] == 12:
        need = count * 3 // 2
        if start + need > len(data) or width % 2:
            raise rd.DevelopError(f"MRW 12-bit packed data runs past the end of the file ({start + need} > {len(data)} bytes)")
        blob = data[start : start + need]
        np_mod = rd._numpy_engine("auto")
        vals = np_mod.unpack_bits(blob, 12, count, width) if np_mod else rd._unpack_bits(blob, 12, count, width)
        return (vals if isinstance(vals, array) else array("H", vals)), "MRW: 12-bit packed"
    if info["storage"] == STORAGE_UNPACKED and info["datasize"] == 16:
        need = count * 2
        if start + need > len(data):
            raise rd.DevelopError(f"MRW 16-bit data runs past the end of the file ({start + need} > {len(data)} bytes)")
        vals = array("H")
        vals.frombytes(data[start : start + need])
        if (end == ">") != (array("H", [1]).tobytes() == b"\0\1"):
            vals.byteswap()
        return vals, "MRW: 16-bit unpacked"
    raise rd.DevelopError(
        f"this MRW layout (storage {info['storage']:#x}, {info['datasize']}-bit data) is not supported; convert to DNG"
    )


def parse_mrw(data: bytes) -> rd.RawImage:
    """An MRW's sensor data and DNG-equivalent tags."""

    end, start, found = blocks(data)
    info = prd(data, end, found)
    width, height = info["width"], info["height"]
    if not width or not height or width * height > 400_000_000:
        raise rd.DevelopError("raw image size is missing or implausible")
    pattern = BAYER.get(info["bayer"])
    if pattern is None:
        raise rd.DevelopError(f"MRW Bayer pattern code {info['bayer']:#x} is not one this reader knows; convert to DNG")
    values, layout = decode_sensor(data, start, width, height, info, end)
    notes = [layout]
    black = [0.0] * 4
    white, white_note = _white(values, width, height, black)
    if white_note:
        notes.append(white_note)

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
        rd.TAG_BLACK_LEVEL: tuple(black),
        rd.TAG_WHITE_LEVEL: (white,),
    }
    gains = wb_gains(data, end, found)
    if gains is not None:
        by_colour: dict[int, list[int]] = {0: [], 1: [], 2: []}
        for colour, gain in zip(pattern, gains):
            by_colour[colour].append(gain)
        r, b = by_colour[0][0], by_colour[2][0]
        g = sum(by_colour[1]) / len(by_colour[1])
        if r > 0 and b > 0 and g > 0:
            synth.entries[rd.TAG_AS_SHOT_NEUTRAL] = (g / r, 1.0, g / b)
        else:
            notes.append("MRW: the WBG gains include a zero: no as-shot white balance")
    else:
        notes.append("MRW: no WBG block: no as-shot white balance")

    tiff = _ttw(data, found)
    exif = None
    if tiff is not None:
        reader, ifd0 = tiff
        head = rd.Ifd(entries=dict(ifd0.entries), byte_order=reader.end)
        exif = rd.exif_ifd(reader, ifd0)
    else:
        head = rd.Ifd(byte_order=end)
        notes.append("MRW: no readable TTW block: no camera name, orientation or EXIF")
    model = camera_model(data)
    if model:
        head.entries[rd.TAG_UNIQUE_CAMERA_MODEL] = tuple(model.encode("latin-1")) + (0,)
    return rd.RawImage(width, height, 1, values, synth, head, source="mrw", notes=notes, exif=exif)


def _white(values: array, width: int, height: int, black: list[float]) -> tuple[float, str | None]:
    from shootflow import cr2

    return cr2._white_from_clipping(values, width, 0, 0, height, width, black, 12)


__all__ = [
    "blocks",
    "camera_model",
    "decode_sensor",
    "is_mrw",
    "make_model",
    "parse_mrw",
    "prd",
    "wb_gains",
]
