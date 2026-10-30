#!/usr/bin/env python3
"""Unit tests for the browser-check orchestrator.

The property worth pinning is the sentinel. Every other part of this tool
is convenience; the sentinel is the reason to use it instead of six
hand-typed commands, because it is what turns the 2026-08-28 false clean
report into a refusal.
"""
from __future__ import annotations

import io
import contextlib
import os
import shutil
import tempfile
import unittest
from unittest import mock

import browser_checks as bc


class Sentinel(unittest.TestCase):
    """A served tree is only trusted when it echoes the token just written."""

    def setUp(self):
        self.dist = tempfile.mkdtemp(prefix="bc-test-")
        self.port = bc.free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        self.httpd = None

    def tearDown(self):
        if self.httpd is not None:
            self.httpd.shutdown()
            self.httpd.server_close()
        import shutil
        shutil.rmtree(self.dist, ignore_errors=True)

    def test_matching_token_is_confirmed(self):
        token = bc.write_sentinel(self.dist)
        self.httpd = bc.serve(self.dist, self.port)
        ok, detail = bc.confirm_sentinel(self.base, token)
        self.assertTrue(ok, detail)

    def test_a_server_on_another_tree_is_refused(self):
        """The exact 2026-08-28 shape: the port answers, but for a stale build."""
        stale = tempfile.mkdtemp(prefix="bc-stale-")
        try:
            bc.write_sentinel(stale)          # the old build's token
            self.httpd = bc.serve(stale, self.port)
            fresh = bc.write_sentinel(self.dist)  # the tree we mean to test
            ok, detail = bc.confirm_sentinel(self.base, fresh)
            self.assertFalse(ok)
            self.assertIn("different token", detail)
        finally:
            import shutil
            shutil.rmtree(stale, ignore_errors=True)

    def test_a_server_with_no_sentinel_at_all_is_refused(self):
        """An older build predates the sentinel, so the file 404s."""
        empty = tempfile.mkdtemp(prefix="bc-empty-")
        try:
            self.httpd = bc.serve(empty, self.port)
            ok, detail = bc.confirm_sentinel(self.base, bc.write_sentinel(self.dist))
            self.assertFalse(ok)
            self.assertIn("404", detail)
        finally:
            import shutil
            shutil.rmtree(empty, ignore_errors=True)

    def test_nothing_listening_is_refused(self):
        ok, detail = bc.confirm_sentinel(self.base, "abc", timeout=2.0)
        self.assertFalse(ok)
        self.assertIn("could not be read", detail)

    def test_sentinel_file_lands_in_the_tree_under_test(self):
        token = bc.write_sentinel(self.dist)
        path = os.path.join(self.dist, bc.SENTINEL_NAME)
        self.assertTrue(os.path.isfile(path))
        with open(path, encoding="utf-8") as fh:
            self.assertEqual(fh.read().strip(), token)

    def test_each_call_writes_a_new_token(self):
        """Reusing a token would let a stale tree pass on a second run."""
        self.assertNotEqual(bc.write_sentinel(self.dist), bc.write_sentinel(self.dist))


class Arguments(unittest.TestCase):
    def run_main(self, argv):
        err = io.StringIO()
        out = io.StringIO()
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
            rc = bc.main(argv)
        return rc, err.getvalue() + out.getvalue()

    def test_unknown_check_is_rejected_before_anything_is_built(self):
        rc, text = self.run_main(["--checks", "journey,nosuchcheck"])
        self.assertEqual(rc, 2)
        self.assertIn("nosuchcheck", text)

    def test_base_url_cannot_be_combined_with_a_built_tree(self):
        """--base-url has no sentinel, so silently ignoring --dist would be a lie."""
        rc, text = self.run_main(["--base-url", "https://example.test", "--dist", "."])
        self.assertEqual(rc, 2)
        self.assertIn("pass it alone", text)

    def test_missing_dist_directory_is_named(self):
        rc, text = self.run_main(["--dist", "/nonexistent-browser-checks-dir"])
        self.assertIn(rc, (1, 2))
        self.assertIn("nonexistent-browser-checks-dir", text)


class DistPropagation(unittest.TestCase):
    """The DIST env var `main()` forgot to pass to each check (2026-08-30).

    sideways.mjs, presets.mjs, roundtrip.mjs, contrast.mjs and highlight.mjs
    each walk the built tree on disk directly, in addition to fetching over
    BASE_URL. Before this test existed, `run_check`'s child env carried only
    BASE_URL, so any of those five ran against `<script-dir>/dist` instead
    of the tree this orchestrator actually built or was pointed at --
    empty in the common case, or a previous run's stale leftovers in the
    dangerous one. sweep.mjs and journey.mjs never read DIST, so they
    passed either way and the gap went unnoticed until a real run
    exercised the other four (see 2026-08-30's ledger entry).
    """

    def test_run_check_receives_the_dist_it_is_serving(self):
        dist = tempfile.mkdtemp(prefix="bc-distprop-")
        try:
            with open(os.path.join(dist, "index.html"), "w", encoding="utf-8") as fh:
                fh.write("<html></html>")
            calls = []

            def fake_run_check(name, base, env, timeout):
                calls.append((name, env.get("DIST")))
                return 0, ""

            with mock.patch.object(bc, "run_check", fake_run_check), \
                 mock.patch.object(bc, "playwright_available", lambda env: True), \
                 mock.patch.object(bc, "chrome_launches", lambda env, path: True):
                rc = bc.main(["--dist", dist, "--checks", "sideways"])

            self.assertEqual(rc, 0)
            self.assertEqual(calls, [("sideways", dist)])
        finally:
            shutil.rmtree(dist, ignore_errors=True)


class Registry(unittest.TestCase):
    def test_every_named_check_exists_on_disk(self):
        """A typo here would silently verify one fewer thing than the report claims."""
        for name in bc.CHECKS:
            self.assertTrue(
                os.path.isfile(os.path.join(bc.PAGES, f"{name}.mjs")),
                f"platform/pages/{name}.mjs is missing",
            )

    def test_the_documented_checks_are_all_registered(self):
        self.assertEqual(
            set(bc.CHECKS),
            {"journey", "sweep", "contrast", "roundtrip", "presets", "highlight",
             "sideways", "optout"},
        )

    def test_every_enumeration_of_the_checks_agrees(self):
        """The registry is written out in four places. They must not drift.

        `browser_checks.CHECKS` is the registry; `browser_state.CHECKS`
        duplicates it as a literal on purpose (importing it would trigger the
        environment probing this module does at import time); and
        `browser-checks-ci.yml` spells the same list twice, once as the
        workflow_dispatch default and once as the fallback for `CHECKS`.

        Nothing tied them together until `optout` was added on 2026-09-12 and
        four files had to be edited by hand to register one check. The
        neighbouring test already catches a check that no list names -- this
        catches a check that *some* of them name, which is worse: the sweep
        runs it locally and the nightly does not, or the nightly runs it and
        `browser_state.py` reports the reading under a check it does not know,
        and either way the disagreement is invisible until someone diffs two
        files nobody thinks to diff.
        """
        import re
        import browser_state

        self.assertEqual(
            list(bc.CHECKS),
            list(browser_state.CHECKS),
            "browser_state.CHECKS has drifted from browser_checks.CHECKS",
        )

        workflow = os.path.join(
            os.path.dirname(os.path.dirname(bc.PAGES)),
            ".github", "workflows", "browser-checks-ci.yml",
        )
        with open(workflow, encoding="utf-8") as fh:
            text = fh.read()
        spelled = re.findall(r"\b((?:[a-z]+,){3,}[a-z]+)\b", text)
        lists = [s for s in spelled if set(s.split(",")) & set(bc.CHECKS)]
        self.assertTrue(lists, f"no check list found in {workflow}")
        for spelling in lists:
            self.assertEqual(
                spelling.split(","),
                list(bc.CHECKS),
                f"{os.path.basename(workflow)} spells the checks as {spelling!r}, "
                f"which is not {','.join(bc.CHECKS)}",
            )

    def test_highlight_is_registered(self):
        """It was written on 2026-08-29 and left out of CHECKS.

        A session running "the browser checks" then ran six of the seven and
        was not told which one it had missed. `highlight.mjs` is the only
        check that asks whether a rejected input gets pointed at -- it found
        0 of 103 tools drawing any highlight at all when it was written, on
        forms whose own message said "check the highlighted input".
        """
        self.assertIn("highlight", bc.CHECKS)

    def test_no_check_module_in_pages_is_left_out_of_the_registry(self):
        """The gap that let `highlight` sit unregistered, closed generally.

        Every `platform/pages/*.mjs` that runs as a standalone browser check
        reads `BASE_URL` and drives Playwright. Anything matching that shape
        and missing from CHECKS is a check nobody runs.
        """
        registered = set(bc.CHECKS)
        for path in sorted(os.listdir(bc.PAGES)):
            if not path.endswith(".mjs") or path.endswith(".test.mjs"):
                continue
            name = path[: -len(".mjs")]
            if name in registered:
                continue
            with open(os.path.join(bc.PAGES, path), encoding="utf-8") as fh:
                source = fh.read()
            looks_like_a_check = "BASE_URL" in source and "chromium" in source
            self.assertFalse(
                looks_like_a_check,
                f"platform/pages/{path} reads BASE_URL and launches a browser but "
                f"is not in CHECKS, so nothing runs it. Register it, or give it a "
                f"name this test does not mistake for a check.",
            )

    def test_free_port_is_actually_free(self):
        port = bc.free_port()
        httpd = bc.serve(tempfile.mkdtemp(prefix="bc-port-"), port)
        try:
            self.assertTrue(1024 <= port <= 65535)
        finally:
            httpd.shutdown()
            httpd.server_close()


class DiscoverChrome(unittest.TestCase):
    """Filling in `CHROME_PATH` when the machine already has a browser.

    Playwright pins a browser build number and will not launch a different
    one, even from the tree right beside it. Its advice ("npx playwright
    install") is wrong wherever the download is blocked, so a session that
    follows it loses the run to an install it cannot do.
    """

    def _tree(self, *builds, shell=()):
        root = tempfile.mkdtemp(prefix="bc-browsers-")
        for name in [*builds, *shell]:
            leaf = "headless_shell" if name in shell else "chrome"
            path = os.path.join(root, name, "chrome-linux", leaf)
            os.makedirs(os.path.dirname(path))
            with open(path, "w") as fh:
                fh.write("#!/bin/sh\n")
            os.chmod(path, 0o755)
        return root

    def _always_launches(self):
        """Stub the launch probe: every candidate starts. Restores on exit."""
        original = bc.chrome_launches
        bc.chrome_launches = lambda env, path: True
        self.addCleanup(setattr, bc, "chrome_launches", original)

    def test_an_explicit_choice_is_never_overridden(self):
        self._always_launches()
        root = self._tree("chromium-1194")
        env = {"PLAYWRIGHT_BROWSERS_PATH": root, "CHROME_PATH": "/somewhere/else"}
        self.assertIsNone(bc.discover_chrome(env))
        # CHROMIUM_PATH is sweep.mjs's older spelling for the same knob.
        env = {"PLAYWRIGHT_BROWSERS_PATH": root, "CHROMIUM_PATH": "/somewhere/else"}
        self.assertIsNone(bc.discover_chrome(env))

    def test_a_browser_in_the_tree_is_found(self):
        self._always_launches()
        root = self._tree("chromium-1194")
        found = bc.discover_chrome({"PLAYWRIGHT_BROWSERS_PATH": root})
        self.assertEqual(found, os.path.join(root, "chromium-1194", "chrome-linux", "chrome"))

    def test_the_newest_build_wins(self):
        # Alphabetical order would pick 1194 over 989, and a stale tree left
        # by an older install would then shadow the current one.
        root = self._tree("chromium-989", "chromium-1194")
        found = bc.chrome_candidates({"PLAYWRIGHT_BROWSERS_PATH": root})
        self.assertIn("chromium-1194", found[0])

    def test_the_headless_shell_is_offered_after_the_full_browser(self):
        # It is a different binary under a different name, and it is what
        # Playwright itself launches for `headless: true` — which is the only
        # mode these checks use. So it is a real fallback, not a mistake.
        # It ranks below the full build: preferred only when that will not run.
        root = self._tree("chromium-1194", shell=("chromium_headless_shell-1194",))
        found = bc.chrome_candidates({"PLAYWRIGHT_BROWSERS_PATH": root})
        self.assertEqual(len(found), 2)
        self.assertTrue(found[0].endswith(os.path.join("chromium-1194", "chrome-linux", "chrome")))
        self.assertTrue(found[1].endswith("headless_shell"))

    def test_the_headless_shell_alone_is_still_a_candidate(self):
        root = self._tree(shell=("chromium_headless_shell-1194",))
        found = bc.chrome_candidates({"PLAYWRIGHT_BROWSERS_PATH": root})
        self.assertEqual(len(found), 1)
        self.assertTrue(found[0].endswith("headless_shell"))

    def test_nothing_found_changes_nothing(self):
        # None means "leave the environment alone", so Playwright's own
        # resolution gets its turn instead of being pre-empted by a wrong guess.
        self._always_launches()
        self.assertIsNone(bc.discover_chrome({}))
        self.assertIsNone(bc.discover_chrome({"PLAYWRIGHT_BROWSERS_PATH": "/no/such/dir"}))
        self.assertIsNone(bc.discover_chrome({"PLAYWRIGHT_BROWSERS_PATH": self._tree()}))

    def test_a_non_executable_file_is_not_offered(self):
        root = self._tree("chromium-1194")
        os.chmod(os.path.join(root, "chromium-1194", "chrome-linux", "chrome"), 0o644)
        self.assertEqual(bc.chrome_candidates({"PLAYWRIGHT_BROWSERS_PATH": root}), [])

    def test_a_candidate_that_will_not_launch_is_skipped(self):
        # The defect this exists for, measured 2026-09-07: the full
        # chromium-1194 on this image dies on SIGTRAP the moment Playwright
        # connects, while the shell build beside it renders fine. Offering the
        # first one turned all seven checks red with a stack trace that reads
        # like a broken catalogue rather than a browser that will not start.
        root = self._tree("chromium-1194", shell=("chromium_headless_shell-1194",))
        original = bc.chrome_launches
        bc.chrome_launches = lambda env, path: path.endswith("headless_shell")
        self.addCleanup(setattr, bc, "chrome_launches", original)
        found = bc.discover_chrome({"PLAYWRIGHT_BROWSERS_PATH": root})
        self.assertTrue(found.endswith("headless_shell"))

    def test_nothing_that_launches_means_no_override(self):
        # Not a dead end: returning None leaves Playwright's own resolution to
        # try, which on the image that produced this bug is one that works.
        root = self._tree("chromium-1194", shell=("chromium_headless_shell-1194",))
        original = bc.chrome_launches
        bc.chrome_launches = lambda env, path: False
        self.addCleanup(setattr, bc, "chrome_launches", original)
        self.assertIsNone(bc.discover_chrome({"PLAYWRIGHT_BROWSERS_PATH": root}))


class Classification(unittest.TestCase):
    """Exit 2 means "nothing was verified", and must never read as a failure.

    Every check in `platform/pages/` reserves 2 for a dependency it could not
    load, an empty page list, or a DIST that is not there, and 1 for a defect
    it actually found. This orchestrator used to collapse both into
    "FAILED (exit N)" and return 1, so a machine without `axe-core` reported
    `1 of 6 checks failed: contrast` -- a missing npm package presented as an
    accessibility regression. That is the same conflation `CLAUDE.md` spends
    three paragraphs on for CI ("absent CI is not failed CI"), reproduced in
    the repo's own tooling.
    """

    def test_zero_is_a_pass(self):
        self.assertEqual(bc.classify(0), "ok")
        self.assertFalse(bc.is_skip(0))
        self.assertFalse(bc.is_failure(0))

    def test_two_is_a_skip(self):
        self.assertEqual(bc.classify(bc.SKIP_EXIT), "skip")
        self.assertTrue(bc.is_skip(2))
        self.assertFalse(bc.is_failure(2))

    def test_one_is_a_real_failure(self):
        self.assertEqual(bc.classify(1), "fail")
        self.assertTrue(bc.is_failure(1))
        self.assertFalse(bc.is_skip(1))

    def test_a_timeout_is_a_failure_not_a_skip(self):
        """124 is invented by run_check, not exited by a check.

        A check that was running and did not finish is the shape of a page
        that hangs, which is a defect. Treating it as "could not verify"
        would let a hang pass as an environment problem.
        """
        self.assertTrue(bc.is_failure(bc.TIMEOUT_EXIT))
        self.assertIn("timed out", bc.outcome_label(bc.TIMEOUT_EXIT))

    def test_an_unexpected_code_is_a_failure(self):
        # Anything the contract does not name is treated as a defect, so a new
        # exit code cannot quietly become a skip.
        for rc in (3, 5, 127, 255):
            self.assertTrue(bc.is_failure(rc), rc)

    def test_the_skip_banner_never_says_failed(self):
        self.assertNotIn("FAIL", bc.outcome_label(bc.SKIP_EXIT).upper())
        self.assertIn("did not run", bc.outcome_label(bc.SKIP_EXIT))

    def test_every_class_has_a_summary_mark_of_equal_width(self):
        # The summary is a column; a mark of a different width misaligns it.
        marks = [bc.SUMMARY_MARK[k] for k in ("ok", "skip", "fail")]
        self.assertEqual({len(m) for m in marks}, {4})


class RunOutcome(unittest.TestCase):
    """What `main()` returns once each check has reported."""

    def _run(self, codes):
        """Drive main() over a real served tree with faked check results."""
        dist = tempfile.mkdtemp(prefix="bc-outcome-")
        try:
            with open(os.path.join(dist, "index.html"), "w", encoding="utf-8") as fh:
                fh.write("<html></html>")
            names = list(codes)

            def fake_run_check(name, base, env, timeout):
                return codes[name], ""

            err, out = io.StringIO(), io.StringIO()
            with mock.patch.object(bc, "run_check", fake_run_check), \
                 mock.patch.object(bc, "playwright_available", lambda env: True), \
                 mock.patch.object(bc, "chrome_launches", lambda env, path: True), \
                 mock.patch.object(bc, "discover_axe", lambda env: None), \
                 contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
                rc = bc.main(["--dist", dist, "--checks", ",".join(names)])
            return rc, err.getvalue() + out.getvalue()
        finally:
            shutil.rmtree(dist, ignore_errors=True)

    def test_all_passing_is_zero(self):
        rc, text = self._run({"sideways": 0, "presets": 0})
        self.assertEqual(rc, 0)
        self.assertIn("all 2 browser checks passed", text)

    def test_a_skip_alone_is_two_not_one(self):
        """The whole point: a missing dependency is not a red suite."""
        rc, text = self._run({"sideways": 0, "contrast": 2})
        self.assertEqual(rc, 2)
        self.assertNotIn("checks failed", text)
        self.assertIn("did NOT run", text)
        self.assertIn("contrast", text)

    def test_a_skip_is_never_reported_as_all_passed(self):
        """A gate that skips quietly stops being a gate."""
        _, text = self._run({"sideways": 0, "contrast": 2})
        self.assertNotIn("all 2 browser checks passed", text)
        self.assertIn("the 1 check(s) that ran passed", text)

    def test_a_real_failure_is_one(self):
        rc, text = self._run({"sideways": 1, "presets": 0})
        self.assertEqual(rc, 1)
        self.assertIn("1 of 2 checks failed: sideways", text)

    def test_a_failure_outranks_a_skip(self):
        """A defect must not be downgraded to "could not verify" by a skip."""
        rc, text = self._run({"sideways": 1, "contrast": 2, "presets": 0})
        self.assertEqual(rc, 1)
        self.assertIn("checks failed: sideways", text)
        # ...and the skip is still reported rather than swallowed.
        self.assertIn("did NOT run", text)

    def test_a_browser_that_will_not_start_is_a_skip_and_runs_nothing(self):
        """The nightly of 2026-10-21 to 10-29: Chromium was never installed,
        every check died on "Executable doesn't exist", and the run said
        "8 of 8 checks failed". That is a missing browser, not eight defects."""
        dist = tempfile.mkdtemp(prefix="bc-nobrowser-")
        try:
            with open(os.path.join(dist, "index.html"), "w", encoding="utf-8") as fh:
                fh.write("<html></html>")
            ran = []
            err, out = io.StringIO(), io.StringIO()
            with mock.patch.object(bc, "run_check", lambda *a: ran.append(a) or (1, "")), \
                 mock.patch.object(bc, "playwright_available", lambda env: True), \
                 mock.patch.object(bc, "chrome_launches", lambda env, path: False), \
                 mock.patch.object(bc, "discover_axe", lambda env: None), \
                 contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
                rc = bc.main(["--dist", dist, "--checks", "sideways,presets"])
        finally:
            shutil.rmtree(dist, ignore_errors=True)
        text = err.getvalue() + out.getvalue()
        self.assertEqual(rc, 2)
        self.assertEqual(ran, [])
        self.assertIn("would not start", text)
        self.assertNotIn("checks failed", text)

    def test_the_summary_marks_each_class_distinctly(self):
        _, text = self._run({"sideways": 1, "contrast": 2, "presets": 0})
        self.assertIn("FAIL  sideways", text)
        self.assertIn("skip  contrast", text)
        self.assertIn("ok    presets", text)


class DiscoverModules(unittest.TestCase):
    """Finding Playwright and axe-core where npm actually put them.

    `contrast.mjs` resolves `axe-core/axe.min.js` relative to itself, so it
    sees a copy installed into this repo and nothing else -- and this repo has
    no `package.json` and should not grow one for a check that is not in CI.
    A global or scratch install is therefore invisible to it, and the WCAG
    check skips on a machine that has axe-core sitting right there.
    """

    def _module(self, root, relpath):
        path = os.path.join(root, relpath)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("// stub\n")
        return path

    def setUp(self):
        self.root = tempfile.mkdtemp(prefix="bc-modules-")
        # npm is not consulted in these tests: the global root is a real
        # subprocess and its answer varies per machine.
        patcher = mock.patch.object(bc, "npm_global_root", lambda env: None)
        patcher.start()
        self.addCleanup(patcher.stop)

        # `module_search_roots` always appends the repo's own `node_modules`
        # and `platform/pages/node_modules`, which is correct behaviour and
        # exactly what a session gets after `npm install axe-core` in the repo
        # root -- the install the WCAG check needs in order to run at all.
        # Left unpatched, the two "nothing was found" cases below assert on
        # whether *this machine* happens to have that install, so following
        # `browser_checks.py`'s own advice turns this suite red with a failure
        # that reads like a code break. Point both at empty scratch
        # directories so these tests measure the search, not the developer.
        # `test_the_repo_itself_is_searched` reads the same attributes, so it
        # keeps testing the real contract against the patched values.
        for attr in ("REPO_ROOT", "PAGES"):
            empty = tempfile.mkdtemp(prefix=f"bc-{attr.lower()}-")
            self.addCleanup(shutil.rmtree, empty, ignore_errors=True)
            p = mock.patch.object(bc, attr, empty)
            p.start()
            self.addCleanup(p.stop)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_an_explicit_axe_choice_is_never_overridden(self):
        self._module(self.root, os.path.join("axe-core", "axe.min.js"))
        env = {"NODE_PATH": self.root, "AXE": "/somewhere/else"}
        self.assertIsNone(bc.discover_axe(env))

    def test_an_explicit_playwright_choice_is_never_overridden(self):
        self._module(self.root, os.path.join("playwright", "index.js"))
        env = {"NODE_PATH": self.root, "PLAYWRIGHT": "/somewhere/else"}
        self.assertIsNone(bc.discover_playwright(env))

    def test_axe_on_node_path_is_found(self):
        want = self._module(self.root, os.path.join("axe-core", "axe.min.js"))
        self.assertEqual(bc.discover_axe({"NODE_PATH": self.root}), want)

    def test_playwright_on_node_path_is_found(self):
        want = self._module(self.root, os.path.join("playwright", "index.js"))
        self.assertEqual(bc.discover_playwright({"NODE_PATH": self.root}), want)

    def test_nothing_found_changes_nothing(self):
        # None means "leave the environment alone", so the check's own message
        # gets to report the miss instead of a wrong guess pre-empting it.
        self.assertIsNone(bc.discover_axe({"NODE_PATH": self.root}))
        self.assertIsNone(bc.discover_playwright({"NODE_PATH": self.root}))
        self.assertIsNone(bc.discover_axe({}))

    def test_the_nearest_root_wins(self):
        """NODE_PATH order is the caller's stated preference; keep it."""
        second = tempfile.mkdtemp(prefix="bc-modules2-")
        try:
            want = self._module(self.root, os.path.join("axe-core", "axe.min.js"))
            self._module(second, os.path.join("axe-core", "axe.min.js"))
            env = {"NODE_PATH": os.pathsep.join([self.root, second])}
            self.assertEqual(bc.discover_axe(env), want)
        finally:
            shutil.rmtree(second, ignore_errors=True)

    def test_a_directory_in_the_modules_place_is_not_offered(self):
        # `axe.min.js` as a directory resolves nowhere; only a readable file
        # is a usable answer.
        os.makedirs(os.path.join(self.root, "axe-core", "axe.min.js"))
        self.assertIsNone(bc.discover_axe({"NODE_PATH": self.root}))

    def test_the_repo_itself_is_searched(self):
        """A `npm install` run in the repo root is the other common shape."""
        roots = bc.module_search_roots({})
        self.assertIn(os.path.join(bc.REPO_ROOT, "node_modules"), roots)
        self.assertIn(os.path.join(bc.PAGES, "node_modules"), roots)


if __name__ == "__main__":
    unittest.main()


class OnlyFilter(unittest.TestCase):
    """`--only`, and the two guarantees that keep it from hiding a non-run.

    A filter is a way to verify less. The failure this class exists to make
    impossible is the one the repo has already paid for in three other
    shapes: a check that reports a clean run it did not perform.
    """

    def _run(self, argv, slugs=("ebay-fee-calculator", "shopify-fee-calculator")):
        """Drive main() over a served tree containing `slugs`, faking the checks.

        `captured` collects the env each check was handed, which is the only
        way to assert that the filter actually reached them -- the harness runs
        every check as `node <path>` with no arguments, so ONLY_SLUGS is the
        whole mechanism.
        """
        dist = tempfile.mkdtemp(prefix="bc-only-")
        captured = {}
        try:
            with open(os.path.join(dist, "index.html"), "w", encoding="utf-8") as fh:
                fh.write("<html></html>")
            for slug in slugs:
                os.mkdir(os.path.join(dist, slug))
                with open(os.path.join(dist, slug, "index.html"), "w", encoding="utf-8") as fh:
                    fh.write("<html></html>")

            def fake_run_check(name, base, env, timeout):
                captured[name] = env.get("ONLY_SLUGS")
                return 0, ""

            err, out = io.StringIO(), io.StringIO()
            with mock.patch.object(bc, "run_check", fake_run_check), \
                 mock.patch.object(bc, "playwright_available", lambda env: True), \
                 mock.patch.object(bc, "chrome_launches", lambda env, path: True), \
                 mock.patch.object(bc, "discover_axe", lambda env: None), \
                 contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
                rc = bc.main(["--dist", dist] + argv)
            return rc, err.getvalue() + out.getvalue(), captured
        finally:
            shutil.rmtree(dist, ignore_errors=True)

    def test_the_filter_reaches_the_checks_as_ONLY_SLUGS(self):
        _, _, captured = self._run(["--checks", "sideways", "--only", "ebay-fee-calculator"])
        self.assertEqual(captured["sideways"], "ebay-fee-calculator")

    def test_no_filter_leaves_the_variable_unset(self):
        """Not the empty string: only-slugs.mjs reads a blank as "no filter",
        but leaving it out entirely is what keeps that from being load-bearing."""
        _, _, captured = self._run(["--checks", "sideways"])
        self.assertIsNone(captured["sideways"])

    def test_a_slug_not_in_the_build_stops_the_run_with_two(self):
        """A typo must name itself, not silently reduce the run to nothing.

        Exit 2, not 1: nothing was verified, and reporting it as a site defect
        sends the reader hunting for a bug in a calculator that is fine.
        """
        rc, text, captured = self._run(
            ["--checks", "sideways", "--only", "ebay-fee-calcualtor"])
        self.assertEqual(rc, 2)
        self.assertIn("ebay-fee-calcualtor", text)
        # And nothing ran at all -- the refusal is before any browser starts.
        self.assertEqual(captured, {})

    def test_one_bad_slug_among_good_ones_still_stops_the_run(self):
        """The dangerous case: the run would otherwise look scoped and pass."""
        rc, _, captured = self._run(
            ["--checks", "sideways", "--only", "ebay-fee-calculator,nope"])
        self.assertEqual(rc, 2)
        self.assertEqual(captured, {})

    def test_a_filtered_pass_is_never_reported_as_a_full_one(self):
        rc, text, _ = self._run(["--checks", "sideways", "--only", "ebay-fee-calculator"])
        self.assertEqual(rc, 0)
        self.assertIn("FILTERED: ebay-fee-calculator", text)

    def test_an_unfiltered_pass_carries_no_filtered_stamp(self):
        _, text, _ = self._run(["--checks", "sideways"])
        self.assertIn("all 1 browser checks passed", text)
        self.assertNotIn("FILTERED", text)

    def test_a_filtered_skip_is_also_stamped(self):
        """The exit-2 summary line needs the stamp as much as the exit-0 one."""
        dist = tempfile.mkdtemp(prefix="bc-only-skip-")
        try:
            with open(os.path.join(dist, "index.html"), "w", encoding="utf-8") as fh:
                fh.write("<html></html>")
            os.mkdir(os.path.join(dist, "ebay-fee-calculator"))
            with open(os.path.join(dist, "ebay-fee-calculator", "index.html"),
                      "w", encoding="utf-8") as fh:
                fh.write("<html></html>")
            err, out = io.StringIO(), io.StringIO()
            with mock.patch.object(bc, "run_check", lambda n, b, e, t: (2, "")), \
                 mock.patch.object(bc, "playwright_available", lambda env: True), \
                 mock.patch.object(bc, "chrome_launches", lambda env, path: True), \
                 mock.patch.object(bc, "discover_axe", lambda env: None), \
                 contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
                rc = bc.main(["--dist", dist, "--checks", "sideways",
                              "--only", "ebay-fee-calculator"])
            text = err.getvalue() + out.getvalue()
            self.assertEqual(rc, 2)
            self.assertIn("FILTERED: ebay-fee-calculator", text)
        finally:
            shutil.rmtree(dist, ignore_errors=True)

    def test_journey_alone_under_a_filter_says_it_is_not_scoped(self):
        """`journey` ignores the filter, so this combination must not look scoped."""
        _, text, _ = self._run(["--checks", "journey", "--only", "ebay-fee-calculator"])
        self.assertIn("ignores --only", text)
