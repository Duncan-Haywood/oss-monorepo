"""Sony's in-file lens corrections: the distortion, lateral colour and vignetting tables an ARW carries.

Sony E-mount bodies write the lens's own correction curves into the raw file's first sub-IFD (the full-size raw
image's IFD) as three signed 16-bit tag arrays, the same data the camera uses for its JPEGs:

- ``0x7032`` VignettingCorrParams: ``n`` then ``n`` knots (17 values; 11 or 16 knots seen so far);
- ``0x7035`` ChromaticAberrationCorrParams: ``2n`` then ``n`` knots for red and ``n`` for blue (33 values);
- ``0x7037`` DistortionCorrParams: ``n`` then ``n`` knots (17 values).

The knots are evenly spaced in radius from the image centre (knot 0) to the corner (knot ``n - 1``), as darktable
reads them (``src/common/exif.cc`` and ``src/iop/lens.cc``, darktable 4.4 and later; GPL, read for the format
only, no code copied). The values are fixed point:

- distortion: an output pixel at radius ``r`` takes its colour from radius ``r * (1 + d / 2**14)`` of the raw
  frame (negative ``d`` is barrel distortion);
- lateral colour: red and blue are sampled at the green radius times ``1 + c / 2**21``;
- vignetting: the pixel is multiplied by ``2 ** (2 ** (v / 2**13 - 1) - 0.5)`` (1 where ``v = 0``).

``eval/sony-in-file-corrections-2026-11-15.md`` checks each of these against lensfun's own calibration of the
same lens at the same focal length on three real frames (A5000, A7 III, A7 IV): the knot spacing (centre to
corner) and the 2**-14 distortion scale are both recovered from lensfun's curves by a free fit.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

TAG_VIGNETTING = 0x7032
TAG_CA = 0x7035
TAG_DISTORTION = 0x7037
# Seen only on the A7 IV (7032, 4688): the full sensor size the tables describe, not used.
TAG_CORRECTION_SIZE = 0x7038

DISTORTION_SCALE = 2.0 ** -14
CA_SCALE = 2.0 ** -21
VIGNETTING_SCALE = 2.0 ** -13


@dataclass(frozen=True)
class SonyCorrections:
    """The knot values as stored (``None`` for a table the file lacks). Radius ``rho`` runs 0 (centre) to 1
    (corner); knot ``i`` sits at ``i / (n - 1)``."""

    distortion: tuple[int, ...] | None
    ca_red: tuple[int, ...] | None
    ca_blue: tuple[int, ...] | None
    vignetting: tuple[int, ...] | None
    size: tuple[int, int] | None = None

    def distortion_factor(self, rho: float) -> float:
        """Source radius over output radius at ``rho`` (1 where there is no table)."""

        return 1.0 + _interp(self.distortion, rho) * DISTORTION_SCALE if self.distortion else 1.0

    def ca_factors(self, rho: float) -> tuple[float, float]:
        """Red and blue source radius over green's at ``rho``."""

        if not self.ca_red or not self.ca_blue:
            return 1.0, 1.0
        return 1.0 + _interp(self.ca_red, rho) * CA_SCALE, 1.0 + _interp(self.ca_blue, rho) * CA_SCALE

    def vignetting_gain(self, rho: float) -> float:
        """The multiplier that lifts the corner falloff at ``rho`` (1 at the centre when knot 0 is 0)."""

        if not self.vignetting:
            return 1.0
        v = _interp(self.vignetting, rho) * VIGNETTING_SCALE
        return 2.0 ** (2.0 ** (v - 1.0) - 0.5)


def _interp(knots: tuple[int, ...], rho: float) -> float:
    """Linear between knots, held flat past the last one."""

    n = len(knots)
    if n == 1:
        return float(knots[0])
    x = min(max(rho, 0.0), 1.0) * (n - 1)
    i = min(int(x), n - 2)
    t = x - i
    return knots[i] * (1.0 - t) + knots[i + 1] * t


def _table(values, pieces: int) -> list[tuple[int, ...]] | None:
    """Split ``n`` (or ``2n``), then the knots; None when the count does not fit the array."""

    if not values or len(values) < 2:
        return None
    n = int(values[0])
    if n < 2 * pieces or n % pieces or n + 1 > len(values):
        return None
    k = n // pieces
    knots = [int(v) for v in values[1:n + 1]]
    return [tuple(knots[j * k:(j + 1) * k]) for j in range(pieces)]


def from_ifd(ifd) -> SonyCorrections | None:
    """Read the three tables from one IFD (``raw_develop.Ifd``); None when it holds none of them."""

    if ifd is None:
        return None
    dist = _table(ifd.get(TAG_DISTORTION), 1)
    ca = _table(ifd.get(TAG_CA), 2)
    vig = _table(ifd.get(TAG_VIGNETTING), 1)
    if not (dist or ca or vig):
        return None
    size = ifd.get(TAG_CORRECTION_SIZE)
    return SonyCorrections(
        dist[0] if dist else None,
        ca[0] if ca else None,
        ca[1] if ca else None,
        vig[0] if vig else None,
        (int(size[0]), int(size[1])) if size and len(size) >= 2 else None,
    )


def from_arw(data: bytes) -> SonyCorrections | None:
    """The first IFD of a Sony file that carries the tables (the raw image's sub-IFD), or None."""

    from shootflow import arw

    found = arw._ifds(data)
    if not found:
        return None
    for ifd in found[1]:
        corr = from_ifd(ifd)
        if corr is not None:
            return corr
    return None


def warp_terms(corr: SonyCorrections, degree: int = 7, plane: int | None = None,
               stretch: float = 1.0) -> tuple[float, ...]:
    """kr0..kr14 of a DNG WarpRectilinear2 (radius 1 at the corner) fitted to the distortion table.

    The DNG warp maps an output radius ``r`` to the source radius ``r * sum(kr_p r^p)``, the same direction as
    Sony's table, so the fit is least squares of ``sum(kr_p rho^p)`` on ``1 + d(rho) / 2**14`` at 200 radii.
    ``plane`` 0 or 2 multiplies in red's or blue's lateral colour factor (green's radius times ``1 + c / 2**21``).
    ``stretch`` is the warp's radius 1 over the knots' (above 1 when the raw frame has a margin round the picture
    the tables describe, as the A7 IV's 7168 x 5120 has round its 7032 x 4688); past the last knot the table is
    held flat.
    """

    xs = [i / 199 for i in range(200)]

    def factor(x: float) -> float:
        x *= stretch
        f = corr.distortion_factor(x)
        if plane in (0, 2):
            f *= corr.ca_factors(x)[0 if plane == 0 else 1]
        return f

    ys = [factor(x) for x in xs]
    m = degree + 1
    a = [[0.0] * m for _ in range(m)]
    b = [0.0] * m
    for x, y in zip(xs, ys):
        p = [x ** j for j in range(m)]
        for i in range(m):
            b[i] += p[i] * y
            for j in range(m):
                a[i][j] += p[i] * p[j]
    coef = _solve(a, b)
    return tuple(coef + [0.0] * (15 - m))


def _solve(a: list[list[float]], b: list[float]) -> list[float]:
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        m[c], m[p] = m[p], m[c]
        if abs(m[c][c]) < 1e-300:
            raise ValueError("singular fit")
        for r in range(n):
            if r != c:
                f = m[r][c] / m[c][c]
                for k in range(c, n + 1):
                    m[r][k] -= f * m[c][k]
    return [m[i][n] / m[i][i] for i in range(n)]


def build_warp(corr: SonyCorrections, w: int, h: int, fill: bool = True, tca: bool = True,
               picture: tuple[int, int] | None = None):
    """The table as a DNG WarpRectilinear2 for OpcodeList3 (one plane, or red, green, blue with ``tca``),
    zoomed to fill the frame as ``lens_profiles.build_warp`` does; returns ``(warp, zoom, notes)``.

    The warp's radius 1 is the frame's corner pixel; the knots' last radius is the corner of ``picture`` (width,
    height: the table's own size tag 0x7038, else the caller's crop, else the frame), centred on the frame."""

    from shootflow.dng_opcodes import WarpRectilinear2
    from shootflow.lens_profiles import fill_scale, scale_terms

    if not corr.distortion:
        raise ValueError("no distortion table")
    use_ca = tca and bool(corr.ca_red)
    pw, ph = corr.size or picture or (w, h)
    m = math.hypot((w - 1) / 2.0, (h - 1) / 2.0)
    stretch = m / (math.hypot((pw - 1) / 2.0, (ph - 1) / 2.0) or m)
    which = (0, 1, 2) if use_ca else (None,)
    planes = [warp_terms(corr, plane=p, stretch=stretch) for p in which]
    k = max(fill_scale(p, w, h) for p in planes) if fill else 1.0
    if k != 1.0:
        planes = [scale_terms(p, k) for p in planes]
    warp = WarpRectilinear2(tuple(p + (0.0, 0.0, 0.0, 1.0) for p in planes), 0.5, 0.5, False)
    worst = max(max_fit_error(corr, warp_terms(corr, plane=p), m / stretch, p) for p in which)
    note = (f"lens correction from the file's own Sony tables: distortion {len(corr.distortion)} knots"
            + (", lateral colour" if use_ca else "") + f" (fit within {worst:.2f} px)"
            + (f", knots end at the corner of {pw} x {ph}" if (pw, ph) != (w, h) else "")
            + (f", zoom {k:.4f} to fill the frame" if fill else ", no fill zoom")
            + "; vignetting table not applied (eval/sony-in-file-corrections-2026-11-15.md)")
    return warp, k, [note]


def max_fit_error(corr: SonyCorrections, kr: tuple[float, ...], half_diagonal_px: float,
                  plane: int | None = None) -> float:
    """Largest gap, in pixels at ``half_diagonal_px`` from the centre to the corner, between the fitted warp's
    source radius and the table's."""

    worst = 0.0
    for i in range(401):
        x = i / 400
        poly = 0.0
        for p in range(14, -1, -1):
            poly = poly * x + kr[p]
        want = corr.distortion_factor(x)
        if plane in (0, 2):
            want *= corr.ca_factors(x)[0 if plane == 0 else 1]
        worst = max(worst, abs(poly - want) * x * half_diagonal_px)
    return worst


def describe(corr: SonyCorrections) -> str:
    parts = []
    if corr.distortion:
        edge = (corr.distortion_factor(1.0) / corr.distortion_factor(0.0) - 1.0) * 100
        parts.append(f"distortion {len(corr.distortion)} knots ({edge:+.2f}% at the corner)")
    if corr.ca_red:
        r, b = corr.ca_factors(1.0)
        parts.append(f"lateral colour (red {(r - 1) * 1e4:+.1f}, blue {(b - 1) * 1e4:+.1f} per 10,000 at the corner)")
    if corr.vignetting:
        parts.append(f"vignetting (x{corr.vignetting_gain(1.0):.2f}, {math.log2(corr.vignetting_gain(1.0)):.2f} "
                     "stops at the corner)")
    return "Sony in-file corrections: " + ", ".join(parts)
