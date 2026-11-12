"""The DNG specification's camera-to-XYZ colour model, stdlib only.

``raw_develop`` used to take one camera matrix (the one nearest D65) and
white-balance in camera space, the way dcraw does. That is right for a photo
shot in daylight and drifts for one shot under tungsten or shade, because a
camera's response is not a fixed linear map of XYZ: a DNG carries two
matrices measured under two calibration illuminants (usually Standard A and
D65) so a reader can blend them for the light the photo was taken in.

This module follows the DNG specification (Adobe, version 1.4 onwards,
chapter 6, "Mapping Camera Color Space to CIE XYZ Space"):

* the as-shot white is the one consistent with ``AsShotNeutral``: blend the
  matrices for a white's colour temperature, map the neutral back to XYZ, and
  that white must come out again (found by bisection on the blend weight
  rather than the specification's plain iteration, which can crawl; same
  fixed point); or taken from ``AsShotWhiteXY`` directly;
* ``ColorMatrix``, ``CameraCalibration`` and ``ForwardMatrix`` are each
  interpolated linearly in inverse colour temperature (mired) between the two
  calibration illuminants, and clamped outside them;
* ``XYZtoCamera = AnalogBalance * CameraCalibration * ColorMatrix``;
* with ``ForwardMatrix``: ``CameraToXYZ_D50 = FM * D * inv(AB * CC)``, where
  ``D`` scales the reference neutral to (1, 1, 1);
* without it: ``CameraToXYZ_D50 = Bradford(white -> D50) * inv(XYZtoCamera)``;
* ``CameraCalibration`` is used only when ``CameraCalibrationSignature``
  equals ``ProfileCalibrationSignature`` (both absent counts as equal).

Colour temperature is Robertson's (1968) method on the CIE 1960 UCS, with the
isotemperature lines published in Wyszecki and Stiles, *Color Science* (2nd
ed., 1982), including Lindbloom's correction of the 325-mired row.

Not handled here: ``ColorMatrix3``/``CalibrationIlluminant3`` (DNG 1.6, a
third illuminant), ``IlluminantData`` (custom illuminant spectra), and the
profile's hue/saturation and look tables. ``tools/dng_colour_check.py``
compares this module with colour-hdri's independent implementation.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

Matrix = tuple[tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]]

IDENTITY: Matrix = ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))

# The DNG profile connection space white: D50 as the DNG specification gives it.
D50_XY = (0.3457, 0.3585)

# Bradford cone response matrix (Lam 1985; as in the ICC specification).
_BRADFORD: Matrix = (
    (0.8951, 0.2664, -0.1614),
    (-0.7502, 1.7135, 0.0367),
    (0.0389, -0.0685, 1.0296),
)

# EXIF / DNG LightSource code -> correlated colour temperature in kelvin.
# CIE illuminants at their defined CCTs; the fluorescent classes at the middle
# of the range the EXIF 2.3 specification gives for each; "daylight", "fine
# weather" and "flash" at 5500 K, "cloudy" at 6500 K and "shade" at 7500 K
# (nominal values; the specification gives no number for these). 0 (unknown)
# and 255 (other) have no temperature.
ILLUMINANT_CCT: dict[int, float] = {
    1: 5500.0,  # daylight
    2: 4200.0,  # fluorescent (treated as cool white, W 3900-4500 K)
    3: 2856.0,  # tungsten (incandescent): Standard Illuminant A
    4: 5500.0,  # flash
    9: 5500.0,  # fine weather
    10: 6500.0,  # cloudy weather
    11: 7500.0,  # shade
    12: 6400.0,  # daylight fluorescent (D 5700-7100 K)
    13: 5000.0,  # day white fluorescent (N 4600-5400 K)
    14: 4200.0,  # cool white fluorescent (W 3900-4500 K)
    15: 3450.0,  # white fluorescent (WW 3200-3700 K)
    16: 2925.0,  # warm white fluorescent (L 2600-3250 K)
    17: 2856.0,  # Standard Illuminant A
    18: 4874.0,  # Standard Illuminant B
    19: 6774.0,  # Standard Illuminant C
    20: 5503.0,  # D55
    21: 6504.0,  # D65
    22: 7504.0,  # D75
    23: 5003.0,  # D50
    24: 3200.0,  # ISO studio tungsten
}

# Robertson (1968) isotemperature lines: (mired, u, v, slope), CIE 1960 UCS.
_ROBERTSON = (
    (0, 0.18006, 0.26352, -0.24341),
    (10, 0.18066, 0.26589, -0.25479),
    (20, 0.18133, 0.26846, -0.26876),
    (30, 0.18208, 0.27119, -0.28539),
    (40, 0.18293, 0.27407, -0.30470),
    (50, 0.18388, 0.27709, -0.32675),
    (60, 0.18494, 0.28021, -0.35156),
    (70, 0.18611, 0.28342, -0.37915),
    (80, 0.18740, 0.28668, -0.40955),
    (90, 0.18880, 0.28997, -0.44278),
    (100, 0.19032, 0.29326, -0.47888),
    (125, 0.19462, 0.30141, -0.58204),
    (150, 0.19962, 0.30921, -0.70471),
    (175, 0.20525, 0.31647, -0.84901),
    (200, 0.21142, 0.32312, -1.0182),
    (225, 0.21807, 0.32909, -1.2168),
    (250, 0.22511, 0.33439, -1.4512),
    (275, 0.23247, 0.33904, -1.7298),
    (300, 0.24010, 0.34308, -2.0637),
    (325, 0.24792, 0.34655, -2.4681),
    (350, 0.25591, 0.34951, -2.9641),
    (375, 0.26400, 0.35200, -3.5814),
    (400, 0.27218, 0.35407, -4.3633),
    (425, 0.28039, 0.35577, -5.3762),
    (450, 0.28863, 0.35714, -6.7262),
    (475, 0.29685, 0.35823, -8.5955),
    (500, 0.30505, 0.35907, -11.324),
    (525, 0.31320, 0.35968, -15.628),
    (550, 0.32129, 0.36011, -23.325),
    (575, 0.32931, 0.36038, -40.770),
    (600, 0.33724, 0.36051, -116.45),
)


class ColourError(ValueError):
    """The colour tags cannot be used; the message says why."""


# ----------------------------------------------------------------- algebra


def matmul(a, b):
    return tuple(tuple(sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)) for i in range(3))


def apply(m, v):
    return tuple(m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2] for i in range(3))


def inverse(m):
    (a, b, c), (d, e, f), (g, h, i) = m
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    if abs(det) < 1e-12:
        raise ColourError("colour matrix is singular")
    return (
        ((e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det),
        ((f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det),
        ((d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det),
    )


def diag(v) -> Matrix:
    return ((float(v[0]), 0.0, 0.0), (0.0, float(v[1]), 0.0), (0.0, 0.0, float(v[2])))


def scale(m, s):
    return tuple(tuple(v * s for v in row) for row in m)


def as_matrix(values) -> Matrix | None:
    """A 3x3 matrix from a tag's nine values, row-major; None if absent."""

    if not values:
        return None
    if len(values) != 9:
        raise ColourError("colour matrix is not 3x3 (four-colour cameras are not supported)")
    return tuple(tuple(float(values[3 * r + c]) for c in range(3)) for r in range(3))  # type: ignore[return-value]


# -------------------------------------------------------------- chromaticity


def xy_to_xyz(xy) -> tuple[float, float, float]:
    x, y = xy
    if y <= 0:
        raise ColourError(f"white chromaticity {xy} has y <= 0")
    return (x / y, 1.0, (1.0 - x - y) / y)


def xyz_to_xy(xyz) -> tuple[float, float]:
    s = xyz[0] + xyz[1] + xyz[2]
    if s <= 0:
        raise ColourError("white maps to XYZ with no positive sum")
    return (xyz[0] / s, xyz[1] / s)


def xy_to_cct(xy) -> float:
    """Correlated colour temperature in kelvin, Robertson (1968).

    Outside the table (above 1e6/600 = 1667 K or past infinity) the end line
    is extrapolated.
    """

    x, y = xy
    d = -2.0 * x + 12.0 * y + 3.0
    u, v = 4.0 * x / d, 6.0 * y / d
    prev_dt = 0.0
    prev = None
    for i, (mired, ui, vi, ti) in enumerate(_ROBERTSON):
        dt = ((v - vi) - ti * (u - ui)) / math.sqrt(1.0 + ti * ti)
        if i > 0 and (dt <= 0.0 or i == len(_ROBERTSON) - 1):
            # Between lines i-1 and i (or extrapolated past the last line).
            f = 0.0 if prev_dt == dt else prev_dt / (prev_dt - dt)
            m = prev[0] + f * (mired - prev[0])  # type: ignore[index]
            return 1e6 / m if m > 0 else math.inf
        prev_dt, prev = dt, (mired, ui, vi, ti)
    return math.inf  # unreachable


def bradford(src_xy, dst_xy) -> Matrix:
    """XYZ chromatic adaptation from white ``src_xy`` to white ``dst_xy``."""

    s = apply(_BRADFORD, xy_to_xyz(src_xy))
    d = apply(_BRADFORD, xy_to_xyz(dst_xy))
    # Cone ratios bounded as a guard against a degenerate white.
    ratio = [min(max(d[i] / s[i], 0.1), 10.0) if s[i] > 0 else 1.0 for i in range(3)]
    return matmul(matmul(inverse(_BRADFORD), diag(ratio)), _BRADFORD)


# ----------------------------------------------------------------- profile


@dataclass
class Profile:
    """The colour tags of a DNG, as matrices; absent ones are None."""

    color_matrix_1: Matrix | None
    color_matrix_2: Matrix | None = None
    illuminant_1: int = 0
    illuminant_2: int = 0
    camera_calibration_1: Matrix | None = None
    camera_calibration_2: Matrix | None = None
    forward_matrix_1: Matrix | None = None
    forward_matrix_2: Matrix | None = None
    analog_balance: tuple[float, float, float] = (1.0, 1.0, 1.0)
    use_calibration: bool = True

    def _pair(self):
        """(T1, T2) of the two calibration illuminants, or None when only one counts."""

        if self.color_matrix_1 is None or self.color_matrix_2 is None:
            return None
        t1 = ILLUMINANT_CCT.get(int(self.illuminant_1), 0.0)
        t2 = ILLUMINANT_CCT.get(int(self.illuminant_2), 0.0)
        if t1 <= 0 or t2 <= 0 or t1 == t2:
            return None
        return t1, t2

    def weight(self, cct: float) -> float:
        """Share of the illuminant-1 tags at ``cct`` (1.0 = only set 1)."""

        pair = self._pair()
        if pair is None:
            return 1.0 if self.color_matrix_1 is not None else 0.0
        t1, t2 = pair
        if cct <= min(t1, t2):
            return 1.0 if t1 < t2 else 0.0
        if cct >= max(t1, t2):
            return 0.0 if t1 < t2 else 1.0
        return (1.0 / cct - 1.0 / t2) / (1.0 / t1 - 1.0 / t2)

    def _blend(self, m1, m2, g):
        if m1 is None and m2 is None:
            return None
        if m1 is None or self._pair() is None:
            return m1 if m1 is not None else m2
        if m2 is None:
            return m1
        return tuple(tuple(g * m1[i][j] + (1.0 - g) * m2[i][j] for j in range(3)) for i in range(3))

    def tags_at(self, cct: float):
        """(ColorMatrix, CameraCalibration, ForwardMatrix) interpolated at ``cct``."""

        return self._tags_g(self.weight(cct))

    def _tags_g(self, g: float):
        cm = self._blend(self.color_matrix_1, self.color_matrix_2, g)
        if cm is None:
            raise ColourError("no ColorMatrix")
        cc = self._blend(self.camera_calibration_1, self.camera_calibration_2, g) if self.use_calibration else None
        fm = self._blend(self.forward_matrix_1, self.forward_matrix_2, g)
        return cm, cc or IDENTITY, fm

    def _xyz_to_camera_g(self, g: float) -> Matrix:
        cm, cc, _fm = self._tags_g(g)
        return matmul(matmul(diag(self.analog_balance), cc), cm)

    def xyz_to_camera(self, xy) -> Matrix:
        return self._xyz_to_camera_g(self.weight(xy_to_cct(xy)))

    def neutral_to_xy(self, neutral) -> tuple[float, float]:
        """The white chromaticity whose camera response is ``neutral``.

        The white and the blend depend on each other. The specification
        iterates from a guess; with two matrices that differ a lot that
        fixed-point loop crawls (over 200 steps for some profiles in
        ``tools/dng_colour_check.py``). Here the unknown is the blend weight
        ``g`` in [0, 1]: ``h(g) = weight(cct(white(g))) - g`` is >= 0 at 0 and
        <= 0 at 1, so bisection finds the self-consistent white in 60 steps.
        """

        def white(g):
            return xyz_to_xy(apply(inverse(self._xyz_to_camera_g(g)), neutral))

        if self._pair() is None:
            return white(self.weight(5000.0))
        lo, hi = 0.0, 1.0
        if self.weight(xy_to_cct(white(lo))) <= lo:
            return white(lo)
        if self.weight(xy_to_cct(white(hi))) >= hi:
            return white(hi)
        for _ in range(60):
            mid = (lo + hi) / 2.0
            if self.weight(xy_to_cct(white(mid))) > mid:
                lo = mid
            else:
                hi = mid
        return white((lo + hi) / 2.0)

    def xy_to_neutral(self, xy) -> tuple[float, float, float]:
        """Camera neutral for white ``xy``, scaled so its largest value is 1."""

        n = apply(self.xyz_to_camera(xy), xy_to_xyz(xy))
        top = max(n)
        if top <= 0:
            raise ColourError(f"white {xy} has no positive camera response")
        return tuple(v / top for v in n)  # type: ignore[return-value]

    def camera_to_xyz_d50(self, neutral, white_xy=None) -> tuple[Matrix, tuple[float, float], float, bool]:
        """``(CameraToXYZ_D50, white_xy, cct, used_forward_matrix)`` for ``neutral``.

        The matrix is scaled so the neutral maps to Y = 1 (a neutral that just
        reaches the white level renders as the white of the output space).
        """

        if white_xy is None:
            white_xy = self.neutral_to_xy(neutral)
        cct = xy_to_cct(white_xy)
        cm, cc, fm = self.tags_at(cct)
        ab_cc = matmul(diag(self.analog_balance), cc)
        if fm is not None:
            ref = apply(inverse(ab_cc), neutral)
            if min(ref) <= 0:
                raise ColourError("reference neutral has a non-positive entry")
            m = matmul(matmul(fm, diag([1.0 / r for r in ref])), inverse(ab_cc))
        else:
            m = matmul(bradford(white_xy, D50_XY), inverse(matmul(ab_cc, cm)))
        y = apply(m, neutral)[1]
        if y <= 0:
            raise ColourError("neutral maps to a non-positive luminance")
        return scale(m, 1.0 / y), white_xy, cct, fm is not None  # type: ignore[return-value]


def illuminant_name(code: int) -> str:
    names = {
        1: "daylight", 2: "fluorescent", 3: "tungsten", 4: "flash", 9: "fine weather", 10: "cloudy",
        11: "shade", 12: "daylight fluorescent", 13: "day white fluorescent", 14: "cool white fluorescent",
        15: "white fluorescent", 16: "warm white fluorescent", 17: "A", 18: "B", 19: "C", 20: "D55",
        21: "D65", 22: "D75", 23: "D50", 24: "ISO studio tungsten",
    }
    return names.get(int(code), f"illuminant {int(code)}")
