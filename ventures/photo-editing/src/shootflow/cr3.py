"""Read a Canon CR3 straight into the developer, standard library only (C when present).

A CR3 is an ISO base media file (the MP4 family: ``ftyp`` brand ``crx``), not a
TIFF. Every Canon body since 2018 (the EOS R, M50, 90D, R5, R6, R8, R3...)
writes it. What a CR2 holds in TIFF IFDs, a CR3 holds in boxes:

* **Metadata**: a Canon ``uuid`` box inside ``moov`` holds ``CMT1`` (IFD0:
  Make, Model), ``CMT2`` (the EXIF IFD), ``CMT3`` (Canon's maker note:
  SensorInfo 0x00E0, CameraSettings 0x0001, the lens name 0x0095) and
  ``CMT4`` (GPS), each a small TIFF file of its own.
* **As-shot white balance**: not in CMT3. The fourth track (``CTMD``, timed
  metadata) carries per-frame records; record type 8 holds a maker-note
  fragment with ColorData (0x4001). ColorData11 (3,778 entries on the R8,
  3,973 on the R3) has WB_RGGBLevelsAsShot at index 0x69, as R, G, G, B.
* **Sensor data**: the third track's sample, whose ``CRAW`` sample entry
  carries a ``CMP1`` box: version, size, tile size, bits, planes, CFA layout,
  encoding type, wavelet levels, and the size of a header at the start of the
  sample listing each tile, plane and subband with its byte count.
* **Crop**: SensorInfo, as on a CR2 (the same rectangle as the CDI1/IAD1 box).
* **Black level**: ColorData's PerChannelBlackLevel where its place is known
  (R5, R3, R5 Mark II: equal to LibRaw on all nine real files of 2026-11-18; by
  ColorData length and version since the 39-file survey the same evening),
  else the median of the masked columns left of the image, per 2x2 position, as
  on a CR2 (on the R8 files the medians are within 1 of LibRaw's 2047/2048).
* **White level**: clipped sensels when the frame has a pile at the top, else
  the stream's full scale (14 bits: 16383, LibRaw's figure on all five).
* **CFA**: CMP1's cfaLayout (0 RGGB, 1 GRBG, 2 GBRG, 3 BGGR) at the sensor's
  first sensel, turned by the crop's parity.

Storage read: Canon's CRX codec with no wavelet levels (``imageLevels`` 0),
which is the full "RAW" quality, and since 2026-11-15 the smaller "C-RAW"
quality, a 5/3 wavelet with quantised subbands (CMP1 version 0x200, three
levels on the test bodies), read by ``shootflow.cr3_wavelet``. In the RAW quality each of the four planes (one per 2x2
position, at half width and height) is a single band coded line by line: a
median edge predictor (the LOCO-I one: left, above, and left + above -
above-left), an adaptive Rice code for the error whose parameter K follows
the size of recent errors and, where the line is flat (left = above = above
right), a run mode with JPEG-LS's run-length table. A sensel is the decoded
value, clamped to the signed ``bits`` range, plus ``2^(bits-1)``.

The codec as LibRaw reads it (``crx.cpp``, from Alexey Danilchenko's
reverse-engineered decoder) and as the ``lclevy/canon_cr3`` notes describe
the container; this is an independent implementation, checked sensel for
sensel against LibRaw 0.22 on two full-quality EOS R8 files (and, for C-RAW, three more: two R8, one R3)
(``tools/cr3_libraw_check.py``, ``eval/canon-cr3-reader-2026-11-15.md``).

Several tiles (later on 2026-11-15): a CR3 may store the planes cut into tiles (the real EOS R5 and R5
Mark II files of 2026-11-18, 8352 and 8480 sensels wide, turned out to be one tile each),
which CMP1's tile size gives (every tile that size but the last of each row and column, which takes the
rest). The sample header then holds each tile's header (0xFF01, with its index) and its planes' headers in
turn, and the data follows tile after tile; each tile's plane is an independent band at the tile's width.
Full-quality tiles are read, and since 2026-11-16 C-RAW tiles too (``cr3_wavelet``: each tile its own
wavelet decomposition plus the edge coefficients its neighbours lend). Until 2026-11-18 no public tiled CR3
had been fetched, so real one-tile R8 (and, for C-RAW, R3) files were re-stored as tiles and LibRaw 0.22 read
them back to the original sensels (``tools/cr3_tiled_libraw_check.py``, ``eval/canon-cr3-tiled-2026-11-15.md``;
``tools/cr3_craw_tiled_libraw_check.py``, ``eval/canon-cr3-craw-tiled-2026-11-16.md``).

Real tiled files (2026-11-18, ``eval/canon-cr3-every-body-2026-11-18.md``): the older CR3 bodies on
raw.pixls.us (EOS R, RP, M50/Kiss M, M50 Mark II, M6 Mark II, M200, 250D/SL3, 90D, 850D, R100; 6288-7128
sensels wide) store a full frame as two tiles side by side, mostly with CMP1's several-tiles flags left 0,
while the later bodies (R5, R6, R7, R3, R8, 1D X Mark III and on) store one tile even at 7128-8480 sensels.
The older bodies' C-RAW is an older layout too (version 0x100 with wavelet levels, one fixed step per
subband: ``cr3_wavelet``). This reader refused 17 of those 18 files before that day (the Kiss M's flags are
set); all now match LibRaw sensel for sensel.
"""

from __future__ import annotations

import struct
from array import array

from shootflow import cr2
from shootflow import raw_develop as rd

CANON_UUID = bytes.fromhex("85c0b687820f11e08111f4ce462b6a48")
_CONTAINERS = {b"moov", b"trak", b"mdia", b"minf", b"stbl"}
# WB_RGGBLevelsAsShot index by ColorData length; the CR2 table covers ColorData1-10.
_AS_SHOT_INDEX = dict(cr2._AS_SHOT_INDEX)
_AS_SHOT_INDEX.update({3778: 0x69, 3973: 0x69})  # ColorData11: R8, R3 (R5, R6 Mark II, R7, R10, R50 share it)
_AS_SHOT_INDEX[4528] = 0x69  # ColorData12 (version 64): R5 Mark II (raw.pixls.us, 2026-11-18)
# PerChannelBlackLevel (R, G, G, B) index by ColorData length, found on real files where it equals LibRaw's
# black_level_per_channel (eval/canon-cr3-r5-real-2026-11-18.md): R5 (ColorData10, 510), R3 (2047), R5 Mark II
# (512). On the R5 Mark II, IAD1's left optical black also takes in a darker strip (columns 0-131, about 470),
# so a measured median lands 8-41 levels low; the stated level is what Canon and LibRaw use.
_BLACK_INDEX = {3656: 0x157, 3973: 0x16B, 4528: 0x17F}
# Where one length holds two layouts, ColorData's first entry (its version) tells them apart
# (eval/canon-cr3-every-body-2026-11-18.md, 39 raw.pixls.us files): 3,778 entries is version 48 on the R7, R10,
# R50, R6 Mark II and R8 (black at 0x16B, as the R3) but 65 on the PowerShot V1 and 66 on the R6 Mark III (at
# 0x17F, as the R5 Mark II; LibRaw 0.22.2 reads 0-145 there). 1,816-1,824 entries (versions 16-19: EOS R, RP,
# M50, M6 Mark II, M200, 250D, 90D, 850D, R100) hold it at 0x149, where LibRaw's value was found on 9 files.
_BLACK_INDEX_BY_VERSION = {
    (3778, 48): 0x16B, (3778, 65): 0x17F, (3778, 66): 0x17F,
    (1816, 18): 0x149, (1816, 19): 0x149, (1820, 16): 0x149, (1824, 17): 0x149,
}
# A measured black further than this from the stated one is reported in the notes.
_BLACK_GAP_NOTE = 4
_CFA_LAYOUT = {0: "RGGB", 1: "GRBG", 2: "GBRG", 3: "BGGR"}

# JPEG-LS run-length table (ISO 14495-1, J[]); JS is 1 << J.
J = (0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 9, 10, 11, 12, 13, 14, 15)
JS = tuple(1 << j for j in J)


def is_cr3(data: bytes) -> bool:
    return len(data) >= 12 and data[4:8] == b"ftyp" and data[8:12] == b"crx "


def _boxes(data: bytes, start: int, end: int):
    """(type, start, header size, total size) for each box in ``data[start:end]``."""

    pos = start
    while pos + 8 <= end:
        size, kind = struct.unpack_from(">I4s", data, pos)
        head = 8
        if size == 1:
            if pos + 16 > end:
                return
            size = struct.unpack_from(">Q", data, pos + 8)[0]
            head = 16
        elif size == 0:
            size = end - pos
        if size < head or pos + size > end:
            return
        yield kind, pos, head, size
        pos += size


def _child(data: bytes, start: int, end: int, kind: bytes):
    for k, pos, head, size in _boxes(data, start, end):
        if k == kind:
            return pos + head, pos + size
    return None


class Track:
    """One ``trak``: its sample entry's type, its CMP1 payload (if any) and its first sample's place."""

    def __init__(self, entry: bytes, cmp1: bytes | None, offset: int, size: int, iad1: bytes | None = None):
        self.entry, self.cmp1, self.offset, self.size, self.iad1 = entry, cmp1, offset, size, iad1


def _track(data: bytes, start: int, end: int) -> Track | None:
    path = [b"mdia", b"minf", b"stbl"]
    s, e = start, end
    for kind in path:
        found = _child(data, s, e, kind)
        if found is None:
            return None
        s, e = found
    stbl = (s, e)
    stsd = _child(data, *stbl, b"stsd")
    offset = size = None
    co64 = _child(data, *stbl, b"co64")
    stco = _child(data, *stbl, b"stco")
    if co64 and co64[1] - co64[0] >= 16:
        offset = struct.unpack_from(">Q", data, co64[0] + 8)[0]
    elif stco and stco[1] - stco[0] >= 12:
        offset = struct.unpack_from(">I", data, stco[0] + 8)[0]
    stsz = _child(data, *stbl, b"stsz")
    if stsz and stsz[1] - stsz[0] >= 12:
        fixed, count = struct.unpack_from(">II", data, stsz[0] + 4)
        size = fixed if fixed else (struct.unpack_from(">I", data, stsz[0] + 12)[0] if count else None)
    if stsd is None or offset is None or size is None:
        return None
    entry_at = stsd[0] + 8
    if entry_at + 8 > stsd[1]:
        return None
    esize, ekind = struct.unpack_from(">I4s", data, entry_at)
    cmp1 = iad1 = None
    if ekind == b"CRAW":
        # CRAW: 8-byte box header, then 82 bytes of a visual sample entry, then child boxes.
        kids = (entry_at + 8 + 82, min(entry_at + esize, stsd[1]))
        found = _child(data, *kids, b"CMP1")
        if found:
            cmp1 = data[found[0] : found[1]]
        cdi1 = _child(data, *kids, b"CDI1")
        if cdi1:
            found = _child(data, cdi1[0] + 4, cdi1[1], b"IAD1")  # CDI1: 4 bytes of version and flags, then IAD1
            if found:
                iad1 = data[found[0] : found[1]]
    return Track(ekind, cmp1, offset, size, iad1)


class Container:
    """The parts of a CR3 the developer needs."""

    def __init__(self, data: bytes):
        if not is_cr3(data):
            raise rd.DevelopError("not a Canon CR3 (no 'ftyp' box with brand 'crx ')")
        moov = _child(data, 0, len(data), b"moov")
        if moov is None:
            raise rd.DevelopError("CR3: no 'moov' box")
        self.cmt: dict[bytes, bytes] = {}
        self.tracks: list[Track] = []
        for kind, pos, head, size in _boxes(data, *moov):
            if kind == b"uuid" and data[pos + head : pos + head + 16] == CANON_UUID:
                for k, p, h, s in _boxes(data, pos + head + 16, pos + size):
                    if k in (b"CMT1", b"CMT2", b"CMT3", b"CMT4"):
                        self.cmt[k] = data[p + h : p + s]
            elif kind == b"trak":
                t = _track(data, pos + head, pos + size)
                if t is not None:
                    self.tracks.append(t)
        raws = [(t, Cmp1(t.cmp1)) for t in self.tracks if t.cmp1 is not None]
        if not raws:
            raise rd.DevelopError("CR3: no track with a CMP1 (sensor data) box")
        # The full-size raw is the CMP1 with the most sensels (the others are small previews, when present).
        self.raw, self.head = max(raws, key=lambda pair: pair[1].width * pair[1].height)
        self.ctmd = next((t for t in self.tracks if t.entry == b"CTMD"), None)


class Cmp1:
    """CMP1: the codec header (big-endian; the fields LibRaw names, offsets from the box payload)."""

    def __init__(self, blob: bytes):
        if len(blob) < 36:
            raise rd.DevelopError("CR3: CMP1 box is too short")
        self.version = struct.unpack_from(">H", blob, 4)[0]
        self.width, self.height, self.tile_width, self.tile_height = struct.unpack_from(">4I", blob, 8)
        self.bits = blob[24]
        self.planes = blob[25] >> 4
        self.cfa_layout = blob[25] & 0xF
        self.enc_type = blob[26] >> 4
        self.levels = blob[26] & 0xF
        self.tile_cols = blob[27] >> 7
        self.tile_rows = (blob[27] >> 6) & 1
        self.header_size = struct.unpack_from(">I", blob, 28)[0]


def left_optical_black(iad1: bytes | None, width: int, height: int) -> tuple[int, int, int, int] | None:
    """IAD1's left optical-black rectangle as (left, top, right, bottom), right and bottom exclusive.

    IAD1 (in the raw track's CDI1 box), as big-endian shorts after 4 bytes of version and flags: the
    sensor's width and height, four shorts of kind, then four rectangles of (left, top, right,
    bottom), inclusive: the crop (SensorInfo's), the left optical black, the top optical black and
    the active area. On the EOS R8 the active area starts at column 156 and the crop at 168, so
    the columns between are exposed: black is measured inside the left optical black only.
    """

    if not iad1 or len(iad1) < 4 + 2 * 16:
        return None
    v = struct.unpack_from(">16H", iad1, 4)
    if v[0] != width or v[1] != height:
        return None
    left, top, right, bottom = v[10:14]
    if not (0 <= left < right < width and 0 <= top < bottom < height):
        return None
    return left, top, right + 1, bottom + 1


def black_levels(values: array, width: int, ob: tuple[int, int, int, int], top: int, left: int, bottom: int) -> list[float] | None:
    """Median per 2x2 position (phase relative to the crop's (top, left)) inside the optical-black rectangle
    ``ob``, four columns in from each side, over the crop's rows."""

    skip = 4
    x0, x1 = ob[0] + skip, ob[2] - skip
    y0, y1 = max(top, ob[1]), min(bottom, ob[3])
    if x1 - x0 < 4 or y1 - y0 < 4:
        return None
    step_y = max(1, (y1 - y0) // 600) * 2
    out = []
    for py in (0, 1):
        for px in (0, 1):
            picks: list[int] = []
            ys = y0 + ((top + py - y0) % 2)
            xs = x0 + ((left + px - x0) % 2)
            for y in range(ys, y1, step_y):
                base = y * width
                picks.extend(values[base + xs : base + x1 : 2])
            out.append(cr2._median(picks))
    return out


def _tiff_ifd(blob: bytes | None) -> tuple[rd._Reader, rd.Ifd] | None:
    if not blob or len(blob) < 8 or blob[:2] not in (b"II", b"MM"):
        return None
    try:
        reader = rd._Reader(blob)
        return reader, reader.read_ifd(reader.first_ifd_offset())[0]
    except (rd.DevelopError, struct.error, IndexError):
        return None


def colour_data(data: bytes, box: Container) -> tuple | None:
    """ColorData (0x4001) from the CTMD track's record type 8, or None."""

    t = box.ctmd
    if t is None or t.offset + t.size > len(data):
        return None
    blob = data[t.offset : t.offset + t.size]
    pos = 0
    while pos + 12 <= len(blob):
        size, kind = struct.unpack_from("<IH", blob, pos)
        if size < 6 or pos + size > len(blob):
            return None
        if kind in (7, 8, 9):
            sub = pos + 12  # a record of these types: 12-byte head, then (size, tag, TIFF) entries
            while sub + 8 <= pos + size:
                ssize, _tag = struct.unpack_from("<II", blob, sub)
                if ssize < 8 or sub + ssize > pos + size:
                    break
                found = _tiff_ifd(blob[sub + 8 : sub + ssize])
                if found is not None and found[1].get(cr2.CANON_COLOR_DATA):
                    return tuple(found[1].get(cr2.CANON_COLOR_DATA))
                sub += ssize
        pos += size
    return None


class _Bits:
    """Big-endian bit reader; past the end the stream reads as zeros."""

    __slots__ = ("data", "pos", "acc", "n")

    def __init__(self, data: bytes):
        self.data, self.pos, self.acc, self.n = data, 0, 0, 0

    def _fill(self) -> None:
        k = (64 - self.n) >> 3
        chunk = self.data[self.pos : self.pos + k]
        self.pos += k
        if len(chunk) < k:
            chunk += bytes(k - len(chunk))
        self.acc = (self.acc << (8 * k)) | int.from_bytes(chunk, "big")
        self.n += 8 * k

    def get(self, bits: int) -> int:
        if not bits:
            return 0
        if self.n < bits:
            self._fill()
        self.n -= bits
        value = self.acc >> self.n
        self.acc &= (1 << self.n) - 1
        return value

    def zeros(self) -> int:
        """Count zero bits up to the next one, and consume that one too."""

        count = 0
        while True:
            if not self.n:
                self._fill()
            if not self.acc:
                count += self.n
                self.n = 0
                if count > 64 and self.pos >= len(self.data) + 16:
                    raise rd.DevelopError("CR3: the compressed band ran past its data")
                continue
            length = self.acc.bit_length()
            count += self.n - length
            self.n = length - 1
            self.acc &= (1 << self.n) - 1
            return count


def _next_k(k: int, code: int) -> int:
    nk = k - (code < ((1 << k) >> 1)) + ((code >> k) > 2) + ((code >> k) > 5)
    return nk if nk < 15 else 15


def _error(bits: _Bits, k: int) -> int:
    code = bits.zeros()
    if code >= 41:
        return bits.get(21)
    if k:
        return bits.get(k) | (code << k)
    return code


def _run(bits: _Bits, state: list[int], length: int) -> int:
    """Run mode: how many samples repeat the left one (0 when the first bit is 0)."""

    if not bits.get(1):
        return 0
    n = 1
    while bits.get(1):
        n += JS[state[0]]
        if n > length:
            n = length
            break
        if state[0] < 31:
            state[0] += 1
        if n == length:
            break
    if n < length:
        if J[state[0]]:
            n += bits.get(J[state[0]])
        if state[0] > 0:
            state[0] -= 1
        if n > length:
            raise rd.DevelopError("CR3: a run is longer than the rest of its line")
    return n


def decode_band(data: bytes, width: int, height: int) -> list[list[int]]:
    """One losslessly coded band (a plane at ``imageLevels`` 0): ``height`` lines of signed values.

    Each line buffer has a pad on both sides: position 0 holds the line above's first value (so the
    first sample's left equals its above), position ``width + 1`` the last value plus one (so a run
    never reaches past the end through the above-right sample).
    """

    bits = _Bits(data)
    state = [0]
    k = 0
    lines: list[list[int]] = []
    cur = [0] * (width + 2)
    i = 0
    length = width
    # The top line: the prediction is the left value; a zero left value may start a run.
    while length > 1:
        if cur[i]:
            cur[i + 1] = cur[i]
        else:
            n = _run(bits, state, length)
            if n:
                length -= n
                for _ in range(n):
                    cur[i + 1] = cur[i]
                    i += 1
                if length <= 0:
                    break
            cur[i + 1] = 0
        code = _error(bits, k)
        cur[i + 1] += -(code & 1) ^ (code >> 1)
        k = _next_k(k, code)
        i += 1
        length -= 1
    if length == 1:
        cur[i + 1] = cur[i]
        code = _error(bits, k)
        cur[i + 1] += -(code & 1) ^ (code >> 1)
        k = _next_k(k, code)
        i += 1
    cur[i + 1] = cur[i] + 1
    lines.append(cur[1 : width + 1])
    prev = cur
    for _line in range(1, height):
        cur = [0] * (width + 2)
        cur[0] = prev[1]
        i = j = 0  # cur[i] is the left sample; prev[j], prev[j + 1], prev[j + 2] above-left, above, above-right
        length = width
        while length > 0:
            median = True
            if length > 1 and cur[i] == prev[j + 1] == prev[j + 2]:
                n = _run(bits, state, length)
                if n:
                    length -= n
                    j += n
                    for _ in range(n):
                        cur[i + 1] = cur[i]
                        i += 1
                    if length <= 0:
                        break
                median = False
            a, b = cur[i], prev[j + 1]
            if median:
                c = prev[j]
                delta = b - c
                neg = delta < 0
                pick = (((c < a) ^ neg) << 1) + ((a < b) ^ neg)
                value = (delta + a, delta + a, a, b)[pick]
            else:
                value = b
            code = _error(bits, k)
            cur[i + 1] = value + (-(code & 1) ^ (code >> 1))
            if length > 1:
                code = (code + abs((prev[j + 2] - prev[j + 1]) << 1)) >> 1
                j += 1
            k = _next_k(k, code)
            i += 1
            length -= 1
        cur[i + 1] = cur[i] + 1
        lines.append(cur[1 : width + 1])
        prev = cur
    return lines


class Band:
    __slots__ = ("plane", "offset", "size", "tile")

    def __init__(self, plane: int, offset: int, size: int, tile: "Tile | None" = None):
        self.plane, self.offset, self.size, self.tile = plane, offset, size, tile


def check_supported(head: Cmp1) -> None:
    """Raise with the reason when this reader cannot decode the sensor data CMP1 describes."""

    # Version 0x100 with wavelet levels is the older C-RAW (EOS R100, raw.pixls.us, 2026-11-18): one fixed
    # step per subband instead of a QP grid (cr3_wavelet's old-style headers).
    if not (head.version in (0x100, 0x200) and 0 <= head.levels <= 3) or (head.version == 0x200 and not head.levels):
        raise rd.DevelopError(
            f"CR3: codec version {head.version:#x} with {head.levels} wavelet levels is not supported; convert to DNG "
            "with Adobe's free DNG Converter"
        )
    if head.planes != 4 or head.enc_type != 0:
        raise rd.DevelopError(f"CR3: {head.planes} planes with encoding type {head.enc_type} is not supported (only 4-plane Bayer)")
    if head.tile_width != head.width or head.tile_height != head.height:
        tile_grid(head)


class Tile:
    """One tile of the sensor, in plane units (half the sensor's width and height for 4-plane Bayer)."""

    __slots__ = ("index", "row", "col", "width", "height")

    def __init__(self, index: int, row: int, col: int, width: int, height: int):
        self.index, self.row, self.col, self.width, self.height = index, row, col, width, height


def tile_grid(head: Cmp1) -> list[Tile]:
    """The tiles CMP1's tile size cuts the planes into, row by row, as LibRaw lays them out (``crx.cpp``).

    Every tile but the last in a row is ``tile_width / 2`` plane sensels wide and the last takes what is left;
    rows likewise. LibRaw refuses a tile (or a remainder) under 22 plane sensels, an odd tile size, a tile larger
    than the sensor, or more than 255 tiles a side, and so does this reader."""

    pw, ph = head.width // 2, head.height // 2
    tw, th = head.tile_width, head.tile_height
    if tw & 1 or th & 1 or tw > head.width or th > head.height or tw // 2 < 0x16 or th // 2 < 0x16:
        raise rd.DevelopError(f"CR3: tile size {tw} x {th} for a {head.width} x {head.height} sensor is not valid")
    tw, th = tw // 2, th // 2
    cols, rows = -(-pw // tw), -(-ph // th)
    if cols > 0xFF or rows > 0xFF or pw - tw * (cols - 1) < 0x16 or ph - th * (rows - 1) < 0x16:
        raise rd.DevelopError(f"CR3: a {cols} x {rows} tile grid leaves an edge tile under 22 sensels; not valid")
    # CMP1's two several-tiles flags are not checked against the grid: the real EOS M200 RAW (raw.pixls.us,
    # 2026-11-18) stores two tiles side by side with both flags 0, and LibRaw reads the grid from the sizes alone
    # (eval/canon-cr3-every-body-2026-11-18.md).
    tiles: list[Tile] = []
    for r in range(rows):
        for c in range(cols):
            tiles.append(Tile(len(tiles), r * th, c * tw, tw if c < cols - 1 else pw - tw * (cols - 1),
                              th if r < rows - 1 else ph - th * (rows - 1)))
    return tiles


def band_layout(sample: bytes, head: Cmp1) -> list[Band]:
    """The planes' bands of a no-wavelet CR3 sample, tile by tile, from its header (tags 0xFF01-0xFF03).

    The header holds, for each tile in turn, a tile header (0xFF01: the tile's byte count and its index), then
    per plane a plane header (0xFF02: its byte count, the plane number in the top four bits of its flags) and
    one subband header (0xFF03). The data follows the header in the same order: tile after tile, and inside a
    tile plane after plane."""

    check_supported(head)
    tiles = tile_grid(head) if (head.tile_width, head.tile_height) != (head.width, head.height) else [
        Tile(0, 0, 0, head.width // 2, head.height // 2)]
    hdr = sample[: head.header_size]
    pos = 0
    tile_at = head.header_size
    bands: list[Band] = []
    for tile in tiles:
        if pos + 12 > len(hdr):
            raise rd.DevelopError("CR3: the sample header ends before the last tile's")
        tag, size, tile_size, number, tail = struct.unpack_from(">HHIHH", hdr, pos)
        if tag != 0xFF01 or size != 8:
            raise rd.DevelopError(f"CR3: tile header tag {tag:#06x}, expected 0xff01")
        if number != tile.index or tail:
            raise rd.DevelopError(f"CR3: tile header {tile.index} names tile {number}")
        pos += 12
        data_at = tile_at
        for plane in range(head.planes):
            if pos + 24 > len(hdr):
                raise rd.DevelopError("CR3: the sample header ends inside a tile's plane headers")
            tag, size, plane_size, pflags = struct.unpack_from(">HHII", hdr, pos)
            if tag != 0xFF02 or size != 8:
                raise rd.DevelopError(f"CR3: plane header tag {tag:#06x}, expected 0xff02")
            if pflags >> 28 != plane:
                raise rd.DevelopError(f"CR3: plane header {plane} of tile {tile.index} names plane {pflags >> 28}")
            if not pflags & 0x08000000:
                raise rd.DevelopError("CR3: a plane without the partial-decoding flag is not supported (no test file)")
            if (pflags >> 25) & 3:
                raise rd.DevelopError("CR3: a plane with rounded bits is not supported (no test file)")
            tag, size, band_size, bflags = struct.unpack_from(">HHII", hdr, pos + 12)
            if tag != 0xFF03 or size != 8:
                raise rd.DevelopError(f"CR3: subband header tag {tag:#06x}, expected 0xff03")
            pos += 24
            bands.append(Band(plane, data_at, band_size - (bflags & 0x7FFFF), tile))
            data_at += plane_size
        tile_at += tile_size
        if data_at > tile_at:
            raise rd.DevelopError(f"CR3: tile {tile.index}'s planes run past its byte count")
    if tile_at > len(sample):
        raise rd.DevelopError("CR3: the tiles run past the end of the sensor sample")
    return bands


def decode_sensor(data: bytes, box: Container, engine: str = "auto") -> tuple[Cmp1, array]:
    """The whole stored sensor, ``width * height`` 16-bit sensels, row-major."""

    head = box.head
    t = box.raw
    if t.offset + t.size > len(data):
        raise rd.DevelopError("CR3: the sensor sample lies outside the file")
    sample = data[t.offset : t.offset + t.size]
    w, h = head.width, head.height
    pw, ph = w // 2, h // 2
    if pw * 2 != w or ph * 2 != h:
        raise rd.DevelopError("CR3: an odd sensor size is not supported")
    lo, hi, mid = -(1 << (head.bits - 1)), (1 << (head.bits - 1)) - 1, 1 << (head.bits - 1)
    out = array("H", bytes(2 * w * h))
    if head.levels:
        check_supported(head)
        from shootflow import cr3_wavelet

        cr3_wavelet.decode_sensor(sample, head, out, engine=engine)
        return head, out
    bands = band_layout(sample, head)
    native = None
    if engine in ("auto", "c"):
        from shootflow import ljpeg_native

        native = ljpeg_native.crx_function()
        if native is None and engine == "c":
            raise rd.DevelopError("CR3: the C decoder is not available")
    for band in bands:
        chunk = sample[band.offset : band.offset + band.size]
        oy, ox = band.plane >> 1, band.plane & 1
        tile = band.tile
        assert tile is not None  # band_layout sets every band's tile
        row0, col0 = 2 * tile.row + oy, 2 * tile.col + ox
        if native is not None:
            first = out.buffer_info()[0] + 2 * (row0 * w + col0)
            if native(chunk, len(chunk), tile.width, tile.height, head.bits, first, 2 * w) < 0:
                raise rd.DevelopError("CR3: the compressed band is invalid")
        else:
            for y, row in enumerate(decode_band(chunk, tile.width, tile.height)):
                base = (row0 + 2 * y) * w + col0
                out[base : base + 2 * tile.width : 2] = array("H", (min(max(v, lo), hi) + mid for v in row))
    return head, out


def camera_model(data: bytes, readable: bool = False) -> str:
    """The camera's name from CMT1; with ``readable``, first refuse a file whose sensor data this reader
    cannot decode (an unknown codec version, a tile grid LibRaw would refuse), so the profile chooser does not ask for a profile it could not use."""

    box = Container(data)
    if readable:
        check_supported(box.head)
    found = _tiff_ifd(box.cmt.get(b"CMT1"))
    if found is None:
        raise rd.DevelopError("CR3: no CMT1 (IFD0) box")
    return cr2.unique_camera_model(found[1])


def _exif(box: Container, note: rd.Ifd | None) -> rd.Ifd | None:
    found = _tiff_ifd(box.cmt.get(b"CMT2"))
    exif = found[1] if found else None
    if exif is not None and exif.get(cr2.TAG_EXIF_LENS_MODEL):
        return exif
    name = bytes(note.get(cr2.TAG_CANON_LENS_MODEL) or b"") if note is not None else b""
    name = name.split(b"\0", 1)[0].strip()
    if not name:
        return exif
    out = rd.Ifd(entries=dict(exif.entries) if exif is not None else {}, byte_order=exif.byte_order if exif else "<")
    out.entries[cr2.TAG_EXIF_LENS_MODEL] = tuple(name) + (0,)
    return out


def _turn(pattern: str, dy: int, dx: int) -> str:
    grid = [list(pattern[0:2]), list(pattern[2:4])]
    if dy:
        grid = grid[::-1]
    if dx:
        grid = [r[::-1] for r in grid]
    return "".join(grid[0] + grid[1])


def _stated_black(cd: tuple | None, bits: int, phase: str) -> list[float] | None:
    """ColorData's PerChannelBlackLevel, stored R, G (on red's rows), G (on blue's), B, laid out on the
    2x2 positions of ``phase`` (the CFA at the crop's origin), or None."""

    if not cd:
        return None
    idx = _BLACK_INDEX_BY_VERSION.get((len(cd), int(cd[0])), _BLACK_INDEX.get(len(cd)))
    if idx is None or idx + 4 > len(cd):
        return None
    r, g_red_row, g_blue_row, b = (float(v) for v in cd[idx : idx + 4])
    if not all(0 < v < (1 << bits) // 2 for v in (r, g_red_row, g_blue_row, b)):
        return None
    red_row = phase.index("R") // 2
    return [
        r if c == "R" else b if c == "B" else (g_red_row if i // 2 == red_row else g_blue_row)
        for i, c in enumerate(phase)
    ]


def parse_cr3(data: bytes, engine: str = "auto") -> rd.RawImage:
    """A CR3's sensor data and DNG-equivalent tags."""

    box = Container(data)
    head, values = decode_sensor(data, box, engine=engine)
    width, height = head.width, head.height
    found = _tiff_ifd(box.cmt.get(b"CMT1"))
    if found is None:
        raise rd.DevelopError("CR3: no CMT1 (IFD0) box")
    reader, ifd0 = found
    note_found = _tiff_ifd(box.cmt.get(b"CMT3"))
    note = note_found[1] if note_found else None
    notes: list[str] = []
    if head.levels and head.tile_height < height:
        notes.append(
            "CR3: C-RAW tiles stacked one above another; the rows at each seam between them follow the seamless 5/3 "
            "rule, which LibRaw 0.22 does not reproduce there (eval/canon-cr3-craw-tiled-2026-11-16.md); no real file "
            "has checked them"
        )
    sensor = note.get(cr2.CANON_SENSOR_INFO) if note is not None else None
    if sensor and len(sensor) >= 9 and 0 <= sensor[5] < sensor[7] < width and 0 <= sensor[6] < sensor[8] < height:
        left, top, right, bottom = int(sensor[5]), int(sensor[6]), int(sensor[7]) + 1, int(sensor[8]) + 1
    else:
        left, top, right, bottom = 0, 0, width, height
        notes.append("no Canon SensorInfo: the whole sensor, masked borders included, is developed")
    ob = left_optical_black(box.raw.iad1, width, height)
    black = black_levels(values, width, ob, top, left, bottom) if ob else None
    if black is None:
        black = cr2._black_levels(values, width, top, left, bottom, right)
        if black is not None:
            notes.append("no IAD1 optical-black rectangle: black from the columns left of the crop")
    measured = black
    if black is None:
        black = [0.0] * 4
        notes.append("no masked columns left of the image: black level 0")

    as_shot = None
    cd = colour_data(data, box)
    if cd:
        idx = _AS_SHOT_INDEX.get(len(cd))
        if idx is not None and idx + 4 <= len(cd):
            r, g1, g2, b = (int(v) for v in cd[idx : idx + 4])
            if min(r, g1, g2, b) > 0:
                g = (g1 + g2) / 2.0
                as_shot = (r / g, 1.0, b / g)
        if as_shot is None:
            notes.append(f"Canon ColorData version with {len(cd)} entries is not known: no as-shot white balance")
    else:
        notes.append("no Canon ColorData in the CTMD track: no as-shot white balance")

    layout = _CFA_LAYOUT.get(head.cfa_layout)
    if layout is None:
        raise rd.DevelopError(f"CR3: CFA layout {head.cfa_layout} is not known")
    phase = _turn(layout, top % 2, left % 2)
    notes.append(f"CR3: CFA {phase} from CMP1's layout {layout} and the crop's parity")

    stated = _stated_black(cd, head.bits, phase)
    if stated is not None:
        if measured is not None and max(abs(a - b) for a, b in zip(measured, stated)) > _BLACK_GAP_NOTE:
            notes.append(
                "CR3: black level " + "/".join(f"{v:g}" for v in stated) + " as ColorData states it; the masked "
                "columns measure " + "/".join(f"{v:g}" for v in measured)
            )
        black = stated
        notes[:] = [n for n in notes if not n.startswith(("no IAD1", "no masked columns"))]

    white, white_note = cr2._white_from_clipping(values, width, top, left, bottom, right, black, head.bits)
    if white_note:
        notes.append(white_note)
    synth = rd.Ifd(byte_order=reader.end)
    synth.entries = {
        rd.TAG_WIDTH: (width,),
        rd.TAG_HEIGHT: (height,),
        rd.TAG_BITS: (head.bits,),
        rd.TAG_SAMPLES: (1,),
        rd.TAG_PHOTOMETRIC: (rd.PHOTOMETRIC_CFA,),
        rd.TAG_CFA_REPEAT: (2, 2),
        rd.TAG_CFA_PATTERN: cr2.PHASES[phase],
        rd.TAG_ACTIVE_AREA: (top, left, bottom, right),
        rd.TAG_BLACK_REPEAT: (2, 2),
        rd.TAG_BLACK_LEVEL: tuple(black),
        rd.TAG_WHITE_LEVEL: (white,),
    }
    if as_shot is not None:
        synth.entries[rd.TAG_AS_SHOT_NEUTRAL] = tuple(1.0 / v for v in as_shot)
    head_ifd = rd.Ifd(entries=dict(ifd0.entries), byte_order=reader.end)
    head_ifd.entries[rd.TAG_UNIQUE_CAMERA_MODEL] = tuple(cr2.unique_camera_model(ifd0).encode("latin-1")) + (0,)
    return rd.RawImage(width, height, 1, values, synth, head_ifd, source="cr3", notes=notes, exif=_exif(box, note),
                         lens_hint=cr2.hint_from_note(note))
