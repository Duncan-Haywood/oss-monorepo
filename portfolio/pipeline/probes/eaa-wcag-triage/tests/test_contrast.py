"""SC 1.4.3 resolution: what it decides, and every way it refuses.

The refusals are the tests that matter. A contrast checker that guesses is
worse than none — it puts a fabricated failure in front of a stranger, which is
the first contact this candidate's whole distribution wedge depends on.
"""

from wcag_triage import contrast as C
from wcag_triage.css import DARK, LIGHT, SCHEMES, parse_stylesheet
from wcag_triage.engine import audit_html
from wcag_triage.parser import parse


def evaluate_one(html: str, css: str = "", schemes: tuple = SCHEMES) -> C.ContrastResult:
    """Verdict for the single text-bearing element of interest (the last one)."""
    root = parse(html)
    sheet = parse_stylesheet(css)
    results = C.evaluate_document(root, sheet, schemes)
    assert results, "no text-bearing element found"
    return results[-1][1]


# ---------------------------------------------------------------------------
# Deciding.
# ---------------------------------------------------------------------------


def test_passes_on_black_on_white():
    result = evaluate_one(
        '<html><body style="background:#fff"><p style="color:#000">hi</p></body></html>'
    )
    assert result.verdict == C.PASS
    assert result.min_ratio == 21.0


def test_fails_below_the_normal_text_threshold():
    result = evaluate_one(
        '<html><body style="background:#fff"><p style="color:#999">hi</p></body></html>'
    )
    assert result.verdict == C.FAIL
    assert result.min_ratio < C.NORMAL_TEXT_RATIO
    assert result.threshold == C.NORMAL_TEXT_RATIO


def test_large_text_gets_the_lower_threshold():
    """The same colour pair passes at 24px and fails at 16px."""
    small = evaluate_one(
        '<html><body style="background:#fff"><p style="color:#888">hi</p></body></html>'
    )
    large = evaluate_one(
        '<html><body style="background:#fff">'
        '<p style="color:#888;font-size:24px">hi</p></body></html>'
    )
    assert small.verdict == C.FAIL
    assert large.verdict == C.PASS
    assert large.threshold == C.LARGE_TEXT_RATIO


def test_bold_18_66px_counts_as_large_but_bold_16px_does_not():
    bold_large = evaluate_one(
        '<html><body style="background:#fff">'
        '<p style="color:#888;font-size:19px;font-weight:700">hi</p></body></html>'
    )
    bold_small = evaluate_one(
        '<html><body style="background:#fff">'
        '<p style="color:#888;font-size:16px;font-weight:700">hi</p></body></html>'
    )
    assert bold_large.threshold == C.LARGE_TEXT_RATIO
    assert bold_small.threshold == C.NORMAL_TEXT_RATIO


def test_translucent_background_layer_is_composited():
    result = evaluate_one(
        '<html><body style="background:#000">'
        '<div style="background:rgb(255 255 255 / 0.5)">'
        '<p style="color:#000">hi</p></div></body></html>'
    )
    assert result.verdict == C.PASS
    assert result.backgrounds == ("#808080",)


def test_em_font_size_resolves_through_the_parent_chain():
    result = evaluate_one(
        '<html><body style="background:#fff;font-size:32px">'
        '<p style="color:#888;font-size:1em">hi</p></body></html>'
    )
    assert result.font_px == 32.0
    assert result.threshold == C.LARGE_TEXT_RATIO


def test_class_background_beats_a_type_selector_shorthand():
    """The bug this test exists for shipped a wrong answer on a real page.

    A Next.js reset writes `body { background: var(--background) }` and the
    markup carries `class="bg-white"`. Reading the shorthand first — instead of
    by specificity — makes the page look like it inherits a scheme-dependent
    background when the class settles it outright.
    """
    css = (
        ":root{--background:#ffffff}"
        "@media (prefers-color-scheme:dark){:root{--background:#0a0a0a}}"
        "body{background:var(--background)}"
        ".bg-white{background-color:#fff}"
        ".text-black{color:#000}"
    )
    result = evaluate_one(
        '<html><body class="bg-white"><p class="text-black">hi</p></body></html>', css
    )
    assert result.verdict == C.PASS
    assert result.backgrounds == ("#ffffff",)


# ---------------------------------------------------------------------------
# Colour schemes.
# ---------------------------------------------------------------------------


def test_a_dark_only_failure_is_found_and_a_light_only_scan_misses_it():
    css = (
        ".t{color:#333}"
        "@media (prefers-color-scheme:dark){.t{color:#333}}"
        ".b{background-color:#fff}"
        "@media (prefers-color-scheme:dark){.b{background-color:#000}}"
    )
    html = '<html><body class="b"><p class="t">hi</p></body></html>'
    light_only = evaluate_one(html, css, (LIGHT,))
    both = evaluate_one(html, css, SCHEMES)
    assert light_only.verdict == C.PASS
    assert both.verdict == C.FAIL


def test_a_scheme_only_utility_class_is_honoured_under_that_scheme():
    """`dark:text-amber-400` declares nothing outside its media query."""
    css = (
        ".text-amber-700{color:#b45309}"
        "@media (prefers-color-scheme:dark){.dark\\:text-amber-400{color:#fbbf24}}"
        ".bg{background-color:#ffffff}"
    )
    html = '<html><body class="bg"><p class="text-amber-700 dark:text-amber-400">hi</p></body></html>'
    root = parse(html)
    sheet = parse_stylesheet(css)
    node = C.text_elements(root)[-1]
    assert C.evaluate(sheet, node, LIGHT).foreground == "#b45309"
    assert C.evaluate(sheet, node, DARK).foreground == "#fbbf24"


def test_worst_of_prefers_a_failure_then_an_unknown():
    passing = C.ContrastResult(verdict=C.PASS, min_ratio=10.0)
    failing = C.ContrastResult(verdict=C.FAIL, min_ratio=2.0)
    unknown = C.ContrastResult(verdict=C.UNDECIDABLE, reason="conditional-color")
    assert C.worst_of([passing, failing]).verdict == C.FAIL
    assert C.worst_of([passing, unknown]).verdict == C.UNDECIDABLE
    assert C.worst_of([passing]).verdict == C.PASS


# ---------------------------------------------------------------------------
# Gradients: decided by bounds, refused when the bounds straddle.
# ---------------------------------------------------------------------------


def test_gradient_is_decided_when_every_stop_agrees():
    result = evaluate_one(
        '<html><body style="background:linear-gradient(to right, #ffffff, #eeeeee)">'
        '<p style="color:#000">hi</p></body></html>'
    )
    assert result.verdict == C.PASS
    assert len(result.backgrounds) == 2


def test_gradient_that_straddles_the_threshold_is_refused():
    result = evaluate_one(
        '<html><body style="background:linear-gradient(to right, #ffffff, #767676)">'
        '<p style="color:#767676">hi</p></body></html>'
    )
    assert result.verdict == C.UNDECIDABLE
    assert result.reason == "gradient-straddles-threshold"


def test_radial_gradient_with_a_shape_prefix_parses():
    result = evaluate_one(
        '<html><body style="background:radial-gradient(ellipse at top, #ffffff 0%, #f5f5f5 100%)">'
        '<p style="color:#000">hi</p></body></html>'
    )
    assert result.verdict == C.PASS


# ---------------------------------------------------------------------------
# Refusals, one per named reason.
# ---------------------------------------------------------------------------


def test_no_stylesheet_means_no_declared_colour():
    result = evaluate_one("<html><body><p>hi</p></body></html>")
    assert result.verdict == C.UNDECIDABLE
    assert result.reason == "no-declared-color"


def test_background_image_is_refused():
    result = evaluate_one(
        '<html><body style="background:url(/hero.jpg)">'
        '<p style="color:#000">hi</p></body></html>'
    )
    assert result.verdict == C.UNDECIDABLE
    assert result.reason == "background-image"


def test_opacity_in_the_chain_is_refused():
    result = evaluate_one(
        '<html><body style="background:#fff">'
        '<div style="opacity:0.5"><p style="color:#000">hi</p></div></body></html>'
    )
    assert result.verdict == C.UNDECIDABLE
    assert result.reason == "opacity-in-chain"


def test_no_opaque_background_anywhere_is_refused():
    result = evaluate_one('<html><body><p style="color:#000">hi</p></body></html>')
    assert result.verdict == C.UNDECIDABLE
    assert result.reason == "no-opaque-background"


def test_a_breakpoint_dependent_colour_is_refused():
    css = ".t{color:#000}@media (min-width:40rem){.t{color:#eee}}.b{background-color:#fff}"
    result = evaluate_one('<html><body class="b"><p class="t">hi</p></body></html>', css)
    assert result.verdict == C.UNDECIDABLE
    assert result.reason == "conditional-color"


def test_a_supports_fallback_pair_that_agrees_is_not_treated_as_conditional():
    """The `lab()` override of a hex fallback is the same colour, not a variant."""
    css = (
        ".t{color:#18181b}"
        "@supports (color:lab(0% 0 0)){.t{color:lab(8.30603% .618205 -2.16572)}}"
        ".b{background-color:#fff}"
    )
    result = evaluate_one('<html><body class="b"><p class="t">hi</p></body></html>', css)
    assert result.verdict == C.PASS


def test_context_relative_font_units_are_refused():
    result = evaluate_one(
        '<html><body style="background:#fff">'
        '<p style="color:#888;font-size:4vw">hi</p></body></html>'
    )
    assert result.verdict == C.UNDECIDABLE
    assert result.reason == "unresolvable-font-size"


def test_responsive_type_is_scored_at_the_most_lenient_threshold():
    """`text-sm sm:text-3xl` is two sizes; only a failure at both is reported."""
    css = ".t{font-size:14px;color:#888}@media (min-width:40rem){.t{font-size:30px}}.b{background-color:#fff}"
    result = evaluate_one('<html><body class="b"><p class="t">hi</p></body></html>', css)
    assert result.threshold == C.LARGE_TEXT_RATIO


# ---------------------------------------------------------------------------
# Element selection and integration.
# ---------------------------------------------------------------------------


def test_aria_hidden_and_hidden_subtrees_are_skipped():
    root = parse(
        '<html><body><p aria-hidden="true">a</p><div hidden><p>b</p></div>'
        "<style>.x{color:red}</style></body></html>"
    )
    tags = [node.tag for node in C.text_elements(root)]
    assert "style" not in tags
    assert tags == []


def test_engine_emits_a_finding_and_a_tally():
    html = (
        '<html lang="en"><head><title>t</title>'
        "<style>.b{background-color:#fff}.t{color:#999}</style></head>"
        '<body class="b"><p class="t">hi</p></body></html>'
    )
    audit = audit_html(html)
    contrast_findings = [f for f in audit.findings if f.criterion == "1.4.3"]
    assert len(contrast_findings) == 1
    assert audit.contrast["fail"] == 1
    assert audit.contrast["decidable_share"] == 1.0


def test_severe_contrast_blocks_and_marginal_contrast_degrades():
    severe = audit_html(
        '<html lang="en"><head><title>t</title>'
        "<style>.b{background-color:#fff}.t{color:#ccc}</style></head>"
        '<body class="b"><p class="t">hi</p></body></html>'
    )
    marginal = audit_html(
        '<html lang="en"><head><title>t</title>'
        "<style>.b{background-color:#fff}.t{color:#888}</style></head>"
        '<body class="b"><p class="t">hi</p></body></html>'
    )
    assert [f.impact for f in severe.findings if f.criterion == "1.4.3"] == ["blocking"]
    assert [f.impact for f in marginal.findings if f.criterion == "1.4.3"] == ["degrading"]


def test_a_page_with_no_css_reports_zero_decidable_rather_than_zero_failures():
    audit = audit_html('<html lang="en"><head><title>t</title></head><body><p>hi</p></body></html>')
    assert audit.contrast["fail"] == 0
    assert audit.contrast["decidable_share"] == 0.0
    assert audit.contrast["reasons"]["no-declared-color"] == 1


def test_an_inline_style_block_does_not_leak_between_pages():
    """One shared stylesheet, two pages: the first page's <style> must not
    follow the second, or a page inherits colours it never declared."""
    base = parse_stylesheet(".bg{background-color:#ffffff}")
    first = parse("<html><body class='bg'><style>.t{color:#000}</style>"
                  "<p class='t'>hi</p></body></html>")
    second = parse("<html><body class='bg'><p class='t'>hi</p></body></html>")
    assert C.evaluate_document(first, base)[-1][1].verdict == C.PASS
    leaked = C.evaluate_document(second, base)[-1][1]
    assert leaked.verdict == C.UNDECIDABLE
    assert leaked.reason == "no-declared-color"
