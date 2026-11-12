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

    def test_first_run_landed_in_programme_is_not_free(self):
        listed, free = pick_track.milestones("civ")
        self.assertIn("civ-culture", listed)  # "(first run landed in civ-levers ...)"
        self.assertNotIn("civ-culture", free)

    def test_logs_naming_a_milestone_are_found(self):
        self.assertIn("research/aerolog-scaling/LOG.md", pick_track.mentioned_in_logs("aerolog-sizing"))
        self.assertEqual(pick_track.mentioned_in_logs("nosuch-milestone-xyz"), [])

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


class ShallowAndRefreshTest(unittest.TestCase):
    def test_shallow_clone_too_short_is_not_called_clear(self):
        pick_track._open_pr_titles.cache_clear()
        lines = ClaimCheckTest._run(None, [(1, "other")], covers=False)
        self.assertEqual(len(lines), 1)
        self.assertNotIn("clear", lines[0])
        self.assertIn("shallow-since", lines[0])

    def test_boundary_commit_is_dropped(self):
        from unittest import mock
        log = mock.Mock(returncode=0, stdout="aaa1 aaa 1 hour ago: unrelated venture\nbbb2 bbb 2 hours ago: research/x: 2\n")
        with mock.patch("subprocess.run", return_value=log) as run, \
             mock.patch.object(pick_track, "shallow_edge", return_value={"aaa1"}):
            self.assertEqual(pick_track.recent_programme_commits("x"), ["bbb 2 hours ago: research/x: 2"])
        # git runs in research/, so a bare "research/x" pathspec meant research/research/x and the
        # commit check matched nothing (found 2026-11-12).
        self.assertEqual(run.call_args[0][0][-1], ":(top)research/x")

    def test_real_git_finds_this_files_own_commit(self):
        import subprocess
        out = subprocess.run(["git", "log", "-1", "--format=%h", "--", ":(top)research/_shared"],
                             cwd=pick_track.RESEARCH, capture_output=True, text=True)
        if out.returncode or not out.stdout.strip():
            self.skipTest("no git history here")
        bare = subprocess.run(["git", "log", "-1", "--format=%h", "--", "research/_shared"],
                              cwd=pick_track.RESEARCH, capture_output=True, text=True)
        self.assertEqual(bare.stdout.strip(), "", "a cwd-relative pathspec should not match from research/")

    def _fake_git(self, remote, local, fetch_rc=0):
        from unittest import mock
        calls = []

        def run(cmd, **kw):
            calls.append(cmd)
            if cmd[1] == "ls-remote":
                return mock.Mock(returncode=0 if remote else 2, stdout=f"{remote}\trefs/heads/main\n" if remote else "")
            if cmd[1] == "rev-parse":
                return mock.Mock(returncode=0, stdout=local + "\n")
            return mock.Mock(returncode=fetch_rc, stdout="")
        return run, calls

    def test_refresh_skips_fetch_when_current(self):
        from unittest import mock
        run, calls = self._fake_git("abc", "abc")
        with mock.patch.object(pick_track, "history_covers", return_value=True):
            self.assertIsNone(pick_track.refresh_origin_main(run=run))
        self.assertFalse(any(c[1] == "fetch" for c in calls))

    def test_refresh_fetches_deep_enough_when_stale_and_shallow(self):
        from unittest import mock
        run, calls = self._fake_git("new", "old")
        with mock.patch.object(pick_track, "history_covers", return_value=False), \
             mock.patch.object(pick_track, "is_shallow", return_value=True):
            self.assertIsNone(pick_track.refresh_origin_main(run=run))
        fetch = [c for c in calls if c[1] == "fetch"]
        self.assertEqual(len(fetch), 1)
        self.assertTrue(any(a.startswith("--shallow-since=") for a in fetch[0]))

    def test_refresh_reports_unreachable_origin_and_failed_fetch(self):
        from unittest import mock
        run, _ = self._fake_git(None, "abc")
        self.assertIn("could not reach", pick_track.refresh_origin_main(run=run))
        run, _ = self._fake_git("new", "old", fetch_rc=128)
        with mock.patch.object(pick_track, "history_covers", return_value=True), \
             mock.patch.object(pick_track, "is_shallow", return_value=True):
            self.assertIn("failed", pick_track.refresh_origin_main(run=run))


class OpenPrsTest(unittest.TestCase):
    def test_matches_title_and_survives_errors(self):
        import io, json
        from unittest import mock
        body = json.dumps([{"number": 7, "title": "research/lowcomm-training: 3d"},
                           {"number": 8, "title": "other"}]).encode()
        with mock.patch("urllib.request.urlopen", return_value=io.BytesIO(body)):
            self.assertEqual(pick_track.open_prs_for("lowcomm-training"),
                             ["#7 research/lowcomm-training: 3d"])
        pick_track._open_pr_titles.cache_clear()
        with mock.patch("urllib.request.urlopen", side_effect=OSError):
            self.assertEqual(pick_track.open_prs_for("x"), [])
        pick_track._open_pr_titles.cache_clear()

    def test_pages_past_the_first_hundred(self):
        import io, json
        from unittest import mock
        page1 = [{"number": i, "title": "other"} for i in range(100)]
        page2 = [{"number": 500, "title": "research/lowcomm-training: 4"}]
        bodies = [io.BytesIO(json.dumps(page1).encode()), io.BytesIO(json.dumps(page2).encode())]
        pick_track._open_pr_titles.cache_clear()
        with mock.patch("urllib.request.urlopen", side_effect=bodies):
            self.assertEqual(pick_track.open_prs_for("lowcomm-training"), ["#500 research/lowcomm-training: 4"])
        pick_track._open_pr_titles.cache_clear()


class ClaimCheckTest(unittest.TestCase):
    def setUp(self):
        pick_track._open_pr_titles.cache_clear()

    def tearDown(self):
        pick_track._open_pr_titles.cache_clear()

    def _run(self, titles, recent=(), age=1.0, covers=True):
        from unittest import mock
        with mock.patch.object(pick_track, "_open_pr_titles", return_value=titles), \
             mock.patch.object(pick_track, "recent_programme_commits", return_value=list(recent)), \
             mock.patch.object(pick_track, "origin_main_age_hours", return_value=age), \
             mock.patch.object(pick_track, "history_covers", return_value=covers):
            return pick_track.claim_check("cell-fidelity")

    def test_says_clear_when_nothing_found(self):
        lines = self._run([(1, "other")])
        self.assertEqual(len(lines), 1)
        self.assertIn("clear", lines[0])

    def test_api_error_is_not_silent(self):
        lines = self._run(None)
        self.assertTrue(any("could not list open PRs" in l for l in lines))
        self.assertFalse(any("clear" in l for l in lines))

    def test_stale_origin_main_is_flagged(self):
        lines = self._run([], age=30)
        self.assertTrue(any("30h old" in l for l in lines))
        self.assertFalse(any("clear" in l for l in lines))

    def test_claims_listed(self):
        lines = self._run([(9, "research/cell-fidelity: m2")], recent=["abc 1 hour ago: x"])
        self.assertTrue(any("#9" in l for l in lines))
        self.assertTrue(any("abc" in l for l in lines))


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
        # The fixture slugs must not depend on which programmes are BLOCKED on disk today,
        # nor on the network (build-data has a HOSTS file).
        real, pick_track.is_blocked = pick_track.is_blocked, lambda slug: False
        try:
            firsts = [pick_track.draw_programme(i / 4000, progs, lambda s: [], unreachable=lambda s: [])[0]
                      for i in range(4000)]
        finally:
            pick_track.is_blocked = real
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


class HostsTest(unittest.TestCase):
    progs = [("a-prog", True), ("b-prog", True), ("c-prog", True)]

    def test_programme_with_dead_host_is_passed_over(self):
        down = lambda s: ["https://x.example/"] if s == "a-prog" else []
        for r in [i / 50 for i in range(50)]:
            slug, _, skipped = pick_track.draw_programme(r, self.progs, lambda s: [], unreachable=down)
            self.assertNotEqual(slug, "a-prog")
            self.assertTrue(all(l.startswith("a-prog: needs https://x.example/") for l in skipped))

    def test_offline_beats_claimed_when_nothing_else_is_left(self):
        claimed = lambda s: ["#1 x"] if s != "b-prog" else []
        down = lambda s: ["https://x.example/"] if s == "b-prog" else []
        slug, _, skipped = pick_track.draw_programme(0.3, self.progs, claimed, unreachable=down)
        self.assertEqual(slug, "b-prog")
        self.assertEqual(len(skipped), 3)

    def test_unreachable_reports_only_failing_hosts(self):
        old = pick_track.needed_hosts
        pick_track.needed_hosts = lambda s: ["https://up.example/", "https://down.example/"]
        try:
            got = pick_track.unreachable_hosts("x", answers=lambda u: "up" in u)
        finally:
            pick_track.needed_hosts = old
        self.assertEqual(got, ["https://down.example/"])

    def test_no_hosts_file_probes_nothing(self):
        def boom(u):
            raise AssertionError("probed")
        self.assertEqual(pick_track.unreachable_hosts("no-such-programme", answers=boom), [])

    def test_hosts_file_parses_comments(self):
        self.assertEqual(len(pick_track.needed_hosts("build-data")), 4)
        self.assertTrue(all(h.startswith("https://") for h in pick_track.needed_hosts("build-data")))

    def test_host_answers_counts_http_errors_as_up(self):
        import urllib.error
        old = pick_track.urllib.request.urlopen
        def raise_(e):
            def f(*a, **k):
                raise e
            return f
        try:
            pick_track.urllib.request.urlopen = raise_(urllib.error.HTTPError("u", 404, "nf", {}, None))
            self.assertTrue(pick_track.host_answers("https://x/"))
            pick_track.host_answers.cache_clear()
            pick_track.urllib.request.urlopen = raise_(urllib.error.URLError("Tunnel connection failed: 403"))
            self.assertFalse(pick_track.host_answers("https://x/"))
        finally:
            pick_track.urllib.request.urlopen = old
            pick_track.host_answers.cache_clear()
