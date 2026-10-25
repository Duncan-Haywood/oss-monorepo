import unittest

import pick_track


class ProgrammesTest(unittest.TestCase):
    def test_reads_table(self):
        progs = dict(pick_track.programmes())
        self.assertTrue(progs.get("sim2real-inference"))
        self.assertIn("lowcomm-training", progs)


class MilestonesTest(unittest.TestCase):
    def test_capture_lists_milestones(self):
        listed, free = pick_track.milestones("capture")
        self.assertIn("capture-crop", listed)
        self.assertTrue(set(free) <= set(listed))

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


if __name__ == "__main__":
    unittest.main()
