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


class BlockedTest(unittest.TestCase):
    progs = [("a-prog", True), ("b-prog", True), ("c-prog", True)]

    def test_blocked_programme_is_never_drawn(self):
        old = pick_track.is_blocked
        pick_track.is_blocked = lambda s: s == "a-prog"
        try:
            for r in [i / 50 for i in range(50)]:
                self.assertNotEqual(pick_track.draw_programme(r, self.progs, lambda s: [])[0], "a-prog")
        finally:
            pick_track.is_blocked = old

    def test_all_blocked_still_draws(self):
        old = pick_track.is_blocked
        pick_track.is_blocked = lambda s: True
        try:
            self.assertIn(pick_track.draw_programme(0.3, self.progs, lambda s: [])[0], {"a-prog", "b-prog", "c-prog"})
        finally:
            pick_track.is_blocked = old


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


class FocusTest(unittest.TestCase):
    """Owner, 2026-10-31: industrial, energy and construction get about two thirds of draws."""

    def test_focus_tracks_exist(self):
        self.assertTrue(set(pick_track.FOCUS) <= set(pick_track.PREFIX))

    def test_track_draws_lean_to_focus(self):
        draws = [pick_track.pick(0.05 + 0.95 * i / 20000) for i in range(20000)]
        share = sum(pick_track.PREFIX[t - 1] in pick_track.FOCUS for t in draws) / len(draws)
        uniform = len(pick_track.FOCUS) / len(pick_track.PREFIX)
        expected = pick_track.FOCUS_SHARE + (1 - pick_track.FOCUS_SHARE) * uniform
        self.assertAlmostEqual(share, expected, delta=0.02)
        self.assertEqual(len(set(draws)), len(pick_track.PREFIX))  # no track is closed

    def test_zero_share_is_the_old_uniform_map(self):
        self.assertEqual(pick_track.pick(0.11, focus_share=0), 2)
        self.assertEqual(pick_track.pick(0.04), "free")

    def test_programme_draws_lean_to_focus(self):
        progs = [("heavy-hydraulics", True), ("lowcomm-training", True),
                 ("qual-x", True), ("build-data", False)]
        firsts = [pick_track.draw_programme(i / 4000, progs, lambda s: [])[0] for i in range(4000)]
        share = sum(pick_track.is_focus(s) for s in firsts) / len(firsts)
        self.assertAlmostEqual(share, 0.75, delta=0.03)
        self.assertEqual(set(firsts), {p[0] for p in progs})


if __name__ == "__main__":
    unittest.main()


class SessionDrawTest(unittest.TestCase):
    def test_same_draw_until_new(self):
        first = pick_track.session_draw(new=True)
        self.assertEqual(pick_track.session_draw(), first)
        self.assertEqual(pick_track.session_draw(), first)
