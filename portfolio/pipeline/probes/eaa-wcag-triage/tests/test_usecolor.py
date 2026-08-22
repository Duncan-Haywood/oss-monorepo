"""SC 1.4.1 — a link in prose that only colour marks out as a link.

The cases here are grouped by the three questions `wcag_triage.usecolor` asks
in order (is this link in prose, is it marked some other way, are the two
colours too close), plus the ones that decide *nothing* and have to stay
silent. Several are out-of-sample shapes that were wrong when first measured
against a browser — the file-list row, the flex header button, the Tailwind
reset — and they are pinned here so a later edit has to break a named case
rather than a number.
"""

from wcag_triage import usecolor
from wcag_triage.engine import audit_html
from wcag_triage.parser import parse
from wcag_triage.rules import COVERAGE

PROSE = "Every order ships within two working days from our workshop. "


def _page(style, body):
    return (
        f'<html lang="en"><head><title>t</title><style>{style}</style></head>'
        f"<body>{body}</body></html>"
    )


def _criteria(html):
    return sorted(f.criterion for f in audit_html(html).findings)


def _findings(html):
    return [f for f in audit_html(html).findings if f.criterion == "1.4.1"]


# --- the reference's own defect fixture -------------------------------------


def test_the_reference_defect_fixture_is_detected():
    # Character for character the fixture
    # portfolio/research/a11y-external-coverage-reference/ recorded as a gap.
    html = _page(
        "",
        f'<p>See <a href="/x" style="color:blue;text-decoration:none">this</a>. {PROSE}</p>',
    )
    assert "1.4.1" in _criteria(html)


def test_the_tailwind_reset_shape_is_detected():
    # `a { text-decoration: inherit }` is what every Tailwind preflight ships,
    # and it overrides the UA underline. Reading the chain as "nobody said
    # anything, so the browser underlines it" passed 152 links in this
    # portfolio's own corpus that are not underlined.
    html = _page(
        "a{color:inherit;text-decoration:inherit}.link{color:#38bdf8}.body{color:#e8edf7}",
        f'<p class="body">{PROSE}See <a class="link" href="/x">site security</a>.</p>',
    )
    findings = _findings(html)
    assert len(findings) == 1
    assert "1.825:1" in findings[0].message
    assert findings[0].impact == "blocking"


# --- question 1: is the link in prose at all ---------------------------------


def test_a_navigation_list_is_not_prose():
    html = _page(
        "a{text-decoration:none;color:#38bdf8}",
        '<nav><a href="/a">Home</a><a href="/b">Shop</a><a href="/c">Contact us</a></nav>',
    )
    assert _findings(html) == []


def test_a_list_row_whose_link_outweighs_its_caption_is_not_prose():
    # The shape that broke a fixed character floor out of sample: the caption
    # clears any short threshold and the link is still the row.
    html = _page(
        "a{text-decoration:none;color:#38bdf8}.body{color:#e8edf7}",
        '<li class="body"><a href="/r">ShootFlow Commercial Viability Assessment</a>'
        " — <code>COMMERCIAL_VIABILITY_REPORT.html</code></li>",
    )
    assert _findings(html) == []


def test_a_link_laid_out_as_a_block_is_not_prose():
    html = _page(
        "a{text-decoration:none;color:#38bdf8}.card{display:block}.body{color:#e8edf7}",
        f'<div class="body">{PROSE}<a class="card" href="/x">Read the report</a></div>',
    )
    assert _findings(html) == []


def test_a_flex_child_is_blockified_and_is_not_prose():
    # No `display` on the link at all: the parent is a flex container, which
    # CSS blockifies its children. Three of five out-of-sample findings were
    # header buttons of exactly this shape.
    html = _page(
        "a{text-decoration:none;color:#38bdf8}.row{display:flex}.body{color:#e8edf7}",
        f'<div class="row body"><h1>{PROSE}</h1><a href="/x">Full report</a></div>',
    )
    assert _findings(html) == []


def test_prose_longer_than_the_link_is_prose():
    html = _page(
        "a{text-decoration:none;color:#38bdf8}.body{color:#e8edf7}",
        f'<p class="body">{PROSE}See <a href="/x">the terms</a>.</p>',
    )
    assert len(_findings(html)) == 1


# --- question 2: is it marked some other way ---------------------------------


def test_the_browser_default_underline_is_a_mark():
    html = _page(
        ".link{color:#38bdf8}.body{color:#e8edf7}",
        f'<p class="body">{PROSE}See <a class="link" href="/x">the terms</a>.</p>',
    )
    assert _findings(html) == []


def test_an_underline_utility_is_a_mark():
    html = _page(
        "a{text-decoration:inherit}.underline{text-decoration-line:underline}"
        ".link{color:#38bdf8}.body{color:#e8edf7}",
        f'<p class="body">{PROSE}See <a class="underline link" href="/x">terms</a>.</p>',
    )
    assert _findings(html) == []


def test_a_border_is_a_mark():
    html = _page(
        "a{text-decoration:inherit}.border{border-width:1px;border-style:solid}"
        ".link{color:#38bdf8}.body{color:#e8edf7}",
        f'<p class="body">{PROSE}See <a class="border link" href="/x">terms</a>.</p>',
    )
    assert _findings(html) == []


def test_a_heavier_weight_is_a_mark():
    html = _page(
        "a{text-decoration:inherit}.bold{font-weight:600}"
        ".link{color:#38bdf8}.body{color:#e8edf7}",
        f'<p class="body">{PROSE}See <a class="bold link" href="/x">terms</a>.</p>',
    )
    assert _findings(html) == []


def test_a_weight_the_prose_already_has_is_not_a_mark():
    html = _page(
        "a{text-decoration:inherit}.bold{font-weight:600}"
        ".link{color:#38bdf8}.body{color:#e8edf7}",
        f'<p class="bold body">{PROSE}See <a class="bold link" href="/x">terms</a>.</p>',
    )
    assert len(_findings(html)) == 1


# --- question 3: the two colours ---------------------------------------------


def test_a_colour_clear_of_the_prose_passes():
    html = _page(
        "a{text-decoration:inherit}.link{color:#c00000}.body{color:#eeeeee}",
        f'<p class="body">{PROSE}See <a class="link" href="/x">terms</a>.</p>',
    )
    assert _findings(html) == []


def test_no_colour_declared_anywhere_is_decided_without_assuming_one():
    # Both sides inherit the same colour, whatever it is, so the ratio is
    # exactly 1.0 and nothing has to be assumed about the initial value.
    html = _page(
        "a{text-decoration:none}",
        f'<p>{PROSE}See <a href="/x">the terms</a>.</p>',
    )
    findings = _findings(html)
    assert len(findings) == 1
    assert "exactly the colour of the text around it" in findings[0].message


def test_a_dark_scheme_only_failure_is_not_missed():
    # Light scheme: #0000ff on white, 8.59:1 — a pass on its own. Dark scheme
    # redefines the prose to nearly the link's own colour.
    html = _page(
        "a{text-decoration:inherit}.link{color:#0000ff}.body{color:#ffffff}"
        "@media (prefers-color-scheme: dark){.body{color:#1a1aff}}",
        f'<p class="body">{PROSE}See <a class="link" href="/x">terms</a>.</p>',
    )
    assert len(_findings(html)) == 1


def test_a_dark_scheme_document_will_not_assume_an_undeclared_colour_is_black():
    html = _page(
        "html{color-scheme:dark}a{text-decoration:inherit}.link{color:#333333}",
        f'<p>{PROSE}See <a class="link" href="/x">terms</a>.</p>',
    )
    assert _findings(html) == []
    tally = audit_html(html).use_of_color
    assert tally["undecidable"] == 1
    assert tally["reasons"] == {"unknown-color-scheme": 1}


def test_a_translucent_colour_is_undecidable_rather_than_guessed():
    html = _page(
        "a{text-decoration:inherit}.link{color:rgba(56,189,248,0.5)}.body{color:#e8edf7}",
        f'<p class="body">{PROSE}See <a class="link" href="/x">terms</a>.</p>',
    )
    assert _findings(html) == []
    assert audit_html(html).use_of_color["reasons"] == {"translucent-text": 1}


def test_a_conditional_only_colour_is_undecidable_rather_than_guessed():
    html = _page(
        "a{text-decoration:inherit}"
        "@media (min-width: 40rem){.link{color:#38bdf8}}"
        ".body{color:#e8edf7}",
        f'<p class="body">{PROSE}See <a class="link" href="/x">terms</a>.</p>',
    )
    assert _findings(html) == []
    assert audit_html(html).use_of_color["undecidable"] == 1


def test_the_link_is_checked_against_every_colour_of_prose_around_it():
    # It stands clear of the darker span, so a reader has something to see it
    # by even though it is close to the lighter one.
    html = _page(
        "a{text-decoration:inherit}.link{color:#38bdf8}.faint{color:#e8edf7}.strong{color:#111111}",
        f'<p class="faint">{PROSE}<span class="strong">{PROSE}</span>'
        'See <a class="link" href="/x">terms</a>.</p>',
    )
    assert _findings(html) == []


# --- the record -------------------------------------------------------------


def test_the_tally_counts_links_not_elements():
    html = _page(
        "a{text-decoration:inherit}.link{color:#38bdf8}.body{color:#e8edf7}",
        f'<p class="body">{PROSE}See <a class="link" href="/x">terms</a> or '
        f'<a class="link" href="/y">the shipping page</a>.</p>'
        '<nav><a href="/a">Home</a></nav>',
    )
    tally = audit_html(html).use_of_color
    assert tally["links"] == 2  # the nav link is not examined
    assert tally["fail"] == 2
    assert tally["decidable_share"] == 1.0


def test_the_coverage_row_moved_off_unimplemented():
    row = next(c for c in COVERAGE if c.criterion == "1.4.1")
    assert row.coverage == "partial"
    assert "needs someone to read the page" in row.note


def test_the_record_states_the_denominator_it_examined():
    from wcag_triage.evidence import build_record, to_markdown

    html = _page(
        "a{text-decoration:inherit}.link{color:#38bdf8}.body{color:#e8edf7}",
        f'<p class="body">{PROSE}See <a class="link" href="/x">terms</a>.</p>',
    )
    text = to_markdown(build_record({"page.html": audit_html(html)}, "2026-08-22"))
    assert "## Use of colour (1.4.1)" in text
    assert "link(s) inside body text" in text
    assert "Links outside prose" in text


# --- the module's own seams --------------------------------------------------


def test_links_in_text_reports_the_prose_that_surrounds_a_link():
    html = _page("", f'<p>{PROSE}See <a href="/x">terms</a>.</p>')
    found = usecolor.links_in_text(parse(html))
    assert len(found) == 1
    link, block, surrounding = found[0]
    assert link.attr("href") == "/x"
    assert block.tag == "p"
    assert PROSE.strip() in " ".join(text for _, text in surrounding)


def test_worst_of_prefers_a_decided_failure_over_an_undecidable_scheme():
    results = [
        ("light", usecolor.LinkResult(verdict=usecolor.UNDECIDABLE, reason="translucent-text")),
        ("dark", usecolor.LinkResult(verdict=usecolor.FAIL, ratio=1.2)),
    ]
    combined = usecolor.worst_of(results)
    assert combined.verdict == usecolor.FAIL
    assert combined.schemes == ("dark",)


def test_a_failure_in_one_scheme_only_names_that_scheme():
    html = _page(
        "a{text-decoration:inherit}.link{color:#c00000}.body{color:#eeeeee}"
        "@media (prefers-color-scheme: dark){.body{color:#c81212}}",
        f'<p class="body">{PROSE}See <a class="link" href="/x">terms</a>.</p>',
    )
    findings = _findings(html)
    assert len(findings) == 1
    assert "in dark mode" in findings[0].message


def test_a_failure_in_both_schemes_names_neither():
    # Nothing to disambiguate: the barrier is simply on the page.
    html = _page(
        "a{text-decoration:inherit}.link{color:#38bdf8}.body{color:#e8edf7}",
        f'<p class="body">{PROSE}See <a class="link" href="/x">terms</a>.</p>',
    )
    findings = _findings(html)
    assert len(findings) == 1
    assert "mode" not in findings[0].message
