"""Colour parsing and the contrast arithmetic.

The load-bearing tests here are the two that check against something outside
this repository's own opinion: published WCAG contrast ratios for known colour
pairs, and the ``lab()``/hex pairs a real Tailwind v4 build emits for the same
palette entry.
"""

import json
from pathlib import Path

from wcag_triage.colors import (
    Rgba,
    composite,
    contrast_ratio,
    parse_color,
    ratio_bounds,
    relative_luminance,
)

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"

WHITE = parse_color("#ffffff")
BLACK = parse_color("#000000")


# Published WCAG ratios. #767676 is the canonical "smallest grey that passes AA
# on white" and #777777 the one just below it; getting either wrong by a
# rounding error would put the engine on the wrong side of the threshold.
KNOWN_RATIOS = [
    ("#ffffff", "#000000", 21.0),
    ("#767676", "#ffffff", 4.54),
    ("#777777", "#ffffff", 4.48),
    ("#595959", "#ffffff", 7.00),
    ("#0000ff", "#ffffff", 8.59),
    ("#ff0000", "#ffffff", 4.00),
]


def test_known_contrast_ratios():
    for first, second, expected in KNOWN_RATIOS:
        actual = contrast_ratio(parse_color(first), parse_color(second))
        assert abs(actual - expected) < 0.01, (first, second, actual, expected)


def test_luminance_endpoints():
    assert relative_luminance(WHITE) == 1.0
    assert relative_luminance(BLACK) == 0.0


def test_hex_forms():
    assert parse_color("#fff") == Rgba(255.0, 255.0, 255.0, 1.0)
    assert parse_color("#ffffff") == Rgba(255.0, 255.0, 255.0, 1.0)
    assert parse_color("#ffffff80").a == 128 / 255
    assert parse_color("#f00").hex() == "#ff0000"
    assert parse_color("#12345") is None


def test_rgb_both_syntaxes():
    assert parse_color("rgb(1, 2, 3)") == Rgba(1.0, 2.0, 3.0, 1.0)
    assert parse_color("rgb(1 2 3 / 0.5)").a == 0.5
    assert parse_color("rgba(1, 2, 3, 0.25)").a == 0.25
    assert parse_color("rgb(100% 0% 0%)").hex() == "#ff0000"


def test_hsl():
    assert parse_color("hsl(0 100% 50%)").hex() == "#ff0000"
    assert parse_color("hsl(120deg, 100%, 50%)").hex() == "#00ff00"
    assert parse_color("hsla(240, 100%, 50%, 0.5)").a == 0.5


def test_oklch_endpoints():
    assert parse_color("oklch(0 0 0)").hex() == "#000000"
    assert parse_color("oklch(1 0 0)").hex() == "#ffffff"


def test_lab_matches_the_hex_fallback_a_real_build_ships():
    """Ground truth for the CIELAB conversion, not a self-consistency check.

    Tailwind v4 writes every palette entry twice — an sRGB hex fallback and a
    `lab()` override under `@supports` — so the build itself states what each
    `lab()` value should come out as. The tolerance is on *relative luminance*
    rather than channels because that is what a contrast ratio is a function
    of, and because the two forms legitimately diverge in channel space
    wherever the hex fallback is a gamut-mapped rendition of a colour outside
    sRGB (`red-600` is the widest, at 9/255 on one channel).
    """
    data = json.loads((FIXTURES / "tailwind-v4-lab-pairs.json").read_text())
    pairs = data["pairs"]
    assert len(pairs) > 100
    worst = 0.0
    for name, entry in pairs.items():
        from_hex = parse_color(entry["hex"])
        from_lab = parse_color(entry["lab"])
        assert from_lab is not None, name
        delta = abs(relative_luminance(from_hex) - relative_luminance(from_lab))
        worst = max(worst, delta)
    assert worst < 0.01, worst


def test_color_mix_with_transparent_is_alpha():
    parsed = parse_color("color-mix(in oklab, #fff 90%, transparent)")
    assert parsed.hex() == "#ffffff"
    assert abs(parsed.a - 0.9) < 1e-9


def test_color_mix_of_two_real_colors_is_refused():
    # Interpolating in an arbitrary space is not something this module claims
    # to do, and guessing would move a ratio across a threshold.
    assert parse_color("color-mix(in oklab, #fff 50%, #000)") is None


def test_unknown_values_return_none_rather_than_a_guess():
    for value in ("currentColor", "inherit", "var(--x)", "rebeccapurpleish", "", "  "):
        assert parse_color(value) is None


def test_named_colors():
    assert parse_color("white") == Rgba(255.0, 255.0, 255.0, 1.0)
    assert parse_color("transparent").transparent


def test_composite_over_opaque():
    half_black = Rgba(0.0, 0.0, 0.0, 0.5)
    assert composite(half_black, WHITE).hex() == "#808080"


def test_ratio_bounds_on_a_solid_background():
    low, high = ratio_bounds(BLACK, [WHITE])
    assert abs(low - 21.0) < 1e-9
    assert abs(high - 21.0) < 1e-9


def test_ratio_bounds_bracket_a_gradient():
    # Text mid-grey over a black-to-white gradient: somewhere on the gradient
    # the background matches the text exactly, so the minimum is 1.0, and the
    # maximum is at whichever end is farther away.
    grey = parse_color("#767676")
    low, high = ratio_bounds(grey, [BLACK, WHITE])
    assert abs(low - 1.0) < 1e-9
    # The far end is black, not white: #767676 sits slightly nearer white in
    # luminance, so the widest ratio it reaches on this gradient is against
    # black (4.62) rather than the published 4.54 against white.
    assert abs(high - contrast_ratio(grey, BLACK)) < 1e-9
    assert high > contrast_ratio(grey, WHITE)


def test_ratio_bounds_take_the_extremes_from_the_stops():
    low, high = ratio_bounds(BLACK, [parse_color("#eeeeee"), WHITE])
    assert low < high
    assert abs(high - 21.0) < 1e-9
