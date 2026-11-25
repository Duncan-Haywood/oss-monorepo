import tempfile
import unittest
from pathlib import Path
from unittest import mock

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

    def test_open_programme_demotes_the_milestone_line(self):
        found = (["aerolog-a", "aerolog-sizing"], ["aerolog-sizing"])
        [line] = pick_track.milestone_lines("aerolog", ["aerolog-scaling"], found, lambda s: [])
        self.assertIn("advancing aerolog-scaling comes first", line)
        self.assertIn("next free: aerolog-sizing", line)

    def test_no_takeable_programme_keeps_the_plain_line(self):
        found = (["x-a", "x-b"], ["x-b"])
        [line] = pick_track.milestone_lines("x", [], found, lambda s: ["research/p/LOG.md"])
        self.assertTrue(line.startswith("milestones: 1/2 on this checkout; next free: x-b"))
        self.assertIn("named in research/p/LOG.md", line)
        [line] = pick_track.milestone_lines("x", [], ([], []), lambda s: [])
        self.assertIn("no list found", line)


class NextStepsTest(unittest.TestCase):
    def test_reads_section_and_cuts(self):
        text = pick_track.next_steps("sensing-gatemix", width=40)
        self.assertTrue(text.startswith("Resample the measured offset"))
        self.assertLessEqual(len(text), 43)

    def test_missing_project_is_empty(self):
        self.assertEqual(pick_track.next_steps("nosuch-project"), "")

    def test_a_list_shows_every_item(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "p").mkdir()
            body = "".join(f"{i}. Item {i} " + "x" * 300 + "\n" for i in range(1, 7))
            (Path(d) / "p" / "README.md").write_text("# P\n\n## Next steps\n\n" + body + "\n## Log\n")
            with mock.patch.object(pick_track, "RESEARCH", Path(d)):
                text = pick_track.next_steps("p")
        for i in range(1, 7):
            self.assertIn(f"{i}) Item {i}", text)
        self.assertNotIn("Log", text)


class NewestLogEntriesTest(unittest.TestCase):
    LOG = ("# Log\n\n## 2026-11-13 · Milestone 6g: newest\n- x\n"
           "## 2026-11-12 · Milestone 6f\n"
           "## 2026-10-28 · old one above a newer one\n"
           "## 2026-11-12 · Milestone 6e: same day, lower in the file\n"
           "## 2026-11-03 · out of order\n")

    def test_sorted_by_date_with_file_order_for_ties(self):
        out = pick_track.newest_log_entries("x", n=4, text=self.LOG)
        self.assertEqual([o.split(": ", 1)[1][:10] for o in out],
                         ["2026-11-13", "2026-11-12", "2026-11-12", "2026-11-03"])
        self.assertIn("6f", out[1])
        self.assertIn("6e", out[2])
        self.assertTrue(out[0].startswith("3: "))

    def test_cuts_long_titles(self):
        out = pick_track.newest_log_entries("x", n=1, width=30, text=self.LOG)
        self.assertTrue(out[0].endswith("...") and len(out[0]) <= 33)

    def test_missing_log_is_empty(self):
        self.assertEqual(pick_track.newest_log_entries("nosuch-programme"), [])

    def test_real_log_reads(self):
        out = pick_track.newest_log_entries("heavy-hydraulics", n=1)
        self.assertEqual(len(out), 1)


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
        self.assertEqual(len(lines), 2)
        self.assertNotIn("clear", lines[0])
        self.assertIn("CLAIM RACE", lines[1])
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

    def test_refresh_deepens_when_plain_fetch_leaves_history_short(self):
        # A days-old ref reads as covered, the plain fetch replaces it with ~4 h of history.
        from unittest import mock
        run, calls = self._fake_git("new", "old")
        with mock.patch.object(pick_track, "history_covers", side_effect=[True, False]), \
             mock.patch.object(pick_track, "is_shallow", return_value=True):
            self.assertIsNone(pick_track.refresh_origin_main(run=run))
        fetch = [c for c in calls if c[1] == "fetch"]
        self.assertEqual(len(fetch), 2)
        self.assertFalse(any(a.startswith("--shallow-since=") for a in fetch[0]))
        self.assertIn("--shallow-since=7 hours ago", fetch[1])

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
        pick_track._open_pr_titles.cache_clear()  # an earlier test may have filled it
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


class OwnPrTest(unittest.TestCase):
    """A run that re-ran pick_track after opening its own draft PR had its programme skipped."""

    def setUp(self):
        pick_track._open_pr_titles.cache_clear()
        pick_track._HEADS.clear()

    tearDown = setUp

    def _fetch(self):
        import io, json
        from unittest import mock
        body = json.dumps([{"number": 7, "title": "research/lowcomm-training: 3d", "head": {"ref": "claude/mine"}},
                           {"number": 8, "title": "research/lowcomm-training: 4", "head": {"ref": "claude/sib"}}]).encode()
        return mock.patch("urllib.request.urlopen", return_value=io.BytesIO(body)), \
            mock.patch.object(pick_track, "current_branch", return_value="claude/mine")

    def test_own_pr_is_not_a_claim(self):
        a, b = self._fetch()
        with a, b:
            self.assertEqual(pick_track.open_prs_for("lowcomm-training"), ["#8 research/lowcomm-training: 4"])

    def test_draw_keeps_the_programme_once_its_own_pr_is_open(self):
        import io, json
        from unittest import mock
        body = json.dumps([{"number": 7, "title": "research/a-prog: m3", "head": {"ref": "claude/mine"}}]).encode()
        progs = [("a-prog", True), ("b-prog", True)]
        with mock.patch.object(pick_track, "current_branch", return_value="claude/mine"), \
             mock.patch("urllib.request.urlopen", return_value=io.BytesIO(body)):
            for r in (i / 50 for i in range(50)):
                first = pick_track.draw_programme(r, progs, lambda s: [], unreachable=lambda s: [])[0]
                again = pick_track.draw_programme(r, progs, unreachable=lambda s: [])[0]
                self.assertEqual(first, again)

    def test_claim_check_labels_own_pr(self):
        from unittest import mock
        a, b = self._fetch()
        with a, b, mock.patch.object(pick_track, "recent_programme_commits", return_value=[]), \
                mock.patch.object(pick_track, "origin_main_age_hours", return_value=1.0), \
                mock.patch.object(pick_track, "history_covers", return_value=True):
            lines = pick_track.claim_check("lowcomm-training")
        self.assertTrue(any("#7" in l and "own PR" in l for l in lines))
        self.assertFalse(any("#7" in l and "take a different" in l for l in lines))
        self.assertTrue(any("#8" in l and "take a different" in l for l in lines))


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
        self.assertEqual(len(lines), 2)
        self.assertIn("clear", lines[0])
        self.assertIn("CLAIM RACE", lines[1])

    def test_race_line_on_an_active_programme_too(self):
        # 2026-11-18: the claim_check.py pointer sat on the 'clear' line only, so a draw with
        # recent merged commits (the programmes most likely to be drawn twice) never saw it.
        lines = self._run([(1, "other")], recent=["abc 1 hour ago: m4 merged"])
        self.assertTrue(any("portfolio/router/claim_check.py cell-fidelity" in l for l in lines))

    def test_race_line_gives_the_empty_commit_claim(self):
        # A PR needs a commit; three research records waited ~15 min for a real one.
        lines = self._run([(1, "other")])
        self.assertTrue(any("git commit --allow-empty" in l for l in lines), lines)

    def test_no_race_line_when_a_claim_is_already_listed(self):
        lines = self._run([(9, "research/cell-fidelity: m2")])
        self.assertFalse(any("CLAIM RACE" in l for l in lines))

    def test_no_race_line_when_prs_cannot_be_read(self):
        self.assertFalse(any("CLAIM RACE" in l for l in self._run(None)))

    def test_api_error_is_not_silent(self):
        lines = self._run(None)
        self.assertTrue(any("could not list open PRs" in l for l in lines))
        self.assertFalse(any("clear" in l for l in lines))

    def test_stale_origin_main_is_flagged(self):
        lines = self._run([], age=30)
        self.assertTrue(any("30h old" in l for l in lines))
        self.assertFalse(any("clear" in l for l in lines))

    def test_short_history_suggests_a_window_wider_than_the_check(self):
        # --shallow-since='6 hours ago' cannot fetch a commit older than 6 h, so suggesting it
        # for a 6 h check repeated the warning forever.
        lines = self._run([], covers=False)
        self.assertTrue(any("--shallow-since='7 hours ago'" in l for l in lines))

    def test_claims_listed(self):
        lines = self._run([(9, "research/cell-fidelity: m2")], recent=["abc 1 hour ago: x"])
        self.assertTrue(any("#9" in l for l in lines))
        self.assertTrue(any("abc" in l for l in lines))
        self.assertFalse(any("no open PR names" in l for l in lines))

    def test_merged_commits_read_as_finished_not_claimed(self):
        # 2026-11-14 friction: "touched" did not say whether it was a finished milestone or a claim.
        lines = self._run([(1, "other")], recent=["abc 1 hour ago: m4 merged"])
        self.assertIn("finished work, not a claim", lines[0])
        self.assertTrue(any("no open PR names cell-fidelity" in l for l in lines))
        self.assertFalse(any("clear" in l.split(":", 1)[1][:7] for l in lines))


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
        # Half the fixture is focus: PROGRAMME_FOCUS_SHARE first, then half of the rest.
        expected = pick_track.PROGRAMME_FOCUS_SHARE + (1 - pick_track.PROGRAMME_FOCUS_SHARE) * 0.5
        self.assertAlmostEqual(share, expected, delta=0.03)
        self.assertEqual(set(firsts), {p[0] for p in progs})


class TriageTest(unittest.TestCase):
    """Owner, 2026-11-24: research gets pivoted into products; no effort on sunken ships."""

    table = """## Open programmes

| Programme | Question | Builds on | Triage (2026-11-24) | Product, or why | Target venue |
|---|---|---|---|---|---|
| [`a-prog`](a-prog/PROPOSAL.md) | Q? | track 20 | `product-linked` | Bet #1, `finish-paper` named in prose | V |
| [`b-prog`](b-prog/PROPOSAL.md) | Q? | `x-*` | `wound-down` | no product | V |
| [`c-prog`](c-prog/PROPOSAL.md) | Q? | `y-*` | `finish-paper` | draft close | V |
| [`d-prog`](d-prog/PROPOSAL.md) | Q? | `z-*` | none | V |
"""

    def test_triage_reads_the_state_cell(self):
        self.assertEqual(pick_track.triage(self.table),
                         {"a-prog": "product-linked", "b-prog": "wound-down", "c-prog": "finish-paper"})

    def test_only_product_linked_and_finish_paper_are_drawable(self):
        progs = [(s, True) for s in ("a-prog", "b-prog", "c-prog", "d-prog")]
        got = pick_track.drawable(progs, pick_track.triage(self.table))
        self.assertEqual([s for s, _ in got], ["a-prog", "c-prog"])

    def test_untriaged_table_keeps_everything(self):
        progs = [("a-prog", True)]
        self.assertEqual(pick_track.drawable(progs, {}), progs)

    def test_real_table_is_fully_triaged(self):
        slugs = [s for s, _ in pick_track.programmes()]
        states = pick_track.triage()
        self.assertEqual(set(states), set(slugs))
        self.assertTrue(set(states.values()) <= set(pick_track.TRIAGE_STATES))
        live = pick_track.drawable(pick_track.programmes())
        self.assertTrue(live)
        # Construction and manufacturing come first, so at least one drawable programme is focus.
        self.assertTrue(any(pick_track.is_focus(s) for s, _ in live))
        self.assertFalse(any(states[s] == "wound-down" for s, _ in live))

    def test_venue_column_stays_last(self):
        # venue_policy.py and portfolio/direction/report.py read the table by position.
        import venue_policy
        rows = venue_policy.programmes((pick_track.RESEARCH / "PROGRAMMES.md").read_text())
        self.assertTrue(rows)
        self.assertFalse(any(v.strip("` ") in pick_track.TRIAGE_STATES for _, v in rows))


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


class TrackProgrammesTest(unittest.TestCase):
    TABLE = """## Open programmes

| Programme | Question | Builds on | Target venue |
|---|---|---|---|
| [`build-data`](build-data/PROPOSAL.md) | q | city feeds; tracks 12 and 20 | v |
| [`sensing-selfcal`](sensing-selfcal/PROPOSAL.md) | q | track 15, the `sensing-ba*` projects | v |
| [`heavy-hydraulics`](heavy-hydraulics/PROPOSAL.md) | q | `osrobot-*`, `codesign-*` | v |
| [`marine-hull`](marine-hull/PROPOSAL.md) | q | track 23; `osrobot-*` | v |
"""

    def test_named_track_and_prefix(self):
        tp = pick_track.track_programmes
        self.assertEqual(tp(15, self.TABLE), ["sensing-selfcal"])
        self.assertEqual(tp(12, self.TABLE), ["build-data"])
        self.assertEqual(tp(20, self.TABLE), ["build-data"])
        self.assertEqual(tp(23, self.TABLE), ["marine-hull"])
        # matched by slug prefix although "Builds on" names no track
        self.assertEqual(tp(pick_track.PREFIX.index("heavy") + 1, self.TABLE), ["heavy-hydraulics"])
        self.assertEqual(tp(pick_track.PREFIX.index("infra") + 1, self.TABLE), [])

    def test_real_table_names_some_programme(self):
        # Every row that says "track N" in the live table maps back to it.
        self.assertIn("sensing-selfcal", pick_track.track_programmes(15))

    def test_builds_on_glob_names_the_track(self):
        # llm-coding-inference builds on `qual-*`; its slug has no qual- prefix.
        table = ("## Open programmes\n\n| Programme | Question | Builds on | Venue |\n|---|---|---|---|\n"
                 "| [`llm-coding-inference`](x) | Q | `qual-*` | V |\n"
                 "| [`verified-dse`](x) | Q | `eda-*`, `chip-*` and `accel-*` | V |\n"
                 "| [`sim2real-inference`](x) | Q | `*-twin`, `twin-*` and `mimic-twin*` | V |\n")
        tp = pick_track.track_programmes
        idx = pick_track.PREFIX.index
        self.assertEqual(tp(idx("qual") + 1, table), ["llm-coding-inference"])
        self.assertEqual(tp(idx("eda") + 1, table), ["verified-dse"])
        self.assertEqual(tp(idx("accel") + 1, table), ["verified-dse"])
        self.assertEqual(tp(idx("mimic") + 1, table), ["sim2real-inference"])
        self.assertEqual(tp(idx("swe") + 1, table), [])
        self.assertIn("llm-coding-inference", tp(idx("qual") + 1))


class FreeChoiceTest(unittest.TestCase):
    def test_free_choice_says_where_the_work_goes(self):
        lines = pick_track.free_choice_lines([("a-prog", True), ("b-prog", True)])
        text = "\n".join(lines)
        self.assertIn('"programme": "none"', text)
        self.assertIn("why_standalone", text)
        self.assertIn("PROPOSAL.md", text)
        self.assertIn("2 open programme(s)", text)

    def test_least_contended_programme_comes_first(self):
        prs = {"busy": ["#1 research/busy: m3"], "hot": [], "idle": [], "fresh": []}
        recent = {"busy": [], "hot": ["abc 1 hour ago: research/hot: m9"], "idle": [], "fresh": []}
        age = {"busy": 30.0, "hot": 40.0, "idle": 20.0, "fresh": 2.0}
        lines = pick_track.contention_lines(["busy", "hot", "fresh", "idle"], prs=prs.get,
                                            recent=recent.get, last=age.get)
        self.assertEqual([l.split(":")[0].strip() for l in lines], ["idle", "fresh", "hot", "busy"])
        self.assertIn("idle: 0 open PR(s), 0 commit(s) on main in 6 h, last landed 20 h ago", lines[0])

    def test_unknown_age_counts_as_idlest_and_says_so(self):
        lines = pick_track.contention_lines(["a", "b"], prs=lambda s: [], recent=lambda s: [],
                                            last={"a": 5.0, "b": None}.get, logged=lambda s: None)
        self.assertTrue(lines[0].strip().startswith("b:"))
        self.assertIn("nothing in this clone's history or LOG.md", lines[0])

    def test_log_date_stands_in_when_the_shallow_clone_has_no_commit(self):
        import calendar
        now = calendar.timegm((2026, 11, 23, 20, 0, 0))
        lines = pick_track.contention_lines(["logged-today", "landed", "old-log"], prs=lambda s: [],
                                            recent=lambda s: [], now=now,
                                            last={"logged-today": None, "landed": 40.0, "old-log": None}.get,
                                            logged={"logged-today": "2026-11-23", "old-log": "2026-11-01"}.get)
        self.assertEqual([l.split(":")[0].strip() for l in lines], ["old-log", "landed", "logged-today"])
        self.assertIn("newest LOG.md entry dated 2026-11-23", lines[2])

    def test_free_choice_prints_the_ranking(self):
        text = "\n".join(pick_track.free_choice_lines([("a-prog", True)], contention=lambda s: ["    a-prog: x"]))
        self.assertIn("least contended first", text)
        self.assertIn("a-prog: x", text)


class PostLimitsTest(unittest.TestCase):
    def test_line_carries_the_checker_caps(self):
        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "platform" / "ci"))
        import check_post_frontmatter as cpf
        line = pick_track.post_limits_line()
        self.assertTrue(line.startswith("post front matter:"))
        self.assertIn(f"description {cpf.MIN_DESCRIPTION} to {cpf.LIMITS['description']}", line)


class ProgrammeLabelTest(unittest.TestCase):
    def test_offline_and_plain(self):
        self.assertEqual(pick_track.programme_label("no-such-programme", []), "no-such-programme")
        got = pick_track.programme_label("no-such-programme", ["https://example.invalid/"])
        self.assertIn("OFFLINE", got)
        self.assertIn("https://example.invalid/", got)


class LandFirstTest(unittest.TestCase):
    """research prompt step 2: runs read 100+ open PR titles by hand to find the research ones."""

    def setUp(self):
        pick_track._open_pr_titles.cache_clear()
        pick_track._HEADS.clear()
        pick_track._META.clear()

    tearDown = setUp

    def _lines(self, prs, branch="claude/mine", main=(), **kw):
        import io, json, calendar, time
        from unittest import mock
        body = json.dumps(prs).encode()
        now = calendar.timegm(time.strptime("2026-11-16T12:00:00Z", "%Y-%m-%dT%H:%M:%SZ"))
        with mock.patch("urllib.request.urlopen", return_value=io.BytesIO(body)), \
                mock.patch.object(pick_track, "_main_subjects", return_value=list(main)), \
                mock.patch.object(pick_track, "current_branch", return_value=branch):
            return pick_track.land_first_lines(now=now, **kw)

    def pr(self, n, title, created, ref="claude/x", draft=False):
        return {"number": n, "title": title, "created_at": created, "draft": draft, "head": {"ref": ref}}

    def test_splits_stale_from_fresh_and_skips_others(self):
        lines = self._lines([
            self.pr(1, "research/sensing-selfcal: milestone 3b", "2026-11-16T11:00:00Z", draft=True),
            self.pr(2, "research/build-data: session 90", "2026-11-14T12:00:00Z"),
            self.pr(3, "redteam: some venture", "2026-11-10T12:00:00Z"),
            self.pr(4, "run record: research run 2026-11-08", "2026-11-08T12:00:00Z"),
            self.pr(5, "research/old-prog: step", "2026-11-16T06:00:00Z"),
            self.pr(6, "research/mine: step", "2026-11-10T00:00:00Z", ref="claude/mine"),
        ])
        text = "\n".join(lines)
        self.assertIn("3 open PR(s) by other sessions title research/..., out of 6 open PRs in the repository", lines[0])
        self.assertNotIn("#3 ", text)
        self.assertNotIn("#4 ", text)
        # oldest stale first, fresh in its own group, own PR labelled
        self.assertLess(text.index("#2 (2d)"), text.index("#5 (6.0h)"))
        self.assertLess(text.index("#5 (6.0h)"), text.index("last 3h"))
        self.assertIn("#1 (1.0h, draft)", text.split("last 3h")[1])
        self.assertIn("#6 is this branch's own PR", text)

    def test_none_and_api_error_are_said(self):
        self.assertIn("none", self._lines([self.pr(3, "ventures: x", "2026-11-16T11:00:00Z")])[0])
        pick_track._open_pr_titles.cache_clear()
        from unittest import mock
        with mock.patch("urllib.request.urlopen", side_effect=OSError):
            self.assertIn("could not list", pick_track.land_first_lines()[0])

    def test_squash_landed_prs_are_told_to_close(self):
        # 2026-11-16: #16494 was listed as unlanded while '(#16494)' was already on main
        lines = self._lines([
            self.pr(7, "research/a: milestone 2", "2026-11-15T12:00:00Z"),
            self.pr(8, "research/b: milestone 5", "2026-11-15T12:00:00Z"),
            self.pr(9, "research/c: milestone 1", "2026-11-15T12:00:00Z"),
        ], main=["research/a: milestone 2 + post (#7)", "Merge pull request #9 from x/y", "other (#77)"])
        text = "\n".join(lines)
        head, _, tail = text.partition("already on main")
        self.assertIn("1 older than 3h", head)
        self.assertIn("#8 (24.0h)", head)
        self.assertNotIn("#7 ", head)
        self.assertIn("#7 (24.0h)", tail)
        self.assertIn("#9 (24.0h)", tail)
        self.assertIn("close it", tail.splitlines()[0])

    def test_landed_on_main_matches_subjects_only(self):
        from unittest import mock
        with mock.patch.object(pick_track, "_main_subjects",
                               return_value=["x (#12)", "y (#123) trailing", "Merge pull request #5 from a/b"]):
            self.assertEqual(pick_track.landed_on_main([12, 123, 5, 1]), {12, 5})

    def test_caps_long_lists(self):
        prs = [self.pr(i, f"research/p{i}: s", "2026-11-01T00:00:00Z") for i in range(12)]
        lines = self._lines(prs, show=3)
        self.assertTrue(any("and 9 more" in l for l in lines))


class StaleHostsTest(unittest.TestCase):
    """stale_hosts.py lives beside pick_track.py; its tests sit here because research-ci.yml
    runs test_pick_track by name."""

    def setUp(self):
        import tempfile, pathlib
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        d = self.root / "prog"
        d.mkdir()
        (d / "LOG.md").write_text(
            "## 2026-11-16 · newest\n"
            "- arXiv refused earlier sessions; this session reached example.org and read it.\n"
            "- Design: no microdata (gss.norc.org still refuses the proxy with a 403).\n"
            "- Wrote results.json and run.py; nothing was refused.\n"
            "## 2026-11-10 · older\n"
            "- `L-TOWN.inp` was unreachable (zenodo.org refused by the proxy).\n"
            "- huggingface.co refused at CONNECT.\n")
        (d / "README.md").write_text("Data from data.sf.gov (403 through the proxy).\n")
        (d / "HOSTS").write_text("# needed\nhttps://huggingface.co/\n")

    def tearDown(self):
        self.tmp.cleanup()

    def test_finds_refused_hosts_only_in_refusing_clauses(self):
        import stale_hosts
        got = stale_hosts.noted_hosts("prog", self.root)
        self.assertEqual([h for h, _ in got], ["arxiv.org", "gss.norc.org", "zenodo.org", "data.sf.gov"])
        self.assertEqual(dict(got)["zenodo.org"], "LOG.md:6")  # newest LOG entries first, README last

    def test_skips_hosts_listed_in_HOSTS_and_file_names(self):
        import stale_hosts
        hosts = [h for h, _ in stale_hosts.noted_hosts("prog", self.root)]
        self.assertNotIn("huggingface.co", hosts)  # the OFFLINE check already probes it
        self.assertNotIn("example.org", hosts)  # its clause says reached, not refused
        self.assertNotIn("results.json", hosts)

    def test_recheck_splits_answering_from_refused(self):
        import stale_hosts
        lines = stale_hosts.recheck_lines("prog", answers=lambda u: "zenodo" in u or "arxiv" in u, root=self.root)
        self.assertEqual(len(lines), 2)
        self.assertIn("arxiv.org (LOG.md:2), zenodo.org (LOG.md:6)", lines[0])
        self.assertTrue(lines[1].endswith("still refused here: gss.norc.org, data.sf.gov"))

    def test_recheck_names_a_refused_host_the_code_fetches(self):
        import stale_hosts
        src = self.root / "prog" / "src"
        src.mkdir()
        (src / "data.py").write_text('RECORD = "https://zenodo.org/api/records/1/files/{name}/content"\n')
        lines = stale_hosts.recheck_lines("prog", answers=lambda u: False, root=self.root)
        self.assertEqual(len(lines), 2)
        self.assertIn("its own code fetches from zenodo.org", lines[1])
        self.assertIn("research/prog/HOSTS", lines[1])
        self.assertNotIn("gss.norc.org", lines[1])  # named in notes only, not fetched by code

    def test_no_notes_no_lines(self):
        import stale_hosts
        (self.root / "empty").mkdir()
        self.assertEqual(stale_hosts.recheck_lines("empty", answers=lambda u: True, root=self.root), [])


class TrackFallbackTest(unittest.TestCase):
    """track_fallback_lines: a track whose programmes are all untakeable names one elsewhere."""

    def lines(self, progs_here, down=None, claimed=lambda s: [], unreachable=lambda s: [], t=20,
              all_progs=("build-data", "buildbot-sheathing", "house-x", "society-y")):
        ranked = lambda slugs, show=3: [f"    {s}" for s in slugs[:show]]
        with mock.patch.object(pick_track, "is_blocked", lambda s: False):
            return pick_track.track_fallback_lines(t, progs_here, down or {}, all_progs=list(all_progs),
                                                   claimed=claimed, unreachable=unreachable, contention=ranked)

    def test_takeable_programme_prints_nothing(self):
        self.assertEqual(self.lines(["build-data", "buildbot-sheathing"], down={"build-data": ["h"]}), [])

    def test_offline_and_claimed_names_one_elsewhere(self):
        out = self.lines(["build-data", "buildbot-sheathing"], down={"build-data": ["https://h"]},
                         claimed=lambda s: ["#16769 research/buildbot-sheathing: draft"] if s == "buildbot-sheathing" else [])
        self.assertIn("build-data: OFFLINE", out[0])
        self.assertIn("buildbot-sheathing: claimed by #16769", out[0])
        # track 20 (buildbot) is a focus track, so only focus programmes are offered
        self.assertEqual(out[1:], ["    house-x"])

    def test_non_focus_track_offers_any(self):
        out = self.lines(["society-y"], claimed=lambda s: ["#1 t"] if s == "society-y" else [], t=17)
        self.assertEqual(out[1:], ["    build-data", "    buildbot-sheathing", "    house-x"])

    def test_skips_unreachable_elsewhere(self):
        out = self.lines(["buildbot-sheathing"], claimed=lambda s: ["#1 t"] if s == "buildbot-sheathing" else [],
                         unreachable=lambda s: ["h"] if s == "build-data" else [])
        self.assertNotIn("    build-data", out)

    def test_nothing_left_says_open_one(self):
        out = self.lines(["buildbot-sheathing"], claimed=lambda s: ["#1 t"], all_progs=("buildbot-sheathing",))
        self.assertEqual(len(out), 1)
        self.assertIn("open a new programme", out[0])

    def test_no_programmes_for_track_prints_nothing(self):
        self.assertEqual(self.lines([]), [])


class ChainLineTest(unittest.TestCase):
    LOG = "".join(f"## 2026-11-{10 + i // 10:02d} · Milestone 6{'z' * (i // 26)}{chr(97 + i % 26)}: knob {i}\n"
                  for i in range(30, -1, -1))

    def test_long_chain_prints_cue(self):
        line = pick_track.chain_line("x", text=self.LOG)
        self.assertTrue(line.startswith("CHAIN: milestone 6 has 31 sub-steps"))
        self.assertIn("no LOG heading names a paper step yet", line)

    def test_short_chain_prints_nothing(self):
        self.assertIsNone(pick_track.chain_line("x", minimum=40, text=self.LOG))

    def test_unlabelled_log_prints_nothing(self):
        self.assertIsNone(pick_track.chain_line("x", text="## 2026-11-10 · notes\n- a\n"))

    def test_missing_log_prints_nothing(self):
        self.assertIsNone(pick_track.chain_line("no-such-programme-slug"))

    def test_newest_entry_a_paper_step_prints_nothing(self):
        text = "## 2026-11-19 · Paper step: Section 4 carries 6a..6ze\n" + self.LOG
        self.assertIsNone(pick_track.chain_line("x", text=text))

    def test_names_the_last_paper_step(self):
        # llm-coding-inference, 2026-11-20: `Paper: Section 6.1` one entry back read as "32 since"
        text = (self.LOG.split("\n", 1)[0] + "\n## 2026-11-13 · Paper: Section 6.1, validity\n"
                + self.LOG.split("\n", 1)[1])
        line = pick_track.chain_line("x", text=text)
        self.assertIn("1 entry since the last paper step, \"2026-11-13 · Paper: Section 6.1, validity\"", line)


if __name__ == "__main__":
    unittest.main()
