"""CSS colour values, alpha compositing, and the WCAG contrast ratio.

Standard library only, like the rest of this probe. Three jobs:

1. **Parse** the colour syntaxes a real stylesheet actually contains — hex,
   ``rgb()``/``rgba()``, ``hsl()``/``hsla()``, ``oklch()``, the CSS named
   colours, and ``transparent``. ``oklch()`` is not optional: Tailwind v4 —
   which is what this portfolio's own venture ships — writes its entire default
   palette in ``oklch()``, so a parser without it resolves nothing on a modern
   build.
2. **Composite** a translucent colour over an opaque backdrop, because
   ``bg-white/70`` on top of a page background is the single most common shape
   in the corpus this was measured on.
3. **Score** a foreground/background pair with the WCAG 2.2 relative-luminance
   formula.

Everything here is exact arithmetic on values the file states. Nothing is
inferred, defaulted, or guessed: a syntax this module does not understand
returns ``None`` rather than an approximation, and the caller turns that into
an *undecidable* verdict with a named reason. That asymmetry is the whole point
— see :mod:`wcag_triage.contrast`.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Rgba:
    """A colour in sRGB, channels 0–255, alpha 0–1."""

    r: float
    g: float
    b: float
    a: float = 1.0

    @property
    def opaque(self) -> bool:
        return self.a >= 1.0

    @property
    def transparent(self) -> bool:
        return self.a <= 0.0

    def hex(self) -> str:
        return "#%02x%02x%02x" % (
            int(round(max(0.0, min(255.0, self.r)))),
            int(round(max(0.0, min(255.0, self.g)))),
            int(round(max(0.0, min(255.0, self.b)))),
        )


# ---------------------------------------------------------------------------
# Named colours.
#
# The full CSS named-colour list is 148 entries. Carrying all of them buys
# nothing here and would be 148 lines of transcription risk, so this is the set
# that actually appears in hand-written page styling, plus the two that decide
# most pages. A name not in this table parses as ``None`` — undecidable, not
# assumed — which is the safe direction.
# ---------------------------------------------------------------------------

NAMED_COLORS: dict = {
    "black": (0, 0, 0),
    "white": (255, 255, 255),
    "red": (255, 0, 0),
    "green": (0, 128, 0),
    "blue": (0, 0, 255),
    "yellow": (255, 255, 0),
    "cyan": (0, 255, 255),
    "aqua": (0, 255, 255),
    "magenta": (255, 0, 255),
    "fuchsia": (255, 0, 255),
    "gray": (128, 128, 128),
    "grey": (128, 128, 128),
    "silver": (192, 192, 192),
    "maroon": (128, 0, 0),
    "olive": (128, 128, 0),
    "lime": (0, 255, 0),
    "teal": (0, 128, 128),
    "navy": (0, 0, 128),
    "purple": (128, 0, 128),
    "orange": (255, 165, 0),
    "pink": (255, 192, 203),
    "brown": (165, 42, 42),
    "gold": (255, 215, 0),
    "beige": (245, 245, 220),
    "ivory": (255, 255, 240),
    "khaki": (240, 230, 140),
    "salmon": (250, 128, 114),
    "tan": (210, 180, 140),
    "violet": (238, 130, 238),
    "indigo": (75, 0, 130),
    "crimson": (220, 20, 60),
    "darkgray": (169, 169, 169),
    "darkgrey": (169, 169, 169),
    "lightgray": (211, 211, 211),
    "lightgrey": (211, 211, 211),
    "dimgray": (105, 105, 105),
    "dimgrey": (105, 105, 105),
    "whitesmoke": (245, 245, 245),
    "gainsboro": (220, 220, 220),
    "rebeccapurple": (102, 51, 153),
}

TRANSPARENT = Rgba(0.0, 0.0, 0.0, 0.0)

_HEX_RE = re.compile(r"^#([0-9a-fA-F]{3,8})$")
_FUNC_RE = re.compile(r"^([a-zA-Z-]+)\(\s*(.*)\s*\)$", re.DOTALL)


def _split_args(body: str) -> list:
    """Split a colour function's argument list.

    Handles both the legacy comma form (``rgb(1, 2, 3)``) and the modern
    space form with a slash for alpha (``rgb(1 2 3 / 0.5)``). Nested
    parentheses are not expected inside a colour function's channels and are
    not supported; a value containing one returns an empty split, which the
    caller reads as unparseable.
    """
    if "(" in body:
        return []
    body = body.replace("/", " / ")
    parts = [p for p in re.split(r"[,\s]+", body.strip()) if p]
    return parts


def _pct_or_number(token: str, scale: float) -> Optional[float]:
    token = token.strip()
    try:
        if token.endswith("%"):
            return float(token[:-1]) / 100.0 * scale
        return float(token)
    except ValueError:
        return None


def _alpha(token: Optional[str]) -> Optional[float]:
    if token is None:
        return 1.0
    token = token.strip()
    if token == "none":
        return 1.0
    value = _pct_or_number(token, 1.0)
    if value is None:
        return None
    return max(0.0, min(1.0, value))


def parse_color(value: str) -> Optional[Rgba]:
    """Parse one CSS colour value, or ``None`` if this module cannot.

    ``None`` is a real answer, not a failure: it means the value's colour is
    not determined by the text alone (``currentColor``, ``inherit``, an
    unresolved ``var()``, a system colour, a name outside the table above) and
    the caller must record it as undecidable.
    """
    if value is None:
        return None
    text = value.strip().lower()
    if not text:
        return None
    if text == "transparent":
        return TRANSPARENT
    if text in NAMED_COLORS:
        r, g, b = NAMED_COLORS[text]
        return Rgba(float(r), float(g), float(b), 1.0)

    hex_match = _HEX_RE.match(text)
    if hex_match:
        return _parse_hex(hex_match.group(1))

    if text.startswith("color-mix("):
        return _parse_color_mix(text)

    func_match = _FUNC_RE.match(text)
    if func_match:
        name = func_match.group(1)
        args = _split_args(func_match.group(2))
        if not args:
            return None
        if name in {"rgb", "rgba"}:
            return _parse_rgb(args)
        if name in {"hsl", "hsla"}:
            return _parse_hsl(args)
        if name == "oklch":
            return _parse_oklch(args)
        if name == "lab":
            return _parse_lab(args)
    return None


_COLOR_MIX_RE = re.compile(
    r"^color-mix\(\s*in\s+[a-z-]+(?:\s+(?:shorter|longer|increasing|decreasing)\s+hue)?\s*,\s*(.+)\)$"
)


def _parse_color_mix(text: str) -> Optional[Rgba]:
    """Handle the one ``color-mix()`` form that is exactly reducible.

    Mixing a colour with ``transparent`` scales its alpha and leaves its
    channels alone — true in every interpolation space, because the
    fully-transparent operand contributes no colour under premultiplied
    interpolation. Tailwind v4 emits exactly this for every ``/opacity``
    utility (``color-mix(in oklab, var(--color-white) 90%, transparent)``), so
    supporting this one case resolves the whole opacity-modifier family without
    committing to interpolation in an arbitrary space.

    Any other ``color-mix()`` returns ``None`` — undecidable, not approximated.
    """
    match = _COLOR_MIX_RE.match(text)
    if not match:
        return None
    operands = _split_top_level(match.group(1))
    if len(operands) != 2:
        return None
    parsed = []
    for operand in operands:
        tokens = operand.strip().rsplit(" ", 1)
        percent = None
        color_text = operand.strip()
        if len(tokens) == 2 and tokens[1].endswith("%"):
            try:
                percent = float(tokens[1][:-1]) / 100.0
            except ValueError:
                return None
            color_text = tokens[0].strip()
        parsed.append((color_text.strip().lower(), percent))

    transparent_side = [i for i, (c, _) in enumerate(parsed) if c == "transparent"]
    if len(transparent_side) != 1:
        return None
    keep_index = 1 - transparent_side[0]
    color_text, percent = parsed[keep_index]
    base = parse_color(color_text)
    if base is None:
        return None
    if percent is None:
        other_percent = parsed[transparent_side[0]][1]
        if other_percent is None:
            return None
        percent = 1.0 - other_percent
    return Rgba(base.r, base.g, base.b, max(0.0, min(1.0, base.a * percent)))


def _split_top_level(text: str) -> list:
    """Split on commas that are not inside parentheses."""
    parts = []
    depth = 0
    current = []
    for char in text:
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        if char == "," and depth == 0:
            parts.append("".join(current))
            current = []
        else:
            current.append(char)
    parts.append("".join(current))
    return [p for p in parts if p.strip()]


def _parse_hex(digits: str) -> Optional[Rgba]:
    if len(digits) in (3, 4):
        channels = [int(c * 2, 16) for c in digits]
    elif len(digits) in (6, 8):
        channels = [int(digits[i : i + 2], 16) for i in range(0, len(digits), 2)]
    else:
        return None
    alpha = channels[3] / 255.0 if len(channels) == 4 else 1.0
    return Rgba(float(channels[0]), float(channels[1]), float(channels[2]), alpha)


def _clean(args: list) -> list:
    return [a for a in args if a != "/"]


def _parse_rgb(args: list) -> Optional[Rgba]:
    slash = "/" in args
    values = _clean(args)
    if len(values) not in (3, 4):
        return None
    channels = [_pct_or_number(v, 255.0) for v in values[:3]]
    if any(c is None for c in channels):
        return None
    alpha = _alpha(values[3] if len(values) == 4 else None)
    if alpha is None:
        return None
    if len(values) == 4 and not slash:
        # Legacy ``rgba(r, g, b, a)`` — same shape, alpha already read.
        pass
    return Rgba(
        max(0.0, min(255.0, channels[0])),
        max(0.0, min(255.0, channels[1])),
        max(0.0, min(255.0, channels[2])),
        alpha,
    )


def _parse_hsl(args: list) -> Optional[Rgba]:
    values = _clean(args)
    if len(values) not in (3, 4):
        return None
    hue_token = values[0].strip()
    for unit in ("deg", "turn", "rad", "grad"):
        if hue_token.endswith(unit):
            number = hue_token[: -len(unit)]
            try:
                raw = float(number)
            except ValueError:
                return None
            if unit == "turn":
                raw *= 360.0
            elif unit == "rad":
                raw = math.degrees(raw)
            elif unit == "grad":
                raw *= 0.9
            hue_token = str(raw)
            break
    try:
        hue = float(hue_token) % 360.0
    except ValueError:
        return None
    saturation = _pct_or_number(values[1], 1.0)
    lightness = _pct_or_number(values[2], 1.0)
    if saturation is None or lightness is None:
        return None
    alpha = _alpha(values[3] if len(values) == 4 else None)
    if alpha is None:
        return None
    r, g, b = _hsl_to_rgb(hue, max(0.0, min(1.0, saturation)), max(0.0, min(1.0, lightness)))
    return Rgba(r * 255.0, g * 255.0, b * 255.0, alpha)


def _hsl_to_rgb(hue: float, saturation: float, lightness: float) -> tuple:
    chroma = (1.0 - abs(2.0 * lightness - 1.0)) * saturation
    hue_prime = hue / 60.0
    second = chroma * (1.0 - abs(hue_prime % 2.0 - 1.0))
    if hue_prime < 1:
        rgb = (chroma, second, 0.0)
    elif hue_prime < 2:
        rgb = (second, chroma, 0.0)
    elif hue_prime < 3:
        rgb = (0.0, chroma, second)
    elif hue_prime < 4:
        rgb = (0.0, second, chroma)
    elif hue_prime < 5:
        rgb = (second, 0.0, chroma)
    else:
        rgb = (chroma, 0.0, second)
    offset = lightness - chroma / 2.0
    return (rgb[0] + offset, rgb[1] + offset, rgb[2] + offset)


def _parse_oklch(args: list) -> Optional[Rgba]:
    values = _clean(args)
    if len(values) not in (3, 4):
        return None
    lightness = _pct_or_number(values[0], 1.0)
    chroma = _pct_or_number(values[1], 0.4)
    hue_token = values[2].strip()
    if hue_token.endswith("deg"):
        hue_token = hue_token[:-3]
    if hue_token == "none":
        hue_token = "0"
    try:
        hue = float(hue_token)
    except ValueError:
        return None
    if lightness is None or chroma is None:
        return None
    alpha = _alpha(values[3] if len(values) == 4 else None)
    if alpha is None:
        return None
    r, g, b = _oklch_to_srgb(lightness, chroma, hue)
    return Rgba(r * 255.0, g * 255.0, b * 255.0, alpha)


def _oklch_to_srgb(lightness: float, chroma: float, hue_deg: float) -> tuple:
    """Convert OKLCH to gamma-encoded sRGB, clamped to the gamut.

    Björn Ottosson's Oklab matrices, then the sRGB transfer function. Out-of-
    gamut results are clamped per channel rather than gamut-mapped; every
    palette value a stylesheet ships is in gamut, and clamping keeps a
    hand-written out-of-gamut value from silently producing a nonsense
    luminance.
    """
    hue = math.radians(hue_deg)
    a = chroma * math.cos(hue)
    b = chroma * math.sin(hue)

    l_ = lightness + 0.3963377774 * a + 0.2158037573 * b
    m_ = lightness - 0.1055613458 * a - 0.0638541728 * b
    s_ = lightness - 0.0894841775 * a - 1.2914855480 * b

    l = l_ ** 3
    m = m_ ** 3
    s = s_ ** 3

    linear = (
        +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    )
    return tuple(_encode_srgb(max(0.0, min(1.0, c))) for c in linear)


def _parse_lab(args: list) -> Optional[Rgba]:
    values = _clean(args)
    if len(values) not in (3, 4):
        return None
    lightness = _pct_or_number(values[0], 100.0)
    a_axis = _pct_or_number(values[1], 125.0)
    b_axis = _pct_or_number(values[2], 125.0)
    if lightness is None or a_axis is None or b_axis is None:
        return None
    alpha = _alpha(values[3] if len(values) == 4 else None)
    if alpha is None:
        return None
    r, g, b = _lab_to_srgb(lightness, a_axis, b_axis)
    return Rgba(r * 255.0, g * 255.0, b * 255.0, alpha)


# CIE standard constants for the L*a*b* transfer function.
_LAB_EPSILON = 216.0 / 24389.0
_LAB_KAPPA = 24389.0 / 27.0
# CSS Color 4 specifies lab() against the D50 white point.
_D50 = (0.3457 / 0.3585, 1.0, (1.0 - 0.3457 - 0.3585) / 0.3585)

# Bradford chromatic adaptation, D50 -> D65.
_BRADFORD_D50_TO_D65 = (
    (0.9554734527042182, -0.023098536874261423, 0.0632593086610217),
    (-0.028369706963208136, 1.0099954580058226, 0.021041398966943008),
    (0.012314001688319899, -0.020507696433477912, 1.3303659366080753),
)

# XYZ (D65) -> linear-light sRGB.
_XYZ_D65_TO_LINEAR_SRGB = (
    (3.2404542, -1.5371385, -0.4985314),
    (-0.9692660, 1.8760108, 0.0415560),
    (0.0556434, -0.2040259, 1.0572252),
)


def _matmul(matrix: tuple, vector: tuple) -> tuple:
    return tuple(sum(row[i] * vector[i] for i in range(3)) for row in matrix)


def _lab_to_srgb(lightness: float, a_axis: float, b_axis: float) -> tuple:
    """Convert CIE L*a*b* (D50, as CSS defines it) to gamma-encoded sRGB.

    Three published steps, each standard: the L*a*b* inverse transfer function
    to XYZ under D50, Bradford adaptation to D65, then the sRGB primaries
    matrix and transfer function.

    This exists because Tailwind v4 ships every palette entry twice — a hex
    fallback and a ``lab()`` override inside ``@supports (color: lab(...))``.
    A parser that reads only the fallback is guessing that the two agree.
    ``tests/test_colors.py`` does not guess: it reads both forms out of a real
    built stylesheet and asserts this conversion reproduces the fallback, which
    is a ground-truth check on the matrices above rather than a self-consistency
    one.
    """
    fy = (lightness + 16.0) / 116.0
    fx = fy + a_axis / 500.0
    fz = fy - b_axis / 200.0

    def inverse(f: float, is_y: bool, l: float) -> float:
        cubed = f ** 3
        if is_y:
            return cubed if l > _LAB_KAPPA * _LAB_EPSILON else l / _LAB_KAPPA
        return cubed if cubed > _LAB_EPSILON else (116.0 * f - 16.0) / _LAB_KAPPA

    xyz_d50 = (
        inverse(fx, False, lightness) * _D50[0],
        inverse(fy, True, lightness) * _D50[1],
        inverse(fz, False, lightness) * _D50[2],
    )
    xyz_d65 = _matmul(_BRADFORD_D50_TO_D65, xyz_d50)
    linear = _matmul(_XYZ_D65_TO_LINEAR_SRGB, xyz_d65)
    return tuple(_encode_srgb(max(0.0, min(1.0, c))) for c in linear)


def _encode_srgb(channel: float) -> float:
    if channel <= 0.0031308:
        return 12.92 * channel
    return 1.055 * (channel ** (1.0 / 2.4)) - 0.055


# ---------------------------------------------------------------------------
# Compositing and scoring.
# ---------------------------------------------------------------------------


def composite(top: Rgba, backdrop: Rgba) -> Rgba:
    """Simple alpha-over of ``top`` on an opaque ``backdrop``.

    The backdrop must be opaque — the caller resolves a layer stack down to an
    opaque base before compositing, so a translucent backdrop here is a bug
    rather than an input.
    """
    if not backdrop.opaque:
        raise ValueError("backdrop must be opaque")
    alpha = max(0.0, min(1.0, top.a))
    return Rgba(
        top.r * alpha + backdrop.r * (1.0 - alpha),
        top.g * alpha + backdrop.g * (1.0 - alpha),
        top.b * alpha + backdrop.b * (1.0 - alpha),
        1.0,
    )


def relative_luminance(color: Rgba) -> float:
    """WCAG 2.2 relative luminance of an opaque colour."""
    channels = []
    for raw in (color.r, color.g, color.b):
        c = max(0.0, min(1.0, raw / 255.0))
        channels.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def contrast_ratio(first: Rgba, second: Rgba) -> float:
    """WCAG contrast ratio between two opaque colours, 1.0–21.0."""
    a = relative_luminance(first)
    b = relative_luminance(second)
    lighter, darker = (a, b) if a >= b else (b, a)
    return (lighter + 0.05) / (darker + 0.05)


def ratio_for_luminance(foreground_luminance: float, background_luminance: float) -> float:
    lighter, darker = (
        (foreground_luminance, background_luminance)
        if foreground_luminance >= background_luminance
        else (background_luminance, foreground_luminance)
    )
    return (lighter + 0.05) / (darker + 0.05)


def ratio_bounds(foreground: Rgba, backgrounds: list) -> tuple:
    """Tightest ``(min_ratio, max_ratio)`` over a *continuum* of backgrounds.

    ``backgrounds`` is the ordered list of opaque colours a gradient
    interpolates between (a solid background is a one-element list). Two facts
    make the bound exact rather than a sample:

    * A CSS gradient interpolates each sRGB channel linearly between adjacent
      stops, and relative luminance is monotonic in each channel, so the
      luminance attained along the gradient is exactly the interval
      ``[min(stop luminances), max(stop luminances)]`` — no interior extremum
      exists to be missed.
    * For a fixed foreground luminance ``Lf``, the contrast ratio as a function
      of background luminance ``Lb`` decreases as ``Lb`` approaches ``Lf`` and
      increases away from it. So over an interval the minimum is at the point
      nearest ``Lf`` (clamped into the interval) and the maximum is at whichever
      endpoint is farther.

    That is why a gradient background is *decidable* here rather than a reason
    to give up: the answer is a bound, and a bound that lies wholly on one side
    of the threshold settles the criterion.
    """
    if not backgrounds:
        raise ValueError("need at least one background colour")
    fg = relative_luminance(foreground)
    luminances = [relative_luminance(c) for c in backgrounds]
    low, high = min(luminances), max(luminances)
    nearest = max(low, min(high, fg))
    minimum = ratio_for_luminance(fg, nearest)
    maximum = max(ratio_for_luminance(fg, low), ratio_for_luminance(fg, high))
    return (minimum, maximum)
