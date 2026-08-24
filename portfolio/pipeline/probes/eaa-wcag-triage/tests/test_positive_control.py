"""Per-engagement positive control — the product, not the research harness.

``a11y-generated-sites`` proved the mutations fire on this portfolio's
delivered pages. These tests pin the product copy: every mutation that bites
a well-formed page makes its criterion fire, a no-op is untested rather than
passed, a page that already fails the check is not counted as a miss, and a
constructed miss stays a miss.
"""

from wcag_triage.engine import audit_html
from wcag_triage.evidence import build_record, to_markdown
from wcag_triage.positive_control import (
    ALREADY_PRESENT,
    CAUGHT,
    MISSED,
    MUTATIONS,
    NOT_EXERCISED,
    classify_page,
    run_control,
)

# A well-formed page that exercises every removal and every injection.
_PAGE = """<!doctype html>
<html lang="en">
<head>
  <title>Shop</title>
</head>
<body>
  <h1>Welcome</h1>
  <p>Hello.</p>
  <img src="hero.jpg" alt="A loaf of bread">
  <label for="email">Email</label>
  <input id="email" type="email">
  <button type="submit">Buy</button>
  <a href="/about">About</a>
</body>
</html>
"""

# A fragment: no <html lang>, no <head>, no <body>, no <img>. Removals and
# injections that need those attachment points must come back not_exercised
# rather than as a fabricated catch.
_FRAGMENT = "<p>just text</p>"


def test_every_mutation_that_bites_this_page_is_caught():
    result = run_control({"shop.html": _PAGE})
    by_mutation = {row["mutation"]: row for row in result["mutations"]}
    assert len(by_mutation) == len(MUTATIONS)
    for _criterion, _kind, description, mutate in MUTATIONS:
        row = by_mutation[description]
        if mutate(_PAGE) == _PAGE:
            assert row["verdict"] == NOT_EXERCISED, description
        else:
            assert row["verdict"] == CAUGHT, (description, row)


def test_injections_all_bite_a_well_formed_page():
    result = run_control({"shop.html": _PAGE})
    injections = [row for row in result["mutations"] if row["kind"] == "injection"]
    assert injections
    assert all(row["verdict"] == CAUGHT for row in injections)
    assert all(row["pages_changed"] == 1 for row in injections)


def test_new_structural_criteria_are_exercised_by_positive_controls():
    result = run_control({"shop.html": _PAGE})
    by_criterion = {row["criterion"]: row for row in result["mutations"]}
    for criterion in ("2.2.2", "2.4.1", "3.1.2", "1.3.4"):
        assert by_criterion[criterion]["verdict"] == CAUGHT
        assert by_criterion[criterion]["pages_changed"] == 1


def test_a_fragment_does_not_count_as_a_pass():
    """No attachment point is 'not exercised', never 'caught'."""
    result = run_control({"snip.html": _FRAGMENT})
    assert result["counts"][CAUGHT] == 0
    assert result["counts"][MISSED] == 0
    assert result["counts"][NOT_EXERCISED] == len(MUTATIONS)


def test_already_failing_page_is_not_a_miss():
    """Dropping lang on a page that has no lang cannot isolate the engine.

    The stronger case: a page that already fails 3.1.1, mutated by a
    different 3.1.1-shaped edit that changes nothing new in the criterion
    set, must not be reported as a detection gap.
    """
    already = audit_html("<html><head><title>x</title></head><body></body></html>")
    still = audit_html("<html><head><title>x</title></head><body></body></html>")
    assert classify_page(already, still, "3.1.1") == ALREADY_PRESENT


def test_a_constructed_miss_stays_a_miss():
    original = audit_html(_PAGE)
    # Same page again: no new criterion appeared.
    assert classify_page(original, original, "1.1.1") == MISSED


def test_caught_requires_the_target_criterion_specifically():
    """Firing a *different* new criterion is not a catch for this row."""
    original = audit_html(_PAGE)
    # Adding an unnamed button introduces 4.1.2, not 1.1.1.
    mutated = audit_html(
        _PAGE.replace("<body>", "<body><button></button>", 1)
    )
    assert "4.1.2" in {f.criterion for f in mutated.findings}
    assert classify_page(original, mutated, "4.1.2") == CAUGHT
    assert classify_page(original, mutated, "1.1.1") == MISSED


def test_record_omits_the_section_when_the_control_was_not_run():
    rec = build_record({"a.html": audit_html(_PAGE)}, "2026-08-24T00:00:00Z")
    assert rec["positive_control"] is None
    md = to_markdown(rec)
    assert "## Positive control" not in md
    assert "**Positive control:**" not in md


def test_record_prints_the_control_before_the_findings():
    control = run_control({"shop.html": _PAGE})
    rec = build_record(
        {"shop.html": audit_html(_PAGE)},
        "2026-08-24T00:00:00Z",
        control=control,
    )
    md = to_markdown(rec)
    assert rec["positive_control"] is control
    assert "## Positive control" in md
    assert md.index("## Positive control") < md.index("## Findings")
    assert "**Positive control:**" in md
    assert "caught" in md.lower()
    assert "not a conformance test" in md.lower()


def test_a_miss_is_named_in_the_header():
    """A miss buried under a clean findings count is the failure mode."""
    control = {
        "statement": "test",
        "mutations": [
            {
                "criterion": "1.1.1",
                "kind": "removal",
                "mutation": "drop alt",
                "verdict": MISSED,
                "pages_changed": 1,
                "pages": [],
            }
        ],
        "counts": {
            NOT_EXERCISED: 0,
            CAUGHT: 0,
            MISSED: 1,
            ALREADY_PRESENT: 0,
        },
    }
    md = to_markdown(
        build_record(
            {"shop.html": audit_html(_PAGE)},
            "2026-08-24T00:00:00Z",
            control=control,
        )
    )
    header = md[: md.index("## What was tested automatically")]
    assert "missed" in header
    assert "would have been wrong" in header


def test_cli_wires_the_control_into_the_record(tmp_path):
    page = tmp_path / "shop.html"
    page.write_text(_PAGE, encoding="utf-8")
    out = tmp_path / "evidence"
    from wcag_triage.cli import run

    assert run([str(page), "--output-dir", str(out), "--checked-at", "2026-08-24"]) == 0
    md = (out / "record.md").read_text(encoding="utf-8")
    assert "## Positive control" in md
    assert "**Positive control:**" in md
    assert "caught" in md
