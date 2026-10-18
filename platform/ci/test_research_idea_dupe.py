"""Tests for research_idea_dupe.py."""
import contextlib
import io
import os
import subprocess
import tempfile
import unittest

import research_idea_dupe as r

FOUND = {
    "verifier-bribery": "bribing verifiers in refereed verification: closed-form bribe floor",
    "sybil-stake": "identity splitting vs merging under stake-weighted pools",
    "bare-dir": "",
}


class T(unittest.TestCase):
    def test_all_keywords_rank_first(self):
        rows = r.search(["bribe", "verifier"], FOUND)
        self.assertEqual(rows[0][:2], (2, "verifier-bribery"))

    def test_slug_matches_and_case(self):
        self.assertEqual([x[1] for x in r.search(["SYBIL"], FOUND)], ["sybil-stake"])

    def test_no_hit(self):
        self.assertEqual(r.search(["quantum"], FOUND), [])

    def test_bullet_regex(self):
        m = r.BULLET.match("- [`research/foo-bar`](foo-bar) — does a thing — and more.")
        self.assertEqual(m.groups(), ("foo-bar", "does a thing — and more."))

    def test_real_main_has_projects(self):
        found = r.projects("HEAD")
        if found:
            self.assertGreater(len(found), 100)


class Repo(unittest.TestCase):
    """projects() and main() against a throwaway git repo, so no network or origin/main is needed."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.old = os.getcwd()
        os.chdir(cls.tmp.name)

        def g(*a):
            subprocess.run(["git", *a], check=True, capture_output=True)

        g("init", "-q")
        os.makedirs("research/alpha-one")
        os.makedirs("research/bare-dir")
        open("research/alpha-one/x", "w").close()
        open("research/bare-dir/x", "w").close()
        with open("research/README.md", "w") as f:
            f.write("- [`research/alpha-one`](alpha-one) \u2014 bribing verifiers floor\n")
        g("add", "-A")
        g("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "x")

    @classmethod
    def tearDownClass(cls):
        os.chdir(cls.old)
        cls.tmp.cleanup()

    def run_main(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                code = r.main(list(argv))
            except SystemExit as e:
                code = e.code
        return code, out.getvalue(), err.getvalue()

    def test_projects_maps_slug_to_description(self):
        found = r.projects("HEAD")
        self.assertEqual(found["alpha-one"], "bribing verifiers floor")
        self.assertEqual(found["bare-dir"], "")

    def test_git_failure_returns_empty(self):
        self.assertEqual(r.git("show", "no-such-ref:research/README.md"), "")
        self.assertEqual(r.projects("no-such-ref"), {})

    def test_exit_1_when_a_project_hits_every_keyword(self):
        code, out, _ = self.run_main("bribing", "verifiers", "--ref", "HEAD")
        self.assertEqual(code, 1)
        self.assertIn("TAKEN?", out)

    def test_exit_0_on_partial_hit(self):
        code, out, _ = self.run_main("bribing", "quantum", "--ref", "HEAD")
        self.assertEqual(code, 0)
        self.assertIn("1/2  research/alpha-one", out)
        self.assertNotIn("TAKEN?", out)

    def test_exit_2_when_ref_unreadable(self):
        code, _, err = self.run_main("x", "--ref", "no-such-ref")
        self.assertEqual(code, 2)
        self.assertIn("git fetch", err)

    def test_help_uses_summary_line(self):
        _, out, _ = self.run_main("--help")
        self.assertIn("Is this research idea already a project", out)


if __name__ == "__main__":
    unittest.main()
