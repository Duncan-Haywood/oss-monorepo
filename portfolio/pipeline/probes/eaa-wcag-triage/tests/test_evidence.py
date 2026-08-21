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


# ---------------------------------------------------------------------------
# Accuracy disclosure. Added 2026-08-21 after
# portfolio/research/error-rate-disclosure/ rendered this record and found that
# it discloses its scope thoroughly and its accuracy not at all. Coverage
# answers "what did you look at"; these pin the answer to "is what came back
# right", in the artifact rather than in a research directory.
# ---------------------------------------------------------------------------


def test_record_carries_accuracy_figures():
    rec = _record()
    assert rec["accuracy"], "record must carry the engine's measured error rates"
    metrics = {f["metric"] for f in rec["accuracy"]}
    assert metrics == {"precision", "recall"}, metrics


def test_accuracy_figures_are_json_serialisable():
    json.dumps(_record()["accuracy"])  # must not raise


def test_markdown_prints_both_directions_of_error():
    """Saying how often without saying which way is half a disclosure."""
    md = to_markdown(_record())
    assert "## How accurate this pass is" in md
    assert "over-reporting" in md
    assert "under-reporting" in md


def test_markdown_prints_the_committed_figures():
    md = to_markdown(_record())
    assert "0.821–0.881" in md
    assert "0.975" in md


def test_accuracy_appears_before_the_findings_it_qualifies():
    """A disclosure below the list it applies to is a footnote."""
    md = to_markdown(_record())
    assert md.index("## How accurate this pass is") < md.index("## Findings")


def test_accuracy_headline_is_in_the_summary_block():
    """A reader who reads only the header still learns the list can be wrong."""
    md = to_markdown(_record())
    headline = md.index("**Accuracy (")
    assert headline < md.index("## What was tested automatically")
    assert "0.821–0.881" in md[headline : md.index("\n", headline)]


def test_record_discloses_the_commercial_incentive():
    """The direction that pays the operator is named, not just the rate.

    This is the sentence the ethical_robustness gate turns on: the audit is the
    qualification step for a paid job, so over-reporting is the error that
    would pay us. A record that prints the precision figure and omits this
    still leaves the reader unable to weigh it.
    """
    rec = _record()
    statement = rec["accuracy_statement"].lower()
    assert "over-reporting is the error that would pay us" in statement
    assert statement in to_markdown(rec).lower()


def test_accuracy_figures_do_not_claim_to_describe_the_customers_site():
    """Both were measured on this portfolio's own pages. Saying so is the point."""
    rec = _record()
    assert "not on your site" in rec["accuracy_statement"]
    for figure in rec["accuracy"]:
        assert figure["caveat"].strip(), figure["metric"]


def test_missing_accuracy_renders_as_absence_not_silence():
    """A record with no figures must say so, not omit the section.

    Silently dropping the section is how the omission this test exists to
    prevent looked normal for four measurement passes.
    """
    rec = _record()
    rec["accuracy"] = []
    md = to_markdown(rec)
    assert "## How accurate this pass is" in md
    assert "No accuracy measurement is recorded" in md
    assert "**Accuracy:** not measured" in md
