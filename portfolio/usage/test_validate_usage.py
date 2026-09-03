#!/usr/bin/env python3
"""Tests for validate_usage.py.

Run from this directory:

    python3 -m unittest test_validate_usage
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import validate_usage

VALID = """\
period: 2026-08
products:
  - slug: example-calculator
    surface: static-page-in-repo
    readings:
      - as_of: 2026-08-26
        signals:
          live_url_visitors: null
          local_events_reported: 0
        note: Baseline.
"""


def check_text(text: str) -> list[str]:
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "usage.yaml"
        path.write_text(text)
        return validate_usage.check(path)


class ValidateUsageTest(unittest.TestCase):
    def test_valid_file_has_no_problems(self):
        self.assertEqual(check_text(VALID), [])

    def test_the_real_usage_file_is_valid(self):
        # The regression this file exists for: usage.yaml on main stopped
        # parsing and no check went red.
        self.assertEqual(validate_usage.check(validate_usage.USAGE), [])

    def test_unparseable_yaml_is_reported_as_the_headline(self):
        # Exactly the shape of the #1387 breakage: a stray blank line and a
        # three-space list item under products:.
        broken = VALID.replace(
            "  - slug: example-calculator",
            "\n   - slug: example-calculator",
        )
        problems = check_text(broken)
        self.assertEqual(len(problems), 1)
        self.assertIn("not valid YAML", problems[0])

    def test_same_slug_on_two_surfaces_is_allowed(self):
        two_surfaces = VALID + """\
  - slug: example-calculator
    surface: repository-cli
    readings:
      - as_of: 2026-08-26
        signals:
          release_downloads_total: 0
        note: Baseline.
"""
        self.assertEqual(check_text(two_surfaces), [])

    def test_same_slug_on_the_same_surface_is_a_duplicate(self):
        problems = check_text(VALID + VALID.split("products:\n")[1])
        self.assertTrue(any("duplicate entry" in p for p in problems), problems)

    def test_missing_surface_is_reported(self):
        problems = check_text("period: 2026-08\nproducts:\n  - slug: stub\n")
        self.assertTrue(any("missing surface" in p for p in problems), problems)
        self.assertTrue(any("no readings" in p for p in problems), problems)

    def test_reading_without_a_note_is_reported(self):
        problems = check_text(VALID.replace("        note: Baseline.\n", ""))
        self.assertTrue(any("missing note" in p for p in problems), problems)

    def test_quoted_date_is_reported(self):
        problems = check_text(VALID.replace("as_of: 2026-08-26", 'as_of: "not-a-date"'))
        self.assertTrue(any("not a YYYY-MM-DD date" in p for p in problems), problems)

    def test_person_shaped_signal_is_rejected(self):
        # README rule 1: count events, never people.
        problems = check_text(
            VALID.replace("local_events_reported: 0", "visitor_email: 0")
        )
        self.assertTrue(any("looks like a person" in p for p in problems), problems)

    def test_non_numeric_signal_is_reported(self):
        problems = check_text(
            VALID.replace("local_events_reported: 0", "local_events_reported: many")
        )
        self.assertTrue(any("must be a number" in p for p in problems), problems)

    def test_duplicate_key_is_reported(self):
        # This file parses. PyYAML keeps the last `note:` and drops the first
        # without a word, which is how two readings' notes were lost on main.
        problems = check_text(
            VALID.replace(
                "        note: Baseline.\n",
                "        note: The fuller note, with the detail.\n"
                "        note: Baseline.\n",
            )
        )
        self.assertTrue(any("duplicate key 'note'" in p for p in problems), problems)

    def test_duplicate_key_reports_the_line_of_the_second_occurrence(self):
        problems = check_text(
            VALID.replace(
                "        note: Baseline.\n",
                "        note: First.\n        note: Baseline.\n",
            )
        )
        # `note: First.` lands on line 10; the repeat a reviewer must look at
        # is line 11, and that is the one reported.
        self.assertTrue(any(":11:" in p for p in problems), problems)

    def test_signals_swallowed_into_a_note_are_reported(self):
        # The dns-configuration-evidence corruption: a merge left a following
        # reading's signals indented inside the note above them, where they
        # parse as prose. The document is valid YAML and the numbers are gone.
        swallowed = VALID.replace(
            "        note: Baseline.\n",
            "        note: >-\n"
            "          Baseline.\n"
            "          local_observations_compared: 0\n"
            "          qualified_operators: 0\n",
        )
        problems = check_text(swallowed)
        self.assertTrue(any("signal-shaped line" in p for p in problems), problems)

    def test_ordinary_prose_in_a_note_is_not_flagged_as_swallowed(self):
        # A note may legitimately mention a colon, a name, or a number without
        # looking like `signal_name: 12` on a line of its own.
        prose = VALID.replace(
            "        note: Baseline.\n",
            "        note: >-\n"
            "          Baseline: 0 visitors so far, and the opt-out counter\n"
            "          records 12 local events. Public URL remains owner-gated.\n",
        )
        self.assertEqual(check_text(prose), [])


if __name__ == "__main__":
    unittest.main()
