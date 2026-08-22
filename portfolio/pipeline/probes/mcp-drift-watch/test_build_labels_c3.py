"""Every corpus-3 figure this probe prints, re-derived from the committed labels.

The rule the probes README states -- "a figure printed at a customer must not be
able to go stale" -- is the reason this file exists. `subscriber_record.py` now
carries a second held-out corpus, and nothing in a constant stops it drifting
away from the labels it claims to come from.

These tests also pin the two claims the write-up makes about *which* corpus a
number came from, because that is the part a later reader is most likely to get
wrong: the improvement from the rule edits is measured out of sample here, and
in sample in `build_labels.py`'s corpus.
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(
    0,
    os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "research", "mcp-tool-drift"
    ),
)

import build_labels  # noqa: E402
import build_labels_c3  # noqa: E402
import rule_variants  # noqa: E402
from build_labels import ALERT, label_corpus, score  # noqa: E402
from subscriber_record import (  # noqa: E402
    ACCURACY,
    ACCURACY_C3,
    HELD_OUT_ALERTING_SHARE_PCT,
    HELD_OUT_C3_ALERTING_SHARE_PCT,
    PRECISION_RANGE,
    RECALL_RANGE,
    accuracy_section,
)

HERE = os.path.dirname(os.path.abspath(__file__))
C2 = os.path.join(HERE, "results-holdout-2026-08-22.json")
C3 = os.path.join(HERE, "results-holdout-c3-2026-08-22.json")
LABELS_C3 = os.path.join(HERE, "holdout-labels-c3-2026-08-22.json")

SETS_C3 = (
    build_labels_c3.TRUE_INSTRUCTION_BEARING,
    build_labels_c3.BORDERLINE,
    build_labels_c3.EXAMINED_AND_NEGATIVE,
)


def load(path):
    with open(path) as fh:
        return json.load(fh)


def scored(corpus, sets=(), borderline_positive=True):
    rows = label_corpus(corpus, *sets) if sets else label_corpus(corpus)
    return rows, score(rows, borderline_positive)


# ---------------------------------------------------------------------------
# The corpus itself
# ---------------------------------------------------------------------------


def test_the_two_held_out_corpora_share_no_package():
    """Otherwise corpus 3 is not a second measurement, it is more of the first."""
    c2 = {row["pkg"] for row in load(C2)["packages"]}
    c3 = {row["pkg"] for row in load(C3)["packages"]}
    assert c2 and c3
    assert c2 & c3 == set()


def test_corpus_3_excluded_corpus_2_by_name_and_says_so():
    selection = load(C3)["selection"]
    assert selection["excluded_by_prior_corpus"]
    assert selection["excluded_from"] == ["results-holdout-2026-08-22.json"]
    # The whole remaining population was taken, not a slice of it.
    assert selection["dropped_by_limit"] == 0


def test_neither_corpus_includes_a_package_the_rules_were_tuned_on():
    from collect_holdout import TUNED_ON

    for path in (C2, C3):
        packages = {row["pkg"] for row in load(path)["packages"]}
        assert packages & set(TUNED_ON) == set()


# ---------------------------------------------------------------------------
# The printed figures
# ---------------------------------------------------------------------------


def test_corpus_3_precision_and_recall_match_what_the_record_prints():
    corpus = load(C3)
    rows, inclusive = scored(corpus, SETS_C3, True)
    _, conservative = scored(corpus, SETS_C3, False)
    assert inclusive["precision"] == ACCURACY_C3["precision"]
    assert conservative["precision"] == ACCURACY_C3["precision"]
    assert ACCURACY_C3["recall_range"] == (
        min(inclusive["recall"], conservative["recall"]),
        max(inclusive["recall"], conservative["recall"]),
    )


def test_corpus_3_size_matches_the_string_the_record_prints():
    corpus = load(C3)
    changes = len(corpus["changes"])
    packages = len({c["pkg"] for c in corpus["changes"]})
    assert str(changes) in ACCURACY_C3["corpus"]
    assert str(packages) in ACCURACY_C3["corpus"]


def test_corpus_3_alerting_share_matches():
    corpus = load(C3)
    flagged = sum(1 for c in corpus["changes"] if c["label"]["bucket"] == ALERT)
    assert round(100 * flagged / len(corpus["changes"]), 1) == HELD_OUT_C3_ALERTING_SHARE_PCT


def test_the_printed_span_is_the_worst_of_both_corpora():
    assert PRECISION_RANGE == (
        min(ACCURACY["precision"], ACCURACY_C3["precision"]),
        max(ACCURACY["precision"], ACCURACY_C3["precision"]),
    )
    assert RECALL_RANGE == (
        min(ACCURACY["recall_range"][0], ACCURACY_C3["recall_range"][0]),
        max(ACCURACY["recall_range"][1], ACCURACY_C3["recall_range"][1]),
    )
    # The point of printing a span: neither corpus's own figure is the claim.
    assert PRECISION_RANGE[0] < PRECISION_RANGE[1]
    assert RECALL_RANGE[0] < RECALL_RANGE[1]


def test_the_committed_labels_file_reproduces_from_the_module():
    """The JSON is data, and data that no longer matches its generator is a lie."""
    committed = load(LABELS_C3)
    corpus = load(C3)
    rows, _ = scored(corpus, SETS_C3, True)
    assert committed["changes_labelled"] == len(rows)
    assert committed["scores"]["shipped"]["borderline_counted_as_positive"] == score(rows, True)
    assert committed["labels"] == rows


def test_every_hand_label_names_a_change_that_exists():
    keys = {build_labels.key(c) for c in load(C3)["changes"]}
    named = set(build_labels_c3.TRUE_INSTRUCTION_BEARING) | set(
        build_labels_c3.EXAMINED_AND_NEGATIVE
    )
    assert named <= keys
    assert set(build_labels_c3.BORDERLINE) <= set(build_labels_c3.TRUE_INSTRUCTION_BEARING)


# ---------------------------------------------------------------------------
# What the edits are worth, in sample and out
# ---------------------------------------------------------------------------


def test_the_edits_look_decisive_on_the_corpus_that_suggested_them():
    corpus = rule_variants.relabel(load(C2))
    _, inclusive = scored(corpus, (), True)
    assert inclusive["precision"] == 1.0
    assert inclusive["recall"] > 0.5


def test_and_are_worth_much_less_on_a_corpus_they_never_saw():
    """The headline result of this pass, pinned so it cannot be softened later."""
    shipped_rows, shipped = scored(load(C3), SETS_C3, True)
    _, variant = scored(rule_variants.relabel(load(C3)), SETS_C3, True)
    assert variant["precision"] > shipped["precision"]
    assert variant["recall"] > shipped["recall"]
    # ...but nowhere near the in-sample figures above.
    assert variant["precision"] < 0.9
    assert variant["recall"] < 0.2
    # And no true positive was lost buying that.
    assert variant["true_positives"] >= shipped["true_positives"]


def test_the_routing_edit_contributes_nothing_out_of_sample():
    """Edit 2 carried half the misses on corpus 2 and moves nothing on corpus 3.

    The one instance of its own mechanism in this corpus -- `ponlo_ai_chat`'s
    "prefer the structured tools (ponlo_calendar_delete_event, ...)" -- puts the
    tool names in a parenthesis after a category noun, which the widened pattern
    does not reach.
    """
    routing_only = rule_variants.variant_signals(drop_credential=False, relax_important=False)
    _, base = scored(load(C3), SETS_C3, True)
    _, widened = scored(rule_variants.relabel(load(C3), routing_only), SETS_C3, True)
    assert widened == base


def test_the_important_edit_carries_the_out_of_sample_recall_gain():
    """Edit 3 was corpus 2's footnote and is the only edit that finds anything here."""
    important_only = rule_variants.variant_signals(drop_credential=False, widen_routing=False)
    _, base = scored(load(C3), SETS_C3, True)
    _, relaxed = scored(rule_variants.relabel(load(C3), important_only), SETS_C3, True)
    assert relaxed["recall"] > base["recall"]
    assert relaxed["true_positives"] == base["true_positives"] + 2


def test_the_credential_signal_has_never_produced_a_true_positive():
    for path, sets in ((C2, ()), (C3, SETS_C3)):
        rows, _ = scored(load(path), sets, True)
        flagged = [r for r in rows if "secret_or_credential" in r["rules_signals"]]
        assert flagged, f"{path} should exercise the signal"
        assert not any(r["hand_label"] == ALERT for r in flagged)


def test_the_write_ups_two_concentration_claims():
    """"35 of the 44 misses are cross-tool routing" and "2 packages carry 34 of 49"."""
    import collections

    rows, _ = scored(load(C3), SETS_C3, True)
    positives = [r for r in rows if r["hand_label"] == ALERT]
    missed = [r for r in positives if r["rules_bucket"] != ALERT]
    assert len(positives) == 49
    assert len(missed) == 44
    # Rubric clauses are recorded at the front of each note, e.g. "(a)(b) ...".
    # A note can cite more than one; (a) is "names another tool and says when to
    # reach for it", and it is the class the write-up says carries the misses.
    routing = [r for r in missed if "(a)" in r["note"][:12]]
    assert len(routing) == 35
    top_two = collections.Counter(r["pkg"] for r in positives).most_common(2)
    assert sum(n for _, n in top_two) == 34


def test_the_corpus_carries_text_no_signal_pattern_can_match():
    """The coverage gap the write-up now declares: every pattern is English."""
    import re

    corpus = load(C3)
    cjk = re.compile(r"[一-鿿]")
    hangul = re.compile(r"[가-힯]")
    assert sum(1 for c in corpus["changes"] if cjk.search(c["new"])) == 8
    assert sum(1 for c in corpus["changes"] if hangul.search(c["new"])) == 2
    # And at least one of them is instruction-bearing by hand.
    labelled = {(k[0], k[1], k[2]) for k in build_labels_c3.TRUE_INSTRUCTION_BEARING}
    assert ("@clize/clize", "clize_email_send", "0.1.0") in labelled


def test_the_record_tells_the_reader_the_rate_is_not_the_accuracy():
    section = accuracy_section().lower()
    assert "reproduced alert rate" in section
    assert str(HELD_OUT_C3_ALERTING_SHARE_PCT) in section
