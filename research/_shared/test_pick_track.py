import unittest

import pick_track


class ProgrammesTest(unittest.TestCase):
    def test_reads_table(self):
        progs = dict(pick_track.programmes())
        self.assertTrue(progs.get("sim2real-inference"))
        self.assertIn("lowcomm-training", progs)


class DrawProgrammeTest(unittest.TestCase):
    progs = [("a-prog", True), ("b-prog", False), ("c-prog", True)]

    def test_skips_claimed_programmes(self):
        claimed = lambda s: ["#1 x"] if s != "b-prog" else []
        slug, has, skipped = pick_track.draw_programme(0.3, self.progs, claimed)
        self.assertEqual((slug, has), ("b-prog", False))
        self.assertTrue(all(x.startswith(("a-prog", "c-prog")) for x in skipped))

    def test_all_claimed_keeps_first_draw(self):
        slug, _, skipped = pick_track.draw_programme(0.3, self.progs, lambda s: ["#1 x"])
        self.assertIn(slug, {p[0] for p in self.progs})
        self.assertEqual(len(skipped), 3)

    def test_none_claimed_skips_nothing(self):
        self.assertEqual(pick_track.draw_programme(0.3, self.progs, lambda s: [])[2], [])


class MilestonesTest(unittest.TestCase):
    def test_capture_lists_milestones(self):
        listed, free = pick_track.milestones("capture")
        self.assertIn("capture-crop", listed)
        self.assertTrue(set(free) <= set(listed))

    def test_landed_in_programme_is_not_free(self):
        listed, free = pick_track.milestones("civ")
        self.assertIn("civ-contact", listed)
        self.assertNotIn("civ-contact", free)

    def test_unknown_prefix_is_empty(self):
        self.assertEqual(pick_track.milestones("nosuchtrack"), ([], []))


class NextStepsTest(unittest.TestCase):
    def test_reads_section_and_cuts(self):
        text = pick_track.next_steps("sensing-gatemix", width=40)
        self.assertTrue(text.startswith("Resample the measured offset"))
        self.assertLessEqual(len(text), 43)

    def test_missing_project_is_empty(self):
        self.assertEqual(pick_track.next_steps("nosuch-project"), "")


class RecentLandedTest(unittest.TestCase):
    def test_returns_list_of_lines(self):
        out = pick_track.recent_landed("sim2real-inference")
        self.assertIsInstance(out, list)
        self.assertLessEqual(len(out), 3)

    def test_unknown_programme_is_empty(self):
        self.assertEqual(pick_track.recent_landed("nosuch-programme"), [])


class BehindTest(unittest.TestCase):
    def test_returns_count_or_none(self):
        n = pick_track.commits_behind()
        self.assertTrue(n is None or n >= 0)


class RecentProgrammeCommitsTest(unittest.TestCase):
    def test_returns_list(self):
        self.assertIsInstance(pick_track.recent_programme_commits("no-such-programme"), list)


class OpenPrsTest(unittest.TestCase):
    def test_matches_title_and_survives_errors(self):
        import io, json
        from unittest import mock
        body = json.dumps([{"number": 7, "title": "research/lowcomm-training: 3d"},
                           {"number": 8, "title": "other"}]).encode()
        with mock.patch("urllib.request.urlopen", return_value=io.BytesIO(body)):
            self.assertEqual(pick_track.open_prs_for("lowcomm-training"),
                             ["#7 research/lowcomm-training: 3d"])
        with mock.patch("urllib.request.urlopen", side_effect=OSError):
            self.assertEqual(pick_track.open_prs_for("x"), [])


class CliTest(unittest.TestCase):
    def test_non_numeric_draw_is_a_usage_error(self):
        import subprocess, sys
        r = subprocess.run([sys.executable, pick_track.__file__, "hanger"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 1)
        self.assertIn("usage:", r.stderr)
        self.assertNotIn("Traceback", r.stderr)


if __name__ == "__main__":
    unittest.main()
