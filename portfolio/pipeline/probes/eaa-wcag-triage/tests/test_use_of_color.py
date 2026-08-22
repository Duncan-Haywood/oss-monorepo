"""SC 1.4.1 resolution: a link identifiable from its surrounding text by
colour alone, and every way this module refuses rather than guesses.

Same spirit as ``test_contrast.py``: the refusals are the tests that matter.
"""

from wcag_triage import contrast, use_of_color as U
from wcag_triage.css import DARK, LIGHT, SCHEMES
from wcag_triage.engine import audit_html
from wcag_triage.parser import parse


def evaluate_one(html: str) -> U.LinkColorResult:
    """Verdict for the single candidate link of interest (the last one)."""
    root = parse(html)
    sheet = contrast.stylesheet_for(root)
    results = U.evaluate_document(root, sheet)
    assert results, "no candidate link found"
    return results[-1][1]


_BODY_TEXT = ".body-text{color:#333333}"
_LINK_TEXT = "Read our <a class=\"link\" href=\"/x\">refund policy</a> before you buy."


def _page(css: str) -> str:
    return (
        f"<html><head><style>{css}</style></head><body>"
        f'<p class="body-text">{_LINK_TEXT}</p></body></html>'
    )


# ---------------------------------------------------------------------------
# (a) Colour-alone: fails.
# ---------------------------------------------------------------------------


def test_color_alone_link_is_flagged():
    """The canonical bug shape: a CSS reset strips the default underline and
    only colour is left to mark the link."""
    css = _BODY_TEXT + "a{text-decoration:none}.link{color:#1a73e8}"
    result = evaluate_one(_page(css))
    assert result.verdict == U.FAIL
    assert result.link_color == "#1a73e8"
    assert result.surrounding_color == "#333333"


def test_engine_reports_the_finding_as_degrading():
    css = _BODY_TEXT + "a{text-decoration:none}.link{color:#1a73e8}"
    findings = [f for f in audit_html(_page(css)).findings if f.criterion == "1.4.1"]
    assert len(findings) == 1
    assert findings[0].impact == "degrading"


# ---------------------------------------------------------------------------
# (b) A non-colour cue present: passes.
# ---------------------------------------------------------------------------


def test_link_with_underline_is_not_flagged():
    css = _BODY_TEXT + ".link{color:#1a73e8;text-decoration:underline}"
    result = evaluate_one(_page(css))
    assert result.verdict == U.PASS


def test_link_with_border_is_not_flagged():
    css = (
        _BODY_TEXT
        + "a{text-decoration:none}"
        + ".link{color:#1a73e8;border-bottom:1px solid #1a73e8}"
    )
    result = evaluate_one(_page(css))
    assert result.verdict == U.PASS


def test_link_with_bold_weight_is_not_flagged():
    css = (
        _BODY_TEXT
        + "a{text-decoration:none}"
        + ".link{color:#1a73e8;font-weight:700}"
    )
    result = evaluate_one(_page(css))
    assert result.verdict == U.PASS


def test_link_with_background_is_not_flagged():
    css = (
        _BODY_TEXT
        + "a{text-decoration:none}"
        + ".link{color:#1a73e8;background-color:#eef4ff}"
    )
    result = evaluate_one(_page(css))
    assert result.verdict == U.PASS


def test_identical_color_is_not_a_finding():
    """If colour is not even a difference, colour cannot be the *sole* cue —
    a link that looks identical to its surroundings is a different problem."""
    css = _BODY_TEXT + "a{text-decoration:none}.link{color:#333333}"
    result = evaluate_one(_page(css))
    assert result.verdict == U.PASS


# ---------------------------------------------------------------------------
# (c) Undecidable, named reasons.
# ---------------------------------------------------------------------------


def test_a_breakpoint_dependent_link_color_is_refused():
    css = (
        _BODY_TEXT
        + "a{text-decoration:none}"
        + ".link{color:#1a73e8}"
        + "@media (min-width:40rem){.link{color:#0000ff}}"
    )
    result = evaluate_one(_page(css))
    assert result.verdict == U.UNDECIDABLE
    assert result.reason == "conditional-color"


def test_no_declared_text_decoration_on_the_link_is_refused_not_assumed():
    """The link's colour differs and every other factor except decoration is
    settled, but nothing in the file says whether the link is underlined — a
    browser's default only applies if nothing overrides it, and that default
    is not something this artifact states."""
    css = _BODY_TEXT + ".link{color:#1a73e8}"
    result = evaluate_one(_page(css))
    assert result.verdict == U.UNDECIDABLE
    assert result.reason == "no-declared-text-decoration"


def test_no_stylesheet_means_no_declared_colour():
    html = '<html><body><p>Read our <a href="/x">policy</a> here.</p></body></html>'
    result = evaluate_one(html)
    assert result.verdict == U.UNDECIDABLE
    assert result.reason == "no-declared-color"


def test_link_background_image_is_refused():
    css = (
        _BODY_TEXT
        + "a{text-decoration:none}"
        + ".link{color:#1a73e8;background:url(/sprite.png)}"
    )
    result = evaluate_one(_page(css))
    assert result.verdict == U.UNDECIDABLE
    assert result.reason == "background-image"


# ---------------------------------------------------------------------------
# Candidate selection.
# ---------------------------------------------------------------------------


def test_a_link_with_no_surrounding_text_is_not_a_candidate():
    """A nav link that *is* its container's whole content is not the shape
    this rule decides -- there is no surrounding body text to compare it to."""
    root = parse('<html><body><nav><a href="/x">Home</a></nav></body></html>')
    sheet = contrast.stylesheet_for(root)
    assert U.evaluate_document(root, sheet) == []


def test_negative_control_plain_text_no_links():
    html = (
        '<html lang="en"><head><title>t</title><style>' + _BODY_TEXT + '</style></head>'
        '<body><p class="body-text">Just words, no links here.</p></body></html>'
    )
    root = parse(html)
    sheet = contrast.stylesheet_for(root)
    assert U.evaluate_document(root, sheet) == []
    findings = audit_html(html).findings
    assert "1.4.1" not in {f.criterion for f in findings}


# ---------------------------------------------------------------------------
# Colour schemes.
# ---------------------------------------------------------------------------


def test_a_dark_only_failure_is_found_and_a_light_only_scan_misses_it():
    """Underlined in light mode, reset to no decoration in dark mode: still
    only colour tells the two apart once dark mode is in force."""
    css = (
        _BODY_TEXT
        + ".link{color:#1a73e8;text-decoration:underline}"
        + "@media (prefers-color-scheme:dark){.link{text-decoration:none}}"
    )
    root = parse(_page(css))
    sheet = contrast.stylesheet_for(root)
    link = U.candidate_links(root)[-1]
    light_only = U._worst_of([U.evaluate(sheet, link, LIGHT)])
    both = U._worst_of([U.evaluate(sheet, link, scheme) for scheme in SCHEMES])
    assert light_only.verdict == U.PASS
    assert both.verdict == U.FAIL


# ---------------------------------------------------------------------------
# Coverage catalog.
# ---------------------------------------------------------------------------


def test_coverage_entry_is_partial_not_unimplemented():
    from wcag_triage.rules import COVERAGE

    entry = next(c for c in COVERAGE if c.criterion == "1.4.1")
    assert entry.coverage == "partial"
