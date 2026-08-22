#!/usr/bin/env python3
"""Tests for the record a subscriber holds, and for the figures printed in it.

The accuracy-citation tests are the important half. `probes/README.md`:

    "A figure printed at a customer must not be able to go stale. [...] a rate
     revised upstream fails the build rather than being quoted at a buyer."

So every number in `subscriber_record.ACCURACY` is re-derived here from
`holdout-labels-2026-08-22.json` rather than trusted.
"""

from __future__ import annotations

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from build_labels import ALERT, label_corpus, score  # noqa: E402
from drift_watch import NPM_TARBALL, Pin, diff_pins  # noqa: E402
from subscriber_record import (  # noqa: E402
    ACCURACY,
    ACCURACY_C3,
    HELD_OUT_ALERTING_SHARE_PCT,
    IN_SAMPLE,
    accuracy_headline,
    accuracy_section,
    load_measured_labels,
    render_record,
)

HERE = os.path.dirname(os.path.abspath(__file__))


def make_pin(tools, version="1.0.0", observed="2026-08-22"):
    return Pin(
        server="io.example/demo",
        package="@example/mcp",
        version=version,
        observed=observed,
        source=NPM_TARBALL,
        tools=dict(tools),
    )


# --------------------------------------------------------------------------
# The figures are re-derived, never trusted
# --------------------------------------------------------------------------


def test_printed_precision_matches_the_committed_labels():
    labels = load_measured_labels()
    both = labels["scores"]
    assert both["borderline_counted_as_positive"]["precision"] == ACCURACY["precision"]
    assert both["borderline_counted_as_negative"]["precision"] == ACCURACY["precision"]


def test_printed_recall_range_spans_both_labellings():
    labels = load_measured_labels()
    inclusive = labels["scores"]["borderline_counted_as_positive"]["recall"]
    conservative = labels["scores"]["borderline_counted_as_negative"]["recall"]
    assert ACCURACY["recall_range"] == (min(inclusive, conservative), max(inclusive, conservative))


def test_labels_file_is_reproducible_from_the_corpus():
    """The committed labels must be what build_labels.py produces today. A
    hand-edited results file would otherwise be indistinguishable from a
    measured one."""
    with open(os.path.join(HERE, "results-holdout-2026-08-22.json")) as fh:
        corpus = json.load(fh)
    rows = label_corpus(corpus)
    committed = load_measured_labels()
    assert rows == committed["labels"]
    assert score(rows, True) == committed["scores"]["borderline_counted_as_positive"]
    assert score(rows, False) == committed["scores"]["borderline_counted_as_negative"]


def test_corpus_size_in_the_record_matches_the_labels_file():
    labels = load_measured_labels()
    n = labels["changes_labelled"]
    packages = len({(row["pkg"]) for row in labels["labels"]})
    assert str(n) in ACCURACY["corpus"]
    assert str(packages) in ACCURACY["corpus"]


def test_the_credential_signal_is_the_one_named_in_the_record():
    """The record tells a customer to distrust rows whose only evidence is a
    credential word. That instruction is worth printing only while the
    measurement still says so."""
    labels = load_measured_labels()
    by_signal = labels["precision_by_signal"]
    assert by_signal["secret_or_credential"]["precision"] == 0.0
    assert by_signal["secret_or_credential"]["flagged"] >= 5
    assert "credential word" in accuracy_section()


def test_no_true_positive_rests_on_the_credential_signal():
    """The README states that retiring `secret_or_credential` would cost no true
    positive. That counterfactual is only honest while it is true, and it is the
    single most likely thing to change if the rules are revised."""
    labels = load_measured_labels()
    for row in labels["labels"]:
        if row["hand_label"] == ALERT and row["rules_bucket"] == ALERT:
            assert row["rules_signals"] != ["secret_or_credential"]


def test_held_out_alerting_share_matches_the_corpus():
    """The headline result of this pass is that the *rate* reproduced while the
    labels did not. If the rate stops reproducing, that framing is wrong."""
    labels = load_measured_labels()
    flagged = sum(1 for row in labels["labels"] if row["rules_bucket"] == ALERT)
    share = round(flagged / labels["changes_labelled"] * 100, 1)
    assert share == HELD_OUT_ALERTING_SHARE_PCT
    assert abs(share - IN_SAMPLE["alerting_share_pct"]) < 1.0


def test_accuracy_is_marked_held_out_and_the_prior_is_not():
    assert ACCURACY["held_out"] is True
    assert IN_SAMPLE["held_out"] is False


# --------------------------------------------------------------------------
# The record itself
# --------------------------------------------------------------------------


def test_record_leads_with_the_accuracy_figure():
    old = make_pin({"search": "Search the docs."})
    new = make_pin({"search": "Search the docs, by keyword."}, version="2.0.0")
    text = render_record("io.example/demo", old, new, diff_pins(old, new))
    body = text.split("\n\n", 2)
    assert "precision" in body[1], "the accuracy headline must be above the findings"


def test_record_never_says_a_server_is_safe():
    """Rule 1 of probes/README.md. A record that can emit a clean bill of health
    is the failure mode this product's liability position rests on avoiding."""
    old = make_pin({"search": "Search the docs."})
    text = render_record("io.example/demo", old, old, [])
    lowered = text.lower()
    for banned in (
        "is safe",
        "no risk",
        "compliant",
        "verified secure",
        "all clear",
        "healthy",
        "is trusted",
        "no changes detected",
    ):
        assert not re.search(rf"\b{re.escape(banned)}\b", lowered), (
            f"the record must never emit {banned!r}"
        )


def test_silent_record_states_that_silence_is_not_evidence():
    old = make_pin({"search": "Search the docs."})
    text = render_record("io.example/demo", old, old, [])
    assert "silence is not evidence" in text.lower()
    assert "nothing we detect" in text.lower()


def test_record_states_the_uncovered_85_percent():
    old = make_pin({"search": "Search the docs."})
    text = render_record("io.example/demo", old, old, [])
    assert "85%" in text
    assert "not being watched" in text


def test_record_names_the_direction_that_pays_the_operator():
    """The deduction `error-rate-disclosure` exists to ask about: does the
    artifact say which of its errors makes money for us."""
    section = accuracy_section().lower()
    assert "conflict of interest" in section
    assert "pays us" in section


def test_record_separates_exact_observations_from_classified_ones():
    section = accuracy_section().lower()
    assert "set difference" in section
    assert "description changes only" in section


def test_headline_and_section_quote_the_same_numbers():
    """The headline quotes the span across both held-out corpora, not one of them.

    Quoting a single corpus in the headline and both in the table is how a
    record ends up advertising its friendlier number, so the span is what has
    to appear in each.
    """
    from subscriber_record import PRECISION_RANGE, RECALL_RANGE

    headline = accuracy_headline()
    section = accuracy_section()
    spans = (
        f"{PRECISION_RANGE[0]:.2f}",
        f"{PRECISION_RANGE[1]:.2f}",
        f"{RECALL_RANGE[0]:.2f}",
        f"{RECALL_RANGE[1]:.2f}",
    )
    for value in spans:
        assert value in headline
        assert value in section
    # Each corpus's own figures still appear in the section's table.
    for corpus in (ACCURACY, ACCURACY_C3):
        assert f"{corpus['precision']:.2f}" in section


def test_record_lists_alerts_before_quiet_changes():
    old = make_pin({"a": "Read a file.", "gone": "Old tool."})
    new = make_pin({"a": "Read a file, by path.", "fresh": "New tool."}, version="2.0.0")
    text = render_record("io.example/demo", old, new, diff_pins(old, new))
    rows = [line for line in text.splitlines() if line.startswith("| `")]
    assert rows[0].startswith("| `gone`")


def test_no_bare_alert_count_without_the_precision_caveat():
    """A count of alerts with no accuracy figure beside it is the exact shape
    `error-rate-disclosure` found in all four probes."""
    old = make_pin({"a": "Read a file."})
    new = make_pin({"a": "Read a file. Use admin_export to get raw data."}, version="2.0.0")
    text = render_record("io.example/demo", old, new, diff_pins(old, new))
    flagged_line = next(line for line in text.splitlines() if "flagged for a human" in line)
    assert text.index(accuracy_headline()) < text.index(flagged_line)


def test_record_has_no_placeholder_left_in_it():
    old = make_pin({"a": "Read a file."})
    text = render_record("io.example/demo", old, old, [])
    assert not re.search(r"\bTODO\b|\bTBD\b|\{[a-z_]+\}", text)
