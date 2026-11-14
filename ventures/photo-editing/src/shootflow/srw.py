"""Read a Samsung SRW straight into the developer, standard library only (C when present).

An SRW is a plain TIFF (magic 42, either byte order) whose raw IFD (a CFA
image, NewSubfileType 0) holds the sensor. Its Compression tag names one of
four storage schemes, all read here:

* **32770 with a row table** (tag 0xA010 in the raw IFD; the Galaxy NX of 2013,
  the NX300 and NX2000 generation): each row starts at its own offset (four
  little-endian bytes per row from 0xA010, counted from StripOffsets) and is
  read MSB-first from 32-bit little-endian words. Rows go in blocks of 16
  sensels: a direction bit, four 2-bit ops that adjust four bit lengths (3 =
  read a new 4-bit length, 2 = one less, 1 = one more; lengths start at 7 on
  rows 0 and 1, else 4), then the even then the odd columns of the block, each a
  signed difference of that length from the sensel one (even columns) or two
  (odd) rows up when the direction bit is set, else from the sensel two columns
  before the block (even) or one before it (odd), the same for all 16; 128 in a
  row's first block. After the whole frame, the second sensel of every 2x2 cell
  swaps with the third.
* **32770 without one** (the NX20 of 2012): 12-bit samples packed two to three
  bytes, little-endian: the first sample is the low 12 bits of the 24-bit
  little-endian group, the second the high 12; every row ``width * 1.5`` bytes.
* **32772** (the NX3000 of 2014, NX mini): one MSB-first bit stream of JPEG-style
  Huffman differences (a fixed 14-code table with codes up to 10 bits) added to
  a running value per column parity, the first two columns of a row predicted
  from the same columns two rows up.
* **32773** (the NX1 and NX500 of 2014-15): after a 14-byte header (an option
  byte at 9 and the initial value at 12) each row starts on a 16-byte boundary
  and is read MSB-first from 32-bit little-endian words. Rows go in blocks of 16
  sensels in an interleaved column order, with an optional magnitude scale every
  64 columns, a prediction mode (left neighbour, or the mean of two sensels one
  or two rows up at offsets the mode picks) and four bit lengths each tracked
  per CFA site through two-deep history; a difference ``d`` becomes
  ``d * (2 * mag + 1) + mag``. Values are 14-bit.

What a DNG states in tags, an SRW states in its maker note (an IFD at the EXIF
MakerNote, offsets counted from the note's first byte):

* **Encryption key**: tag 0xA020, eleven 32-bit values. The levels below are
  stored with the key's first four values added; subtracting them gives the
  real numbers (ExifTool's Samsung "EncryptionKey", LibRaw's
  ``imgdata.makernotes.samsung.key``).
* **Black level**: tag 0xA028 (R, G, G, B) minus the key: 0 on the 12-bit bodies
  here, 128 on the NX1.
* **As-shot white balance**: WB_RGGBLevelsUncorrected (0xA021) minus the key, R
  and B over the first G.
* **Crop**: tag 0xA010 of the maker note, two rectangles (left, top, right,
  bottom): the stored sensor, then the picture area, which becomes
  DefaultCropOrigin and DefaultCropSize. On all four bodies checked it is
  exactly the size of the camera's own embedded JPEG (5472 x 3648 on the NX20
  and NX3000). LibRaw takes its margins from a per-model table instead, so they
  differ by a few sensels; reported, not gated, by ``tools/srw_libraw_check.py``.
* **CFA**: GRBG. The CFAPattern tag is not used: the Galaxy NX writes garbage
  there and the NX3000 writes GBRG, but its image is GRBG (the second sensel of
  the first row follows the embedded JPEG's red, r = 0.93 against 0.70 for
  blue), as LibRaw also reads it.
* **White level**: ``2 ** BitsPerSample - 1`` (4095, or 16383 on the NX1), as
  LibRaw reports on all four bodies checked.
* **Colour**: like a CR2, ARW, NEF, ORF or RW2, an SRW develops with the
  camera's ``.dcp`` profile ("Samsung NX1 Adobe Standard.dcp", from Adobe's free
  DNG Converter).

The format as dcraw and LibRaw read it (Dave Coffin's ``samsung_load_raw``,
``samsung2_load_raw``, ``samsung3_load_raw`` and ``packed_load_raw``); this is
an independent implementation, checked sensel for sensel against LibRaw 0.22
(``tools/srw_libraw_check.py``, ``eval/samsung-srw-reader-2026-11-14.md``).
Other layouts (uncompressed 16-bit, 32769) are refused with the reason: no test
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
TAG_MAKER_NOTE = 0x927C
TAG_ROW_TABLE = 0xA010  # in the raw IFD: where the per-row offsets of compression 32770 start

MN_CROP = 0xA010  # in the maker note: stored sensor and picture area, (left, top, right, bottom) each
MN_KEY = 0xA020
MN_WB_UNCORRECTED = 0xA021
MN_BLACK = 0xA028

COMP_ROWS = 32770
COMP_HUFFMAN = 32772
COMP_BLOCKS = 32773

# 32772's Huffman table: (code length << 8) | difference bits, codes assigned in this order.
HUFF_TAB = (0x304, 0x307, 0x206, 0x205, 0x403, 0x600, 0x709, 0x80A, 0x90B, 0xA0C, 0xA0D, 0x501, 0x408, 0x402)

DEFAULT_CFA = (1, 0, 2, 1)  # GRBG
PAD = 64  # sensels past the frame: the 32770 blocks overrun a row width that is not a multiple of 16


def _text(values) -> str:
    return bytes(values or b"").split(b"\0", 1)[0].decode("latin-1").strip()


def _ifds(data: bytes):
    try:
        reader = rd._Reader(data)
        return reader, rd._all_ifds(reader)
    except (rd.DevelopError, struct.error):
        return None


def _raw_ifd(ifds):
    """The largest full-resolution IFD with a CFA: Photometric 32803, or (as the SRWs here write it, with no
    Photometric tag at all) a CFAPattern."""

    def area(ifd):
        return ifd.one(rd.TAG_WIDTH, 0) * ifd.one(rd.TAG_HEIGHT, 0)

    best = None
    for ifd in ifds:
        photometric = ifd.one(rd.TAG_PHOTOMETRIC)
        cfa = photometric == rd.PHOTOMETRIC_CFA or (photometric is None and ifd.get(rd.TAG_CFA_PATTERN))
        if cfa and ifd.one(rd.TAG_NEW_SUBFILE_TYPE, 0) == 0 and (best is None or area(ifd) > area(best)):
            best = ifd
    return best


def is_srw(data: bytes) -> bool:
    """A classic TIFF whose Make is Samsung, with a CFA raw IFD, and no DNGVersion."""

    found = _ifds(data)
    if not found:
        return False
    reader, ifds = found
    if reader.magic != 42 or not ifds or ifds[0].one(rd.TAG_DNG_VERSION) is not None:
        return False
    if not _text(ifds[0].get(TAG_MAKE)).upper().startswith("SAMSUNG"):
        return False
    return _raw_ifd(ifds) is not None


def camera_model(data: bytes) -> str:
    """The camera name a profile is filed under: 'Samsung NX1' (Adobe's own naming)."""

    found = _ifds(data)
    if not found or not found[1]:
        return ""
    model = _text(found[1][0].get(TAG_MODEL))
    return f"Samsung {model}" if model else ""


# --------------------------------------------------------------------------
# Bit readers


def _swap32(buf: bytes) -> bytes:
    """``buf`` with every 4-byte word reversed (zero-padded to a whole word, plus 8 bytes of zeros)."""

    n = -(-len(buf) // 4) * 4
    words = array("I", bytes(buf) + bytes(n - len(buf)))
    if words.itemsize != 4:  # pragma: no cover - every CPython platform has a 4-byte "I"
        raise RuntimeError("array('I') is not 32-bit here")
    words.byteswap()  # reverses each item's bytes whatever the host's order
    return words.tobytes() + bytes(8)


def _peek(buf: bytes, pos: int, n: int) -> int:
    """``n`` bits (n <= 32) of the MSB-first stream ``buf`` from bit ``pos``."""

    if n == 0:
        return 0
    at = pos >> 3
    word = int.from_bytes(buf[at : at + 8], "big")
    return (word >> (64 - (pos & 7) - n)) & ((1 << n) - 1)


# --------------------------------------------------------------------------
# 32770 with a row table


def _decode_rows_python(data: bytes, start: int, table_at: int, width: int, height: int) -> array:
    """``samsung_load_raw``: rows at their own offsets, blocks of 16, then the 2x2 swap."""

    raw = array("H", [0]) * (width * height + PAD)
    offsets = struct.unpack_from(f"<{height}I", data, table_at)
    for row in range(height):
        at = start + offsets[row]
        nxt = start + offsets[row + 1] if row + 1 < height else len(data)
        buf = _swap32(data[at : max(nxt, at) + 64])
        pos = 0
        lens = [7, 7, 7, 7] if row < 2 else [4, 4, 4, 4]
        base = row * width
        for col in range(0, width, 16):
            direction = _peek(buf, pos, 1)
            pos += 1
            ops = []
            for _ in range(4):
                ops.append(_peek(buf, pos, 2))
                pos += 2
            for c in range(4):
                op = ops[c]
                if op == 3:
                    lens[c] = _peek(buf, pos, 4)
                    pos += 4
                elif op == 2:
                    lens[c] -= 1
                elif op == 1:
                    lens[c] += 1
            for c in (0, 2, 4, 6, 8, 10, 12, 14, 1, 3, 5, 7, 9, 11, 13, 15):
                n = lens[((c & 1) << 1) | (c >> 3)]
                if n < 0 or n > 32:
                    raise rd.DevelopError(f"SRW: bit length {n} at row {row}, column {col + c}")
                d = _peek(buf, pos, n)
                pos += n
                if n and d >> (n - 1):
                    d -= 1 << n
                if direction:
                    up = row - (2 if c & 1 else 1)
                    if up < 0:
                        raise rd.DevelopError(f"SRW: vertical prediction above the frame at row {row}")
                    pred = raw[up * width + col + c]
                elif col:
                    pred = raw[base + col - (1 if c & 1 else 2)]  # dcraw's col + (c | -2): the block start, not the sensel
                else:
                    pred = 128
                raw[base + col + c] = (pred + d) & 0xFFFF
    for row in range(0, height - 1, 2):
        for col in range(0, width - 1, 2):
            a, b = row * width + col + 1, (row + 1) * width + col
            raw[a], raw[b] = raw[b], raw[a]
    del raw[width * height :]
    return raw


# --------------------------------------------------------------------------
# 32770 without a row table: 12-bit packed


def decode_packed12(buf: bytes, width: int, height: int) -> array:
    """12-bit samples, two per three bytes: ``b0 | (b1 & 15) << 8`` then ``b1 >> 4 | b2 << 4`` (numpy when present)."""

    need = width * height * 3 // 2
    if len(buf) < need:
        buf = bytes(buf) + bytes(need - len(buf))
    try:
        import numpy as np
    except ImportError:  # pragma: no cover - exercised by the pure path in tests
        return _packed12_python(buf, width * height)
    b = np.frombuffer(bytes(buf[:need]), dtype=np.uint8).reshape(-1, 3).astype(np.uint16)
    vals = np.empty((b.shape[0], 2), dtype=np.uint16)
    vals[:, 0] = b[:, 0] | ((b[:, 1] & 15) << 8)
    vals[:, 1] = (b[:, 1] >> 4) | (b[:, 2] << 4)
    return array("H", vals.ravel().tobytes())


def _packed12_python(buf: bytes, count: int) -> array:
    out = array("H", [0]) * count
    for k in range(count // 2):
        b0, b1, b2 = buf[3 * k], buf[3 * k + 1], buf[3 * k + 2]
        out[2 * k] = b0 | ((b1 & 15) << 8)
        out[2 * k + 1] = (b1 >> 4) | (b2 << 4)
    return out


# --------------------------------------------------------------------------
# 32772: Huffman differences


def huffman_lut() -> list[tuple[int, int]]:
    """The 1024-entry lookup of 32772's table: 10-bit prefix -> (code length, difference bits)."""

    lut: list[tuple[int, int]] = []
    for entry in HUFF_TAB:
        length, bits = entry >> 8, entry & 0xFF
        lut.extend([(length, bits)] * (1024 >> length))
    if len(lut) != 1024:
        raise AssertionError("32772 table does not fill 10 bits")
    return lut


def _decode_huffman_python(buf: bytes, width: int, height: int, bits: int) -> array:
    """``samsung2_load_raw``: one MSB-first stream; per-parity running values."""

    lut = huffman_lut()
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
            length, n = lut[_peek(data, pos, 10)]
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
                raise rd.DevelopError(f"SRW: value {v} out of range at row {row}, column {col}")
            out[k] = v
            k += 1
    return out


# --------------------------------------------------------------------------
# 32773: blocks of 16 with prediction modes

PRED_A = (-4, -2, -2, 0, 0, 2, 4)  # dcraw's "0224468"[pmode] - '4'
PRED_B = (-4, -2, 0, 0, 2, 2, 4)  # "0244668"[pmode] - '4'


def _decode_blocks_python(data: bytes, start: int, width: int, height: int) -> array:
    """``samsung3_load_raw``: rows on 16-byte boundaries, interleaved blocks of 16."""

    if start + 14 > len(data):
        raise rd.DevelopError("SRW: 32773 header runs past the end of the file")
    opt = data[start + 9]
    init = struct.unpack_from("<H", data, start + 12)[0]
    buf = _swap32(data[start:])
    raw = array("H", [0]) * (width * height + 2 * width)  # two spare rows above for the predictor
    off = 2 * width  # flat index of (row 0, col 0)
    pos = 16 * 8  # bit position of row 0: the header, then the first 16-byte boundary
    for row in range(height):
        mag = 0
        pmode = 7
        lent = [[7, 7], [7, 7], [7, 7]] if row < 2 else [[4, 4], [4, 4], [4, 4]]
        lens = [0, 0, 0, 0]
        base = off + row * width
        # prow[parity] as flat bases: greens one row up shifted by one, red and blue two rows up.
        green = off + (row - 1) * width + (1 - ((row & 1) << 1))
        other = off + (row - 2) * width
        prow = [green, other] if not row & 1 else [other, green]
        row_start = pos
        for tab in range(0, width - 15, 16):
            if not opt & 4 and not tab & 63:
                i = _peek(buf, pos, 2)
                pos += 2
                if i < 3:
                    mag += (0, -2, 2)[i]
                else:
                    mag = _peek(buf, pos, 12)
                    pos += 12
            if opt & 2:
                pmode = 7 - 4 * _peek(buf, pos, 1)
                pos += 1
            else:
                flag = _peek(buf, pos, 1)
                pos += 1
                if not flag:
                    pmode = _peek(buf, pos, 3)
                    pos += 3
            read = True
            if not opt & 1:
                read = not _peek(buf, pos, 1)
                pos += 1
            if read:
                for c in range(4):
                    lens[c] = _peek(buf, pos, 2)
                    pos += 2
                for c in range(4):
                    i = (((row & 1) << 1) | (c & 1)) % 3
                    if lens[c] < 3:
                        lens[c] = lent[i][0] + (0, 1, -1)[lens[c]]
                    else:
                        lens[c] = _peek(buf, pos, 4)
                        pos += 4
                    lent[i][0] = lent[i][1]
                    lent[i][1] = lens[c]
            for c in range(16):
                col = tab + (((c & 7) << 1) ^ (c >> 3) ^ (row & 1))
                if pmode == 7 or row < 2:
                    pred = raw[base + tab - 2 + (col & 1)] if tab else init
                else:
                    p = prow[col & 1] + col
                    pred = (raw[p + PRED_A[pmode]] + raw[p + PRED_B[pmode]] + 1) >> 1
                n = lens[c >> 2]
                if n < 0 or n > 32:
                    raise rd.DevelopError(f"SRW: bit length {n} at row {row}, column {col}")
                d = _peek(buf, pos, n)
                pos += n
                if n and d >> (n - 1):
                    d -= 1 << n
                raw[base + col] = (pred + d * (mag * 2 + 1) + mag) & 0xFFFF
        # The next row starts after the last 32-bit word read, on the next 16-byte boundary.
        used = -(-(pos - row_start) // 32) * 4
        pos = row_start + (-(-used // 16) * 16) * 8
    return raw[off : off + width * height]


# --------------------------------------------------------------------------
# Dispatch and tags


def decode_srw(data: bytes, raw_ifd: rd.Ifd, engine: str = "auto") -> tuple[array, str, int]:
    """The raw IFD's sensor data, row-major: (values, storage note, bits per sample)."""

    width, height = raw_ifd.one(rd.TAG_WIDTH), raw_ifd.one(rd.TAG_HEIGHT)
    if not width or not height or width * height > 400_000_000:
        raise rd.DevelopError("raw image size is missing or implausible")
    comp = raw_ifd.one(TAG_COMPRESSION, 1)
    bits = raw_ifd.one(rd.TAG_BITS, 12)
    start = raw_ifd.one(TAG_STRIP_OFFSETS)
    size = raw_ifd.one(TAG_STRIP_BYTES, 0)
    if start is None or start >= len(data):
        raise rd.DevelopError("SRW raw data starts outside the file")
    table = raw_ifd.one(TAG_ROW_TABLE)
    native = None
    if engine != "python":
        from shootflow import ljpeg_native

        if ljpeg_native.available():
            native = ljpeg_native
        elif engine == "native":
            raise RuntimeError("native decoder is not available")
    if comp == COMP_ROWS and table:
        if table + 4 * height > len(data):
            raise rd.DevelopError("SRW row table runs past the end of the file")
        got = native.samsung_rows_run(data, start, table, width, height) if native else None
        values = got if got is not None else _decode_rows_python(data, start, table, width, height)
        return values, f"SRW: Samsung compressed (32770, row table, {bits}-bit)", bits
    if comp == COMP_ROWS and bits == 12 and size == width * height * 3 // 2:
        return decode_packed12(data[start : start + size], width, height), "SRW: 12-bit packed (32770)", bits
    if comp == COMP_HUFFMAN:
        got = native.samsung_huffman_run(data[start:], width, height, bits) if native else None
        values = got if got is not None else _decode_huffman_python(data[start:], width, height, bits)
        return values, f"SRW: Samsung Huffman (32772, {bits}-bit)", bits
    if comp == COMP_BLOCKS:
        got = native.samsung_blocks_run(data, start, width, height) if native else None
        values = got if got is not None else _decode_blocks_python(data, start, width, height)
        return values, f"SRW: Samsung compressed (32773, {bits}-bit)", bits
    raise rd.DevelopError(f"this SRW layout (compression {comp}, {bits}-bit) is not supported; convert to DNG")


def maker_note(data: bytes, reader, ifd0: rd.Ifd) -> rd.Ifd | None:
    """The Samsung maker note: an IFD at the EXIF MakerNote whose offsets count from the note's start."""

    exif = rd.exif_ifd(reader, ifd0)
    if exif is None or TAG_MAKER_NOTE not in exif.offsets:
        return None
    at = exif.offsets[TAG_MAKER_NOTE]
    end = reader.end
    try:
        count = struct.unpack_from(end + "H", data, at)[0]
        note = rd.Ifd(byte_order=end, source=data)
        pos = at + 2
        for _ in range(count):
            tag, typ, n = struct.unpack_from(end + "HHI", data, pos)
            size = rd._TYPE_SIZES.get(typ)
            if size is not None and n < 1 << 24:
                total = size * n
                where = pos + 8 if total <= 4 else at + struct.unpack_from(end + "I", data, pos + 8)[0]
                if where + total <= len(data):
                    note.entries[tag] = reader._values(typ, n, where)
                    note.offsets[tag] = where
            pos += 12
        return note
    except struct.error:
        return None


def _signed(v: int) -> int:
    return v - (1 << 32) if v >= 1 << 31 else v


def decrypted(note: rd.Ifd | None, tag: int) -> tuple[int, int, int, int] | None:
    """A four-value level tag (R, G, G, B) with the encryption key's first four values subtracted."""

    if note is None:
        return None
    key, values = note.get(MN_KEY), note.get(tag)
    if not key or len(key) < 4 or not values or len(values) < 4:
        return None
    r, g1, g2, b = (_signed(int(values[c])) - _signed(int(key[c])) for c in range(4))
    return r, g1, g2, b


def picture_crop(note: rd.Ifd | None, width: int, height: int) -> tuple[int, int, int, int] | None:
    """The maker note's picture area (0xA010's second rectangle) as (x, y, w, h), when inside the frame."""

    if note is None:
        return None
    rect = note.get(MN_CROP)
    if not rect or len(rect) < 8:
        return None
    left, top, right, bottom = (int(v) for v in rect[4:8])
    if not (0 <= left < right <= width and 0 <= top < bottom <= height):
        return None
    return left, top, right - left, bottom - top


def parse_srw(data: bytes, engine: str = "auto") -> rd.RawImage:
    """An SRW's sensor data and DNG-equivalent tags."""

    found = _ifds(data)
    if not found or not found[1]:
        raise rd.DevelopError("not a TIFF raw (no IFDs)")
    reader, ifds = found
    if not is_srw(data):
        raise rd.DevelopError("not a Samsung SRW")
    ifd0, raw_ifd = ifds[0], _raw_ifd(ifds)
    width, height = raw_ifd.one(rd.TAG_WIDTH), raw_ifd.one(rd.TAG_HEIGHT)
    values, storage, bits = decode_srw(data, raw_ifd, engine)
    notes = [storage]

    # The CFAPattern tag is not trusted: the Galaxy NX writes (1, 71, 21, 224) and the NX3000 GBRG, but on both
    # (and the NX1 and NX20, whose tags agree) the image is GRBG: the second sensel of the first row tracks the
    # embedded JPEG's red (eval/samsung-srw-reader-2026-11-14.md), and LibRaw reads all four as GRBG.
    pattern = DEFAULT_CFA
    tagged = tuple(raw_ifd.get(rd.TAG_CFA_PATTERN, ()))
    if tagged != DEFAULT_CFA:
        notes.append(f"SRW: CFAPattern tag {tagged} ignored; GRBG, as every SRW checked is")
    note = maker_note(data, reader, ifd0)
    black_rggb = decrypted(note, MN_BLACK)
    if black_rggb is None:
        black: tuple[float, ...] = (0.0,) * 4
        notes.append("no Samsung black level (maker note 0xA028): 0 assumed")
    else:
        # R, G, G, B onto the 2x2 positions: the first green where the pattern's first green is.
        greens = iter((black_rggb[1], black_rggb[2]))
        black = tuple(float(black_rggb[0] if p == 0 else black_rggb[3] if p == 2 else next(greens)) for p in pattern)
    white = (1 << bits) - 1
    as_shot = None
    wb = decrypted(note, MN_WB_UNCORRECTED)
    if wb and wb[1] > 0 and wb[0] > 0 and wb[3] > 0:
        as_shot = (wb[0] / wb[1], 1.0, wb[3] / wb[1])
    else:
        notes.append("no Samsung as-shot white balance (maker note 0xA021)")

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
    crop = picture_crop(note, width, height)
    if crop is not None:
        synth.entries[rd.TAG_CROP_ORIGIN] = crop[:2]
        synth.entries[rd.TAG_CROP_SIZE] = crop[2:]
        notes.append(f"SRW: the maker note's picture area, {crop[2]}x{crop[3]} at ({crop[0]}, {crop[1]})")
    if as_shot is not None:
        synth.entries[rd.TAG_AS_SHOT_NEUTRAL] = tuple(1.0 / v for v in as_shot)
    head = rd.Ifd(entries=dict(ifd0.entries), byte_order=reader.end)
    head.entries[rd.TAG_UNIQUE_CAMERA_MODEL] = tuple(camera_model(data).encode("latin-1")) + (0,)
    exif = rd.exif_ifd(reader, ifd0)
    return rd.RawImage(width, height, 1, values, synth, head, source="srw", notes=notes, exif=exif)


__all__ = [
    "camera_model",
    "decode_packed12",
    "decode_srw",
    "decrypted",
    "huffman_lut",
    "is_srw",
    "maker_note",
    "parse_srw",
    "picture_crop",
]
