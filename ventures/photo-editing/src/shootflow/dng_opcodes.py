"""DNG opcode lists: read them all; run ``GainMap``, ``WarpRectilinear``, ``FixVignetteRadial``, ``MapPolynomial`` and the two bad-pixel fixes; name the rest.

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
with corrected lenses write it: the Leica T marks it required).
``FixVignetteRadial`` (opcode 3, a radial brightness fall-off) and
``MapPolynomial`` (opcode 8, a tone or linearisation polynomial) run in
``OpcodeList2`` and ``OpcodeList3``, in the order the list gives them.
``FixBadPixelsConstant`` and ``FixBadPixelsList`` (opcodes 4 and 5) run in
``OpcodeList1`` on CFA data, on the stored raw values before anything else
touches them. Every other opcode, and anything else in ``OpcodeList1``, is
named in the report and left undone.

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

FixVignetteRadial (DNG specification 1.4, chapter 7), on every plane of the
stage-2 or stage-3 image:

* the parameters are ``k0..k4`` and the optical centre ``(cx, cy)`` as
  fractions of the image width and height (seven float64);
* ``r`` is a pixel's distance from the centre divided by the distance from the
  centre to the farthest image corner (``r = 1`` there, as for the warp);
* the gain is ``1 + k0 r^2 + k1 r^4 + k2 r^6 + k3 r^8 + k4 r^10`` and the
  value becomes ``min(value * gain, 1)``.

Choices: pixel centres at ``x + 0.5`` (as for the warp); the gain is evaluated
at every pixel in float64, where the SDK builds a fixed-point gain mask on a
coarser grid and interpolates it, so the two can differ in the last few bits.

MapPolynomial (DNG specification 1.4, chapter 7), over an area, planes and
pitches laid out as GainMap's:

* the parameters are ``top, left, bottom, right, plane, planes, row_pitch,
  col_pitch`` (uint32), the degree ``d`` (uint32, at most 8) and ``d + 1``
  float64 coefficients ``c0..cd``;
* the value ``x`` becomes ``c0 + c1 x + ... + cd x^d``, pinned to ``0..1`` (as
  the SDK pins it).

In stage 3 this module holds white-balanced values (``develop`` keeps them that
way for the warp), so each plane is divided by its white-balance scale before
the polynomial and multiplied back after, and the vignette's ``1`` becomes that
scale: the opcodes see the 0..1 camera values the specification describes. An
area given in full-size pixels is clamped to the image, so on a half-size
develop a MapPolynomial with a partial area lands on the wrong rows; cameras
write it over the whole frame.

FixBadPixelsConstant and FixBadPixelsList (DNG specification 1.4, chapter 7),
in ``OpcodeList1``, on the stored CFA image (the whole stored frame, not just
the active area: coordinates and the Bayer phase count from its top-left):

* FixBadPixelsConstant's parameters are ``Constant`` and ``BayerPhase``
  (uint32); every sensel holding exactly ``Constant`` is bad;
* FixBadPixelsList's are ``BayerPhase``, ``BadPointCount``, ``BadRectCount``
  (uint32), then the points as ``(row, column)`` and the rectangles as
  ``(top, left, bottom, right)`` (uint32, bottom and right exclusive); every
  sensel listed is bad;
* ``BayerPhase`` names the colour of the top-left sensel: 0 red, 1 green on a
  red row, 2 green on a blue row, 3 blue. Only green against not-green matters
  for the repair: green sensels sit on one chequerboard parity, red and blue
  each on every other row and column.

A bad sensel becomes the mean of the nearest good sensels of its own colour:
the same-colour sensels at the smallest Chebyshev distance ``d`` (1 to 8) where
at least one is good, bad ones left out, rounded half up to an integer. For
green that is the four diagonal neighbours at ``d = 1``; for red and blue the
eight at ``d = 2`` (two rows or columns away, and the diagonals). Every repair
reads only the original good values, so the order of repairs does not matter.
On a plane ``a + b*row + c*col`` the symmetric ring gives the exact value back,
which is what the tests check. Choices: the SDK's own interpolation weights
(it treats lone pixels and rectangles separately) are not reproduced; a
sensel with no good same-colour neighbour within ``d = 8`` is left as is; and
a FixBadPixelsConstant that would flag more than 1% of the frame is not run
(a frame that dark is under-exposed, not a defect map) and the report says so.
"""

from __future__ import annotations

import math
import struct
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
FIX_VIGNETTE_RADIAL = 3
MAP_POLYNOMIAL = 8
FIX_BAD_PIXELS_CONSTANT = 4
FIX_BAD_PIXELS_LIST = 5

# A FixBadPixelsConstant that matches more than this share of the frame is not run (module docstring).
BAD_CONSTANT_MAX_SHARE = 0.01
# Farthest Chebyshev distance searched for good same-colour neighbours.
BAD_PIXEL_MAX_DISTANCE = 8


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


@dataclass(frozen=True)
class VignetteRadial:
    k: tuple[float, float, float, float, float]
    cx: float
    cy: float


@dataclass(frozen=True)
class MapPolynomial:
    top: int
    left: int
    bottom: int
    right: int
    plane: int
    planes: int
    row_pitch: int
    col_pitch: int
    coeffs: tuple[float, ...]  # c0..cd


@dataclass(frozen=True)
class BadPixelsConstant:
    constant: int
    bayer_phase: int


@dataclass(frozen=True)
class BadPixelsList:
    bayer_phase: int
    points: tuple[tuple[int, int], ...]  # (row, column)
    rects: tuple[tuple[int, int, int, int], ...]  # (top, left, bottom, right), bottom and right exclusive


def parse_bad_pixels_constant(op: Opcode) -> BadPixelsConstant:
    p = op.params
    if len(p) < 8:
        raise OpcodeError("FixBadPixelsConstant parameters shorter than 8 bytes")
    constant, phase = struct.unpack_from(">2I", p, 0)
    if phase > 3:
        raise OpcodeError(f"FixBadPixelsConstant with Bayer phase {phase} (0 to 3)")
    return BadPixelsConstant(constant, phase)


def parse_bad_pixels_list(op: Opcode) -> BadPixelsList:
    p = op.params
    if len(p) < 12:
        raise OpcodeError("FixBadPixelsList parameters shorter than 12 bytes")
    phase, npts, nrects = struct.unpack_from(">3I", p, 0)
    if phase > 3:
        raise OpcodeError(f"FixBadPixelsList with Bayer phase {phase} (0 to 3)")
    if len(p) < 12 + 8 * npts + 16 * nrects:
        raise OpcodeError(f"FixBadPixelsList holds fewer than its {npts} points and {nrects} rectangles")
    flat = struct.unpack_from(f">{2 * npts}I", p, 12)
    points = tuple((flat[2 * i], flat[2 * i + 1]) for i in range(npts))
    flat = struct.unpack_from(f">{4 * nrects}I", p, 12 + 8 * npts)
    rects = tuple(tuple(flat[4 * i : 4 * i + 4]) for i in range(nrects))
    if any(b <= t or r <= lf for t, lf, b, r in rects):
        raise OpcodeError("FixBadPixelsList with an empty rectangle")
    return BadPixelsList(phase, points, rects)


def parse_vignette_radial(op: Opcode) -> VignetteRadial:
    p = op.params
    if len(p) < 56:
        raise OpcodeError("FixVignetteRadial parameters shorter than 56 bytes")
    vals = struct.unpack_from(">7d", p, 0)
    k, cx, cy = vals[:5], vals[5], vals[6]
    if not all(math.isfinite(v) and abs(v) < 1e6 for v in k) or not (0.0 <= cx <= 1.0 and 0.0 <= cy <= 1.0):
        raise OpcodeError("FixVignetteRadial with terms out of range")
    return VignetteRadial(tuple(k), cx, cy)


def parse_map_polynomial(op: Opcode) -> MapPolynomial:
    p = op.params
    if len(p) < 36:
        raise OpcodeError("MapPolynomial parameters shorter than 36 bytes")
    top, left, bottom, right, plane, planes, rp, cp, degree = struct.unpack_from(">9I", p, 0)
    if degree > 8:
        raise OpcodeError(f"MapPolynomial of degree {degree} (at most 8)")
    if len(p) < 36 + 8 * (degree + 1):
        raise OpcodeError(f"MapPolynomial holds fewer than its {degree + 1} coefficients")
    if rp < 1 or cp < 1 or bottom <= top or right <= left or planes < 1:
        raise OpcodeError("MapPolynomial with an empty area or zero pitch")
    coeffs = struct.unpack_from(f">{degree + 1}d", p, 36)
    if not all(math.isfinite(c) and abs(c) < 1e6 for c in coeffs):
        raise OpcodeError("MapPolynomial with coefficients out of range")
    return MapPolynomial(top, left, bottom, right, plane, planes, rp, cp, tuple(coeffs))


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
    if not all(math.isfinite(v) and abs(v) < 1e6 for t in terms for v in t) or not (0.0 <= cx <= 1.0 and 0.0 <= cy <= 1.0):
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
    """What a raw image's opcode lists hold, and the opcodes this module will run.

    ``stage2`` and ``stage3`` are the runnable opcodes of ``OpcodeList2`` and
    ``OpcodeList3`` in list order (what ``apply_row``/``apply_plane`` and
    ``run_stage3_rgb``/``run_stage3_planes`` take); ``gain_maps`` and
    ``warps`` are the GainMap and WarpRectilinear among them.
    """

    gain_maps: list[GainMap]
    notes: list[str]
    warps: list[WarpRectilinear] = field(default_factory=list)
    stage2: list = field(default_factory=list)
    stage3: list = field(default_factory=list)
    stage1: list = field(default_factory=list)  # FixBadPixelsConstant / FixBadPixelsList, for ``run_stage1``

    def __bool__(self) -> bool:
        return bool(self.gain_maps or self.warps or self.stage1 or self.stage2 or self.stage3)


def plan(ifd, ifd0, cfa: bool = True) -> Plan:
    """Read the three opcode lists from the raw IFD (or IFD0) and decide what runs.

    ``GainMap`` in ``OpcodeList2`` on CFA data runs, and ``WarpRectilinear`` in
    ``OpcodeList3`` (on any image: it runs after demosaic). Everything else is
    named in the notes, and a required (non-optional) opcode left undone says
    so, since the DNG specification expects a reader to run it.
    """

    gain_maps: list[GainMap] = []
    warps: list[WarpRectilinear] = []
    stage1: list = []
    stage2: list = []
    stage3: list = []
    applied: list[tuple[str, str]] = []
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
                stage2.append(gm)
                continue
            if tag == TAG_OPCODE_LIST_3 and op.id == WARP_RECTILINEAR:
                try:
                    wp = parse_warp_rectilinear(op)
                except OpcodeError as exc:
                    notes.append(f"{label} WarpRectilinear unreadable and skipped: {exc}")
                    continue
                warps.append(wp)
                stage3.append(wp)
                continue
            if tag == TAG_OPCODE_LIST_1 and op.id in (FIX_BAD_PIXELS_CONSTANT, FIX_BAD_PIXELS_LIST) and cfa:
                parser = parse_bad_pixels_constant if op.id == FIX_BAD_PIXELS_CONSTANT else parse_bad_pixels_list
                try:
                    stage1.append(parser(op))
                except OpcodeError as exc:
                    notes.append(f"{label} {op.name} unreadable and skipped: {exc}")
                continue
            if tag != TAG_OPCODE_LIST_1 and op.id in (FIX_VIGNETTE_RADIAL, MAP_POLYNOMIAL):
                parser = parse_vignette_radial if op.id == FIX_VIGNETTE_RADIAL else parse_map_polynomial
                try:
                    parsed = parser(op)
                except OpcodeError as exc:
                    notes.append(f"{label} {op.name} unreadable and skipped: {exc}")
                    continue
                (stage2 if tag == TAG_OPCODE_LIST_2 else stage3).append(parsed)
                applied.append((label, op.name))
                continue
            key = op.name + ("" if op.optional else " (required)")
            skipped[key] = skipped.get(key, 0) + 1
        for key, n in skipped.items():
            notes.append(f"{label}: {n} x {key} not applied")
    if gain_maps:
        notes.append(f"OpcodeList2: {len(gain_maps)} GainMap applied (lens shading)")
    if warps:
        notes.append(f"OpcodeList3: {len(warps)} WarpRectilinear applied (lens distortion)")
    for (label, name) in dict.fromkeys(applied):
        what = "lens vignetting" if name == "FixVignetteRadial" else "value mapping"
        notes.append(f"{label}: {applied.count((label, name))} {name} applied ({what})")
    return Plan(gain_maps, notes, warps, stage2, stage3, stage1)


# --- FixBadPixelsConstant and FixBadPixelsList ---------------------------------------------------------------------


def _same_colour_ring(green: bool, d: int) -> list[tuple[int, int]]:
    """Offsets at Chebyshev distance ``d`` that land on the same CFA colour."""

    out = []
    for dy in range(-d, d + 1):
        for dx in range(-d, d + 1):
            if max(abs(dy), abs(dx)) != d:
                continue
            if (green and (dy + dx) % 2 == 0) or (not green and dy % 2 == 0 and dx % 2 == 0):
                out.append((dy, dx))
    return out


_RINGS = {g: [_same_colour_ring(g, d) for d in range(1, BAD_PIXEL_MAX_DISTANCE + 1)] for g in (False, True)}


def _green_parity(phase: int) -> int:
    """``(row + col) % 2`` of the green sensels for a DNG Bayer phase."""

    return 1 if phase in (0, 3) else 0


def _constant_hits(vals, constant: int) -> list[int]:
    try:
        import numpy as np
    except ImportError:  # pragma: no cover - the pure path, same answer
        return [i for i, v in enumerate(vals) if v == constant]
    arr = np.frombuffer(vals, dtype=np.uint16 if vals.typecode == "H" else np.uint32)
    return np.flatnonzero(arr == constant).tolist()


def repair_bad_pixels(vals, w: int, h: int, bad: list[int], phase: int) -> tuple[int, int]:
    """Replace each sensel index in ``bad`` with its nearest good same-colour mean, in place.

    Returns (repaired, left as is). ``vals`` is the stored row-major CFA image.
    """

    mask = bytearray(w * h)
    for i in bad:
        mask[i] = 1
    gp = _green_parity(phase)
    fixes: list[tuple[int, int]] = []
    left = 0
    for i in sorted(set(bad)):
        y, x = divmod(i, w)
        rings = _RINGS[(y + x) % 2 == gp]
        for ring in rings:
            tot = n = 0
            for dy, dx in ring:
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w:
                    j = yy * w + xx
                    if not mask[j]:
                        tot += vals[j]
                        n += 1
            if n:
                fixes.append((i, (2 * tot + n) // (2 * n)))
                break
        else:
            left += 1
    for i, v in fixes:
        vals[i] = v
    return len(fixes), left


def run_stage1(ops: list, vals, w: int, h: int, notes: list[str]):
    """Run ``Plan.stage1`` in list order on a copy of the stored CFA values; returns the copy.

    Each opcode's outcome goes into ``notes``.
    """

    from array import array

    out = array(vals.typecode, vals)
    for op in ops:
        if isinstance(op, BadPixelsConstant):
            hits = _constant_hits(out, op.constant)
            if len(hits) > BAD_CONSTANT_MAX_SHARE * w * h:
                notes.append(
                    f"OpcodeList1: FixBadPixelsConstant not run: {len(hits)} sensels hold {op.constant}, "
                    f"over {BAD_CONSTANT_MAX_SHARE:.0%} of the frame"
                )
                continue
            done, left = repair_bad_pixels(out, w, h, hits, op.bayer_phase)
            name = "FixBadPixelsConstant"
        else:
            bad = [r * w + c for r, c in op.points if r < h and c < w]
            for t, lf, b, r in op.rects:
                for y in range(t, min(b, h)):
                    bad.extend(range(y * w + lf, y * w + min(r, w)))
            done, left = repair_bad_pixels(out, w, h, bad, op.bayer_phase)
            name = "FixBadPixelsList"
        msg = f"OpcodeList1: {name} applied ({done} bad sensels repaired"
        notes.append(msg + (f", {left} with no good neighbour left as is)" if left else ")"))
    return out


def _row_entries(gm: GainMap, y: int, h: int, p: int) -> list[float]:
    """The map interpolated down to row ``y``: one value per map column (rows first)."""

    i1, i2, rf = _axis_index(y, h, gm.origin_v, gm.spacing_v, gm.points_v)
    return [(1.0 - rf) * gm.gain(i1, j, p) + rf * gm.gain(i2, j, p) for j in range(gm.points_h)]


def _rows_cols(gm: "GainMap | MapPolynomial", h: int, w: int):
    rows = range(max(gm.top, 0), min(gm.bottom, h), gm.row_pitch)
    cols = range(max(gm.left, 0), min(gm.right, w), gm.col_pitch)
    return rows, cols


def apply_row(maps: list, y: int, row: list[float], h: int, w: int, spp: int) -> None:
    """Run the stage-2 opcodes (``Plan.stage2``) on one normalised active-area row, in place (pure Python)."""

    for gm in maps:
        if isinstance(gm, VignetteRadial):
            _vignette_row(gm, y, row, 0, h, w, spp, None)
            continue
        if isinstance(gm, MapPolynomial):
            _poly_row(gm, y, row, 0, h, w, spp, None)
            continue
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


def apply_plane(maps: list, plane, h: int, w: int, spp: int) -> None:
    """Run the stage-2 opcodes (``Plan.stage2``) on the normalised (h, w * spp) float64 plane, in place (numpy)."""

    import numpy as np

    for gm in maps:
        if isinstance(gm, VignetteRadial):
            _vignette_plane(gm, plane, h, w, spp, None)
            continue
        if isinstance(gm, MapPolynomial):
            _poly_plane(gm, plane, h, w, spp, None)
            continue
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


# --- FixVignetteRadial and MapPolynomial ----------------------------------------------------------------------------
#
# Each runs on a flat buffer of ``h`` rows of ``w * spp`` samples: the stage-2
# row (offset 0) or the interleaved stage-3 RGB image (offset ``y * w * 3``).
# ``scale`` is None in stage 2; in stage 3 it is the per-plane white-balance
# scale the values carry (module docstring). The pure and numpy paths repeat
# the same float64 operations in the same order, so both give the same bytes.


def _vignette_frame(vg: VignetteRadial, w: int, h: int) -> tuple[float, float, float]:
    cxp, cyp = vg.cx * w, vg.cy * h
    m = max(math.hypot(x - cxp, y - cyp) for x in (0.0, float(w)) for y in (0.0, float(h)))
    return cxp, cyp, (m if m > 0 else 1.0)


def vignette_gain(vg: VignetteRadial, x: float, y: float, w: int, h: int) -> float:
    """The FixVignetteRadial gain at pixel (x, y) of a ``w`` x ``h`` image (the reference)."""

    k0, k1, k2, k3, k4 = vg.k
    cxp, cyp, m = _vignette_frame(vg, w, h)
    dx = (x + 0.5 - cxp) / m
    dy = (y + 0.5 - cyp) / m
    r2 = dx * dx + dy * dy
    return 1.0 + r2 * (k0 + r2 * (k1 + r2 * (k2 + r2 * (k3 + r2 * k4))))


def _vignette_row(vg: VignetteRadial, y: int, buf, off: int, h: int, w: int, spp: int, scale) -> None:
    for x in range(w):
        g = vignette_gain(vg, x, y, w, h)
        for p in range(spp):
            k = off + x * spp + p
            cap = 1.0 if scale is None else scale[p]
            v = buf[k] * g
            buf[k] = cap if v > cap else v


def _vignette_plane(vg: VignetteRadial, plane, h: int, w: int, spp: int, scale) -> None:
    import numpy as np

    k0, k1, k2, k3, k4 = vg.k
    cxp, cyp, m = _vignette_frame(vg, w, h)
    dx = ((np.arange(w, dtype=np.float64) + 0.5 - cxp) / m)[None, :]
    dy = ((np.arange(h, dtype=np.float64) + 0.5 - cyp) / m)[:, None]
    r2 = dx * dx + dy * dy
    g = 1.0 + r2 * (k0 + r2 * (k1 + r2 * (k2 + r2 * (k3 + r2 * k4))))
    for p in range(spp):
        cap = 1.0 if scale is None else scale[p]
        v = plane[:, p::spp] * g
        plane[:, p::spp] = np.where(v > cap, cap, v)


def _poly(coeffs: tuple[float, ...], x: float) -> float:
    acc = coeffs[-1]
    for c in reversed(coeffs[:-1]):
        acc = acc * x + c
    return 0.0 if acc < 0.0 else (1.0 if acc > 1.0 else acc)


def _poly_row(mp: MapPolynomial, y: int, buf, off: int, h: int, w: int, spp: int, scale) -> None:
    rows, cols = _rows_cols(mp, h, w)
    if y not in rows:
        return
    for p in range(mp.plane, min(mp.plane + mp.planes, spp)):
        for x in cols:
            k = off + x * spp + p
            if scale is None:
                buf[k] = _poly(mp.coeffs, buf[k])
            else:
                buf[k] = _poly(mp.coeffs, buf[k] / scale[p]) * scale[p]


def _poly_plane(mp: MapPolynomial, plane, h: int, w: int, spp: int, scale) -> None:
    import numpy as np

    rows, cols = _rows_cols(mp, h, w)
    if not len(rows) or not len(cols):
        return
    rsl = slice(rows.start, rows.stop, rows.step)
    for p in range(mp.plane, min(mp.plane + mp.planes, spp)):
        csl = slice(cols.start * spp + p, cols.stop * spp, cols.step * spp)
        v = plane[rsl, csl]
        if scale is not None:
            v = v / scale[p]
        acc = np.full(v.shape, mp.coeffs[-1], dtype=np.float64)
        for c in reversed(mp.coeffs[:-1]):
            acc = acc * v + c
        acc = np.where(acc < 0.0, 0.0, np.where(acc > 1.0, 1.0, acc))
        plane[rsl, csl] = acc if scale is None else acc * scale[p]


def run_stage3_rgb(ops: list, rgb, w: int, h: int, scale=(1.0, 1.0, 1.0)):
    """Run ``Plan.stage3`` in order on interleaved linear RGB (``array('d')``); returns the result (pure Python)."""

    for op in ops:
        if isinstance(op, WarpRectilinear):
            rgb = warp_rgb([op], rgb, w, h)
        elif isinstance(op, VignetteRadial):
            for y in range(h):
                _vignette_row(op, y, rgb, y * w * 3, h, w, 3, scale)
        else:
            for y in range(h):
                _poly_row(op, y, rgb, y * w * 3, h, w, 3, scale)
    return rgb


def run_stage3_planes(ops: list, img, scale=(1.0, 1.0, 1.0)):
    """Run ``Plan.stage3`` in order on a linear (h, w, 3) float64 image; returns the result (numpy, same bytes)."""

    import numpy as np

    h, w = img.shape[0], img.shape[1]
    for op in ops:
        if isinstance(op, WarpRectilinear):
            img = warp_planes([op], img)
            continue
        flat = np.ascontiguousarray(img).reshape(h, w * 3)
        if isinstance(op, VignetteRadial):
            _vignette_plane(op, flat, h, w, 3, scale)
        else:
            _poly_plane(op, flat, h, w, 3, scale)
        img = flat.reshape(h, w, 3)
    return img


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
