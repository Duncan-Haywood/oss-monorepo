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
    assert "1.4.3" in names  # contrast
    assert "2.1.1" in names  # keyboard


def test_markdown_renders_without_error():
    md = to_markdown(_record())
    assert "# Accessibility evidence record" in md
    assert "manual" in md
