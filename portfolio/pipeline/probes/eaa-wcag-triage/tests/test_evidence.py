import json

from wcag_triage.engine import audit_html
from wcag_triage.evidence import build_record, to_markdown


def _record():
    audits = {
        "a.html": audit_html('<html lang="en"><img src="x"></html>'),
        "b.html": audit_html('<html lang="de"><title>ok</title></html>'),
    }
    return build_record(audits, checked_at="2026-08-20T00:00:00+00:00")


def test_record_is_json_serialisable_and_stamped():
    rec = _record()
    json.dumps(rec)  # must not raise
    assert rec["checked_at"] == "2026-08-20T00:00:00+00:00"
    assert rec["tool"]["name"] == "eaa-wcag-triage"


def test_record_totals_sum_pages():
    rec = _record()
    total = sum(p["counts"]["total"] for p in rec["pages"])
    assert rec["totals"]["total"] == total


def test_coverage_statement_disclaims_compliance():
    rec = _record()
    text = rec["coverage_statement"].lower()
    assert "not a claim of compliance" in text
    assert "static" in text


def test_coverage_lists_manual_criteria():
    rec = _record()
    manual = [c for c in rec["coverage"] if c["coverage"] == "manual"]
    names = {c["criterion"] for c in manual}
    # The gap the candidate sells against must be declared, not hidden.
    assert "2.1.1" in names  # keyboard
    assert "1.4.11" in names  # non-text contrast


def test_contrast_is_partial_never_automated():
    """1.4.3 became decidable in part on 2026-08-21; it must never read as whole.

    The engine now scores contrast wherever the page's own CSS names the
    colours, which is most of a modern build. The failure mode that creates is
    a record implying the criterion was *checked*, when what was checked is
    whatever the supplied stylesheet happened to settle. `partial` plus the
    per-element tally is the honest shape, and 'automated' here would be the
    overclaim the candidate's liability section forbids.
    """
    rec = _record()
    entry = next(c for c in rec["coverage"] if c["criterion"] == "1.4.3")
    assert entry["coverage"] == "partial"
    assert "undecidable" in entry["note"]


def test_record_carries_contrast_tally():
    rec = _record()
    tally = rec["contrast"]
    assert set(tally) >= {"pass", "fail", "undecidable", "elements", "reasons", "decidable_share"}


def test_markdown_reports_undecidable_contrast_with_reasons():
    """A record that omits the undecided elements reads as though none existed."""
    audit = audit_html("<html><body><p>text with no stated colour</p></body></html>")
    md = to_markdown(build_record({"a.html": audit}, "2026-01-01T00:00:00Z"))
    assert "## Colour contrast (1.4.3)" in md
    assert "could not be decided" in md
    assert "no-declared-color" in md


def test_markdown_renders_without_error():
    md = to_markdown(_record())
    assert "# Accessibility evidence record" in md
    assert "manual" in md
