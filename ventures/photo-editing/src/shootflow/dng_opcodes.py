"""DNG opcode lists: read them all; run ``GainMap``, the two warps, ``FixVignetteRadial``, ``MapPolynomial``, ``MapTable``, the four per-row and per-column fixes, the two bad-pixel fixes and ``TrimBounds``; name the rest.

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
touches them. ``MapTable`` (opcode 7) and ``DeltaPerRow``, ``DeltaPerColumn``,
``ScalePerRow`` and ``ScalePerColumn`` (opcodes 10 to 13) run in ``OpcodeList2``
and ``OpcodeList3``. Every other opcode, and anything else in ``OpcodeList1``,
is named in the report and left undone.

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
  divided by ``m``, the distance from the centre to the farthest pixel, so
  ``r = 1`` at that pixel's centre (the centre is ``x0 + cx (x1 - x0)`` between
  the top-left and bottom-right pixels, as the specification defines it); ``r2 = dx*dx + dy*dy`` and
  ``f = kr0 + kr1 r2 + kr2 r2^2 + kr3 r2^3``;
* the pixel takes its value from the source point
  ``centre + m * (f dx + kt0 2 dx dy + kt1 (r2 + 2 dx^2),
  f dy + kt1 2 dx dy + kt0 (r2 + 2 dy^2))`` (``m`` the distance to the farthest pixel):
  the opcode maps the corrected image back into the distorted one.

The centre and ``m`` follow the DNG 1.7.1.0 text (read 2026-11-12, pages
106-110): pixel coordinates of the top-left and bottom-right pixels, so
``(0.5, 0.5)`` is the middle pixel and ``m`` reaches the farthest pixel, not the
image corner. Before 2026-11-12 this module measured both from the image edges
(``cx * w``, corner at ``(w, h)``); on the Leica T's terms the two put a source
point at most 0.048 px apart. Choices the specification does leave open, named
so a later check against Adobe's output can find them: the source is sampled
bilinearly (the SDK uses a wider resampling kernel, and the specification
recommends one such as a cubic spline); a source point outside the image takes
the nearest edge pixel.

WarpFisheye (DNG specification 1.4, chapter 7; opcode 2), in the stage-3 image,
unwraps a fisheye lens's equidistant-style projection into a rectilinear one:

* the parameters are a plane count ``n`` and, per plane, the radial terms
  ``kr0..kr3`` (float64), then the optical centre ``(cx, cy)`` as fractions of
  the image width and height; a plane past ``n`` uses the last plane's terms;
* ``(dx, dy)`` and ``r`` are as for WarpRectilinear (``r = 1`` at the farthest
  pixel); ``t = atan(r)`` and ``rd = kr0 t + kr1 t^3 + kr2 t^5 + kr3 t^7``;
* the pixel takes its value from ``centre + m * (rd / r) * (dx, dy)``, and at
  the centre itself (``r = 0``), where ``rd / r`` tends to ``kr0``, from
  ``centre + m * kr0 * (dx, dy)``, which is the centre.

So with ``kr0 = 1`` and the rest zero a pixel at normalised radius ``r`` reads
from radius ``atan(r)``: an ideal equidistant fisheye (image radius
proportional to the angle off axis) becomes a pinhole image (radius
proportional to its tangent). Sampling, pixel centres and the edge are as for
WarpRectilinear, and both warps run through the same resampler.

FixVignetteRadial (DNG specification 1.4, chapter 7), on every plane of the
stage-2 or stage-3 image:

* the parameters are ``k0..k4`` and the optical centre ``(cx, cy)`` as
  fractions of the image width and height (seven float64);
* ``r`` is a pixel's distance from the centre divided by the distance from the
  centre to the farthest pixel (``r = 1`` there; centre and ``m`` as for the
  warp, from the specification's top-left and bottom-right pixels);
* the gain is ``1 + k0 r^2 + k1 r^4 + k2 r^6 + k3 r^8 + k4 r^10`` and the
  value becomes ``min(value * gain, 1)``.

Choices: the gain is evaluated
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

MapTable, DeltaPerRow, DeltaPerColumn, ScalePerRow and ScalePerColumn (DNG
specification 1.4, chapter 7) share MapPolynomial's area, planes and pitches
(``top, left, bottom, right, plane, planes, row_pitch, col_pitch``, uint32),
then:

* MapTable: ``TableSize`` (uint32, 1 to 65536) and that many uint16 entries.
  A 16-bit value ``v`` becomes ``table[min(v, TableSize - 1)]``. This module
  holds values as 0..1 floats, as the DNG SDK does when it converts 16-bit
  data to float (``v / 65535``), so a value ``x`` indexes the table at
  ``floor(x * 65535 + 0.5)`` (``x`` pinned to 0..1 first) and becomes the entry
  over 65535;
* DeltaPerRow / DeltaPerColumn: ``Count`` (uint32) and that many float32
  offsets, one per row (column) of the area in pitch steps; ``Count`` must be
  ``ceil((bottom - top) / row_pitch)`` (``ceil((right - left) / col_pitch)``
  for columns), as the SDK requires. The value becomes ``x + delta`` pinned to
  0..1;
* ScalePerRow / ScalePerColumn: the same layout with float32 scales, and the
  value becomes ``x * scale`` pinned to 0..1.

Row ``y`` of the area takes entry ``(y - top) // row_pitch``, column ``x``
entry ``(x - left) // col_pitch``. In stage 3 the white-balance scale is taken
off and put back as for MapPolynomial. These run nowhere in ``OpcodeList1``:
there the SDK's float view of a raw value is ``value / 65535`` whatever the
white level, a unit no camera file in the evaluation set has been seen to use,
so they stay named and undone there until one is.

TrimBounds (DNG specification 1.4, chapter 7; opcode 6), in ``OpcodeList2`` or
``OpcodeList3``:

* the parameters are ``top, left, bottom, right`` (uint32, bottom and right
  exclusive), in the coordinates of the image as it stands when the opcode
  runs;
* the image is cropped to that rectangle, and its top-left becomes (0, 0): an
  opcode after it in the list sees the smaller image, so its area, its
  relative map positions and a warp's optical centre and ``m`` all
  count from the trimmed frame (Adobe's DNG SDK trims a simple image in place
  and resets its origin, ``dng_simple_image::Trim``);
* the SDK rejects a rectangle that is empty or does not lie inside the image;
  here such a TrimBounds is skipped and the report says so.

The crop does not move pixels while the opcodes run. ``frame_trims`` walks a
list once the image size is known, takes each TrimBounds out and wraps every
opcode after one in a ``Framed`` (the frame's top, left, height and width in
the untrimmed image); ``apply_row``, ``apply_plane`` and ``run_stage3_*`` run a
framed opcode on that sub-image alone, in its own coordinates, and the
developer crops its output to the last frame after encoding. An
``OpcodeList2`` trim is the starting frame of ``OpcodeList3``. Choices, named
for a later check against Adobe's output: the demosaic runs on the whole
active area, so pixels on the edge of an ``OpcodeList2`` trim are interpolated
from neighbours just outside it, where the SDK sees only the trimmed image (a
difference in the outermost pixel or two); on a half-size develop the
rectangle is halved (rounded down); the DefaultCrop, given relative to the
active area, is moved by the trim's top-left and cut to the trimmed image,
and ignored if nothing is left. A TrimBounds in ``OpcodeList1`` (which would
crop the stored frame, Bayer phase and all) is named and left undone.
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
WARP_FISHEYE = 2
FIX_VIGNETTE_RADIAL = 3
MAP_POLYNOMIAL = 8
FIX_BAD_PIXELS_CONSTANT = 4
FIX_BAD_PIXELS_LIST = 5
MAP_TABLE = 7
DELTA_PER_ROW = 10
DELTA_PER_COLUMN = 11
SCALE_PER_ROW = 12
SCALE_PER_COLUMN = 13
TRIM_BOUNDS = 6
PER_LINE_KINDS = {
    DELTA_PER_ROW: ("delta", "row"),
    DELTA_PER_COLUMN: ("delta", "column"),
    SCALE_PER_ROW: ("scale", "row"),
    SCALE_PER_COLUMN: ("scale", "column"),
}

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
class WarpFisheye:
    terms: tuple[tuple[float, float, float, float], ...]  # per plane: kr0..kr3
    cx: float
    cy: float

    def plane_terms(self, p: int) -> tuple[float, float, float, float]:
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
class MapTable:
    top: int
    left: int
    bottom: int
    right: int
    plane: int
    planes: int
    row_pitch: int
    col_pitch: int
    table: tuple[int, ...]  # uint16 entries


@dataclass(frozen=True)
class TrimBounds:
    """Crop the image to ``top <= y < bottom``, ``left <= x < right`` (module docstring)."""

    top: int
    left: int
    bottom: int
    right: int


@dataclass(frozen=True)
class Framed:
    """An opcode that runs after a TrimBounds: on the sub-image ``top .. top + height``, ``left .. left + width`` alone."""

    op: object
    top: int
    left: int
    height: int
    width: int


@dataclass(frozen=True)
class PerLine:
    """DeltaPerRow, DeltaPerColumn, ScalePerRow or ScalePerColumn."""

    top: int
    left: int
    bottom: int
    right: int
    plane: int
    planes: int
    row_pitch: int
    col_pitch: int
    kind: str  # "delta" or "scale"
    axis: str  # "row" or "column"
    values: tuple[float, ...]

    @property
    def name(self) -> str:
        return ("Delta" if self.kind == "delta" else "Scale") + ("PerRow" if self.axis == "row" else "PerColumn")


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


def _parse_area(op: Opcode, name: str) -> tuple[int, ...]:
    p = op.params
    if len(p) < 36:
        raise OpcodeError(f"{name} parameters shorter than 36 bytes")
    top, left, bottom, right, plane, planes, rp, cp, n = struct.unpack_from(">9I", p, 0)
    if rp < 1 or cp < 1 or bottom <= top or right <= left or planes < 1:
        raise OpcodeError(f"{name} with an empty area or zero pitch")
    return top, left, bottom, right, plane, planes, rp, cp, n


def parse_map_table(op: Opcode) -> MapTable:
    top, left, bottom, right, plane, planes, rp, cp, n = _parse_area(op, "MapTable")
    if not 1 <= n <= 65536:
        raise OpcodeError(f"MapTable of {n} entries (1 to 65536)")
    if len(op.params) < 36 + 2 * n:
        raise OpcodeError(f"MapTable holds fewer than its {n} entries")
    table = struct.unpack_from(f">{n}H", op.params, 36)
    return MapTable(top, left, bottom, right, plane, planes, rp, cp, table)


def parse_trim_bounds(op: Opcode) -> TrimBounds:
    if len(op.params) < 16:
        raise OpcodeError("TrimBounds parameters shorter than 16 bytes")
    top, left, bottom, right = struct.unpack_from(">4I", op.params, 0)
    if bottom <= top or right <= left:
        raise OpcodeError(f"TrimBounds with an empty rectangle ({top}, {left}, {bottom}, {right})")
    return TrimBounds(top, left, bottom, right)


def parse_per_line(op: Opcode) -> PerLine:
    kind, axis = PER_LINE_KINDS[op.id]
    top, left, bottom, right, plane, planes, rp, cp, n = _parse_area(op, op.name)
    steps = (bottom - top + rp - 1) // rp if axis == "row" else (right - left + cp - 1) // cp
    if n != steps:
        raise OpcodeError(f"{op.name} with {n} entries for {steps} {axis}s of its area")
    if len(op.params) < 36 + 4 * n:
        raise OpcodeError(f"{op.name} holds fewer than its {n} entries")
    values = struct.unpack_from(f">{n}f", op.params, 36)
    if not all(math.isfinite(v) and abs(v) < 1e6 for v in values):
        raise OpcodeError(f"{op.name} with entries out of range")
    return PerLine(top, left, bottom, right, plane, planes, rp, cp, kind, axis, values)


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


def parse_warp_fisheye(op: Opcode) -> WarpFisheye:
    p = op.params
    if len(p) < 4:
        raise OpcodeError("WarpFisheye parameters shorter than their plane count")
    (n,) = struct.unpack_from(">I", p, 0)
    if n < 1:
        raise OpcodeError("WarpFisheye with no planes")
    if len(p) < 4 + 32 * n + 16:
        raise OpcodeError(f"WarpFisheye holds fewer than its {n} planes of terms and a centre")
    terms = tuple(struct.unpack_from(">4d", p, 4 + 32 * i) for i in range(n))
    cx, cy = struct.unpack_from(">2d", p, 4 + 32 * n)
    if not all(math.isfinite(v) and abs(v) < 1e6 for t in terms for v in t) or not (0.0 <= cx <= 1.0 and 0.0 <= cy <= 1.0):
        raise OpcodeError("WarpFisheye with terms out of range")
    return WarpFisheye(terms, cx, cy)


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
    warps: list[WarpRectilinear | WarpFisheye] = field(default_factory=list)
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
    warps: list[WarpRectilinear | WarpFisheye] = []
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
            if tag == TAG_OPCODE_LIST_3 and op.id in (WARP_RECTILINEAR, WARP_FISHEYE):
                try:
                    wp = parse_warp_rectilinear(op) if op.id == WARP_RECTILINEAR else parse_warp_fisheye(op)
                except OpcodeError as exc:
                    notes.append(f"{label} {op.name} unreadable and skipped: {exc}")
                    continue
                warps.append(wp)
                stage3.append(wp)
                continue
            if tag == TAG_OPCODE_LIST_1 and op.id in (FIX_BAD_PIXELS_CONSTANT, FIX_BAD_PIXELS_LIST) and cfa:
                try:
                    if op.id == FIX_BAD_PIXELS_CONSTANT:
                        stage1.append(parse_bad_pixels_constant(op))
                    else:
                        stage1.append(parse_bad_pixels_list(op))
                except OpcodeError as exc:
                    notes.append(f"{label} {op.name} unreadable and skipped: {exc}")
                continue
            if tag != TAG_OPCODE_LIST_1 and op.id in _STAGE23_PARSERS:
                parser = _STAGE23_PARSERS[op.id]
                try:
                    parsed = parser(op)
                except OpcodeError as exc:
                    notes.append(f"{label} {op.name} unreadable and skipped: {exc}")
                    continue
                (stage2 if tag == TAG_OPCODE_LIST_2 else stage3).append(parsed)
                if not isinstance(parsed, TrimBounds):  # ``frame_trims`` reports a trim, once the size is known
                    applied.append((label, op.name))
                continue
            key = op.name + ("" if op.optional else " (required)")
            skipped[key] = skipped.get(key, 0) + 1
        for key, n in skipped.items():
            notes.append(f"{label}: {n} x {key} not applied")
    if gain_maps:
        notes.append(f"OpcodeList2: {len(gain_maps)} GainMap applied (lens shading)")
    n_rect = sum(isinstance(wp, WarpRectilinear) for wp in warps)
    if n_rect:
        notes.append(f"OpcodeList3: {n_rect} WarpRectilinear applied (lens distortion)")
    if len(warps) - n_rect:
        notes.append(f"OpcodeList3: {len(warps) - n_rect} WarpFisheye applied (fisheye unwrap)")
    for (label, name) in dict.fromkeys(applied):
        what = _WHAT.get(name, "value mapping")
        notes.append(f"{label}: {applied.count((label, name))} {name} applied ({what})")
    return Plan(gain_maps, notes, warps, stage2, stage3, stage1)


_STAGE23_PARSERS = {
    FIX_VIGNETTE_RADIAL: parse_vignette_radial,
    MAP_POLYNOMIAL: parse_map_polynomial,
    MAP_TABLE: parse_map_table,
    TRIM_BOUNDS: parse_trim_bounds,
    **{k: parse_per_line for k in PER_LINE_KINDS},
}
_WHAT = {
    "FixVignetteRadial": "lens vignetting",
    "DeltaPerRow": "row offsets",
    "DeltaPerColumn": "column offsets",
    "ScalePerRow": "row gains",
    "ScalePerColumn": "column gains",
}


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


def frame_trims(
    ops: list,
    h: int,
    w: int,
    label: str,
    notes: list[str],
    start: tuple[int, int, int, int] | None = None,
    factor: float = 1.0,
) -> tuple[list, tuple[int, int, int, int]]:
    """Take the TrimBounds out of a stage-2 or stage-3 list for an ``h`` x ``w`` image; returns ``(ops, frame)``.

    Every opcode after a trim comes back wrapped in a ``Framed``; ``frame`` is
    the image's last ``(top, left, height, width)``, to crop the output to.
    ``start`` is the frame the list begins in (the ``OpcodeList2`` trim, for
    ``OpcodeList3``); ``factor`` scales a trim's rectangle (0.5 on a half-size
    develop, rounded down). A trim that is empty or does not lie inside the
    frame is skipped, with a note.
    """

    top, left, fh, fw = start if start is not None else (0, 0, h, w)
    out: list = []
    done = 0
    for op in ops:
        if not isinstance(op, TrimBounds):
            out.append(op if (top, left, fh, fw) == (0, 0, h, w) else Framed(op, top, left, fh, fw))
            continue
        t, lf, b, r = (int(v * factor) for v in (op.top, op.left, op.bottom, op.right))
        if not (0 <= t < b <= fh and 0 <= lf < r <= fw):
            notes.append(
                f"{label}: TrimBounds ({op.top}, {op.left}, {op.bottom}, {op.right}) lies outside "
                f"the {fw}x{fh} image and was skipped"
            )
            continue
        top, left, fh, fw = top + t, left + lf, b - t, r - lf
        done += 1
    if done:
        notes.append(f"{label}: {done} TrimBounds applied (image trimmed to {fw}x{fh} at x {left}, y {top})")
    return out, (top, left, fh, fw)


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


def _rows_cols(gm: "GainMap | MapPolynomial | MapTable | PerLine", h: int, w: int):
    rows = range(max(gm.top, 0), min(gm.bottom, h), gm.row_pitch)
    cols = range(max(gm.left, 0), min(gm.right, w), gm.col_pitch)
    return rows, cols


def apply_row(maps: list, y: int, row: list[float], h: int, w: int, spp: int) -> None:
    """Run the stage-2 opcodes (``Plan.stage2``) on one normalised active-area row, in place (pure Python)."""

    for gm in maps:
        if isinstance(gm, TrimBounds):
            continue  # ``frame_trims`` takes these out; a list with one left in is run untrimmed
        if isinstance(gm, Framed):
            if gm.top <= y < gm.top + gm.height:
                a, b = gm.left * spp, (gm.left + gm.width) * spp
                sub = row[a:b]
                apply_row([gm.op], y - gm.top, sub, gm.height, gm.width, spp)
                row[a:b] = sub
            continue
        if isinstance(gm, VignetteRadial):
            _vignette_row(gm, y, row, 0, h, w, spp, None)
            continue
        if isinstance(gm, MapPolynomial):
            _poly_row(gm, y, row, 0, h, w, spp, None)
            continue
        if isinstance(gm, (MapTable, PerLine)):
            _area_row(gm, y, row, 0, h, w, spp, None)
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
        if isinstance(gm, TrimBounds):
            continue  # as in ``apply_row``
        if isinstance(gm, Framed):
            sub = plane[gm.top : gm.top + gm.height, gm.left * spp : (gm.left + gm.width) * spp]
            apply_plane([gm.op], sub, gm.height, gm.width, spp)  # a view: written in place
            continue
        if isinstance(gm, VignetteRadial):
            _vignette_plane(gm, plane, h, w, spp, None)
            continue
        if isinstance(gm, MapPolynomial):
            _poly_plane(gm, plane, h, w, spp, None)
            continue
        if isinstance(gm, (MapTable, PerLine)):
            _area_plane(gm, plane, h, w, spp, None)
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
    return _spec_frame(vg.cx, vg.cy, w, h)


def _spec_frame(cx: float, cy: float, w: int, h: int) -> tuple[float, float, float]:
    """The optical centre and ``m`` as the DNG specification defines them, in this module's coordinates.

    The specification (1.7.1.0, WarpRectilinear, WarpFisheye, FixVignetteRadial) puts the centre at
    ``x0 + cx (x1 - x0)`` with ``x0, x1`` the pixel coordinates of the top-left and bottom-right pixels, and
    ``m = sqrt(mx^2 + my^2)``, ``mx = max(|x0 - cx|, |x1 - cx|)``: the distance to the farthest pixel. Here
    pixel ``x`` sits at ``x + 0.5``, so the centre is returned as ``cx (w - 1) + 0.5``.
    """

    ci, cj = cx * (w - 1), cy * (h - 1)
    m = math.hypot(max(ci, w - 1 - ci), max(cj, h - 1 - cj))
    return ci + 0.5, cj + 0.5, (m if m > 0 else 1.0)


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


# --- MapTable, DeltaPerRow/Column, ScalePerRow/Column ----------------------------------------------------------------
#
# Same buffers, scale and byte-for-byte promise as FixVignetteRadial and MapPolynomial above.


def _table_value(table: tuple[int, ...], v: float) -> float:
    i = int(v * 65535.0 + 0.5) if v > 0.0 else 0
    return table[i if i < len(table) else len(table) - 1] / 65535.0


def _area_row(op: "MapTable | PerLine", y: int, buf, off: int, h: int, w: int, spp: int, scale) -> None:
    rows, cols = _rows_cols(op, h, w)
    if y not in rows:
        return
    table: tuple[int, ...] = op.table if isinstance(op, MapTable) else ()
    values: tuple[float, ...] = () if isinstance(op, MapTable) else op.values
    add = isinstance(op, PerLine) and op.kind == "delta"
    rowwise = isinstance(op, PerLine) and op.axis == "row"
    rv = values[(y - op.top) // op.row_pitch] if rowwise else 0.0
    for p in range(op.plane, min(op.plane + op.planes, spp)):
        for x in cols:
            k = off + x * spp + p
            v = buf[k] if scale is None else buf[k] / scale[p]
            if table:
                v = _table_value(table, v)
            else:
                d = rv if rowwise else values[(x - op.left) // op.col_pitch]
                v = v + d if add else v * d
                v = 0.0 if v < 0.0 else (1.0 if v > 1.0 else v)
            buf[k] = v if scale is None else v * scale[p]


def _area_plane(op: "MapTable | PerLine", plane, h: int, w: int, spp: int, scale) -> None:
    import numpy as np

    rows, cols = _rows_cols(op, h, w)
    if not len(rows) or not len(cols):
        return
    rsl = slice(rows.start, rows.stop, rows.step)
    if isinstance(op, MapTable):
        tbl = np.array(op.table, dtype=np.float64) / 65535.0
    else:
        vals = np.array(op.values, dtype=np.float64)
        if op.axis == "row":
            d = vals[(np.arange(rows.start, rows.stop, rows.step) - op.top) // op.row_pitch][:, None]
        else:
            d = vals[(np.arange(cols.start, cols.stop, cols.step) - op.left) // op.col_pitch][None, :]
    for p in range(op.plane, min(op.plane + op.planes, spp)):
        csl = slice(cols.start * spp + p, cols.stop * spp, cols.step * spp)
        v = plane[rsl, csl]
        if scale is not None:
            v = v / scale[p]
        if isinstance(op, MapTable):
            idx = np.where(v > 0.0, np.floor(v * 65535.0 + 0.5), 0.0)
            idx = np.minimum(idx, len(op.table) - 1).astype(np.int64)
            out = tbl[idx]
        else:
            out = v + d if op.kind == "delta" else v * d
            out = np.where(out < 0.0, 0.0, np.where(out > 1.0, 1.0, out))
        plane[rsl, csl] = out if scale is None else out * scale[p]


def run_stage3_rgb(ops: list, rgb, w: int, h: int, scale=(1.0, 1.0, 1.0)):
    """Run ``Plan.stage3`` in order on interleaved linear RGB (``array('d')``); returns the result (pure Python)."""

    for op in ops:
        if isinstance(op, TrimBounds):
            continue  # as in ``apply_row``
        if isinstance(op, Framed):
            from array import array

            sub = array("d")
            for y in range(op.top, op.top + op.height):
                s = (y * w + op.left) * 3
                sub.extend(rgb[s : s + op.width * 3])
            sub = run_stage3_rgb([op.op], sub, op.width, op.height, scale)
            for i, y in enumerate(range(op.top, op.top + op.height)):
                s = (y * w + op.left) * 3
                rgb[s : s + op.width * 3] = sub[i * op.width * 3 : (i + 1) * op.width * 3]
            continue
        if isinstance(op, (WarpRectilinear, WarpFisheye)):
            rgb = warp_rgb([op], rgb, w, h)
        elif isinstance(op, VignetteRadial):
            for y in range(h):
                _vignette_row(op, y, rgb, y * w * 3, h, w, 3, scale)
        elif isinstance(op, (MapTable, PerLine)):
            for y in range(h):
                _area_row(op, y, rgb, y * w * 3, h, w, 3, scale)
        else:
            for y in range(h):
                _poly_row(op, y, rgb, y * w * 3, h, w, 3, scale)
    return rgb


def run_stage3_planes(ops: list, img, scale=(1.0, 1.0, 1.0)):
    """Run ``Plan.stage3`` in order on a linear (h, w, 3) float64 image; returns the result (numpy, same bytes)."""

    import numpy as np

    h, w = img.shape[0], img.shape[1]
    for op in ops:
        if isinstance(op, TrimBounds):
            continue  # as in ``apply_row``
        if isinstance(op, Framed):
            img = np.array(img, dtype=np.float64)  # own, writable copy
            sl = (slice(op.top, op.top + op.height), slice(op.left, op.left + op.width))
            img[sl] = run_stage3_planes([op.op], img[sl].copy(), scale)
            continue
        if isinstance(op, (WarpRectilinear, WarpFisheye)):
            img = warp_planes([op], img)
            continue
        flat = np.ascontiguousarray(img).reshape(h, w * 3)
        if isinstance(op, VignetteRadial):
            _vignette_plane(op, flat, h, w, 3, scale)
        elif isinstance(op, (MapTable, PerLine)):
            _area_plane(op, flat, h, w, 3, scale)
        else:
            _poly_plane(op, flat, h, w, 3, scale)
        img = flat.reshape(h, w, 3)
    return img


# --- WarpRectilinear -------------------------------------------------------------------------------------------------


def _warp_frame(wp: WarpRectilinear, w: int, h: int) -> tuple[float, float, float]:
    """Optical centre (pixel ``x`` at ``x + 0.5``) and the distance from it to the farthest pixel (``_spec_frame``)."""

    return _spec_frame(wp.cx, wp.cy, w, h)


def warp_source(wp, p: int, x: float, y: float, w: int, h: int) -> tuple[float, float]:
    """Where output pixel (x, y) of plane p reads from, in pixel-index units (pure Python, the reference).

    ``wp`` is a ``WarpRectilinear`` or a ``WarpFisheye``.
    """

    cxp, cyp, m = _warp_frame(wp, w, h)
    dx = (x + 0.5 - cxp) / m
    dy = (y + 0.5 - cyp) / m
    if isinstance(wp, WarpFisheye):
        k0, k1, k2, k3 = wp.plane_terms(p)
        r = math.sqrt(dx * dx + dy * dy)
        if r == 0.0:
            ratio = k0
        else:
            t = math.atan(r)
            t2 = t * t
            ratio = t * (k0 + t2 * (k1 + t2 * (k2 + t2 * k3))) / r
        return cxp + m * (ratio * dx) - 0.5, cyp + m * (ratio * dy) - 0.5
    kr0, kr1, kr2, kr3, kt0, kt1 = wp.plane_terms(p)
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


def warp_rgb(warps: list, rgb, w: int, h: int):
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


def warp_planes(warps: list, img, band: int = 256):
    """Run the warps (WarpRectilinear or WarpFisheye) on a linear (h, w, 3) float64 image; returns a new array (numpy, same bytes as ``warp_rgb``)."""

    import numpy as np

    h, w = img.shape[0], img.shape[1]
    for wp in warps:
        cxp, cyp, m = _warp_frame(wp, w, h)
        out = np.empty_like(img)
        xs = (np.arange(w, dtype=np.float64) + 0.5 - cxp) / m
        fisheye = isinstance(wp, WarpFisheye)
        dx = xs[None, :]
        for y0 in range(0, h, band):
            y1 = min(h, y0 + band)
            dy = ((np.arange(y0, y1, dtype=np.float64) + 0.5 - cyp) / m)[:, None]
            # WarpFisheye's radius and angle depend only on where the pixel is: taken once per band, for every plane.
            geo = _np_fisheye_geometry(np, dx, dy) if fisheye else None
            for p in range(3):
                src = img[..., p]
                if fisheye:
                    sx, sy = _np_fisheye(wp.plane_terms(p), geo)
                else:
                    kr0, kr1, kr2, kr3, kt0, kt1 = wp.plane_terms(p)
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


def _np_fisheye_geometry(np, dx, dy):
    """``(dx, dy, r, t, r == 0)`` on arrays for WarpFisheye, with ``r`` and ``t = atan(r)`` as ``warp_source`` takes them.

    ``atan`` is taken with ``math.atan``, not ``np.arctan``: numpy may use a vectorised arctan that differs from the
    C library's in the last bit, and the two engines must give the same bytes.
    """

    dx, dy = np.broadcast_arrays(dx, dy)
    r = np.sqrt(dx * dx + dy * dy)
    flat = r.ravel()
    t = np.fromiter(map(math.atan, flat.tolist()), dtype=np.float64, count=flat.size).reshape(r.shape)
    return dx, dy, r, t, r == 0.0


def _np_fisheye(terms, geo):
    """WarpFisheye's normalised source offsets for one plane, the same operations in the same order as ``warp_source``."""

    import numpy as np

    k0, k1, k2, k3 = terms
    dx, dy, r, t, zero = geo
    t2 = t * t
    ratio = np.where(zero, k0, t * (k0 + t2 * (k1 + t2 * (k2 + t2 * k3))) / np.where(zero, 1.0, r))
    return ratio * dx, ratio * dy


def _np_split(np, v, n: int):
    """``_clamp_split`` on an array."""

    lo = v <= 0.0
    hi = v >= n - 1
    edge = lo | hi
    i0 = np.floor(np.clip(v, 0.0, n - 1)).astype(np.int64)  # int(v) for 0 < v < n - 1, as in the pure path
    i1 = np.where(edge, i0, i0 + 1)
    fr = np.where(edge, 0.0, v - i0)
    return i0, i1, fr
