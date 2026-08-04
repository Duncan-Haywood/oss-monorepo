#!/usr/bin/env python3
"""
Unit and contract tests for the tracked-symlink check.

Most of these assert the failing direction, because the value of this control
is entirely in what it refuses. The defect it exists for — a `node_modules`
symlink committed as an absolute path under `/Users/duncan/` — was invisible to
every other control in the repository, so a version of this check that reported
PASS on it would be indistinguishable from no check at all.

The measurement half builds real temporary git repositories and commits real
symlinks into them. Asserting over hand-built `Finding` objects would prove the
formatter correct about findings nobody checked came from git, which is the
shape of defect this repository keeps finding in its own controls. It also
matters that targets are read from the *index*: a link deleted from the working
tree but still staged is still going to be committed, and one test pins exactly
that.

The macOS case is not incidental. `Path.resolve()` rewrites `/tmp` to
`/private/tmp`, so a resolve-based implementation reports every link inside a
temporary repository as escaping — the check would fail closed on correct
repositories and get switched off. `test_relative_link_inside_a_symlinked_root`
holds the normpath behaviour that avoids it.

No test here is skipped or conditionally skipped, and none should be.
`scripts/ci/audit_exceptions.py` treats the unittest skip decorator as a
suppression needing a registered owner and expiry, and it is right to.
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))

import io
import json
import os
import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout

import tracked_symlinks


def git(repo: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", *args], cwd=str(repo), capture_output=True, text=True, check=True
    )
    return proc.stdout


def make_repo(tmp: str) -> Path:
    repo = Path(tmp) / "repo"
    (repo / "pkg").mkdir(parents=True)
    git(Path(tmp), "init", "-q", "repo")
    git(repo, "config", "user.email", "test@example.invalid")
    git(repo, "config", "user.name", "Test")
    (repo / "README.md").write_text("readme\n")
    git(repo, "add", "README.md")
    git(repo, "commit", "-qm", "init")
    return repo


def add_symlink(repo: Path, path: str, target: str) -> None:
    link = repo / path
    link.parent.mkdir(parents=True, exist_ok=True)
    os.symlink(target, link)
    git(repo, "add", "--", path)


class FindEscapingSymlinksTest(unittest.TestCase):
    def test_absolute_target_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(tmp)
            add_symlink(repo, "pkg/node_modules", "/Users/someone/elsewhere/node_modules")

            findings = tracked_symlinks.find_escaping_symlinks(repo)

            self.assertEqual(1, len(findings), findings)
            self.assertEqual("absolute", findings[0].kind)
            self.assertEqual("pkg/node_modules", findings[0].path)
            self.assertIn("/Users/someone/elsewhere/node_modules", findings[0].message)

    def test_relative_target_climbing_out_of_the_repo_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(tmp)
            add_symlink(repo, "pkg/vendor", "../../../outside/vendor")

            findings = tracked_symlinks.find_escaping_symlinks(repo)

            self.assertEqual(1, len(findings), findings)
            self.assertEqual("escaping", findings[0].kind)
            self.assertIn("resolves outside the repository", findings[0].message)

    def test_relative_target_inside_the_repo_is_allowed(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(tmp)
            (repo / "shared").mkdir()
            (repo / "shared" / "config.json").write_text("{}\n")
            git(repo, "add", "shared/config.json")
            add_symlink(repo, "pkg/config.json", "../shared/config.json")

            self.assertEqual([], tracked_symlinks.find_escaping_symlinks(repo))

    def test_a_link_that_climbs_out_and_back_in_is_allowed(self):
        """`../pkg/x` from inside pkg/ never leaves; only the net path matters."""
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(tmp)
            (repo / "pkg" / "real.txt").write_text("x\n")
            git(repo, "add", "pkg/real.txt")
            add_symlink(repo, "pkg/nested/link.txt", "../../pkg/real.txt")

            self.assertEqual([], tracked_symlinks.find_escaping_symlinks(repo))

    def test_relative_link_inside_a_symlinked_root(self):
        """A repo reached through a symlinked parent must not report escapes.

        `Path.resolve()` turns /tmp into /private/tmp on macOS, so an
        implementation that resolves both sides compares two different roots
        and calls every link an escape.
        """
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(tmp)
            (repo / "shared").mkdir()
            (repo / "shared" / "config.json").write_text("{}\n")
            git(repo, "add", "shared/config.json")
            add_symlink(repo, "pkg/config.json", "../shared/config.json")

            aliased = Path(tmp) / "alias"
            os.symlink(repo, aliased)

            self.assertEqual([], tracked_symlinks.find_escaping_symlinks(aliased))

    def test_a_repository_with_no_symlinks_is_clean(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(tmp)
            self.assertEqual([], tracked_symlinks.find_escaping_symlinks(repo))

    def test_target_is_read_from_the_index_not_the_working_tree(self):
        """Deleting the file on disk does not un-stage the link."""
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(tmp)
            add_symlink(repo, "pkg/node_modules", "/Users/someone/node_modules")
            os.unlink(repo / "pkg" / "node_modules")

            findings = tracked_symlinks.find_escaping_symlinks(repo)

            self.assertEqual(1, len(findings), findings)
            self.assertEqual("absolute", findings[0].kind)

    def test_several_links_are_all_reported(self):
        """The batch cat-file read must not lose or misalign entries."""
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(tmp)
            add_symlink(repo, "a", "/abs/one")
            add_symlink(repo, "pkg/b", "../../outside")
            (repo / "shared").mkdir()
            (repo / "shared" / "ok.txt").write_text("ok\n")
            git(repo, "add", "shared/ok.txt")
            add_symlink(repo, "pkg/c", "../shared/ok.txt")
            add_symlink(repo, "d", "/abs/two")

            findings = tracked_symlinks.find_escaping_symlinks(repo)

            self.assertEqual(
                {("a", "/abs/one"), ("pkg/b", "../../outside"), ("d", "/abs/two")},
                {(f.path, f.target) for f in findings},
            )

    def test_a_scan_that_cannot_run_raises_rather_than_reporting_clean(self):
        with tempfile.TemporaryDirectory() as tmp:
            not_a_repo = Path(tmp) / "empty"
            not_a_repo.mkdir()
            with self.assertRaises(tracked_symlinks.SymlinkScanError):
                tracked_symlinks.find_escaping_symlinks(not_a_repo)


class CommandLineTest(unittest.TestCase):
    def test_cli_exits_nonzero_on_an_offending_repository(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(tmp)
            add_symlink(repo, "pkg/node_modules", "/Users/someone/node_modules")

            buffer = io.StringIO()
            with redirect_stdout(buffer):
                code = tracked_symlinks.main(["--repo-root", str(repo)])

            self.assertEqual(1, code)
            self.assertIn("FAIL", buffer.getvalue())
            self.assertNotIn("PASS", buffer.getvalue())

    def test_cli_exits_zero_on_a_clean_repository(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(tmp)

            buffer = io.StringIO()
            with redirect_stdout(buffer):
                code = tracked_symlinks.main(["--repo-root", str(repo)])

            self.assertEqual(0, code)
            self.assertIn("PASS", buffer.getvalue())

    def test_json_output_is_machine_readable(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(tmp)
            add_symlink(repo, "pkg/node_modules", "/Users/someone/node_modules")

            buffer = io.StringIO()
            with redirect_stdout(buffer):
                code = tracked_symlinks.main(["--repo-root", str(repo), "--json"])

            payload = json.loads(buffer.getvalue())
            self.assertEqual(1, code)
            self.assertFalse(payload["ok"])
            self.assertEqual("fail", payload["status"])
            self.assertEqual("pkg/node_modules", payload["findings"][0]["path"])

    def test_an_unmeasurable_scan_is_not_reported_as_a_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            not_a_repo = Path(tmp) / "empty"
            not_a_repo.mkdir()

            buffer = io.StringIO()
            with redirect_stdout(buffer):
                code = tracked_symlinks.main(["--repo-root", str(not_a_repo), "--json"])

            payload = json.loads(buffer.getvalue())
            self.assertEqual(1, code)
            self.assertFalse(payload["ok"])
            self.assertEqual("not-measurable", payload["status"])

    def test_report_mode_never_fails_the_build(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(tmp)
            add_symlink(repo, "pkg/node_modules", "/Users/someone/node_modules")

            buffer = io.StringIO()
            with redirect_stdout(buffer):
                code = tracked_symlinks.main(["--repo-root", str(repo), "--report"])

            self.assertEqual(0, code)
            self.assertIn("FAIL", buffer.getvalue())


class RepositoryContractTest(unittest.TestCase):
    """The check as it applies to this repository, which must stay clean."""

    def test_this_repository_has_no_escaping_tracked_symlinks(self):
        findings = tracked_symlinks.find_escaping_symlinks(REPO_ROOT)
        self.assertEqual(
            [],
            findings,
            "\n" + tracked_symlinks.format_report(findings),
        )

    def test_gitignore_would_catch_a_node_modules_symlink(self):
        """The ignore rule that let the original defect through.

        `node_modules/` matches directories only. This asserts the pattern
        still matches a *file* of that name, which is what a symlink is.
        """
        probe = "ventures/print-atelier/node_modules"
        proc = subprocess.run(
            ["git", "check-ignore", "-q", "--no-index", "--", probe],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
        )
        self.assertEqual(
            0,
            proc.returncode,
            f"{probe} is not ignored; a symlink by that name could be committed again",
        )


if __name__ == "__main__":
    unittest.main()
