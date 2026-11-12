"""DNG opcode lists: read them all, run ``GainMap`` and ``WarpRectilinear``, name the rest.

DNG 1.3 added three opcode lists, each a tag holding a big-endian byte blob:
``OpcodeList1`` (51008) runs on the raw values as stored, ``OpcodeList2``
(51009) after they are mapped to linear values (black subtracted, scaled to
0..1, cropped to the active area) and ``OpcodeList3`` (51022) after demosaic.
Each opcode has an id, a DNG version, flags (bit 0: optional, so a reader may
skip it; bit 1: preview only) and a parameter block.

Phones are the reason this matters. Android's camera API writes the lens
shading map it measured into ``OpcodeList2`` as four ``GainMap`` opcodes, one
per Bayer position, and leaves the sensor data uncorrected, so a reader that
ignores them shows the dark, often tinted corners the phone's own JPEG never
has. ``GainMap`` (opcode 9) is run here, and so is ``WarpRectilinear``
(opcode 1, lens distortion and lateral colour in ``OpcodeList3``, as cameras
with corrected lenses write it: the Leica T marks it required). Every other
opcode is named in the report and left undone.

GainMap, as the DNG specification (1.4, chapter 7) and Adobe's DNG SDK
(``dng_gain_map_interpolator``) define it, in the stage-2 image (the active
area, ``h`` x ``w``):

* the opcode applies to rows ``top <= y < bottom`` stepping ``row_pitch``,
  columns ``left <= x < right`` stepping ``col_pitch``, planes ``plane`` ..
  ``plane + planes - 1``;
* the map is ``points_v`` x ``points_h`` gains (``map_planes`` per point,
  float32), placed in relative image coordinates: point (i, j) at
  ``origin_v + i * spacing_v`` of the image height, ``origin_h + j * spacing_h``
  of its width. A pixel at row ``y`` sits at index
  ``(y / h - origin_v) / spacing_v``, clamped to the map's first and last
  point, and its gain is the bilinear blend of the four nearest points (rows
  first, then columns);
* the value becomes ``min(value * gain, 1)``.

The SDK interpolates in float32; this module uses float64 throughout, and the
pure-Python and numpy paths repeat the same operations in the same order, so
both engines give the same bytes.

WarpRectilinear (DNG specification 1.4, chapter 7), in the stage-3 image (after
demosaic, ``w`` x ``h``, still linear):

* the parameters are a plane count ``n`` and, per plane, the radial terms
  ``kr0..kr3`` and tangential terms ``kt0, kt1`` (float64), then the optical
  centre ``(cx, cy)`` as fractions of the image width and height; a plane past
  ``n`` uses the last plane's terms;
* for each output pixel, ``(dx, dy)`` is its offset from the optical centre
  divided by the distance from the centre to the farthest image corner, so
  ``r = 1`` there; ``r2 = dx*dx + dy*dy`` and
  ``f = kr0 + kr1 r2 + kr2 r2^2 + kr3 r2^3``;
* the pixel takes its value from the source point
  ``centre + m * (f dx + kt0 2 dx dy + kt1 (r2 + 2 dx^2),
  f dy + kt1 2 dx dy + kt0 (r2 + 2 dy^2))`` (``m`` the corner distance):
  the opcode maps the corrected image back into the distorted one.

Choices the specification leaves open, made here and named so a later check
against Adobe's output can find them: pixel ``x`` sits at ``x + 0.5`` (pixel
centres, the image spanning ``0..w``); the source is sampled bilinearly (the
SDK uses a wider resampling kernel); a source point outside the image takes the
nearest edge pixel.
"""

from __future__ import annotations

import struct
import math
from dataclasses import dataclass, field

TAG_OPCODE_LIST_1 = 51008
TAG_OPCODE_LIST_2 = 51009
TAG_OPCODE_LIST_3 = 51022

OPCODE_NAMES = {
    1: "WarpRectilinear",
    2: "WarpFisheye",
    3: "FixVignetteRadial",
    4: "FixBadPixelsConstant",
    5: "FixBadPixelsList",
    6: "TrimBounds",
    7: "MapTable",
    8: "MapPolynomial",
    9: "GainMap",
    10: "DeltaPerRow",
    11: "DeltaPerColumn",
    12: "ScalePerRow",
    13: "ScalePerColumn",
    14: "WarpRectilinear2",
}

GAIN_MAP = 9
WARP_RECTILINEAR = 1


class OpcodeError(ValueError):
    pass


@dataclass(frozen=True)
class Opcode:
    id: int
    version: int
    flags: int
    params: bytes

    @property
    def name(self) -> str:
        return OPCODE_NAMES.get(self.id, f"opcode {self.id}")

    @property
    def optional(self) -> bool:
        return bool(self.flags & 1)

    @property
    def preview_only(self) -> bool:
        return bool(self.flags & 2)


@dataclass(frozen=True)
class GainMap:
    top: int
    left: int
    bottom: int
    right: int
    plane: int
    planes: int
    row_pitch: int
    col_pitch: int
    points_v: int
    points_h: int
    spacing_v: float
    spacing_h: float
    origin_v: float
    origin_h: float
    map_planes: int
    gains: tuple[float, ...]  # points_v * points_h * map_planes, row-major, planes innermost

    def gain(self, i: int, j: int, p: int) -> float:
        return self.gains[(i * self.points_h + j) * self.map_planes + min(p, self.map_planes - 1)]


@dataclass(frozen=True)
class WarpRectilinear:
    terms: tuple[tuple[float, float, float, float, float, float], ...]  # per plane: kr0..kr3, kt0, kt1
    cx: float
    cy: float

    def plane_terms(self, p: int) -> tuple[float, float, float, float, float, float]:
        return self.terms[min(p, len(self.terms) - 1)]


def parse_warp_rectilinear(op: Opcode) -> WarpRectilinear:
    p = op.params
    if len(p) < 4:
        raise OpcodeError("WarpRectilinear parameters shorter than their plane count")
    (n,) = struct.unpack_from(">I", p, 0)
    if n < 1:
        raise OpcodeError("WarpRectilinear with no planes")
    if len(p) < 4 + 48 * n + 16:
        raise OpcodeError(f"WarpRectilinear holds fewer than its {n} planes of terms and a centre")
    terms = tuple(struct.unpack_from(">6d", p, 4 + 48 * i) for i in range(n))
    cx, cy = struct.unpack_from(">2d", p, 4 + 48 * n)
    if not all(v == v and abs(v) < 1e6 for t in terms for v in t) or not (0.0 <= cx <= 1.0 and 0.0 <= cy <= 1.0):
        raise OpcodeError("WarpRectilinear with terms out of range")
    return WarpRectilinear(terms, cx, cy)


def parse_list(blob) -> list[Opcode]:
    """The opcodes in one opcode-list tag (raw bytes, or the reader's tuple of byte values)."""

    data = bytes(blob)
    if len(data) < 4:
        raise OpcodeError("opcode list shorter than its count")
    (count,) = struct.unpack_from(">I", data, 0)
    pos, out = 4, []
    for _ in range(count):
        if pos + 16 > len(data):
            raise OpcodeError("opcode list ends inside an opcode header")
        oid, ver, flags, size = struct.unpack_from(">IIII", data, pos)
        pos += 16
        if pos + size > len(data):
            raise OpcodeError(f"{OPCODE_NAMES.get(oid, oid)}: parameters run past the end of the list")
        out.append(Opcode(oid, ver, flags, data[pos : pos + size]))
        pos += size
    return out


def parse_gain_map(op: Opcode) -> GainMap:
    p = op.params
    if len(p) < 76:
        raise OpcodeError("GainMap parameters shorter than 76 bytes")
    top, left, bottom, right, plane, planes, rp, cp, pv, ph = struct.unpack_from(">10I", p, 0)
    sv, sh, ov, oh = struct.unpack_from(">4d", p, 40)
    (mp,) = struct.unpack_from(">I", p, 72)
    n = pv * ph * mp
    if pv < 1 or ph < 1 or mp < 1:
        raise OpcodeError("GainMap with no map points")
    if len(p) < 76 + 4 * n:
        raise OpcodeError(f"GainMap holds fewer than its {n} gains")
    if rp < 1 or cp < 1 or bottom <= top or right <= left:
        raise OpcodeError("GainMap with an empty area or zero pitch")
    if (pv > 1 and sv <= 0) or (ph > 1 and sh <= 0):
        raise OpcodeError("GainMap with a non-positive map spacing")
    gains = struct.unpack_from(f">{n}f", p, 76)
    return GainMap(top, left, bottom, right, plane, planes, rp, cp, pv, ph, sv, sh, ov, oh, mp, tuple(gains))


def _index(f: float, points: int) -> tuple[int, int, float]:
    """Map index ``f`` to the two points either side and the fraction between them (SDK rules)."""

    if f <= 0.0:
        return 0, 0, 0.0
    if f >= points - 1:
        return points - 1, points - 1, 0.0
    i = int(f)
    return i, i + 1, f - i


def _axis_index(pos: int, size: int, origin: float, spacing: float, points: int) -> tuple[int, int, float]:
    if points == 1:
        return 0, 0, 0.0
    return _index((pos * (1.0 / size) - origin) / spacing, points)


@dataclass
class Plan:
    """What a raw image's opcode lists hold, and the gain maps this module will run."""

    gain_maps: list[GainMap]
    notes: list[str]
    warps: list[WarpRectilinear] = field(default_factory=list)

    def __bool__(self) -> bool:
        return bool(self.gain_maps or self.warps)


def plan(ifd, ifd0, cfa: bool = True) -> Plan:
    """Read the three opcode lists from the raw IFD (or IFD0) and decide what runs.

    ``GainMap`` in ``OpcodeList2`` on CFA data runs, and ``WarpRectilinear`` in
    ``OpcodeList3`` (on any image: it runs after demosaic). Everything else is
    named in the notes, and a required (non-optional) opcode left undone says
    so, since the DNG specification expects a reader to run it.
    """

    gain_maps: list[GainMap] = []
    warps: list[WarpRectilinear] = []
    notes: list[str] = []
    for tag, label in (
        (TAG_OPCODE_LIST_1, "OpcodeList1"),
        (TAG_OPCODE_LIST_2, "OpcodeList2"),
        (TAG_OPCODE_LIST_3, "OpcodeList3"),
    ):
        blob = ifd.get(tag) or ifd0.get(tag)
        if not blob:
            continue
        try:
            ops = parse_list(blob)
        except OpcodeError as exc:
            notes.append(f"{label} unreadable and skipped: {exc}")
            continue
        skipped: dict[str, int] = {}
        for op in ops:
            if op.preview_only:
                continue
            if tag == TAG_OPCODE_LIST_2 and op.id == GAIN_MAP and cfa:
                try:
                    gm = parse_gain_map(op)
                except OpcodeError as exc:
                    notes.append(f"{label} GainMap unreadable and skipped: {exc}")
                    continue
                gain_maps.append(gm)
                continue
            if tag == TAG_OPCODE_LIST_3 and op.id == WARP_RECTILINEAR:
                try:
                    warps.append(parse_warp_rectilinear(op))
                except OpcodeError as exc:
                    notes.append(f"{label} WarpRectilinear unreadable and skipped: {exc}")
                continue
            key = op.name + ("" if op.optional else " (required)")
            skipped[key] = skipped.get(key, 0) + 1
        for key, n in skipped.items():
            notes.append(f"{label}: {n} x {key} not applied")
    if gain_maps:
        notes.append(f"OpcodeList2: {len(gain_maps)} GainMap applied (lens shading)")
    if warps:
        notes.append(f"OpcodeList3: {len(warps)} WarpRectilinear applied (lens distortion)")
    return Plan(gain_maps, notes, warps)


def _row_entries(gm: GainMap, y: int, h: int, p: int) -> list[float]:
    """The map interpolated down to row ``y``: one value per map column (rows first)."""

    i1, i2, rf = _axis_index(y, h, gm.origin_v, gm.spacing_v, gm.points_v)
    return [(1.0 - rf) * gm.gain(i1, j, p) + rf * gm.gain(i2, j, p) for j in range(gm.points_h)]


def _rows_cols(gm: GainMap, h: int, w: int):
    rows = range(max(gm.top, 0), min(gm.bottom, h), gm.row_pitch)
    cols = range(max(gm.left, 0), min(gm.right, w), gm.col_pitch)
    return rows, cols


def apply_row(maps: list[GainMap], y: int, row: list[float], h: int, w: int, spp: int) -> None:
    """Run the gain maps on one normalised active-area row, in place (pure Python)."""

    for gm in maps:
        rows, cols = _rows_cols(gm, h, w)
        if y not in rows:
            continue
        col_idx = [_axis_index(x, w, gm.origin_h, gm.spacing_h, gm.points_h) for x in cols]
        for p in range(gm.plane, min(gm.plane + gm.planes, spp)):
            ent = _row_entries(gm, y, h, p - gm.plane)
            for x, (j1, j2, cf) in zip(cols, col_idx):
                g = (1.0 - cf) * ent[j1] + cf * ent[j2]
                k = x * spp + p
                v = row[k] * g
                row[k] = 1.0 if v > 1.0 else v


def apply_plane(maps: list[GainMap], plane, h: int, w: int, spp: int) -> None:
    """Run the gain maps on the normalised (h, w * spp) float64 plane, in place (numpy)."""

    import numpy as np

    for gm in maps:
        rows, cols = _rows_cols(gm, h, w)
        if not len(rows) or not len(cols):
            continue
        ci = [_axis_index(x, w, gm.origin_h, gm.spacing_h, gm.points_h) for x in cols]
        j1 = np.array([c[0] for c in ci], dtype=np.int64)
        j2 = np.array([c[1] for c in ci], dtype=np.int64)
        cf = np.array([c[2] for c in ci], dtype=np.float64)
        ri = [_axis_index(y, h, gm.origin_v, gm.spacing_v, gm.points_v) for y in rows]
        i1 = np.array([r[0] for r in ri], dtype=np.int64)
        i2 = np.array([r[1] for r in ri], dtype=np.int64)
        rf = np.array([r[2] for r in ri], dtype=np.float64)[:, None]
        ys = np.array(list(rows), dtype=np.int64)
        for p in range(gm.plane, min(gm.plane + gm.planes, spp)):
            q = min(p - gm.plane, gm.map_planes - 1)
            table = np.array(gm.gains, dtype=np.float64).reshape(gm.points_v, gm.points_h, gm.map_planes)[
                ..., q
            ]
            ent = (1.0 - rf) * table[i1] + rf * table[i2]  # (rows, points_h)
            g = (1.0 - cf) * ent[:, j1] + cf * ent[:, j2]
            xs = np.array(list(cols), dtype=np.int64) * spp + p
            sub = plane[ys[:, None], xs[None, :]] * g
            plane[ys[:, None], xs[None, :]] = np.where(sub > 1.0, 1.0, sub)


# --- WarpRectilinear -------------------------------------------------------------------------------------------------


def _warp_frame(wp: WarpRectilinear, w: int, h: int) -> tuple[float, float, float]:
    """Optical centre in pixel units and the distance from it to the farthest corner."""

    cxp, cyp = wp.cx * w, wp.cy * h
    m = max(math.hypot(x - cxp, y - cyp) for x in (0.0, float(w)) for y in (0.0, float(h)))
    return cxp, cyp, (m if m > 0 else 1.0)


def warp_source(wp: WarpRectilinear, p: int, x: float, y: float, w: int, h: int) -> tuple[float, float]:
    """Where output pixel (x, y) of plane p reads from, in pixel-index units (pure Python, the reference)."""

    kr0, kr1, kr2, kr3, kt0, kt1 = wp.plane_terms(p)
    cxp, cyp, m = _warp_frame(wp, w, h)
    dx = (x + 0.5 - cxp) / m
    dy = (y + 0.5 - cyp) / m
    r2 = dx * dx + dy * dy
    f = kr0 + r2 * (kr1 + r2 * (kr2 + r2 * kr3))
    sx = f * dx + kt0 * (2.0 * dx * dy) + kt1 * (r2 + 2.0 * dx * dx)
    sy = f * dy + kt1 * (2.0 * dx * dy) + kt0 * (r2 + 2.0 * dy * dy)
    return cxp + m * sx - 0.5, cyp + m * sy - 0.5


def _clamp_split(v: float, n: int) -> tuple[int, int, float]:
    if v <= 0.0:
        return 0, 0, 0.0
    if v >= n - 1:
        return n - 1, n - 1, 0.0
    i = int(v)
    return i, i + 1, v - i


def warp_rgb(warps: list[WarpRectilinear], rgb, w: int, h: int):
    """Run the warps on an interleaved linear RGB image (``array('d')``, h * w * 3); returns a new array (pure Python)."""

    from array import array

    for wp in warps:
        out = array("d", bytes(8 * len(rgb)))
        for p in range(3):
            for y in range(h):
                base = y * w
                for x in range(w):
                    sx, sy = warp_source(wp, p, x, y, w, h)
                    x0, x1, fx = _clamp_split(sx, w)
                    y0, y1, fy = _clamp_split(sy, h)
                    a = rgb[(y0 * w + x0) * 3 + p]
                    b = rgb[(y0 * w + x1) * 3 + p]
                    c = rgb[(y1 * w + x0) * 3 + p]
                    d = rgb[(y1 * w + x1) * 3 + p]
                    out[(base + x) * 3 + p] = (1.0 - fy) * ((1.0 - fx) * a + fx * b) + fy * ((1.0 - fx) * c + fx * d)
        rgb = out
    return rgb


def warp_planes(warps: list[WarpRectilinear], img, band: int = 256):
    """Run the warps on a linear (h, w, 3) float64 image; returns a new array (numpy, same bytes as ``warp_rgb``)."""

    import numpy as np

    h, w = img.shape[0], img.shape[1]
    for wp in warps:
        cxp, cyp, m = _warp_frame(wp, w, h)
        out = np.empty_like(img)
        xs = (np.arange(w, dtype=np.float64) + 0.5 - cxp) / m
        for p in range(3):
            kr0, kr1, kr2, kr3, kt0, kt1 = wp.plane_terms(p)
            src = img[..., p]
            for y0 in range(0, h, band):
                y1 = min(h, y0 + band)
                dy = ((np.arange(y0, y1, dtype=np.float64) + 0.5 - cyp) / m)[:, None]
                dx = xs[None, :]
                r2 = dx * dx + dy * dy
                f = kr0 + r2 * (kr1 + r2 * (kr2 + r2 * kr3))
                sx = f * dx + kt0 * (2.0 * dx * dy) + kt1 * (r2 + 2.0 * dx * dx)
                sy = f * dy + kt1 * (2.0 * dx * dy) + kt0 * (r2 + 2.0 * dy * dy)
                sx = cxp + m * sx - 0.5
                sy = cyp + m * sy - 0.5
                xi0, xi1, fx = _np_split(np, sx, w)
                yi0, yi1, fy = _np_split(np, sy, h)
                a = src[yi0, xi0]
                b = src[yi0, xi1]
                c = src[yi1, xi0]
                d = src[yi1, xi1]
                out[y0:y1, :, p] = (1.0 - fy) * ((1.0 - fx) * a + fx * b) + fy * ((1.0 - fx) * c + fx * d)
        img = out
    return img


def _np_split(np, v, n: int):
    """``_clamp_split`` on an array."""

    lo = v <= 0.0
    hi = v >= n - 1
    edge = lo | hi
    i0 = np.floor(np.clip(v, 0.0, n - 1)).astype(np.int64)  # int(v) for 0 < v < n - 1, as in the pure path
    i1 = np.where(edge, i0, i0 + 1)
    fr = np.where(edge, 0.0, v - i0)
    return i0, i1, fr
