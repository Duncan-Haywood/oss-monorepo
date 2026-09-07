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

    def _status(self, readings, head, changed, slugs=frozenset()):
        """`changed` is the shared-surface answer; `slugs` the venture one.

        Both are what git would report between a reading's commit and HEAD.
        Passing `None` for either is the unanswerable case.
        """
        with mock.patch.object(browser_state, "head_commit", return_value=head), \
             mock.patch.object(browser_state, "shared_changed", return_value=changed), \
             mock.patch.object(browser_state, "changed_slugs",
                               return_value=None if slugs is None else set(slugs)):
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

    def test_a_shared_surface_change_makes_the_reading_stale(self):
        # The builder or the front door moved: every page renders
        # differently, so no per-venture run can rescue this.
        st = self._status([{"commit": "a" * 40, "checks": ["contrast"]}], "b" * 40, True)
        self.assertEqual(st["contrast"]["verdict"], "stale")
        self.assertEqual(st["contrast"]["pending"], [])

    def test_an_unanswerable_diff_is_unknown_never_current(self):
        # A shallow clone that cannot reach the recorded commit must not
        # report the catalogue as verified.
        st = self._status([{"commit": "a" * 40, "checks": ["contrast"]}], "b" * 40, None)
        self.assertEqual(st["contrast"]["verdict"], "unknown")

    def test_an_unanswerable_venture_diff_is_unknown_never_current(self):
        st = self._status([{"commit": "a" * 40, "checks": ["contrast"]}], "b" * 40,
                          False, slugs=None)
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


class PerVentureStalenessTest(unittest.TestCase):
    """The 2026-09-07 change: one venture's edit must not void 174 others.

    Measured that day: two full 30-minute sweeps recorded clean at 14:02Z and
    14:06Z were both reported STALE over the whole catalogue by 14:30Z,
    because two ventures out of 175 had a sibling link each changed.
    """

    def _status(self, readings, head, shared, slugs):
        with mock.patch.object(browser_state, "head_commit", return_value=head), \
             mock.patch.object(browser_state, "shared_changed", return_value=shared), \
             mock.patch.object(browser_state, "changed_slugs",
                               return_value=None if slugs is None else set(slugs)):
            return browser_state.status(readings)

    def test_a_changed_venture_makes_the_check_stale_and_names_it(self):
        readings = [{"commit": "a" * 40, "checks": ["contrast"], "scope": "full"}]
        st = self._status(readings, "b" * 40, False, {"doors", "cashflow"})
        self.assertEqual(st["contrast"]["verdict"], "stale")
        self.assertEqual(st["contrast"]["pending"], ["cashflow", "doors"])

    def test_a_scoped_reading_tops_up_the_full_one(self):
        readings = [
            {"commit": "a" * 40, "checks": ["contrast"], "scope": "full"},
            {"commit": "b" * 40, "checks": ["contrast"], "scope": "ventures",
             "slugs": ["cashflow", "doors"]},
        ]
        # HEAD is the scoped reading's own commit, so nothing has moved since.
        st = self._status(readings, "b" * 40, False, {"doors", "cashflow"})
        self.assertEqual(st["contrast"]["verdict"], "current")

    def test_a_scoped_reading_covers_only_the_slugs_it_names(self):
        readings = [
            {"commit": "a" * 40, "checks": ["contrast"], "scope": "full"},
            {"commit": "b" * 40, "checks": ["contrast"], "scope": "ventures",
             "slugs": ["doors"]},
        ]
        st = self._status(readings, "b" * 40, False, {"doors", "cashflow"})
        self.assertEqual(st["contrast"]["verdict"], "stale")
        self.assertEqual(st["contrast"]["pending"], ["cashflow"])

    def test_a_scoped_reading_can_never_be_the_base_reading(self):
        # The laundering this whole file exists to prevent: a one-venture run
        # must not turn `never` into `current` for the catalogue.
        readings = [{"commit": "b" * 40, "checks": ["contrast"],
                     "scope": "ventures", "slugs": ["doors"]}]
        st = self._status(readings, "b" * 40, False, set())
        self.assertEqual(st["contrast"]["verdict"], "never")

    def test_a_shared_change_voids_scoped_readings_too(self):
        # A builder change renders every page differently; per-venture runs
        # recorded after it must not add up to a covered catalogue.
        readings = [
            {"commit": "a" * 40, "checks": ["contrast"], "scope": "full"},
            {"commit": "b" * 40, "checks": ["contrast"], "scope": "ventures",
             "slugs": ["doors"]},
        ]
        st = self._status(readings, "b" * 40, True, {"doors"})
        self.assertEqual(st["contrast"]["verdict"], "stale")
        self.assertEqual(st["contrast"]["pending"], [])

    def test_journey_ignores_only_so_a_venture_change_keeps_it_stale(self):
        readings = [
            {"commit": "a" * 40, "checks": ["journey"], "scope": "full"},
            {"commit": "b" * 40, "checks": ["journey"], "scope": "ventures",
             "slugs": ["doors"]},
        ]
        st = self._status(readings, "b" * 40, False, {"doors"})
        self.assertEqual(st["journey"]["verdict"], "stale")

    def test_no_venture_moved_leaves_the_full_reading_standing(self):
        readings = [{"commit": "a" * 40, "checks": ["contrast"], "scope": "full"}]
        st = self._status(readings, "b" * 40, False, set())
        self.assertEqual(st["contrast"]["verdict"], "current")


class ChangedSlugsTest(unittest.TestCase):
    """Slug extraction: `ventures/<slug>/<file>` and nothing shallower."""

    def _slugs(self, paths):
        with mock.patch.object(browser_state, "_git") as git:
            git.side_effect = [(0, ""), (0, "\n".join(paths))]
            return browser_state.changed_slugs("a" * 40)

    def test_extracts_the_slug_segment(self):
        self.assertEqual(
            self._slugs(["ventures/doors/index.html",
                         "ventures/doors/calc.mjs",
                         "ventures/cashflow/site/index.html"]),
            {"doors", "cashflow"})

    def test_ignores_a_path_with_no_venture_file(self):
        # `ventures/README.md` is not any venture's own page.
        self.assertEqual(self._slugs(["ventures/README.md"]), set())


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

    def test_a_base_url_run_is_never_recorded(self):
        # It trusted an origin this process did not build and could place no
        # sentinel in, so it cannot honestly be tied to this tree's commit.
        import browser_checks
        with mock.patch.object(browser_state, "record") as rec:
            browser_checks._record_reading(["contrast"], [], "https://example.test", None)
            rec.assert_not_called()

    def test_a_filtered_run_is_recorded_as_scoped_never_as_full(self):
        import browser_checks
        with mock.patch.object(browser_state, "record") as rec:
            rec.return_value = {"checks": ["contrast"], "commit": "a" * 40,
                                "slugs": ["one-slug"]}
            browser_checks._record_reading(["contrast"], ["one-slug"], None, self.tmp.name)
            rec.assert_called_once()
            self.assertEqual(rec.call_args.kwargs["scope"], "ventures")
            self.assertEqual(rec.call_args.kwargs["slugs"], ["one-slug"])

    def test_a_whole_site_check_is_dropped_from_a_scoped_reading(self):
        # `--only` does not scope `journey`, so recording it here would claim
        # a narrative this run never ran against the rest of the catalogue.
        import browser_checks
        with mock.patch.object(browser_state, "record") as rec:
            rec.return_value = {"checks": ["contrast"], "commit": "a" * 40,
                                "slugs": ["one-slug"]}
            browser_checks._record_reading(["contrast", "journey"], ["one-slug"],
                                           None, self.tmp.name)
            self.assertEqual(rec.call_args.args[0], ["contrast"])

    def test_a_scoped_run_of_only_whole_site_checks_records_nothing(self):
        import browser_checks
        with mock.patch.object(browser_state, "record") as rec:
            browser_checks._record_reading(["journey"], ["one-slug"], None, self.tmp.name)
            rec.assert_not_called()

    def test_a_full_run_is_recorded(self):
        import browser_checks
        with mock.patch.object(browser_state, "record") as rec:
            rec.return_value = {"checks": ["contrast"], "commit": "a" * 40}
            browser_checks._record_reading(["contrast"], [], None, self.tmp.name)
            rec.assert_called_once()

    def test_the_reading_names_the_commit_the_build_came_from(self):
        # A 20-30 minute run with up to four concurrent sessions merging
        # underneath it must not claim coverage for whatever landed during it.
        import browser_checks
        with mock.patch.object(browser_state, "record") as rec, \
             mock.patch.object(browser_state, "head_commit", return_value="b" * 40):
            rec.return_value = {"checks": ["contrast"], "commit": "a" * 40}
            browser_checks._record_reading(["contrast"], [], None, self.tmp.name,
                                           commit="a" * 40)
            self.assertEqual(rec.call_args.kwargs["commit"], "a" * 40)

    def test_a_scoped_reading_also_names_the_build_commit(self):
        import browser_checks
        with mock.patch.object(browser_state, "record") as rec, \
             mock.patch.object(browser_state, "head_commit", return_value="b" * 40):
            rec.return_value = {"checks": ["contrast"], "commit": "a" * 40,
                                "slugs": ["doors"]}
            browser_checks._record_reading(["contrast"], ["doors"], None, self.tmp.name,
                                           commit="a" * 40)
            self.assertEqual(rec.call_args.kwargs["commit"], "a" * 40)

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
