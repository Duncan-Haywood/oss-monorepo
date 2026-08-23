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
    PUBLISHER_SPLIT,
    RECALL_RANGE,
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


# --------------------------------------------------------------------------
# The publisher split: every figure re-derived from the corpora, not trusted
#
# These recompute from the two committed corpus files by hand -- plain counting
# over `label_corpus` output -- rather than by calling `score_by_publisher`'s
# own summary. Re-deriving a figure with the code that produced it checks
# nothing; this checks both the printed constants and that script at once.
# --------------------------------------------------------------------------


def _shipped_rows_by_publisher(corpus_file, positives, borderline, negatives):
    """(publisher -> {qualifying, caught, false_alerts}) under the shipped rules."""
    import classify_drift

    with open(os.path.join(HERE, corpus_file)) as fh:
        corpus = json.load(fh)
    changes = [
        dict(c, label=classify_drift.classify(c["old"], c["new"], strict=True))
        for c in corpus["changes"]
    ]
    rows = label_corpus(
        {"changes": changes}, positives=positives, borderline=borderline, negatives=negatives
    )
    out = {}
    for row in rows:
        entry = out.setdefault(row["pkg"], {"qualifying": 0, "caught": 0, "false_alerts": 0})
        real = row["hand_label"] == ALERT
        flagged = row["rules_bucket"] == ALERT
        entry["qualifying"] += int(real)
        entry["caught"] += int(real and flagged)
        entry["false_alerts"] += int(flagged and not real)
    return out


def _both_corpora_by_publisher():
    import build_labels
    import build_labels_c3

    merged = {}
    for corpus_file, module in (
        ("results-holdout-2026-08-22.json", build_labels),
        ("results-holdout-c3-2026-08-22.json", build_labels_c3),
    ):
        split = _shipped_rows_by_publisher(
            corpus_file,
            module.TRUE_INSTRUCTION_BEARING,
            module.BORDERLINE,
            module.EXAMINED_AND_NEGATIVE,
        )
        overlap = set(split) & set(merged)
        assert not overlap, f"the corpora are supposed to share no package: {overlap}"
        merged.update(split)
    return merged


def test_publisher_counts_match_the_corpora():
    split = _both_corpora_by_publisher()
    s = PUBLISHER_SPLIT
    assert len(split) == s["publishers_watched"]
    with_positives = {pkg: row for pkg, row in split.items() if row["qualifying"]}
    assert len(with_positives) == s["publishers_with_a_qualifying_change"]
    assert sum(row["qualifying"] for row in with_positives.values()) == s["qualifying_changes"]
    assert sum(row["caught"] for row in with_positives.values()) == s["caught"]


def test_the_servers_that_caught_nothing_are_counted_correctly():
    """The load-bearing sentence in the headline. If this count falls, the
    headline is overstating how blind the watch is and must be rewritten."""
    split = _both_corpora_by_publisher()
    nothing = [
        pkg for pkg, row in split.items() if row["qualifying"] and row["caught"] == 0
    ]
    assert len(nothing) == PUBLISHER_SPLIT["publishers_caught_nothing"]
    assert len(nothing) > PUBLISHER_SPLIT["publishers_with_a_qualifying_change"] / 2


def test_median_per_publisher_recall_matches_the_corpora():
    import statistics

    split = _both_corpora_by_publisher()
    recalls = [
        row["caught"] / row["qualifying"] for row in split.values() if row["qualifying"]
    ]
    assert round(statistics.median(recalls), 3) == PUBLISHER_SPLIT["median_per_publisher_recall"]


def test_the_servers_it_caught_everything_on_had_a_single_qualifying_change():
    """The record tells a customer that no per-server figure that looks good is
    a rate. That claim is what stops the split from reading as 'some servers are
    covered well', and it holds only while every such publisher has n=1.

    Stated without a cutoff on purpose: an earlier draft said "above a third",
    and that claim flips between a cutoff of 0.25 and one of 0.33 -- both read
    off the table they described."""
    split = _both_corpora_by_publisher()
    perfect = {
        pkg: row
        for pkg, row in split.items()
        if row["qualifying"] and row["caught"] == row["qualifying"]
    }
    assert len(perfect) == PUBLISHER_SPLIT["publishers_catching_everything"]
    assert (
        max(row["qualifying"] for row in perfect.values())
        == PUBLISHER_SPLIT["max_qualifying_changes_among_those"]
    )


def test_best_recall_on_a_server_with_more_than_one_qualifying_change():
    """The other half of the same claim, and the half that carries it: with the
    coin flips excluded, the best the watch managed anywhere."""
    split = _both_corpora_by_publisher()
    best = max(
        row["caught"] / row["qualifying"] for row in split.values() if row["qualifying"] > 1
    )
    assert round(best, 3) == PUBLISHER_SPLIT["best_recall_on_a_multi_change_server"]
    assert f"{PUBLISHER_SPLIT['best_recall_on_a_multi_change_server']:.0%}" in accuracy_section()


def test_false_alerts_concentrate_on_a_few_publishers():
    split = _both_corpora_by_publisher()
    sources = {pkg: row["false_alerts"] for pkg, row in split.items() if row["false_alerts"]}
    s = PUBLISHER_SPLIT
    assert sum(sources.values()) == s["false_alerts"]
    assert len(sources) == s["publishers_with_a_false_alert"]
    assert max(sources.values()) == s["largest_false_alert_source_share"]


def test_largest_publisher_share_and_recall_match_each_corpus():
    """The pair the record uses to say the busiest servers are not the
    best-covered ones. Both halves are re-derived, per corpus, in order."""
    import build_labels
    import build_labels_c3

    shares, recalls = [], []
    for corpus_file, module in (
        ("results-holdout-2026-08-22.json", build_labels),
        ("results-holdout-c3-2026-08-22.json", build_labels_c3),
    ):
        split = _shipped_rows_by_publisher(
            corpus_file,
            module.TRUE_INSTRUCTION_BEARING,
            module.BORDERLINE,
            module.EXAMINED_AND_NEGATIVE,
        )
        total = sum(row["qualifying"] for row in split.values())
        pkg, row = max(split.items(), key=lambda kv: kv[1]["qualifying"])
        shares.append(round(row["qualifying"] / total, 3))
        recalls.append(round(row["caught"] / row["qualifying"], 3))
    assert tuple(shares) == PUBLISHER_SPLIT["largest_publisher_shares"]
    assert tuple(recalls) == PUBLISHER_SPLIT["largest_publisher_recalls"]
    # The claim is only worth printing while the busiest server is worse than
    # the pooled figure quoted beside it.
    assert all(r <= max(RECALL_RANGE) for r in recalls)


def test_committed_split_file_is_reproducible():
    """A hand-edited artifact would otherwise be indistinguishable from a
    measured one -- the same rule the corpus-2 labels file is held to."""
    import score_by_publisher

    with open(os.path.join(HERE, "publisher-split-2026-08-23.json")) as fh:
        committed = json.load(fh)
    assert json.loads(json.dumps(score_by_publisher.measure())) == committed


def test_the_split_is_printed_where_a_customer_reads_it():
    """Rule 4 of probes/README.md: the measured error rate is stated in the
    product. A split that lives only in a JSON file is not disclosed."""
    section = accuracy_section()
    headline = accuracy_headline()
    s = PUBLISHER_SPLIT
    assert str(s["publishers_caught_nothing"]) in headline
    assert str(s["publishers_with_a_qualifying_change"]) in headline
    for figure in (
        str(s["publishers_watched"]),
        str(s["false_alerts"]),
        str(s["publishers_with_a_false_alert"]),
        f"{s['median_per_publisher_recall']:.2f}",
    ):
        assert figure in section, figure
