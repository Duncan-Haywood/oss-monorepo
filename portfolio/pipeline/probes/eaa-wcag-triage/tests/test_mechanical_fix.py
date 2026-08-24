"""Mechanical fixes close only what can be rewritten without inventing content.

The first experiment's software half: apply the pass to the three fixture
shop pages, re-audit, and pin the close rate. A low blocking rate is the
honest result — most blocking findings on these pages are missing words.
"""

from collections import Counter
from pathlib import Path

from wcag_triage.engine import audit_html
from wcag_triage.mechanical_fix import (
    LIMITS,
    apply_mechanical_fixes,
    skip_reason,
    summarise_close_rate,
)
from wcag_triage.rules import Finding

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


def _load(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_accessible_fixture_is_a_noop():
    html = _load("shop-accessible.html")
    result = apply_mechanical_fixes(html)
    assert result.html == html
    assert result.applied == []
    assert result.after.counts() == {"total": 0, "blocking": 0, "degrading": 0}
    assert result.blocking_close_rate() is None


def test_inaccessible_fixture_closes_degrading_only():
    html = _load("shop-inaccessible.html")
    result = apply_mechanical_fixes(html)
    assert result.before.counts() == {"total": 10, "blocking": 8, "degrading": 2}
    assert result.after.counts() == {"total": 8, "blocking": 8, "degrading": 0}
    assert result.blocking_close_rate() == 0.0
    assert "<title>Handmade Ceramics</title>" in result.html
    assert "<h2>Featured</h2>" in result.html
    assert "<h3>" not in result.html
    assert 'lang="' not in result.html
    assert 'alt="' not in result.html
    applied = {(p.criterion, p.impact) for p in result.applied}
    assert applied == {("2.4.2", "degrading"), ("2.4.6", "degrading")}


def test_mixed_fixture_removes_aria_hidden_and_nothing_else():
    html = _load("shop-mixed.html")
    result = apply_mechanical_fixes(html)
    assert result.before.counts() == {"total": 4, "blocking": 3, "degrading": 1}
    assert result.after.counts() == {"total": 3, "blocking": 2, "degrading": 1}
    assert result.blocking_close_rate() == 1 / 3
    assert 'aria-hidden="true"' not in result.html.split("name=\"promo\"")[1].split(">")[0]
    # Decorative icon-in-link pattern is not in this fixture; the remaining
    # aria-hidden must not have been invented. The decorative image stays
    # correctly marked.
    assert 'alt=""' in result.html
    assert "<video" in result.html
    remaining = Counter((f.criterion, f.impact) for f in result.after.findings)
    assert remaining == Counter(
        {("1.1.1", "blocking"): 1, ("1.2.2", "blocking"): 1, ("1.3.1", "degrading"): 1}
    )


def test_decorative_icon_aria_hidden_is_left_alone():
    # The accessible fixture's cart icon is aria-hidden on a span, which is
    # correct. The pass must not strip that.
    html = _load("shop-accessible.html")
    result = apply_mechanical_fixes(html)
    assert 'aria-hidden="true"' in result.html


def test_does_not_invent_lang_on_a_page_without_one():
    html = "<html><head></head><body><p>Hi</p></body></html>"
    result = apply_mechanical_fixes(html)
    assert 'lang="' not in result.html
    assert any(s.criterion == "3.1.1" for s in result.skipped)


def test_title_is_derived_from_h1_and_escaped():
    html = "<html lang='en'><head></head><body><h1>Mugs & bowls</h1></body></html>"
    result = apply_mechanical_fixes(html)
    assert "<title>Mugs &amp; bowls</title>" in result.html
    assert not any(f.criterion == "2.4.2" for f in result.after.findings)


def test_empty_title_is_filled_from_h1():
    html = (
        "<html lang='en'><head><title>  </title></head>"
        "<body><h1>Poster shop</h1></body></html>"
    )
    result = apply_mechanical_fixes(html)
    assert "<title>Poster shop</title>" in result.html


def test_no_title_without_a_heading():
    html = "<html lang='en'><head></head><body><p>No heading</p></body></html>"
    result = apply_mechanical_fixes(html)
    assert "<title>" not in result.html


def test_viewport_zoom_lock_is_removed():
    html = (
        '<html lang="en"><head>'
        '<meta name="viewport" content="width=device-width, initial-scale=1, '
        'user-scalable=no, maximum-scale=1">'
        "<title>t</title></head><body><p>Hi</p></body></html>"
    )
    assert any(f.criterion == "1.4.4" for f in audit_html(html).findings)
    result = apply_mechanical_fixes(html)
    assert not any(f.criterion == "1.4.4" for f in result.after.findings)
    assert "user-scalable" not in result.html
    assert "maximum-scale" not in result.html


def test_skip_reasons_refuse_to_invent_content():
    unnamed = Finding(
        "4.1.2", "Name, Role, Value", "A", "blocking", "button", 1,
        "Button has no accessible name, so it is announced as an unlabelled button.",
        "Add visible text.",
        seq=1,
    )
    assert "will not invent" in skip_reason(unnamed)
    hidden = Finding(
        "4.1.2", "Name, Role, Value", "A", "blocking", "input", 1,
        'Interactive <input> is aria-hidden="true", removing it from the tree.',
        "Do not set aria-hidden on a focusable control.",
        seq=1,
    )
    # aria-hidden findings are patchable; skip_reason is only for leftovers.
    assert "aria-hidden" in hidden.message


def test_fixture_aggregate_close_rate_is_one_of_eleven_blocking():
    names = [
        "shop-inaccessible.html",
        "shop-accessible.html",
        "shop-mixed.html",
    ]
    results = [apply_mechanical_fixes(_load(name)) for name in names]
    summary = summarise_close_rate(results, names)
    assert summary["before"] == {"total": 14, "blocking": 11, "degrading": 3}
    assert summary["after"] == {"total": 11, "blocking": 10, "degrading": 1}
    assert summary["closed"] == {"total": 3, "blocking": 1, "degrading": 2}
    assert summary["blocking_close_rate"] == 1 / 11
    assert summary["limits"] == list(LIMITS)
    assert LIMITS[2].startswith("Does not settle the candidate's kill criterion")


def test_timed_meta_refresh_is_removed_instant_redirect_stays():
    html = (
        '<html lang="en"><head>'
        '<meta http-equiv="refresh" content="5">'
        '<meta http-equiv="refresh" content="0;url=/next">'
        "<title>t</title></head><body><p>Hi</p></body></html>"
    )
    assert any(f.criterion == "2.2.1" for f in audit_html(html).findings)
    result = apply_mechanical_fixes(html)
    assert not any(f.criterion == "2.2.1" for f in result.after.findings)
    assert 'content="5"' not in result.html
    assert 'content="0;url=/next"' in result.html
    assert any(p.criterion == "2.2.1" for p in result.applied)


def test_blink_and_marquee_unwrap_keep_their_text():
    html = (
        '<html lang="en"><head><title>t</title></head>'
        "<body><p><marquee>Sale!</marquee> and <blink>now</blink></p>"
        "</body></html>"
    )
    before = audit_html(html)
    assert {f.element for f in before.findings if f.criterion == "2.2.2"} == {
        "marquee",
        "blink",
    }
    result = apply_mechanical_fixes(html)
    assert not any(f.criterion == "2.2.2" for f in result.after.findings)
    assert "Sale!" in result.html and "now" in result.html
    assert "<marquee" not in result.html.lower()
    assert "<blink" not in result.html.lower()


def test_conflicting_aria_label_is_dropped_visible_text_stays():
    html = (
        '<html lang="en"><head><title>t</title></head>'
        '<body><button aria-label="Submit order">Buy now</button>'
        "</body></html>"
    )
    assert any(f.criterion == "2.5.3" for f in audit_html(html).findings)
    result = apply_mechanical_fixes(html)
    assert not any(f.criterion == "2.5.3" for f in result.after.findings)
    assert "Buy now" in result.html
    assert "aria-label" not in result.html
    assert "Submit order" not in result.html


def test_conflicting_aria_labelledby_is_dropped():
    html = (
        '<html lang="en"><head><title>t</title></head>'
        '<body><span id="n">Submit order</span>'
        '<button aria-labelledby="n">Buy now</button>'
        "</body></html>"
    )
    assert any(f.criterion == "2.5.3" for f in audit_html(html).findings)
    result = apply_mechanical_fixes(html)
    assert not any(f.criterion == "2.5.3" for f in result.after.findings)
    assert "Buy now" in result.html
    assert "aria-labelledby" not in result.html
    # The span is other content, not a name we invented; it stays.
    assert 'id="n"' in result.html


def test_does_not_invent_an_aria_label_on_an_unnamed_button():
    html = (
        '<html lang="en"><head><title>t</title></head>'
        "<body><button></button></body></html>"
    )
    result = apply_mechanical_fixes(html)
    assert "aria-label" not in result.html
    assert any(s.criterion == "4.1.2" for s in result.skipped)


def test_cli_writes_patched_pages_and_leaves_the_customer_record_unpatched(
    tmp_path,
):
    src = tmp_path / "shop-mixed.html"
    src.write_text(_load("shop-mixed.html"), encoding="utf-8")
    evidence = tmp_path / "evidence"
    patched = tmp_path / "patched"
    from wcag_triage.cli import run

    assert (
        run(
            [
                str(src),
                "--output-dir",
                str(evidence),
                "--apply-mechanical-fixes",
                str(patched),
                "--checked-at",
                "2026-08-24",
            ]
        )
        == 0
    )
    record = (evidence / "record.json").read_text(encoding="utf-8")
    # Customer record is of the source, not of our patches.
    assert '"blocking": 3' in record
    written = (patched / "shop-mixed.patched.html").read_text(encoding="utf-8")
    assert 'name="promo"' in written
    assert "aria-hidden" not in written.split('name="promo"')[1].split(">")[0]
    report = (patched / "mechanical-close-rate.json").read_text(encoding="utf-8")
    assert "1 of 11" not in report  # this run is one page
    assert '"blocking": 1' in report  # closed one blocking finding
    assert "Does not invent alt text" in report
