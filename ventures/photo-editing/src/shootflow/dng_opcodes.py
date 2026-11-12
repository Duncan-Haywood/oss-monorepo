"""DNG opcode lists: read them all, run ``GainMap`` (lens shading), name the rest.

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
has. ``GainMap`` (opcode 9) is run here; every other opcode is named in the
report and left undone (``WarpRectilinear`` lens distortion, for instance).

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
"""

from __future__ import annotations

import struct
from dataclasses import dataclass

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

    def __bool__(self) -> bool:
        return bool(self.gain_maps)


def plan(ifd, ifd0, cfa: bool = True) -> Plan:
    """Read the three opcode lists from the raw IFD (or IFD0) and decide what runs.

    Only ``GainMap`` in ``OpcodeList2`` on CFA data runs. Everything else is
    named in the notes, and a required (non-optional) opcode left undone says
    so, since the DNG specification expects a reader to run it.
    """

    gain_maps: list[GainMap] = []
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
            key = op.name + ("" if op.optional else " (required)")
            skipped[key] = skipped.get(key, 0) + 1
        for key, n in skipped.items():
            notes.append(f"{label}: {n} x {key} not applied")
    if gain_maps:
        notes.append(f"OpcodeList2: {len(gain_maps)} GainMap applied (lens shading)")
    return Plan(gain_maps, notes)


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
