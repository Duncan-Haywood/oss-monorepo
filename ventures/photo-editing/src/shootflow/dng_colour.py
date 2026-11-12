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
  that white must come out again (the specification's iteration, on the
  blend weight, with bisection when it crawls or cycles); or taken from
  ``AsShotWhiteXY`` directly;
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

The profile's hue/saturation map and look table (``ProfileHueSatMapData1/2``,
``ProfileLookTableData``, DNG 1.2 onwards; the same tags in a ``.dcp``
camera profile) are ``HueSatTable`` and ``ProfileLook`` below: applied in
linear ProPhoto RGB, the map before the exposure and the look table after it,
in the specification's order.

The profile's tone curve (``ProfileToneCurve``, DNG 1.2 onwards) is
``ToneCurve`` below: the specification's points in linear gamma joined by a
cubic spline (the natural spline, second derivative zero at both ends, as
dng_sdk's ``dng_spline_solver`` computes), sampled into a 4096-step table
read by linear interpolation, and applied after the look table in linear
ProPhoto RGB by the hue-preserving RGB method (``rgb_tone``): the largest and
smallest channel go through the curve and the middle one is placed between
them in the same proportion as before, so HSV hue is unchanged.

DNG 1.6 triple-illuminant profiles (``ColorMatrix3``, ``CalibrationIlluminant3``,
``CameraCalibration3``, ``ForwardMatrix3``, ``ProfileHueSatMapData3``) blend
three tag sets by the white's distance to each illuminant in a
(tint, 1/temperature) plane, as the DNG SDK does (:func:`triple_weights`);
the as-shot white is the SDK's fixed-point loop on xy. ``IlluminantData1/2/3``
give the white of an illuminant coded 255 ("other"), as an xy pair or a
spectrum integrated against the CIE 1931 observer (:mod:`.cie1931`); with two
illuminants such a white blends by its Robertson temperature.
``tools/triple_illuminant_check.py`` checks the temperature, tint and
spectrum parts against colour-science. ``tools/dng_colour_check.py`` compares this module with
colour-hdri's independent implementation; ``tools/dcp_check.py`` reads real
camera profiles.
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
    if min(s) <= 0 or min(d) <= 0:
        raise ColourError(f"white {src_xy} or {dst_xy} has a non-positive cone response")
    ratio = [d[i] / s[i] for i in range(3)]
    return matmul(matmul(inverse(_BRADFORD), diag(ratio)), _BRADFORD)


# ------------------------------------------------- temperature and tint (DNG)

# Distance from the Planckian locus in CIE 1960 uv, scaled to the "tint"
# DNG SDK uses for white balance (same sign and scale as its dng_temperature).
_TINT_SCALE = -3000.0


def temperature_tint(xy) -> tuple[float, float]:
    """(temperature in kelvin, tint) of white ``xy``, the DNG way.

    The temperature is Robertson's, as :func:`xy_to_cct` (here returned
    finite: past the table's 0-mired end it is the end line, 1e6/eps);
    the tint is the signed distance from the locus along the interpolated
    isotemperature direction, times -3000. This is the parameterisation the
    DNG SDK (``dng_temperature``) uses for white balance sliders and for the
    DNG 1.6 triple-illuminant weights. Whites under 2,000 K use the same
    table (the SDK has an optional low-temperature extension, off by
    default, that this does not follow).
    """

    x, y = xy
    d = 1.5 - x + 6.0 * y
    u, v = 2.0 * x / d, 3.0 * y / d
    last_dt = last_du = last_dv = 0.0
    n = len(_ROBERTSON) - 1
    for i in range(1, n + 1):
        mired, ui, vi, ti = _ROBERTSON[i]
        length = math.sqrt(1.0 + ti * ti)
        du, dv = 1.0 / length, ti / length
        uu, vv = u - ui, v - vi
        dt = -uu * dv + vv * du
        if dt <= 0.0 or i == n:
            dt = -min(dt, 0.0)
            f = 0.0 if i == 1 else dt / (last_dt + dt)
            m0 = _ROBERTSON[i - 1]
            mired_at = m0[0] * f + mired * (1.0 - f)
            temp = 1e6 / mired_at if mired_at > 0 else 1e6 / 1e-6
            uu = u - (m0[1] * f + ui * (1.0 - f))
            vv = v - (m0[2] * f + vi * (1.0 - f))
            du, dv = du * (1.0 - f) + last_du * f, dv * (1.0 - f) + last_dv * f
            length = math.hypot(du, dv)
            return temp, (uu * du + vv * dv) / length * _TINT_SCALE
        last_dt, last_du, last_dv = dt, du, dv
    raise AssertionError("unreachable")


def xy_from_temperature_tint(temperature: float, tint: float = 0.0) -> tuple[float, float]:
    """White ``xy`` for a (temperature, tint): the inverse of :func:`temperature_tint`."""

    if temperature <= 0:
        raise ColourError("temperature must be positive")
    r = 1e6 / temperature
    offset = tint / _TINT_SCALE
    for i in range(len(_ROBERTSON) - 1):
        r1 = _ROBERTSON[i + 1][0]
        if r < r1 or i == len(_ROBERTSON) - 2:
            r0, u0, v0, t0 = _ROBERTSON[i]
            _, u1, v1, t1 = _ROBERTSON[i + 1]
            f = (r1 - r) / (r1 - r0)
            u, v = u0 * f + u1 * (1.0 - f), v0 * f + v1 * (1.0 - f)
            l0, l1 = math.sqrt(1.0 + t0 * t0), math.sqrt(1.0 + t1 * t1)
            du = (1.0 / l0) * f + (1.0 / l1) * (1.0 - f)
            dv = (t0 / l0) * f + (t1 / l1) * (1.0 - f)
            length = math.hypot(du, dv)
            u += du / length * offset
            v += dv / length * offset
            d = u - 4.0 * v + 2.0
            return 1.5 * u / d, v / d
    raise AssertionError("unreachable")


# DNG 1.6: the white each LightSource code stands for when three calibration
# illuminants are blended by distance (DNG SDK, dng_illuminant_data). The CIE
# illuminants at their published chromaticities; daylight, fine weather and
# flash as D55, cloudy as D65, shade as D75; each fluorescent class as the CIE
# F lamp the SDK picks (F1, F8, F9, F2, F3, F4). 255 ("other") takes its white
# from the IlluminantData tag; 0 (unknown) is D50.
STD_A_XY = (0.4476, 0.4074)
D55_XY = (0.3324, 0.3474)
D65_XY = (0.3127, 0.3290)
D75_XY = (0.2990, 0.3149)

ILLUMINANT_XY: dict[int, tuple[float, float]] = {
    1: D55_XY, 4: D55_XY, 9: D55_XY, 20: D55_XY,
    10: D65_XY, 21: D65_XY,
    11: D75_XY, 22: D75_XY,
    3: STD_A_XY, 17: STD_A_XY,
    18: (0.348483, 0.351747),  # B
    19: (0.310061, 0.316150),  # C
    23: D50_XY,
    12: (0.31310, 0.33727),  # daylight fluorescent: F1
    13: (0.34588, 0.35875),  # day white fluorescent: F8
    14: (0.37417, 0.37281),  # cool white fluorescent: F9
    2: (0.37208, 0.37529),  # fluorescent: F2
    15: (0.40910, 0.39430),  # white fluorescent: F3
    16: (0.44018, 0.40329),  # warm white fluorescent: F4
}

LIGHT_OTHER = 255


def illuminant_xy(code: int, data_xy=None) -> tuple[float, float]:
    """The white a calibration illuminant stands for (DNG 1.6 weighting)."""

    code = int(code)
    if code == LIGHT_OTHER:
        if data_xy is None:
            raise ColourError("CalibrationIlluminant is 255 (other) but there is no IlluminantData")
        return tuple(data_xy)  # type: ignore[return-value]
    if code == 24:  # ISO studio tungsten: 3200 K on the locus
        return xy_from_temperature_tint(3200.0, 0.0)
    xy = ILLUMINANT_XY.get(code, D50_XY)
    # The SDK stores each white round-tripped through XYZ.
    return xyz_to_xy(xy_to_xyz(xy))


def illuminant_temperature(code: int, data_xy=None) -> float:
    """Kelvin for blending two illuminants: the table, or IlluminantData's white for 255."""

    if int(code) == LIGHT_OTHER:
        return temperature_tint(data_xy)[0] if data_xy is not None else 0.0
    return ILLUMINANT_CCT.get(int(code), 0.0)


def _smoothstep(x: float) -> float:
    return x * x * (3.0 - 2.0 * x)


def triple_weights(white_xy, light1_xy, light2_xy, light3_xy) -> tuple[float, float, float]:
    """DNG 1.6 weights of three calibration illuminants for a white.

    The method of the DNG SDK (``CalculateTripleIlluminantWeights``): each
    white is placed at (tint / 200, min(1500 / T, 1)), so a step of 200 tint
    counts as much as going from 1,500 K to infinity; the weights are inverse
    squared distances (plus 1e-8), normalised, put through a smoothstep, cut
    below 0.02 (rescaled so 0.02 maps to 0 and 1 to 1) and normalised again.
    A white on an illuminant gets that illuminant alone; one between two gets
    mostly those two.
    """

    def place(xy):
        t, tint = temperature_tint(xy)
        return tint / 200.0, min(1500.0 / t, 1.0)

    p = place(white_xy)
    raw = []
    for light in (light1_xy, light2_xy, light3_xy):
        q = place(light)
        raw.append(1.0 / ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + 1e-8))
    total = sum(raw)
    cut = 0.02
    w = [min(max((_smoothstep(v / total) - cut) / (1.0 - cut), 0.0), 1.0) for v in raw]
    total = sum(w)
    w1, w2 = w[0] / total, w[1] / total
    return w1, w2, max(1.0 - w1 - w2, 0.0)


def parse_illuminant_data(values, byte_order: str = "<") -> tuple[float, float]:
    """White ``xy`` from an IlluminantData1/2/3 tag (DNG 1.6, UNDEFINED bytes).

    Type 0 is an xy pair (two RATIONALs); type 1 a spectral power
    distribution (sample count, first wavelength, spacing, samples), whose
    white is integrated against the CIE 1931 2-degree observer from 360 to
    830 nm in 1 nm steps, the spectrum read piecewise-linearly and held at its
    end values outside its range, as the SDK does.
    """

    import struct

    raw = bytes(values or b"")
    if len(raw) < 2:
        raise ColourError("IlluminantData is empty")
    end = byte_order
    kind = struct.unpack_from(end + "H", raw, 0)[0]

    def rational(at):
        n, d = struct.unpack_from(end + "II", raw, at)
        if d == 0:
            raise ColourError("IlluminantData has a zero denominator")
        return n / d

    if kind == 0:
        if len(raw) < 18:
            raise ColourError("IlluminantData xy is too short")
        x, y = rational(2), rational(10)
        if not (1e-6 <= x <= 0.999999 and 1e-6 <= y <= 0.999999):
            raise ColourError(f"IlluminantData xy ({x}, {y}) is out of range")
        return xyz_to_xy(xy_to_xyz((x, y)))
    if kind == 1:
        if len(raw) < 6:
            raise ColourError("IlluminantData spectrum is too short")
        count = struct.unpack_from(end + "I", raw, 2)[0]
        if not 2 <= count <= 2000 or len(raw) < 22 + 8 * count:
            raise ColourError(f"IlluminantData spectrum has a bad sample count ({count})")
        lo, step = rational(6), rational(14)
        if lo <= 0 or step <= 0:
            raise ColourError("IlluminantData spectrum has a non-positive wavelength or spacing")
        samples = [rational(22 + 8 * i) for i in range(count)]
        return spectrum_to_xy(lo, step, samples)
    raise ColourError(f"IlluminantData type {kind} is not 0 (xy) or 1 (spectrum)")


def spectrum_to_xy(first_nm: float, spacing_nm: float, samples) -> tuple[float, float]:
    """White ``xy`` of a light's spectral power distribution, sampled evenly."""

    from .cie1931 import CIE1931_2DEG_360_830

    last_nm = first_nm + spacing_nm * (len(samples) - 1)
    sums = [0.0, 0.0, 0.0]
    obs_sums = [0.0, 0.0, 0.0]
    for i, cmf in enumerate(CIE1931_2DEG_360_830):
        lam = min(max(360.0 + i, first_nm), last_nm)
        pos = (lam - first_nm) / spacing_nm
        k = min(int(pos), len(samples) - 2)
        f = pos - k
        light = samples[k] * (1.0 - f) + samples[k + 1] * f
        for c in range(3):
            obs_sums[c] += cmf[c]
            sums[c] += cmf[c] * light
    xyz = [sums[c] / obs_sums[c] for c in range(3)]
    if min(xyz) <= 0:
        raise ColourError("IlluminantData spectrum gives a white with a non-positive XYZ")
    return xyz_to_xy(xyz)


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
    hue_sat_map_1: HueSatTable | None = None
    hue_sat_map_2: HueSatTable | None = None
    look_table: HueSatTable | None = None
    # DNG 1.6: a third calibration illuminant, and custom illuminant whites
    # (xy, from IlluminantData1/2/3) for CalibrationIlluminant 255.
    color_matrix_3: Matrix | None = None
    illuminant_3: int = 0
    camera_calibration_3: Matrix | None = None
    forward_matrix_3: Matrix | None = None
    hue_sat_map_3: HueSatTable | None = None
    illuminant_data_1: tuple[float, float] | None = None
    illuminant_data_2: tuple[float, float] | None = None
    illuminant_data_3: tuple[float, float] | None = None

    def hue_sat_map_at(self, cct: float) -> HueSatTable | None:
        """The hue/saturation map for a white of ``cct``, blended like the matrices
        (two-illuminant blending; :meth:`hue_sat_map_for_white` covers three)."""

        m1, m2 = self.hue_sat_map_1, self.hue_sat_map_2
        if m1 is None or m2 is None or self._pair() is None:
            return m1 if m1 is not None else m2
        return m1.blend(m2, self.weight(cct))

    def hue_sat_map_for_white(self, xy) -> HueSatTable | None:
        """The hue/saturation map for white ``xy``: three-way when the profile is."""

        m1, m2, m3 = self.hue_sat_map_1, self.hue_sat_map_2, self.hue_sat_map_3
        if self.is_triple() and m1 is not None and m2 is not None and m3 is not None:
            if m1.dims == m2.dims == m3.dims:
                return m1.blend3(m2, m3, self.weights_for_white(xy))
        return self.hue_sat_map_at(xy_to_cct(xy))

    def _pair(self):
        """(T1, T2) of the two calibration illuminants, or None when only one counts."""

        if self.color_matrix_1 is None or self.color_matrix_2 is None:
            return None
        t1 = illuminant_temperature(self.illuminant_1, self.illuminant_data_1)
        t2 = illuminant_temperature(self.illuminant_2, self.illuminant_data_2)
        if t1 <= 0 or t2 <= 0 or t1 == t2:
            return None
        return t1, t2

    def light_whites(self):
        """The three calibration illuminants' whites (DNG 1.6 weighting)."""

        return (
            illuminant_xy(self.illuminant_1, self.illuminant_data_1),
            illuminant_xy(self.illuminant_2, self.illuminant_data_2),
            illuminant_xy(self.illuminant_3, self.illuminant_data_3),
        )

    def triple_problem(self) -> str | None:
        """Why ColorMatrix3 is present but not used, or None (used, or absent)."""

        if self.color_matrix_3 is None:
            return None
        if self._pair() is None:
            return "ColorMatrix3 ignored: the first two calibration illuminants are not a usable pair"
        if int(self.illuminant_3) == 0:
            return "ColorMatrix3 ignored: CalibrationIlluminant3 is missing or unknown"
        try:
            w1, w2, w3 = self.light_whites()
        except ColourError as exc:
            return f"ColorMatrix3 ignored: {exc}"
        if w1 == w2 or w1 == w3 or w2 == w3:
            return "ColorMatrix3 ignored: the three calibration illuminants are not distinct"
        fms = (self.forward_matrix_1, self.forward_matrix_2, self.forward_matrix_3)
        if any(m is not None for m in fms) and any(m is None for m in fms):
            return "ColorMatrix3 ignored: ForwardMatrix is present for some illuminants but not all three"
        return None

    def is_triple(self) -> bool:
        """True when the DNG 1.6 three-illuminant model applies."""

        return self.color_matrix_3 is not None and self.triple_problem() is None

    def weights_for_white(self, xy) -> tuple[float, float, float]:
        """Weights of the illuminant-1, -2 and -3 tags for white ``xy``."""

        if self.is_triple():
            return triple_weights(xy, *self.light_whites())
        g = self.weight(xy_to_cct(xy))
        return g, 1.0 - g, 0.0

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

    def tags_for_white(self, xy):
        """(ColorMatrix, CameraCalibration, ForwardMatrix) for white ``xy``.

        Two illuminants blend by the white's temperature (:meth:`tags_at`);
        three (DNG 1.6) by :func:`triple_weights`, as weighted sums. An absent
        CameraCalibration is the identity.
        """

        if not self.is_triple():
            return self.tags_at(xy_to_cct(xy))
        return self._tags_w(self.weights_for_white(xy))

    def _tags_w(self, w):
        def mix(ms):
            return tuple(
                tuple(sum(wk * m[i][j] for wk, m in zip(w, ms)) for j in range(3)) for i in range(3)
            )

        cm = mix((self.color_matrix_1, self.color_matrix_2, self.color_matrix_3))
        cc = IDENTITY
        cals = (self.camera_calibration_1, self.camera_calibration_2, self.camera_calibration_3)
        if self.use_calibration and any(c is not None for c in cals):
            cc = mix(tuple(c or IDENTITY for c in cals))
        fms = (self.forward_matrix_1, self.forward_matrix_2, self.forward_matrix_3)
        fm = mix(fms) if all(m is not None for m in fms) else None
        return cm, cc, fm

    def _xyz_to_camera_w(self, w) -> Matrix:
        cm, cc, _fm = self._tags_w(w)
        return matmul(matmul(diag(self.analog_balance), cc), cm)

    def _tags_g(self, g: float):
        cm = self._blend(self.color_matrix_1, self.color_matrix_2, g)
        if cm is None:
            raise ColourError("no ColorMatrix")
        cc = None
        if self.use_calibration and (self.camera_calibration_1 or self.camera_calibration_2):
            # An absent CameraCalibration is the identity (DNG default), so a
            # file with only CameraCalibration1 blends it towards identity.
            cc1 = self.camera_calibration_1 or IDENTITY
            cc2 = self.camera_calibration_2 or IDENTITY
            cc = cc1 if self._pair() is None else self._blend(cc1, cc2, g)
        fm = self._blend(self.forward_matrix_1, self.forward_matrix_2, g)
        return cm, cc or IDENTITY, fm

    def _xyz_to_camera_g(self, g: float) -> Matrix:
        cm, cc, _fm = self._tags_g(g)
        return matmul(matmul(diag(self.analog_balance), cc), cm)

    def xyz_to_camera(self, xy) -> Matrix:
        if self.is_triple():
            return self._xyz_to_camera_w(self.weights_for_white(xy))
        return self._xyz_to_camera_g(self.weight(xy_to_cct(xy)))

    def _neutral_to_xy_triple(self, neutral) -> tuple[float, float]:
        """The specification's fixed-point loop on the white itself (three illuminants).

        As the DNG SDK's ``NeutralToXY``: start at D50, blend for the white,
        map the neutral back to a white, until it moves less than 1e-7 in
        x + y; a loop that has not settled after its last pass (a two-value
        oscillation, typically) takes the mean of its last two whites. Here
        the cap is 100 passes, not the SDK's 30.
        """

        lights = self.light_whites()
        last = D50_XY
        for i in range(100):
            m = self._xyz_to_camera_w(triple_weights(last, *lights))
            nxt = xyz_to_xy(apply(inverse(m), neutral))
            if abs(nxt[0] - last[0]) + abs(nxt[1] - last[1]) < 1e-10:
                return nxt
            if i == 99:
                return ((last[0] + nxt[0]) / 2.0, (last[1] + nxt[1]) / 2.0)
            last = nxt
        return last

    def neutral_to_xy(self, neutral) -> tuple[float, float]:
        """The white chromaticity whose camera response is ``neutral``.

        The white and the blend depend on each other. The specification
        iterates: guess a white, blend for its temperature, map the neutral
        back to XYZ, repeat. Here the unknown is the blend weight ``g`` in
        [0, 1] (the white follows from it), iterated from the D50 guess the
        same way. When two matrices differ a lot that loop crawls or cycles
        (over 200 steps for some profiles in ``tools/dng_colour_check.py``);
        after 100 steps the root is bracketed and bisected instead, since
        ``h(g) = f(g) - g`` is >= 0 at 0 and <= 0 at 1. A profile can have
        more than one self-consistent white; the iteration picks the one the
        specification's loop reaches, and bisection searches next to it.
        """

        def white(g):
            return xyz_to_xy(apply(inverse(self._xyz_to_camera_g(g)), neutral))

        def f(g):
            return self.weight(xy_to_cct(white(g)))

        if self.is_triple():
            return self._neutral_to_xy_triple(neutral)
        if self._pair() is None:
            return white(self.weight(5000.0))
        g = self.weight(xy_to_cct(D50_XY))
        seen = [g]
        for _ in range(100):
            nxt = f(g)
            if abs(nxt - g) < 1e-13:
                return white(nxt)
            g = nxt
            seen.append(g)
        # Crawling or cycling: bisect on the bracket the last steps span, or
        # failing a sign change there, on all of [0, 1].
        lo, hi = min(seen[-4:]), max(seen[-4:])
        if not (f(lo) - lo >= 0.0 >= f(hi) - hi):
            lo, hi = 0.0, 1.0
            if f(lo) <= lo:
                return white(lo)
            if f(hi) >= hi:
                return white(hi)
        for _ in range(60):
            mid = (lo + hi) / 2.0
            if f(mid) > mid:
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
        cm, cc, fm = self.tags_for_white(white_xy)
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


# --------------------------------------------------------------------------
# Hue/saturation map and look table (DNG 1.2+, chapter 6; and .dcp profiles)
# --------------------------------------------------------------------------

# ProPhoto RGB (ROMM, ISO 22028-2) to XYZ, D50 white: the space the DNG
# specification applies HueSatMap and LookTable in.
PROPHOTO_TO_XYZ_D50: Matrix = (
    (0.7977, 0.1352, 0.0313),
    (0.2880, 0.7119, 0.0001),
    (0.0, 0.0, 0.8249),
)

SRGB_EXPONENT = 1.0 / 2.4


def srgb_encode(v: float) -> float:
    """sRGB transfer function, linear to encoded, for v in [0, 1]."""

    if v <= 0.0031308:
        return 12.92 * v
    return 1.055 * v**SRGB_EXPONENT - 0.055


def srgb_decode(v: float) -> float:
    if v <= 0.04045:
        return v / 12.92
    return ((v + 0.055) / 1.055) ** 2.4


def rgb_to_hsv(r: float, g: float, b: float) -> tuple[float, float, float]:
    """Hue in [0, 6), saturation, value: the specification's convention."""

    mx = max(r, g, b)
    gap = mx - min(r, g, b)
    if gap > 0.0:
        if r == mx:
            h = (g - b) / gap
            if h < 0.0:
                h += 6.0
        elif g == mx:
            h = 2.0 + (b - r) / gap
        else:
            h = 4.0 + (r - g) / gap
        return h, gap / mx, mx
    return 0.0, 0.0, mx


def hsv_to_rgb(h: float, s: float, v: float) -> tuple[float, float, float]:
    if s <= 0.0:
        return v, v, v
    if h < 0.0:
        h += 6.0
    if h >= 6.0:
        h -= 6.0
    i = int(h)
    i = min(i, 5)
    f = h - i
    p = v * (1.0 - s)
    q = v * (1.0 - s * f)
    t = v * (1.0 - s * (1.0 - f))
    if i == 0:
        return v, t, p
    if i == 1:
        return q, v, p
    if i == 2:
        return p, v, t
    if i == 3:
        return p, q, v
    if i == 4:
        return t, p, v
    return v, p, q


def _pin(v: float) -> float:
    return 0.0 if v < 0.0 else min(v, 1.0)


@dataclass(frozen=True)
class HueSatTable:
    """A ``ProfileHueSatMap`` or ``ProfileLookTable``: for each (hue,
    saturation, value) cell, a hue shift in degrees, a saturation scale and a
    value scale.

    ``data`` holds ``3 * hue * sat * val`` floats with value outermost, then
    hue, then saturation (the order the tags store them). A lookup
    interpolates linearly on each axis, hue wrapping round from the last
    division to the first; ``srgb`` (encoding 1) indexes the value axis by the
    sRGB-encoded value and scales that.
    """

    hue_divisions: int
    sat_divisions: int
    val_divisions: int
    data: tuple[float, ...]
    srgb: bool = False

    @classmethod
    def from_tags(cls, dims, data, encoding=0) -> HueSatTable:
        if not dims or len(dims) not in (2, 3):
            raise ColourError("table dimensions need two or three values")
        hd, sd = int(dims[0]), int(dims[1])
        vd = int(dims[2]) if len(dims) == 3 else 1
        if hd < 1 or sd < 2 or vd < 1 or hd * sd * vd > 1_000_000:
            raise ColourError(f"table dimensions {hd}x{sd}x{vd} are not valid (hue >= 1, saturation >= 2)")
        values = tuple(float(v) for v in (data or ()))
        if len(values) != 3 * hd * sd * vd:
            raise ColourError(f"table holds {len(values)} values; {hd}x{sd}x{vd} needs {3 * hd * sd * vd}")
        if any(not math.isfinite(v) for v in values):
            raise ColourError("table holds a value that is not finite")
        return cls(hd, sd, vd, values, int(encoding) == 1)

    @property
    def dims(self) -> tuple[int, int, int]:
        return self.hue_divisions, self.sat_divisions, self.val_divisions

    def blend(self, other: HueSatTable, g: float) -> HueSatTable:
        """``g`` of this table plus ``1 - g`` of ``other``; this one alone when the shapes differ."""

        if g >= 1.0 or other.dims != self.dims:
            return self
        if g <= 0.0:
            return other
        data = tuple(g * a + (1.0 - g) * b for a, b in zip(self.data, other.data))
        return HueSatTable(*self.dims, data, self.srgb)

    def blend3(self, second: HueSatTable, third: HueSatTable, w) -> HueSatTable:
        """``w[0]`` of this table, ``w[1]`` of ``second`` and ``w[2]`` of ``third`` (same shape)."""

        w1, w2, w3 = w
        if second.dims != self.dims or third.dims != self.dims:
            return self
        for weight, table in ((w1, self), (w2, second), (w3, third)):
            if weight >= 1.0:
                return table
        data = tuple(w1 * a + w2 * b + w3 * c for a, b, c in zip(self.data, second.data, third.data))
        return HueSatTable(*self.dims, data, self.srgb)

    def is_identity(self) -> bool:
        d = self.data
        return all(d[i] == 0.0 and d[i + 1] == 1.0 and d[i + 2] == 1.0 for i in range(0, len(d), 3))

    def lookup(self, h: float, s: float, ve: float) -> tuple[float, float, float]:
        """(hue shift in degrees, saturation scale, value scale) at hue ``h`` in
        [0, 6), saturation ``s`` in [0, 1] and (encoded) value ``ve`` in [0, 1]."""

        hd, sd, vd, d = self.hue_divisions, self.sat_divisions, self.val_divisions, self.data
        hs = h * (hd / 6.0) if hd >= 2 else 0.0
        ss = s * (sd - 1)
        hi0 = int(hs)
        si0 = int(ss)
        si0 = min(si0, sd - 2)
        hi1 = hi0 + 1
        if hi0 >= hd - 1:
            hi0 = hd - 1
            hi1 = 0
        hf1 = hs - hi0
        sf1 = ss - si0
        hf0 = 1.0 - hf1
        sf0 = 1.0 - sf1
        e00 = (hi0 * sd + si0) * 3
        e01 = (hi1 * sd + si0) * 3
        out = [0.0, 0.0, 0.0]
        if vd < 2:
            for k in range(3):
                a0 = hf0 * d[e00 + k] + hf1 * d[e01 + k]
                a1 = hf0 * d[e00 + 3 + k] + hf1 * d[e01 + 3 + k]
                out[k] = sf0 * a0 + sf1 * a1
        else:
            vs = ve * (vd - 1)
            vi0 = int(vs)
            vi0 = min(vi0, vd - 2)
            vf1 = vs - vi0
            vf0 = 1.0 - vf1
            step = hd * sd * 3
            e00 += vi0 * step
            e01 += vi0 * step
            e10 = e00 + step
            e11 = e01 + step
            for k in range(3):
                j = k + 3
                a0 = vf0 * (hf0 * d[e00 + k] + hf1 * d[e01 + k]) + vf1 * (hf0 * d[e10 + k] + hf1 * d[e11 + k])
                a1 = vf0 * (hf0 * d[e00 + j] + hf1 * d[e01 + j]) + vf1 * (hf0 * d[e10 + j] + hf1 * d[e11 + j])
                out[k] = sf0 * a0 + sf1 * a1
        return out[0], out[1], out[2]

    def apply(self, r: float, g: float, b: float) -> tuple[float, float, float]:
        """The table applied to linear ProPhoto ``(r, g, b)`` in [0, 1]."""

        h, s, v = rgb_to_hsv(r, g, b)
        ve = srgb_encode(v) if self.srgb else v
        shift, sat, val = self.lookup(h, s, ve)
        h = h + shift * (6.0 / 360.0)
        s = _pin(s * sat)
        if self.srgb:
            v = srgb_decode(_pin(ve * val))
        else:
            v = _pin(v * val)
        return hsv_to_rgb(h, s, v)


# --------------------------------------------------------------------------
# Profile tone curve (ProfileToneCurve, DNG 1.2+; and .dcp profiles)
# --------------------------------------------------------------------------

TONE_TABLE_STEPS = 4096


def natural_spline_slopes(xs, ys) -> list[float]:
    """Slopes at each knot of the natural cubic spline through ``(xs, ys)``.

    The spline is C2 with zero second derivative at both ends; between knots
    it is the cubic Hermite segment with these end slopes. Solved as the
    usual tridiagonal system on the slopes (Thomas algorithm). Two knots give
    the straight line.
    """

    n = len(xs)
    if n < 2:
        raise ColourError("a spline needs two points")
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    if n == 2:
        return [d[0], d[0]]
    # Row i: sub[i]*s[i-1] + diag[i]*s[i] + sup[i]*s[i+1] = rhs[i]
    sub = [0.0] * n
    dia = [0.0] * n
    sup = [0.0] * n
    rhs = [0.0] * n
    dia[0], sup[0], rhs[0] = 2.0, 1.0, 3.0 * d[0]
    for i in range(1, n - 1):
        sub[i] = h[i]
        dia[i] = 2.0 * (h[i - 1] + h[i])
        sup[i] = h[i - 1]
        rhs[i] = 3.0 * (h[i] * d[i - 1] + h[i - 1] * d[i])
    sub[n - 1], dia[n - 1], rhs[n - 1] = 1.0, 2.0, 3.0 * d[n - 2]
    for i in range(1, n):
        f = sub[i] / dia[i - 1]
        dia[i] -= f * sup[i - 1]
        rhs[i] -= f * rhs[i - 1]
    s = [0.0] * n
    s[n - 1] = rhs[n - 1] / dia[n - 1]
    for i in range(n - 2, -1, -1):
        s[i] = (rhs[i] - sup[i] * s[i + 1]) / dia[i]
    return s


@dataclass(frozen=True)
class ToneCurve:
    """A ``ProfileToneCurve``: points ``(x, y)`` in linear gamma, first (0, 0)
    and last (1, 1), joined by the natural cubic spline.

    ``table`` samples the spline at ``TONE_TABLE_STEPS + 1`` even steps (plus
    one guard entry) and ``__call__`` reads it with linear interpolation,
    clamping the input to [0, 1], the way dng_sdk's ``dng_1d_table`` does.
    """

    xs: tuple[float, ...]
    ys: tuple[float, ...]
    slopes: tuple[float, ...]
    table: tuple[float, ...]

    @classmethod
    def from_tags(cls, values) -> ToneCurve:
        vals = [float(v) for v in (values or ())]
        if len(vals) < 4 or len(vals) % 2:
            raise ColourError(f"tone curve holds {len(vals)} values; it needs pairs, at least two points")
        if any(not math.isfinite(v) for v in vals):
            raise ColourError("tone curve holds a value that is not finite")
        xs, ys = vals[0::2], vals[1::2]
        if abs(xs[0]) > 1e-6 or abs(ys[0]) > 1e-6 or abs(xs[-1] - 1.0) > 1e-6 or abs(ys[-1] - 1.0) > 1e-6:
            raise ColourError("tone curve must start at (0, 0) and end at (1, 1)")
        if any(b <= a for a, b in zip(xs, xs[1:])):
            raise ColourError("tone curve inputs must increase")
        if any(not -1e-6 <= y <= 1.0 + 1e-6 for y in ys):
            raise ColourError("tone curve outputs must lie in [0, 1]")
        return cls.from_points(xs, ys)

    @classmethod
    def from_points(cls, xs, ys) -> ToneCurve:
        xs, ys = tuple(float(v) for v in xs), tuple(float(v) for v in ys)
        slopes = tuple(natural_spline_slopes(xs, ys))
        curve = cls(xs, ys, slopes, ())
        steps = TONE_TABLE_STEPS
        table = [curve.evaluate(i / steps) for i in range(steps + 1)]
        table.append(table[-1])
        return cls(xs, ys, slopes, tuple(table))

    @property
    def points(self) -> int:
        return len(self.xs)

    def is_identity(self) -> bool:
        return all(abs(x - y) < 1e-9 for x, y in zip(self.xs, self.ys))

    def evaluate(self, x: float) -> float:
        """The spline itself at ``x`` (held at the end values outside the knots)."""

        xs, ys, s = self.xs, self.ys, self.slopes
        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]
        lo, hi = 0, len(xs) - 1
        while hi - lo > 1:
            mid = (lo + hi) >> 1
            if xs[mid] <= x:
                lo = mid
            else:
                hi = mid
        x0, x1 = xs[lo], xs[hi]
        a = x1 - x0
        t = (x - x0) / a
        u = 1.0 - t
        # Cubic Hermite basis.
        return (
            ys[lo] * (1.0 + 2.0 * t) * u * u
            + s[lo] * a * t * u * u
            + ys[hi] * (3.0 - 2.0 * t) * t * t
            - s[hi] * a * t * t * u
        )

    def __call__(self, x: float) -> float:
        if x <= 0.0:
            return self.table[0]
        if x >= 1.0:
            return self.table[TONE_TABLE_STEPS]
        y = x * TONE_TABLE_STEPS
        i = int(y)
        f = y - i
        t = self.table
        return t[i] + f * (t[i + 1] - t[i])


def rgb_tone(curve: ToneCurve, r: float, g: float, b: float) -> tuple[float, float, float]:
    """The hue-preserving RGB tone (dng_sdk's ``RefBaselineRGBTone``).

    The largest and smallest channels go through the curve; the middle one
    keeps its place between them, ``mid' = lo' + (hi' - lo') * (mid - lo) /
    (hi - lo)``. With two channels equal and the third the largest, the two
    equal ones both go through the curve. HSV hue is unchanged.
    """

    if r >= g:
        if g > b:  # r >= g > b
            rr, bb = curve(r), curve(b)
            return rr, bb + (rr - bb) * (g - b) / (r - b), bb
        if b > r:  # b > r >= g
            bb, gg = curve(b), curve(g)
            return gg + (bb - gg) * (r - g) / (b - g), gg, bb
        if b > g:  # r >= b > g
            rr, gg = curve(r), curve(g)
            return rr, gg, gg + (rr - gg) * (b - g) / (r - g)
        # r >= g == b
        rr, gg = curve(r), curve(g)
        return rr, gg, gg
    if r >= b:  # g > r >= b
        gg, bb = curve(g), curve(b)
        return bb + (gg - bb) * (r - b) / (g - b), gg, bb
    if b > g:  # b > g > r
        bb, rr = curve(b), curve(r)
        return rr, rr + (bb - rr) * (g - r) / (b - r), bb
    # g >= b > r
    gg, rr = curve(g), curve(r)
    return rr, gg, rr + (gg - rr) * (b - r) / (g - r)


@dataclass(frozen=True)
class ProfileLook:
    """The profile's tables between the camera matrix and the output space.

    The input is linear ProPhoto RGB with the exposure gain already in it (the
    developer folds the gain into its white-balance multipliers). In the
    specification's order: take the gain back out and pin to [0, 1], apply the
    hue/saturation map, put the exposure back, pin, apply the look table, then
    the tone curve (hue-preserving RGB tone); then ``out`` maps ProPhoto to
    the output space (linear sRGB in the developer).
    """

    hue_sat_map: HueSatTable | None
    look_table: HueSatTable | None
    gain: float
    out: Matrix
    tone: ToneCurve | None = None

    def apply(self, r: float, g: float, b: float) -> tuple[float, float, float]:
        if self.hue_sat_map is not None:
            gain = self.gain
            r, g, b = self.hue_sat_map.apply(_pin(r / gain), _pin(g / gain), _pin(b / gain))
            r, g, b = r * gain, g * gain, b * gain
        r, g, b = _pin(r), _pin(g), _pin(b)
        if self.look_table is not None:
            r, g, b = self.look_table.apply(r, g, b)
        if self.tone is not None:
            r, g, b = rgb_tone(self.tone, r, g, b)
        m = self.out
        return (
            m[0][0] * r + m[0][1] * g + m[0][2] * b,
            m[1][0] * r + m[1][1] * g + m[1][2] * b,
            m[2][0] * r + m[2][1] * g + m[2][2] * b,
        )
