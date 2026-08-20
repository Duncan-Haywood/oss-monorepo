"""Validate the engine against the hand-labeled fixture set.

This is the probe's equivalent of the sibling reachability probe's validation
against a manual review: a set of pages a human labeled by hand, checked
against what the engine reports. Because the label set and the engine are both
in this repo, a perfect match here is a regression guard, not evidence about
real-world shops — the README states that limit explicitly.
"""

import json
from collections import Counter
from pathlib import Path

from wcag_triage.engine import audit_html

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


def _labels():
    data = json.loads((FIXTURES / "labels.json").read_text())
    return {k: v for k, v in data.items() if not k.startswith("_")}


def _expected_counter(entries):
    return Counter((crit, impact) for crit, impact in entries)


def _actual_counter(page):
    html = (FIXTURES / page).read_text()
    return Counter((f.criterion, f.impact) for f in audit_html(html).findings)


def test_engine_matches_hand_labels_exactly():
    for page, entries in _labels().items():
        expected = _expected_counter(entries)
        actual = _actual_counter(page)
        assert actual == expected, (
            f"{page}: engine {dict(actual)} != labels {dict(expected)}"
        )


def test_accessible_fixture_is_clean():
    assert _actual_counter("shop-accessible.html") == Counter()


def test_precision_and_recall_are_perfect_on_fixtures():
    tp = fp = fn = 0
    for page, entries in _labels().items():
        expected = _expected_counter(entries)
        actual = _actual_counter(page)
        tp += sum((expected & actual).values())
        fp += sum((actual - expected).values())
        fn += sum((expected - actual).values())
    assert fp == 0 and fn == 0 and tp > 0
