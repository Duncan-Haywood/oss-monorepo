"""Read a Canon CR2 straight into the developer, standard library only.

A CR2 is a TIFF whose fourth IFD holds the whole sensor as one lossless JPEG
(the same SOF3 coding DNG tiles use, decoded by ``raw_develop``). Canon cuts
the sensor into vertical slices before coding (tag 0xC640: ``n`` slices of
``width`` columns, then one of ``last`` columns). What a DNG states in tags, a
CR2 leaves to the reader, and this module finds it as follows:

* **Sensor borders** (the active area): Canon maker note tag 0x00E0
  (SensorInfo), whose left, top, right and bottom border fields bound the
  image area; the rest is masked (optical black) sensels.
* **Black level**: the median of the masked columns left of the image, per
  2x2 colour position (the first and last few masked columns are skipped).
* **White level**: read from the picture when the frame has clipped sensels.
  Canon's raws saturate below the stream's precision on many bodies and ISOs
  (a real 7D frame piles 25,858 green sensels on 12,649 and 12,650, not
  16,383; LibRaw's per-model table says 13,584). When one 2x2 position piles
  at least 64 sensels on its maximum, far more than on the values just below,
  and that maximum is well above black, the lowest such pile is the white
  level. Otherwise the top of the stream's precision (16,383 for 14 bits), as
  before: with nothing clipped the choice does not change the render.
* **As-shot white balance**: maker note tag 0x4001 (ColorData) holds
  ``WB_RGGBLevelsAsShot``; its index depends on the ColorData version, which
  the array's length identifies (layout as documented for ExifTool's Canon
  tags). Unknown versions develop with no white balance and say so.
* **CFA phase**: a CR2 has no CFAPattern tag, and the phase differs between
  bodies. It is read from the picture: on a 12 x 8 grid of cells, the green
  diagonal is the pair of 2x2 positions whose values agree most closely
  (greens see the same light; red and blue do not), and red is told from blue
  by the as-shot white balance (a grey under the shot's light reads raw R/B =
  B gain / R gain, so the brighter of the two is red when the red gain is the
  smaller). When the as-shot balance is too close to neutral for that (a real
  70D frame: red 1,993, blue 1,964), the small RGB thumbnail in IFD 2 decides:
  across the grid, log(p/q) of the two non-green positions correlates with
  the thumbnail's log(R/B) at about +0.99 when p is red and -0.99 when it is
  blue (five real bodies). A correlation under 0.8 either way is unclear, and
  a clear thumbnail that contradicts a clear balance is refused. When the
  tests are unclear the file is refused with a request for ``--cfa``, never
  guessed. (The thumbnail cannot place the green diagonal, which an earlier
  attempt asked of it: on the 5D Mark II it is a differently framed,
  black-level offset picture. Telling red from blue needs only the sign of a
  coarse chroma correlation, which survives the framing.)
* **Colour**: a CR2 carries no colour matrix. Developing one needs a camera
  profile (``.dcp``): Adobe's free DNG Converter installs one per camera
  ("Canon EOS 5D Mark II Adobe Standard.dcp" and so on), and dcamprof and
  RawTherapee write them too. ``raw_develop.develop`` refuses a CR2 without one.

The result is a ``RawImage`` whose ``ifd`` carries DNG-equivalent tags
(ActiveArea, CFAPattern, BlackLevel with a 2x2 repeat, WhiteLevel,
AsShotNeutral) so the develop path is the DNG one, unchanged. sRAW and mRAW
(subsampled CR2) are refused, as are CR3 files (a different container).
"""

from __future__ import annotations

import math
import struct
import sys
from array import array

from shootflow import raw_develop as rd

TAG_EXIF_IFD = 34665
TAG_MAKER_NOTE = 37500
TAG_MAKE = 271
TAG_MODEL = 272
TAG_CR2_SLICES = 0xC640
CANON_SENSOR_INFO = 0x00E0
CANON_COLOR_DATA = 0x4001

# ColorData version by array length -> index of WB_RGGBLevelsAsShot.
# Layout from ExifTool's Canon ColorData tables (ColorData1..ColorData11).
_AS_SHOT_INDEX = {
    582: 0x19,  # ColorData1: 20D, 350D
    653: 0x18,  # ColorData2: 1D Mark II, 1Ds Mark II
    796: 0x3F,  # ColorData3: 1D Mark II N, 5D, 30D, 400D
    # ColorData4: 1D Mark III, 1Ds Mark III, 40D, 450D, 1000D, 5D Mark II, 50D, 500D, 7D, 550D, 1D Mark IV
    674: 0x3F, 692: 0x3F, 702: 0x3F, 1227: 0x3F, 1250: 0x3F, 1251: 0x3F, 1337: 0x3F, 1338: 0x3F, 1346: 0x3F,
    5120: 0x47,  # ColorData5: PowerShot G10 and similar
    1273: 0x3F, 1275: 0x3F,  # ColorData6: 600D, 1100D
    1312: 0x3F, 1313: 0x3F, 1316: 0x3F, 1506: 0x3F,  # ColorData7: 1D X, 5D Mark III, 6D, 60D, 650D, 700D, 70D...
    1560: 0x3F, 1592: 0x3F, 1353: 0x3F, 1602: 0x3F,  # ColorData8: 5DS, 7D Mark II, 750D, 80D...
    1816: 0x47, 1820: 0x47, 1824: 0x47,  # ColorData9: 6D Mark II, 200D, M50...
    2024: 0x55, 3656: 0x55,  # ColorData10: 90D, M6 Mark II...
}

PHASES = {"RGGB": (0, 1, 1, 2), "GRBG": (1, 0, 2, 1), "GBRG": (1, 2, 0, 1), "BGGR": (2, 1, 1, 0)}


def is_cr2(data: bytes) -> bool:
    return len(data) >= 10 and data[:2] in (b"II", b"MM") and data[8:10] == b"CR"


def unique_camera_model(ifd0: rd.Ifd) -> str:
    """The camera's name as a DNG's UniqueCameraModel would give it: Model,
    with Make in front unless Model already starts with it ("Canon EOS 5D Mark II")."""

    make = bytes(ifd0.get(TAG_MAKE) or b"").rstrip(b"\0").decode("latin-1").strip()
    model = bytes(ifd0.get(TAG_MODEL) or b"").rstrip(b"\0").decode("latin-1").strip()
    return model if model.lower().startswith(make.lower()) else f"{make} {model}".strip()


def camera_model(data: bytes) -> str:
    """A CR2's camera name from IFD0 alone, without decoding the sensor."""

    if not is_cr2(data):
        raise rd.DevelopError("not a Canon CR2 (no 'CR' marker after the TIFF header)")
    reader = rd._Reader(data)
    return unique_camera_model(reader.read_ifd(reader.first_ifd_offset())[0])


def _ifd_at(reader: rd._Reader, offset: int) -> rd.Ifd | None:
    try:
        return reader.read_ifd(offset)[0]
    except rd.DevelopError:
        return None


def _maker_note(reader: rd._Reader, ifd0: rd.Ifd) -> rd.Ifd | None:
    """Canon's maker note: a plain IFD whose offsets count from the TIFF header."""

    exif_at = ifd0.one(TAG_EXIF_IFD)
    if not exif_at:
        return None
    data, end = reader.data, reader.end
    if exif_at + 2 > len(data):
        return None
    count = struct.unpack_from(end + "H", data, exif_at)[0]
    for i in range(count):
        pos = exif_at + 2 + 12 * i
        if pos + 12 > len(data):
            return None
        tag, _typ, n, value = struct.unpack_from(end + "HHII", data, pos)
        if tag == TAG_MAKER_NOTE and n > 12:
            return _ifd_at(reader, value)
    return None


def _sof3(stream: bytes) -> tuple[int, list[tuple[int, int]]]:
    """(precision, sampling factors) from the stream's SOF3 header."""

    pos = 2
    while pos + 4 <= len(stream):
        if stream[pos] != 0xFF:
            break
        marker = stream[pos + 1]
        if marker == 0xFF:
            pos += 1
            continue
        length = struct.unpack_from(">H", stream, pos + 2)[0]
        if marker == 0xC3:
            precision, _h, _w, nf = struct.unpack_from(">BHHB", stream, pos + 4)
            body = stream[pos + 4 : pos + 2 + length]
            return precision, [(body[7 + 3 * i] >> 4, body[7 + 3 * i] & 0x0F) for i in range(nf)]
        if marker == 0xDA:
            break
        pos += 2 + length
    raise rd.DevelopError("CR2 sensor stream has no lossless JPEG frame header (SOF3)")


def _unslice(samples, frame_w: int, frame_h: int, nf: int, slices) -> tuple[int, array]:
    """Put Canon's vertical slices back side by side; returns (width, values)."""

    row = frame_w * nf
    if not slices or len(slices) < 3 or slices[0] == 0:
        if not isinstance(samples, array):
            samples = array("H", samples)
        return row, samples[: row * frame_h]
    count, width, last = (int(v) for v in slices[:3])
    widths = [width] * count + [last]
    total = sum(widths)
    if total != row:
        raise rd.DevelopError(f"CR2 slices ({count} x {width} + {last}) do not match the frame width {row}")
    try:
        import numpy as np
    except ImportError:  # pragma: no cover - exercised without numpy
        np = None  # type: ignore[assignment]
    if np is not None:
        flat = np.asarray(samples, dtype=np.uint16)[: total * frame_h]
        out = np.empty((frame_h, total), dtype=np.uint16)
        k = x0 = 0
        for sw in widths:
            out[:, x0 : x0 + sw] = flat[k : k + sw * frame_h].reshape(frame_h, sw)
            k += sw * frame_h
            x0 += sw
        return total, array("H", out.tobytes())
    src = samples if isinstance(samples, array) else array("H", samples)
    out = array("H", bytes(2 * total * frame_h))
    k = x0 = 0
    for sw in widths:
        for y in range(frame_h):
            at = y * total + x0
            out[at : at + sw] = src[k : k + sw]
            k += sw
        x0 += sw
    return total, out


def _median(values: list[int]) -> float:
    values = sorted(values)
    n = len(values)
    if not n:
        return 0.0
    mid = n // 2
    return float(values[mid]) if n % 2 else (values[mid - 1] + values[mid]) / 2.0


def _black_levels(values: array, width: int, top: int, left: int, bottom: int, right: int) -> list[float] | None:
    """Median of the masked left columns per 2x2 position, phase relative to (top, left)."""

    skip = 4
    x0, x1 = skip, left - skip
    if x1 - x0 < 4:
        return None
    step_y = max(1, (bottom - top) // 600) * 2
    out = []
    for py in (0, 1):
        for px in (0, 1):
            picks: list[int] = []
            for y in range(top + py, bottom, step_y):
                base = y * width
                start = x0 + ((left + px - x0) % 2)
                picks.extend(values[base + start : base + x1 : 2])
            out.append(_median(picks))
    return out


def _grid_means(values: array, width: int, top: int, left: int, h: int, w: int, black, gx: int, gy: int):
    """Mean black-subtracted value of each 2x2 position in a gx x gy grid of cells."""

    cells = []
    cw, ch = (w // gx) & ~1, (h // gy) & ~1
    sub = max(2, (min(cw, ch) // 16) & ~1)  # sample every ``sub`` rows/columns, keeping the 2x2 phase
    for j in range(gy):
        for i in range(gx):
            acc = [0.0, 0.0, 0.0, 0.0]
            cnt = 0
            y0, x0 = top + j * ch, left + i * cw
            for y in range(y0, y0 + ch - 1, sub):
                base0 = y * width
                base1 = base0 + width
                for x in range(x0, x0 + cw - 1, sub):
                    acc[0] += values[base0 + x]
                    acc[1] += values[base0 + x + 1]
                    acc[2] += values[base1 + x]
                    acc[3] += values[base1 + x + 1]
                    cnt += 1
            cells.append([max(acc[k] / max(cnt, 1) - black[k], 1e-3) for k in range(4)])
    return cells


def _correlation(a: list[float], b: list[float]) -> float:
    n = len(a)
    if n < 3 or n != len(b):
        return 0.0
    ma, mb = sum(a) / n, sum(b) / n
    sab = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    saa = sum((x - ma) ** 2 for x in a)
    sbb = sum((y - mb) ** 2 for y in b)
    return sab / math.sqrt(saa * sbb) if saa > 0 and sbb > 0 else 0.0


THUMB_CLEAR = 0.8  # |correlation| of the thumbnail chroma test needed to decide


def _phase_from_data(
    cells, as_shot: tuple[float, float, float] | None, thumb_rb: list[float] | None = None
) -> tuple[str | None, str]:
    """Greens: the diagonal whose two positions agree most; red/blue: the as-shot balance, else the thumbnail.

    ``thumb_rb`` is the RGB thumbnail's log(R/B) on the same grid of cells as ``cells``.
    """

    def disagreement(a, b):
        return sum(abs(math.log(c[a] / c[b])) for c in cells) / len(cells)

    main = disagreement(0, 3)  # positions (0,0) and (1,1)
    anti = disagreement(1, 2)  # positions (0,1) and (1,0)
    if min(main, anti) * 1.5 > max(main, anti):
        return None, "green diagonal unclear"
    p, q = (1, 2) if main < anti else (0, 3)

    by_balance: int | None = None  # the position the as-shot balance says is red
    balance_why = "no as-shot balance to tell red from blue"
    if as_shot is not None:
        # A grey under the as-shot light reads raw R/B = (1/R level) / (1/B level).
        want = math.log(as_shot[2] / as_shot[0])
        mean_p = sum(c[p] for c in cells) / len(cells)
        mean_q = sum(c[q] for c in cells) / len(cells)
        have = math.log(mean_p / mean_q)
        if abs(want) >= 0.15:
            by_balance = p if (have > 0) == (want > 0) else q
        else:
            balance_why = "as-shot balance too close to neutral to tell red from blue"

    by_thumb: int | None = None
    corr = 0.0
    if thumb_rb is not None and len(thumb_rb) == len(cells):
        corr = _correlation([math.log(c[p] / c[q]) for c in cells], thumb_rb)
        if abs(corr) >= THUMB_CLEAR:
            by_thumb = p if corr > 0 else q

    if by_balance is not None and by_thumb is not None and by_balance != by_thumb:
        return None, f"as-shot balance and thumbnail colour disagree on red (thumbnail correlation {corr:+.2f})"
    if by_balance is not None:
        red, method = by_balance, "green diagonal and as-shot balance"
    elif by_thumb is not None:
        red, method = by_thumb, f"green diagonal and thumbnail colour (correlation {corr:+.2f})"
    else:
        why = balance_why if thumb_rb is None else f"{balance_why}; thumbnail colour unclear (correlation {corr:+.2f})"
        return None, why
    blue = q if red == p else p
    pat = [1, 1, 1, 1]
    pat[red], pat[blue] = 0, 2
    for name, ref in PHASES.items():
        if tuple(pat) == ref:
            return name, method
    return None, "no Bayer phase fits"  # pragma: no cover


def _thumbnail_rb(data: bytes, reader: rd._Reader, ifds: list[rd.Ifd], black: float, gx: int, gy: int) -> list[float] | None:
    """log(R/B) of the uncompressed RGB thumbnail (IFD 2 in a CR2) on a gx x gy grid, or None.

    A 16-bit thumbnail carries the sensor's black level (about 1,024 or 2,048), so ``black``
    (the raw's mean black) is taken off; an 8-bit one is already a picture. Older bodies (the
    350D) tag the plain 8-bit strip with compression 6; it is read when its size is exactly
    width x height x 3 bytes.
    """

    for ifd in ifds[1:]:
        w, h = ifd.one(rd.TAG_WIDTH), ifd.one(rd.TAG_HEIGHT)
        bits = tuple(int(b) for b in (ifd.get(rd.TAG_BITS) or ()))
        depth = bits[0] if len(bits) == 3 else 0
        if (
            not w
            or not h
            or ifd.one(rd.TAG_COMPRESSION) not in (1, 6)
            or ifd.one(rd.TAG_PHOTOMETRIC) != 2
            or ifd.one(rd.TAG_SAMPLES) != 3
            or depth not in (8, 16)
            or any(b != depth for b in bits)
            or w < gx * 4
            or h < gy * 4
            or w > 2048
        ):
            continue
        at, size = ifd.one(rd.TAG_STRIP_OFFSETS), ifd.one(rd.TAG_STRIP_BYTES)
        need = w * h * 3 * (depth // 8)
        if at is None or size is None or size < need or at + need > len(data):
            continue
        if ifd.one(rd.TAG_COMPRESSION) == 6 and size != need:
            continue  # older bodies (350D) tag the plain RGB strip as JPEG; trust it only at the exact size
        if depth == 16:
            px = array("H", data[at : at + need])
            if (reader.end == ">") != (sys.byteorder == "big"):
                px.byteswap()
            off = black
        else:
            px = array("B", data[at : at + need])
            off = 0.0
        out: list[float] = []
        for j in range(gy):
            for i in range(gx):
                sr = sb = 0.0
                n = 0
                for y in range(j * h // gy, (j + 1) * h // gy):
                    base = y * w * 3
                    x0, x1 = i * w // gx, (i + 1) * w // gx
                    row = px[base + 3 * x0 : base + 3 * x1]
                    sr += sum(row[0::3])
                    sb += sum(row[2::3])
                    n += x1 - x0
                r, b = sr / n - off, sb / n - off
                out.append(math.log(max(r, 1e-3) / max(b, 1e-3)))
        return out
    return None


CLIP_MIN_SENSELS = 64  # sensels piled on one value before it is read as the clip level
CLIP_WINDOW = 8  # values just below the maximum that a pile must stand out from


def _white_from_clipping(
    values: array, width: int, top: int, left: int, bottom: int, right: int, black: list[float], precision: int
) -> tuple[float, str | None]:
    """The clip level when the frame has clipped sensels, else the stream's full scale.

    For each 2x2 position: its maximum ``m`` in the image area, how many sensels sit on ``m``,
    and how many on the ``CLIP_WINDOW`` values below. A pile (at least ``CLIP_MIN_SENSELS`` on ``m`` and 8
    times the average of the values just below) well above black is clipping, and the lowest
    such ``m`` is the white level.
    """

    full = float((1 << precision) - 1)
    try:
        import numpy as np
    except ImportError:  # pragma: no cover - exercised without numpy
        np = None  # type: ignore[assignment]
    piles: list[tuple[int, int]] = []
    for py in (0, 1):
        for px in (0, 1):
            if np is not None:
                img = np.frombuffer(values, dtype=np.uint16).reshape(-1, width)
                sub = img[top + py : bottom : 2, left + px : right : 2]
                if not sub.size:
                    continue
                m = int(sub.max())
                lo = max(0, m - CLIP_WINDOW)
                hist = np.bincount(sub[sub >= lo].ravel() - lo, minlength=m - lo + 1)
                at_m, below = int(hist[-1]), int(hist[:-1].sum())
            else:
                rows = [values[y * width + left + px : y * width + right : 2] for y in range(top + py, bottom, 2)]
                if not rows:
                    continue
                m = max(max(r) for r in rows if len(r))
                at_m = sum(r.count(m) for r in rows)
                # Most frames have no pile: skip counting the values below.
                below = sum(r.count(v) for r in rows for v in range(max(0, m - CLIP_WINDOW), m)) if at_m >= CLIP_MIN_SENSELS else 0
            span = max(1, min(CLIP_WINDOW, m))
            floor = black[py * 2 + px] + 0.25 * (full - black[py * 2 + px])
            if at_m >= CLIP_MIN_SENSELS and at_m >= 8 * (below / span) and m > floor:
                piles.append((m, at_m))
    if not piles:
        return full, None
    m, n = min(piles)
    if m >= full:
        return full, None
    total = sum(k for _v, k in piles)
    return float(m), f"white level {m} from clipped sensels ({total:,} piled at the clip; stream full scale {int(full)})"


def parse_cr2(data: bytes, cfa: str | None = None) -> rd.RawImage:
    """A CR2's sensor data and DNG-equivalent tags; ``cfa`` forces the 2x2 phase."""

    if not is_cr2(data):
        raise rd.DevelopError("not a Canon CR2 (no 'CR' marker after the TIFF header)")
    reader = rd._Reader(data)
    ifds: list[rd.Ifd] = []
    offset = reader.first_ifd_offset()
    while offset and len(ifds) < 8:
        ifd, offset = reader.read_ifd(offset)
        ifds.append(ifd)
    raw_ifd = next((i for i in ifds if i.one(rd.TAG_COMPRESSION) == 6 and i.get(TAG_CR2_SLICES) is not None), None)
    if raw_ifd is None and len(ifds) >= 4 and ifds[3].one(rd.TAG_COMPRESSION) == 6:
        raw_ifd = ifds[3]
    if raw_ifd is None:
        raise rd.DevelopError("no CR2 raw IFD (a lossless JPEG with Canon's slices tag)")
    at, size = raw_ifd.one(rd.TAG_STRIP_OFFSETS), raw_ifd.one(rd.TAG_STRIP_BYTES)
    if at is None or size is None or at + size > len(data):
        raise rd.DevelopError("CR2 raw strip lies outside the file")
    stream = data[at : at + size]
    precision, sampling = _sof3(stream)
    if any(f != (1, 1) for f in sampling):
        raise rd.DevelopError("sRAW/mRAW (subsampled CR2) is not supported; shoot full RAW or convert to DNG")
    fw, fh, nf, samples = rd._decode_lossless_jpeg(stream)
    width, values = _unslice(samples, fw, fh, nf, raw_ifd.get(TAG_CR2_SLICES))
    height = fh
    del samples

    ifd0 = ifds[0]
    notes: list[str] = []
    mn = _maker_note(reader, ifd0)
    sensor = mn.get(CANON_SENSOR_INFO) if mn is not None else None
    if sensor and len(sensor) >= 9 and 0 <= sensor[5] < sensor[7] < width and 0 <= sensor[6] < sensor[8] < height:
        left, top, right, bottom = int(sensor[5]), int(sensor[6]), int(sensor[7]) + 1, int(sensor[8]) + 1
    else:
        left, top, right, bottom = 0, 0, width, height
        notes.append("no Canon SensorInfo: the whole sensor, masked borders included, is developed")
    black = _black_levels(values, width, top, left, bottom, right)
    if black is None:
        black = [0.0] * 4
        notes.append("no masked columns left of the image: black level 0")

    as_shot = None
    cd = mn.get(CANON_COLOR_DATA) if mn is not None else None
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
        notes.append("no Canon ColorData: no as-shot white balance")

    phase: str | None
    if cfa is not None:
        if cfa.upper() not in PHASES:
            raise rd.DevelopError(f"CFA phase must be one of {', '.join(PHASES)}")
        phase, method = cfa.upper(), "given"
    else:
        gx, gy = 12, 8
        cells = _grid_means(values, width, top, left, bottom - top, right - left, black, gx, gy)
        thumb = _thumbnail_rb(data, reader, ifds, sum(black) / 4.0, gx, gy)
        phase, method = _phase_from_data(cells, as_shot, thumb)
        if phase is None:
            raise rd.DevelopError(f"could not tell this CR2's CFA phase ({method}); pass it with --cfa RGGB|GRBG|GBRG|BGGR")
    assert phase is not None
    notes.append(f"CR2: CFA {phase} from {method}")

    unique = unique_camera_model(ifd0)
    white, white_note = _white_from_clipping(values, width, top, left, bottom, right, black, precision)
    if white_note:
        notes.append(white_note)
    synth = rd.Ifd(byte_order=reader.end)
    synth.entries = {
        rd.TAG_WIDTH: (width,),
        rd.TAG_HEIGHT: (height,),
        rd.TAG_BITS: (precision,),
        rd.TAG_SAMPLES: (1,),
        rd.TAG_PHOTOMETRIC: (rd.PHOTOMETRIC_CFA,),
        rd.TAG_CFA_REPEAT: (2, 2),
        rd.TAG_CFA_PATTERN: PHASES[phase],
        rd.TAG_ACTIVE_AREA: (top, left, bottom, right),
        rd.TAG_BLACK_REPEAT: (2, 2),
        rd.TAG_BLACK_LEVEL: tuple(black),
        rd.TAG_WHITE_LEVEL: (white,),
    }
    if as_shot is not None:
        synth.entries[rd.TAG_AS_SHOT_NEUTRAL] = tuple(1.0 / v for v in as_shot)
    head = rd.Ifd(entries=dict(ifd0.entries), byte_order=reader.end)
    head.entries[rd.TAG_UNIQUE_CAMERA_MODEL] = tuple(unique.encode("latin-1")) + (0,)
    return rd.RawImage(width, height, 1, values, synth, head, source="cr2", notes=notes)
