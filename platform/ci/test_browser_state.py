"""Tests for browser_state.py — the record of when the browser checks last ran.

The behaviour worth guarding here is not the happy path. It is the set of
refusals: this file is only worth trusting if a partial, filtered or skipped
run can never end up in it looking like a full pass. Each of those is a way
the repository has already been wrong about something else — a FILTERED run
read as a whole-site one, a skip read as a pass, an absent measurement read
as a healthy one.
"""

import json
import os
import tempfile
import unittest
from unittest import mock

import browser_state


class RecordingTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        patcher = mock.patch.object(
            browser_state, "STATE", os.path.join(self.tmp.name, "browser_state.json"))
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_load_returns_empty_shape_when_nothing_recorded(self):
        self.assertEqual(browser_state.load(), {"readings": []})

    def test_corrupt_file_reads_as_nothing_recorded_never_as_a_pass(self):
        with open(browser_state.STATE, "w", encoding="utf-8") as fh:
            fh.write("{not json")
        self.assertEqual(browser_state.load(), {"readings": []})

    def test_wrong_shape_reads_as_nothing_recorded(self):
        with open(browser_state.STATE, "w", encoding="utf-8") as fh:
            json.dump(["not", "a", "dict"], fh)
        self.assertEqual(browser_state.load(), {"readings": []})

    def test_record_writes_the_checks_it_was_given(self):
        browser_state.record(["contrast", "sideways"], result="pass",
                             commit="a" * 40, pages=775, now="2026-09-07")
        readings = browser_state.load()["readings"]
        self.assertEqual(len(readings), 1)
        self.assertEqual(readings[0]["checks"], ["contrast", "sideways"])
        self.assertEqual(readings[0]["pages"], 775)
        self.assertEqual(readings[0]["measured"], "2026-09-07")

    def test_readings_are_capped_so_the_file_stays_short(self):
        for i in range(25):
            browser_state.record(["contrast"], result="pass",
                                 commit=f"{i:040d}", now="2026-09-07")
        self.assertEqual(len(browser_state.load()["readings"]), 20)


class VerdictTest(unittest.TestCase):
    """The four verdicts, and specifically that absence is never `current`."""

    def _status(self, readings, head, changed):
        with mock.patch.object(browser_state, "head_commit", return_value=head), \
             mock.patch.object(browser_state, "surface_changed", return_value=changed):
            return browser_state.status(readings)

    def test_a_check_never_run_reads_never(self):
        st = self._status([], "b" * 40, False)
        for check in browser_state.CHECKS:
            self.assertEqual(st[check]["verdict"], "never")

    def test_a_reading_at_head_is_current(self):
        head = "b" * 40
        st = self._status([{"commit": head, "checks": ["contrast"]}], head, False)
        self.assertEqual(st["contrast"]["verdict"], "current")

    def test_an_older_commit_with_no_surface_change_still_stands(self):
        # A README or ledger merge must not invalidate a 30-minute run, or
        # sessions learn to ignore this tool — the failure it exists to stop.
        st = self._status([{"commit": "a" * 40, "checks": ["contrast"]}], "b" * 40, False)
        self.assertEqual(st["contrast"]["verdict"], "current")

    def test_a_surface_change_makes_the_reading_stale(self):
        st = self._status([{"commit": "a" * 40, "checks": ["contrast"]}], "b" * 40, True)
        self.assertEqual(st["contrast"]["verdict"], "stale")

    def test_an_unanswerable_diff_is_unknown_never_current(self):
        # A shallow clone that cannot reach the recorded commit must not
        # report the catalogue as verified.
        st = self._status([{"commit": "a" * 40, "checks": ["contrast"]}], "b" * 40, None)
        self.assertEqual(st["contrast"]["verdict"], "unknown")

    def test_one_checks_reading_says_nothing_about_another(self):
        head = "b" * 40
        st = self._status([{"commit": head, "checks": ["contrast"]}], head, False)
        self.assertEqual(st["contrast"]["verdict"], "current")
        self.assertEqual(st["sweep"]["verdict"], "never")

    def test_latest_reading_wins_for_a_check(self):
        readings = [
            {"commit": "a" * 40, "checks": ["contrast"], "measured": "2026-09-01"},
            {"commit": "b" * 40, "checks": ["contrast"], "measured": "2026-09-07"},
        ]
        st = self._status(readings, "b" * 40, False)
        self.assertEqual(st["contrast"]["reading"]["measured"], "2026-09-07")


class RequireCurrentTest(unittest.TestCase):
    def test_exits_1_when_a_check_has_no_current_reading(self):
        with mock.patch.object(browser_state, "load", return_value={"readings": []}):
            self.assertEqual(browser_state.main(["--require-current"]), 1)

    def test_exits_0_when_every_check_is_current(self):
        head = "b" * 40
        readings = [{"commit": head, "checks": list(browser_state.CHECKS)}]
        with mock.patch.object(browser_state, "load", return_value={"readings": readings}), \
             mock.patch.object(browser_state, "head_commit", return_value=head):
            self.assertEqual(browser_state.main(["--require-current"]), 0)

    def test_bare_run_exits_0_even_when_stale(self):
        # Same split as pages_state.py: the bare report answers "what is the
        # state?", the flag answers "is it current?". Folding them together
        # would make a green run mean two things.
        with mock.patch.object(browser_state, "load", return_value={"readings": []}):
            self.assertEqual(browser_state.main([]), 0)


class RefusalTest(unittest.TestCase):
    """browser_checks.py must refuse to record the runs that verify less."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_filtered_and_base_url_runs_are_not_recorded(self):
        import browser_checks
        with mock.patch.object(browser_state, "record") as rec:
            browser_checks._record_reading(["contrast"], ["one-slug"], None, self.tmp.name)
            browser_checks._record_reading(["contrast"], [], "https://example.test", None)
            rec.assert_not_called()

    def test_a_full_run_is_recorded(self):
        import browser_checks
        with mock.patch.object(browser_state, "record") as rec:
            rec.return_value = {"checks": ["contrast"], "commit": "a" * 40}
            browser_checks._record_reading(["contrast"], [], None, self.tmp.name)
            rec.assert_called_once()

    def test_html_count_walks_the_built_tree(self):
        import browser_checks
        os.makedirs(os.path.join(self.tmp.name, "a", "b"))
        for rel in ("index.html", "a/index.html", "a/b/index.html", "a/style.css"):
            with open(os.path.join(self.tmp.name, rel), "w", encoding="utf-8") as fh:
                fh.write("x")
        self.assertEqual(browser_checks._count_html(self.tmp.name), 3)
        self.assertIsNone(browser_checks._count_html(None))


if __name__ == "__main__":
    unittest.main()
