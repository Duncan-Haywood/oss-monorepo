"""Read a Sony ARW straight into the developer, standard library only (numpy when present).

An ARW is a TIFF whose SubIFD holds the sensor. Sony has stored it three ways,
and all three are read here:

* **Compressed ("cRAW", compression 32767, SonyRawFileType 2)**, every Alpha and
  NEX body since about 2008. Each row is cut into 16-byte blocks; a block holds
  16 sensels of one colour, every other column across 32 columns (the next
  block holds the odd columns of the same span). The 128 bits, least significant
  first, are an 11-bit maximum, an 11-bit minimum, the 4-bit positions of the
  maximum and the minimum within the block, then fourteen 7-bit deltas for the
  other sensels, scaled up by the smallest shift ``s`` (0 to 4) for which
  ``0x80 << s`` exceeds max - min, added to the minimum and capped at 0x7FF.
  The 11-bit value, doubled, indexes a tone curve that the raw IFD's tag 0x7010
  (SonyToneCurve, four knees on a 14-bit scale, divided by four here) builds:
  slope 1 up to the first knee, then 2, 4, 8 and 16. The curve's output is the
  14-bit sensor value. This is lossy by design (Sony's "compressed RAW"), so the
  reader reproduces what the camera kept, not the scene.
* **Uncompressed** (compression 1): 16-bit little-endian sensels, 14 bits used.
* **Lossless compressed** (compression 7, SonyRawFileType 4; A7 IV, A1, A7R V and
  later): 512 x 512 tiles, each one lossless JPEG (the SOF3 coding DNG tiles and
  CR2 use, decoded by ``raw_develop``) of 256 x 256 samples with four
  components; each JPEG sample is one 2x2 Bayer cell, components in raster order
  (top-left, top-right, bottom-left, bottom-right).

What a DNG states in tags, an ARW mostly states too, in Sony's own tags:

* **Black and white levels, as-shot white balance**: newer bodies (A7 III on)
  put BlackLevel (0x7310, four values), WB_RGGBLevels (0x7313) and a DNG
  WhiteLevel (0xC61D) in the raw IFD. Older bodies keep them only in the
  SR2SubIFD, which is encrypted: IFD0's DNGPrivateData points at an SR2Private
  IFD naming the sub-IFD's offset (0x7200), length (0x7201) and a 32-bit key
  (0x7221). The key seeds a 127-word shift register (four words from the linear
  congruence ``k = 48828125 k + 1``, the rest from XORs of earlier words); the
  stream it produces is XORed over the sub-IFD as big-endian 32-bit words. The
  decrypted sub-IFD gives BlackLevel (0x7310, or 0x7300 on early bodies) and WB_RGGBLevels (0x7313) or
  WB_GRBGLevels (0x7303). (Algorithm as dcraw and ExifTool describe it; this is
  an independent implementation.) Its WhiteLevel (0x787F, 15360) sits below
  sensels compressed frames really hold, so the white level is the raw IFD's
  WhiteLevel when present, else the 14-bit ceiling 16383.
* **Crop**: newer bodies carry DNG DefaultCropOrigin/Size (0xC61F/0xC620), which
  pass through. Older ones carry none, and the whole stored width is developed.
* **CFA phase**: the raw IFD's CFAPattern tag, as in a DNG.
* **Colour**: an ARW carries no colour matrix the DNG colour model can use.
  Like a CR2, developing one needs the camera's ``.dcp`` profile (Adobe's free
  DNG Converter installs one per camera, e.g. "Sony ILCE-7M3 Adobe Standard.dcp").

Sony's DNG files are DNGs and go the DNG way; ARW 1.0 (DSLR-A100, a different
encryption of the whole raw) and Sony's SR2/SRF are refused with the reason.
"""

from __future__ import annotations

import struct
from array import array

from shootflow import raw_develop as rd

TAG_MAKE = 271
TAG_MODEL = 272
TAG_EXIF_IFD = 34665
TAG_DNG_PRIVATE = 50740
TAG_SONY_RAW_FILE_TYPE = 0x7000
TAG_SONY_TONE_CURVE = 0x7010
TAG_SONY_BLACK = 0x7310
TAG_SONY_WB_RGGB = 0x7313
TAG_DEFAULT_CROP_ORIGIN = 0xC61F
TAG_DEFAULT_CROP_SIZE = 0xC620
SR2_SUB_OFFSET, SR2_SUB_LENGTH, SR2_SUB_KEY = 0x7200, 0x7201, 0x7221
SR2_BLACK, SR2_WB_GRBG, SR2_WB_RGGB = 0x7300, 0x7303, 0x7313

COMPRESSION_SONY_ARW = 32767
_M32 = 0xFFFFFFFF


def _text(values) -> str:
    return bytes(values or b"").split(b"\0", 1)[0].decode("latin-1").strip()


def _ifds(data: bytes) -> tuple[rd._Reader, list[rd.Ifd]] | None:
    try:
        reader = rd._Reader(data)
        return reader, rd._all_ifds(reader)
    except (rd.DevelopError, struct.error):
        return None


def is_arw(data: bytes) -> bool:
    """A Sony TIFF raw with no DNGVersion (a Sony DNG is read as a DNG)."""

    found = _ifds(data)
    if not found:
        return False
    _, ifds = found
    if not ifds or ifds[0].one(rd.TAG_DNG_VERSION) is not None:
        return False
    return _text(ifds[0].get(TAG_MAKE)).upper().startswith("SONY")


def camera_model(data: bytes) -> str:
    """The camera name a profile is filed under: 'Sony ILCE-7M3' (Make's first word, then Model)."""

    found = _ifds(data)
    if not found or not found[1]:
        return ""
    ifd0 = found[1][0]
    make = _text(ifd0.get(TAG_MAKE)).title()
    model = _text(ifd0.get(TAG_MODEL))
    return f"{make} {model}".strip() if make and not model.upper().startswith(make.upper()) else model


# --------------------------------------------------------------------------
# SR2SubIFD decryption


def sr2_pad(key: int) -> list[int]:
    """The shift register's 128 words after seeding with ``key`` (word 127 starts at zero)."""

    pad = [0] * 128
    for p in range(4):
        key = (key * 48828125 + 1) & _M32
        pad[p] = key
    pad[3] = ((pad[3] << 1) | ((pad[0] ^ pad[2]) >> 31)) & _M32
    for p in range(4, 127):
        pad[p] = (((pad[p - 4] ^ pad[p - 2]) << 1) | ((pad[p - 3] ^ pad[p - 1]) >> 31)) & _M32
    return pad


def sr2_crypt(block: bytes, key: int) -> bytes:
    """XOR ``block`` with the key's stream (big-endian words); the same call encrypts and decrypts."""

    pad = sr2_pad(key)
    n = len(block) // 4
    words = struct.unpack(f">{n}I", block[: 4 * n])
    out = []
    p = 127
    for w in words:
        v = pad[(p + 1) & 127] ^ pad[(p + 65) & 127]
        pad[p & 127] = v
        out.append(w ^ v)
        p += 1
    return struct.pack(f">{n}I", *out) + block[4 * n :]


def _sr2_sub_ifd(data: bytes, reader: rd._Reader, ifd0: rd.Ifd) -> rd.Ifd | None:
    private = ifd0.get(TAG_DNG_PRIVATE)
    if not private or len(private) != 4:
        return None
    at = struct.unpack(reader.end + "I", bytes(private))[0]
    try:
        sr2, _ = reader.read_ifd(at)
    except (rd.DevelopError, struct.error):
        return None
    off, length, key = sr2.one(SR2_SUB_OFFSET), sr2.one(SR2_SUB_LENGTH), sr2.get(SR2_SUB_KEY)
    if key is not None and len(key) == 4:  # stored as four UNDEFINED bytes, read in the file's byte order
        key = struct.unpack(reader.end + "I", bytes(key))[0]
    elif key is not None and len(key) == 1:
        key = key[0]
    else:
        key = None
    if off is None or not length or key is None or off + length > len(data):
        return None
    plain = data[:off] + sr2_crypt(data[off : off + length], key) + data[off + length :]
    try:
        sub, _ = rd._Reader(plain).read_ifd(off)
    except (rd.DevelopError, struct.error):
        return None
    return sub


# --------------------------------------------------------------------------
# Sensor data


def tone_curve(knees) -> list[int]:
    """Sony's 11-bit-doubled -> 14-bit curve from the four SonyToneCurve knees."""

    points = [0, 0, 0, 0, 0, 4095]
    for i in range(4):
        points[i + 1] = (int(knees[i]) >> 2) & 0xFFF
    curve = list(range(0x4001))
    for i in range(5):
        for j in range(points[i] + 1, points[i + 1] + 1):
            curve[j] = curve[j - 1] + (1 << i)
    return curve


def _craw_rows_python(buf: bytes, width: int, height: int, curve: list[int]) -> array:
    out = array("H", [0]) * (width * height)
    blocks_per_row = width // 16
    pix = [0] * 16
    for row in range(height):
        base = row * width
        col = 0
        for b in range(blocks_per_row):
            at = base + b * 16
            bits = int.from_bytes(buf[at : at + 16], "little")
            hi = bits & 0x7FF
            lo = (bits >> 11) & 0x7FF
            imax = (bits >> 22) & 0xF
            imin = (bits >> 26) & 0xF
            sh = 0
            while sh < 4 and (0x80 << sh) <= hi - lo:
                sh += 1
            bit = 30
            for i in range(16):
                if i == imax:
                    pix[i] = hi
                elif i == imin:
                    pix[i] = lo
                else:
                    v = (((bits >> bit) & 0x7F) << sh) + lo
                    pix[i] = v if v <= 0x7FF else 0x7FF
                    bit += 7
            for i in range(16):
                out[base + col] = curve[pix[i] << 1]
                col += 2
            col -= 1 if col & 1 else 31
    return out


def _craw_rows_numpy(buf: bytes, width: int, height: int, curve: list[int]) -> array:
    import numpy as np

    blocks = np.frombuffer(buf, dtype=np.uint8, count=width * height).reshape(-1, 16)
    lo64 = blocks[:, :8].copy().view("<u8").ravel()
    hi64 = blocks[:, 8:].copy().view("<u8").ravel()

    def field(pos: int, n: int):
        mask = np.uint64((1 << n) - 1)
        if pos + n <= 64:
            return (lo64 >> np.uint64(pos)) & mask
        if pos >= 64:
            return (hi64 >> np.uint64(pos - 64)) & mask
        return ((lo64 >> np.uint64(pos)) | (hi64 << np.uint64(64 - pos))) & mask

    vmax = field(0, 11).astype(np.int32)
    vmin = field(11, 11).astype(np.int32)
    imax = field(22, 4).astype(np.int32)
    imin = field(26, 4).astype(np.int32)
    diff = vmax - vmin
    sh = sum(((0x80 << s) <= diff).astype(np.int32) for s in range(4))
    deltas = np.stack([field(30 + 7 * k, 7).astype(np.int32) for k in range(14)], axis=1)
    deltas = np.concatenate([deltas, np.zeros((len(deltas), 1), np.int32)], axis=1)  # a 15th slot if imax == imin
    pix = np.empty((len(blocks), 16), np.int32)
    for i in range(16):
        k = i - (imax < i) - ((imin < i) & (imin != imax))
        v = np.minimum((np.take_along_axis(deltas, k[:, None], axis=1)[:, 0] << sh) + vmin, 0x7FF)
        pix[:, i] = np.where(i == imax, vmax, np.where(i == imin, vmin, v))
    lut = np.asarray(curve, dtype=np.uint16)
    vals = lut[pix << 1]  # (rows * width/16, 16)
    # Block pair 2j covers columns 32j + 0, 2, ..., 30; block 2j+1 the odd ones.
    vals = vals.reshape(height, width // 32, 2, 16).transpose(0, 1, 3, 2).reshape(height, width)
    return array("H", vals.astype(np.uint16).tobytes())


def decode_craw(buf: bytes, width: int, height: int, curve: list[int], engine: str = "auto") -> array:
    """Sony compressed RAW rows (one byte per sensel) to 14-bit values, row-major."""

    if width % 32:
        raise rd.DevelopError(f"Sony compressed RAW width {width} is not a multiple of 32")
    if len(buf) < width * height:
        raise rd.DevelopError("Sony compressed RAW strip is shorter than width x height bytes")
    if engine != "python":
        try:
            import numpy  # noqa: F401
        except ImportError:
            if engine == "numpy":
                raise
        else:
            return _craw_rows_numpy(buf, width, height, curve)
    return _craw_rows_python(buf, width, height, curve)


def decode_lossless_tiles(data: bytes, ifd: rd.Ifd, width: int, height: int) -> array:
    """Sony's lossless ARW: tiles of 2x2-cell lossless JPEG, four components per sample."""

    tw, tl = ifd.one(rd.TAG_TILE_WIDTH), ifd.one(rd.TAG_TILE_LENGTH)
    offsets, sizes = ifd.get(rd.TAG_TILE_OFFSETS), ifd.get(rd.TAG_TILE_BYTES)
    if not tw or not tl or not offsets or not sizes or len(offsets) != len(sizes):
        raise rd.DevelopError("Sony lossless ARW has no usable tile tags")
    across = (width + tw - 1) // tw
    out = array("H", [0]) * (width * height)
    for t, (at, size) in enumerate(zip(offsets, sizes)):
        if at + size > len(data):
            raise rd.DevelopError("Sony lossless ARW tile lies outside the file")
        fw, fh, nf, samples = rd._decode_lossless_jpeg(data[at : at + size])
        if nf != 4 or fw * 2 > tw or fh * 2 > tl:
            raise rd.DevelopError(f"Sony lossless ARW tile is {fw}x{fh} with {nf} components; expected 2x2 cells")
        y0, x0 = (t // across) * tl, (t % across) * tw
        for r in range(fh):
            for dy in (0, 1):
                y = y0 + 2 * r + dy
                if y >= height:
                    break
                row_at = y * width
                for c in range(fw):
                    x = x0 + 2 * c
                    if x >= width:
                        break
                    s = (r * fw + c) * 4 + 2 * dy
                    out[row_at + x] = samples[s]
                    if x + 1 < width:
                        out[row_at + x + 1] = samples[s + 1]
    return out


def _decode_lossless_tiles_numpy(data: bytes, ifd: rd.Ifd, width: int, height: int):
    import numpy as np

    tw, tl = ifd.one(rd.TAG_TILE_WIDTH), ifd.one(rd.TAG_TILE_LENGTH)
    offsets, sizes = ifd.get(rd.TAG_TILE_OFFSETS), ifd.get(rd.TAG_TILE_BYTES)
    if not tw or not tl or not offsets or not sizes or len(offsets) != len(sizes):
        raise rd.DevelopError("Sony lossless ARW has no usable tile tags")
    across = (width + tw - 1) // tw
    down = (height + tl - 1) // tl
    plane = np.zeros((down * tl, across * tw), np.uint16)

    def one(t: int):
        at, size = offsets[t], sizes[t]
        if at + size > len(data):
            raise rd.DevelopError("Sony lossless ARW tile lies outside the file")
        fw, fh, nf, samples = rd._decode_lossless_jpeg(data[at : at + size])
        if nf != 4 or fw * 2 > tw or fh * 2 > tl:
            raise rd.DevelopError(f"Sony lossless ARW tile is {fw}x{fh} with {nf} components; expected 2x2 cells")
        cells = np.frombuffer(memoryview(samples).cast("B"), dtype=np.uint16).reshape(fh, fw, 2, 2)
        y0, x0 = (t // across) * tl, (t % across) * tw
        plane[y0 : y0 + 2 * fh, x0 : x0 + 2 * fw] = cells.transpose(0, 2, 1, 3).reshape(2 * fh, 2 * fw)

    from concurrent.futures import ThreadPoolExecutor

    n = min(len(offsets), max(1, (__import__("os").cpu_count() or 1)))
    with ThreadPoolExecutor(max_workers=n) as ex:
        list(ex.map(one, range(len(offsets))))
    return array("H", np.ascontiguousarray(plane[:height, :width]).tobytes())


def parse_arw(data: bytes, engine: str = "auto") -> rd.RawImage:
    """An ARW's sensor data and DNG-equivalent tags."""

    found = _ifds(data)
    if not found or not found[1]:
        raise rd.DevelopError("not a TIFF raw (no IFDs)")
    reader, ifds = found
    ifd0 = ifds[0]
    if not _text(ifd0.get(TAG_MAKE)).upper().startswith("SONY") or ifd0.one(rd.TAG_DNG_VERSION) is not None:
        raise rd.DevelopError("not a Sony ARW")
    raws = [i for i in ifds if i.one(rd.TAG_PHOTOMETRIC) == rd.PHOTOMETRIC_CFA and i.one(rd.TAG_NEW_SUBFILE_TYPE, 0) == 0]
    if not raws:
        raise rd.DevelopError("no Sony raw IFD (a full-size CFA image); ARW 1.0 and SR2/SRF files are not supported")
    ifd = max(raws, key=lambda i: i.one(rd.TAG_WIDTH, 0) * i.one(rd.TAG_HEIGHT, 0))
    width, height = ifd.one(rd.TAG_WIDTH), ifd.one(rd.TAG_HEIGHT)
    if not width or not height or width * height > 400_000_000:
        raise rd.DevelopError("raw image size is missing or implausible")
    compression = ifd.one(rd.TAG_COMPRESSION, 1)
    notes: list[str] = []
    if compression == COMPRESSION_SONY_ARW:
        at, size = ifd.one(rd.TAG_STRIP_OFFSETS), ifd.one(rd.TAG_STRIP_BYTES)
        if at is None or size is None or at + size > len(data):
            raise rd.DevelopError("Sony raw strip lies outside the file")
        if size < width * height:
            raise rd.DevelopError(
                f"Sony raw strip holds {size} bytes for {width}x{height} sensels: not the 8-bit compressed "
                "layout (ARW 1.0 or a newer variant); convert to DNG"
            )
        knees = ifd.get(TAG_SONY_TONE_CURVE) or (8000, 10400, 12900, 14100)
        values = decode_craw(data[at : at + width * height], width, height, tone_curve(knees), engine)
        notes.append("ARW: Sony compressed RAW (lossy 8-bit blocks and tone curve)")
    elif compression == 1:
        at, size = ifd.one(rd.TAG_STRIP_OFFSETS), ifd.one(rd.TAG_STRIP_BYTES)
        if at is None or size is None or at + size > len(data) or size < 2 * width * height:
            raise rd.DevelopError("Sony uncompressed raw strip is missing or short")
        values = array("H", data[at : at + 2 * width * height])
        if reader.end == ">" and array("H", b"\x01\x00")[0] == 1 or reader.end == "<" and array("H", b"\x01\x00")[0] != 1:
            values.byteswap()
        notes.append("ARW: uncompressed")
    elif compression == 7:
        use_np = engine != "python"
        if use_np:
            try:
                import numpy  # noqa: F401
            except ImportError:
                use_np = False
        values = (_decode_lossless_tiles_numpy if use_np else decode_lossless_tiles)(data, ifd, width, height)
        notes.append("ARW: Sony lossless compressed RAW (lossless JPEG tiles)")
    else:
        raise rd.DevelopError(f"Sony raw compression {compression} is not supported; convert to DNG")

    sub = _sr2_sub_ifd(data, reader, ifd0)
    black = ifd.get(TAG_SONY_BLACK) or (sub.get(TAG_SONY_BLACK) or sub.get(SR2_BLACK) if sub is not None else None)
    if black and len(black) >= 4:
        black = tuple(float(b) for b in black[:4])
    else:
        black = (512.0,) * 4
        notes.append("no Sony black level: 512 (Sony's 14-bit default)")
    # The SR2 sub-IFD's WhiteLevel (0x787F, 15360 on all six bodies checked) is not used: compressed
    # frames hold sensels up to 16,372 (the curve's top), which it would clip. The 14-bit ceiling is
    # LibRaw's choice too (eval/sony-arw-reader-2026-11-14.md).
    white = ifd.one(rd.TAG_WHITE_LEVEL) or 16383
    as_shot = None
    rggb = ifd.get(TAG_SONY_WB_RGGB) or (sub.get(SR2_WB_RGGB) if sub is not None else None)
    if rggb and len(rggb) >= 4 and min(rggb[:4]) > 0:
        r, g1, g2, b = (float(v) for v in rggb[:4])
    elif sub is not None and sub.get(SR2_WB_GRBG) and len(sub.get(SR2_WB_GRBG)) >= 4 and min(sub.get(SR2_WB_GRBG)[:4]) > 0:
        g1, r, b, g2 = (float(v) for v in sub.get(SR2_WB_GRBG)[:4])
    else:
        r = g1 = g2 = b = 0.0
        notes.append("no Sony as-shot white balance")
    if r > 0:
        g = (g1 + g2) / 2.0
        as_shot = (r / g, 1.0, b / g)

    pattern = ifd.get(rd.TAG_CFA_PATTERN)
    if ifd.get(rd.TAG_CFA_REPEAT) != (2, 2) or not pattern or len(pattern) != 4 or sorted(pattern) != [0, 1, 1, 2]:
        raise rd.DevelopError("Sony raw has no 2x2 RGB CFAPattern")

    synth = rd.Ifd(byte_order=reader.end)
    synth.entries = {
        rd.TAG_WIDTH: (width,),
        rd.TAG_HEIGHT: (height,),
        rd.TAG_BITS: (14,),
        rd.TAG_SAMPLES: (1,),
        rd.TAG_PHOTOMETRIC: (rd.PHOTOMETRIC_CFA,),
        rd.TAG_CFA_REPEAT: (2, 2),
        rd.TAG_CFA_PATTERN: tuple(pattern),
        rd.TAG_ACTIVE_AREA: (0, 0, height, width),
        rd.TAG_BLACK_REPEAT: (2, 2),
        rd.TAG_BLACK_LEVEL: black,
        rd.TAG_WHITE_LEVEL: (int(white),),
    }
    origin, crop = ifd.get(TAG_DEFAULT_CROP_ORIGIN), ifd.get(TAG_DEFAULT_CROP_SIZE)
    if origin and crop and len(origin) == 2 and len(crop) == 2 and origin[0] + crop[0] <= width and origin[1] + crop[1] <= height:
        synth.entries[TAG_DEFAULT_CROP_ORIGIN] = tuple(origin)
        synth.entries[TAG_DEFAULT_CROP_SIZE] = tuple(crop)
    if as_shot is not None:
        synth.entries[rd.TAG_AS_SHOT_NEUTRAL] = tuple(1.0 / v for v in as_shot)
    # The lens's own correction tables (sony_corrections), kept for develop's in-file lens stage.
    for tag in (0x7032, 0x7035, 0x7037, 0x7038):
        if ifd.get(tag):
            synth.entries[tag] = tuple(ifd.get(tag))
    head = rd.Ifd(entries=dict(ifd0.entries), byte_order=reader.end)
    head.entries[rd.TAG_UNIQUE_CAMERA_MODEL] = tuple(camera_model(data).encode("latin-1")) + (0,)
    exif = None
    exif_at = ifd0.one(TAG_EXIF_IFD)
    if exif_at:
        try:
            exif, _ = reader.read_ifd(exif_at)
        except (rd.DevelopError, struct.error):
            exif = None
    return rd.RawImage(width, height, 1, values, synth, head, source="arw", notes=notes, exif=exif)


__all__ = ["camera_model", "decode_craw", "is_arw", "parse_arw", "sr2_crypt", "tone_curve"]
