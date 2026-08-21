#!/usr/bin/env python3
"""Pin the aggregate accuracy figures ``validate_accuracy.py`` reports today.

This is a change detector, not a re-derivation: if a future rule edit makes a
fixture stop firing the way it is labeled to, this turns red rather than
letting ``render_markdown()``'s disclosure text quietly go stale. It also pins
the corpus shape itself (case count, and that every rule R1-R7 is exercised at
least once), so a fixture silently dropped from ``CASES`` is caught too.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from validate_accuracy import CASES, RULE_TITLES_CHECK, measure  # noqa: E402


class TestValidateAccuracyAggregate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = measure()

    def test_total_case_count(self):
        self.assertEqual(self.result["total_cases"], 34)
        self.assertEqual(len(CASES), 34)

    def test_zero_false_positives_and_false_negatives_today(self):
        # The whole point of this test: if a rule change makes any fixture
        # misbehave, this fails loudly instead of leaving the disclosure text
        # in render_markdown() claiming "0 false positives, 0 false negatives"
        # against a corpus that no longer supports it.
        self.assertEqual(self.result["fp"], 0)
        self.assertEqual(self.result["fn"], 0)

    def test_true_positive_and_true_negative_counts(self):
        self.assertEqual(self.result["tp"], 16)
        self.assertEqual(self.result["tn"], 18)

    def test_positive_rule_opportunities(self):
        self.assertEqual(self.result["positive_opportunities"], 16)

    def test_precision_and_recall_are_both_perfect_on_this_corpus(self):
        self.assertEqual(self.result["precision"], 1.0)
        self.assertEqual(self.result["recall"], 1.0)

    def test_every_rule_r1_through_r7_is_exercised(self):
        exercised = {case.rule for case in CASES}
        self.assertEqual(exercised, RULE_TITLES_CHECK)

    def test_every_rule_has_both_a_fire_and_a_silent_case(self):
        by_rule: dict[str, set[bool]] = {}
        for case in CASES:
            by_rule.setdefault(case.rule, set()).add(case.should_fire)
        for rule, seen in by_rule.items():
            self.assertEqual(seen, {True, False}, f"{rule} missing a fire or silent case")

    def test_reused_and_new_cases_are_both_present(self):
        # A corpus that is entirely "reused" is just the test suite restated;
        # a corpus that is entirely "new" would not be reusing the best
        # labeled examples that already exist. Both should be present.
        sources = {case.source for case in CASES}
        self.assertEqual(sources, {"reused", "new"})


if __name__ == "__main__":
    unittest.main()
