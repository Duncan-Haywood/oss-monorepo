"""Tests for mirror.py against throwaway upstream and local git repositories."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import mirror

ENV = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
       "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}


def sh(cwd: Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=cwd, env=ENV, check=True,
                          capture_output=True, text=True).stdout.strip()


def write(root: Path, files: dict[str, str]) -> None:
    for rel, text in files.items():
        path = root / rel
        if text is None:
            path.unlink()
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)


def commit(root: Path, files: dict[str, str], msg: str = "c") -> str:
    write(root, files)
    sh(root, "add", "-A")
    sh(root, "commit", "-q", "-m", msg)
    return sh(root, "rev-parse", "HEAD")


RUN = {"date": "2026-10-13", "session": "https://claude.ai/code/session_abc", "prompt_version": 0,
       "outcome": "success", "merged": None, "errors": [], "integrity_issues": []}

UPSTREAM_FILES = {
    "README.md": "# old repo\nintro\n\n- [`research/alpha`](research/alpha) — first.\n",
    "CLAUDE.md": "old rules\n",
    "prompt.md": "old brief\n",
    "LICENSE": "MIT\n",
    ".gitignore": "_site/\n",
    "PROJECTS.md": "tracks\n",
    "site/build.py": "build\n",
    "site/template.html": "<html>\n",
    "site/projects.json": "{}\n",
    ".github/workflows/pages.yml": "on: push\n",
    "prompts/runs.jsonl": json.dumps(RUN) + "\n",
    "research/alpha/README.md": "alpha\n",
    "research/alpha/test_alpha.py": "def test_a(): pass\n",
}


class MirrorTest(unittest.TestCase):
    def setUp(self) -> None:
        # mirror.py calls git itself (the merge needs a committer), and CI
        # runners have no identity configured.
        env = mock.patch.dict(os.environ, {k: v for k, v in ENV.items() if k.startswith("GIT_")})
        env.start()
        self.addCleanup(env.stop)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        base = Path(tmp.name)
        self.up, self.here = base / "upstream", base / "here"
        for repo in (self.up, self.here):
            repo.mkdir()
            sh(repo, "init", "-q", "-b", "main")
        self.first = commit(self.up, UPSTREAM_FILES)
        # This repository: something of its own, plus the adapted files.
        commit(self.here, {
            "README.md": "# monorepo\n",
            "research/README.md": "# Research\nheader here\n\n",
            "research/CLAUDE.md": "adapted rules\n",
            "prompts/research/prompt-0.md": "adapted brief\n",
            "research/_homepage/build.py": "adapted build\n",
            "research/_homepage/template.html": "<html adapted>\n",
            ".github/workflows/research-ci.yml": "on: pull_request\n",
            "research/_mirror/state.json": json.dumps({"upstream_commit": None, "adapted": {}}),
        })
        self.ref = mirror.UPSTREAM_REF
        self.fetch()

    def fetch(self) -> None:
        sh(self.here, "fetch", "-q", str(self.up), f"main:{self.ref}")

    def sync(self) -> list[str]:
        todo = mirror.sync(self.here, fetch=False)
        sh(self.here, "commit", "-q", "-m", "sync")
        return todo

    def ack_all(self) -> None:
        for path in mirror.ADAPTED:
            mirror.ack(self.here, path)
        sh(self.here, "commit", "-q", "-am", "ack")

    def test_sync_brings_history_content_readme_and_runs(self):
        todo = self.sync()
        self.assertEqual(len(todo), len(mirror.ADAPTED))  # nothing was pinned yet
        self.ack_all()
        self.assertEqual(mirror.check(self.here), [])
        # History: the upstream commit is an ancestor.
        self.assertTrue(mirror.is_ancestor(self.here, self.first, "HEAD"))
        # Content.
        self.assertEqual((self.here / "research/alpha/README.md").read_text(), "alpha\n")
        self.assertEqual((self.here / "research/_homepage/projects.json").read_text(), "{}\n")
        self.assertEqual((self.here / "research/LICENSE").read_text(), "MIT\n")
        readme = (self.here / "research/README.md").read_text()
        self.assertEqual(readme, "# Research\nheader here\n\n- [`research/alpha`](alpha) — first.\n")
        run = json.loads((self.here / "prompts/runs/2026-10-13-session_abc.json").read_text())
        self.assertEqual((run["track"], run["source"]), ("research", mirror.RUNS_SOURCE))
        # Adapted files are left alone.
        self.assertEqual((self.here / "research/CLAUDE.md").read_text(), "adapted rules\n")

    def test_second_sync_adds_removes_and_flags_adapted_changes(self):
        self.sync()
        self.ack_all()
        commit(self.up, {
            "research/beta/README.md": "beta\n",
            "research/alpha/test_alpha.py": None,
            "README.md": UPSTREAM_FILES["README.md"] + "- [`research/beta`](research/beta) — second.\n",
            "CLAUDE.md": "new rules\n",
        })
        self.fetch()
        self.assertTrue(any(p.startswith("behind:") for p in mirror.check(self.here)))
        todo = self.sync()
        self.assertEqual([t.split(" ->")[0] for t in todo], ["CLAUDE.md"])
        self.assertTrue((self.here / "research/beta/README.md").exists())
        self.assertFalse((self.here / "research/alpha/test_alpha.py").exists())
        self.assertIn("(beta)", (self.here / "research/README.md").read_text())
        problems = mirror.check(self.here)
        self.assertEqual(len(problems), 1)
        self.assertIn("adapted: upstream CLAUDE.md changed", problems[0])
        mirror.ack(self.here, "CLAUDE.md")
        self.assertEqual(mirror.check(self.here), [])

    def test_check_catches_local_drift(self):
        self.sync()
        self.ack_all()
        commit(self.here, {"research/alpha/README.md": "edited here\n",
                           "research/gamma/README.md": "only here\n"})
        problems = "\n".join(mirror.check(self.here))
        self.assertIn("differs: research/alpha/README.md", problems)
        self.assertIn("extra: research/gamma/README.md", problems)

    def test_local_only_files_are_allowed(self):
        self.sync()
        self.ack_all()
        commit(self.here, {"research/_mirror/notes.md": "ours\n"})
        self.assertEqual(mirror.check(self.here), [])

    def test_unmapped_upstream_file_is_named(self):
        commit(self.up, {".github/workflows/other.yml": "on: push\n"})
        self.fetch()
        todo = self.sync()
        self.assertTrue(any("unmapped upstream file .github/workflows/other.yml" in t for t in todo))
        self.assertTrue(any("unmapped" in p for p in mirror.check(self.here)))

    def test_run_records_may_be_corrected_but_not_silently_edited(self):
        self.sync()
        self.ack_all()
        path = self.here / "prompts/runs/2026-10-13-session_abc.json"
        rec = json.loads(path.read_text())
        rec["merged"] = True
        path.write_text(json.dumps(rec))
        sh(self.here, "commit", "-q", "-am", "edit")
        self.assertTrue(any("field 'merged'" in p for p in mirror.check(self.here)))
        rec["corrections"] = [{"date": "2026-10-14", "field": "merged", "from": None, "to": True,
                               "why": "PR merged"}]
        path.write_text(json.dumps(rec))
        sh(self.here, "commit", "-q", "-am", "correct")
        self.assertEqual(mirror.check(self.here), [])

    def test_sync_refuses_a_dirty_tree(self):
        (self.here / "stray.txt").write_text("x")
        with self.assertRaises(mirror.MirrorError):
            mirror.sync(self.here, fetch=False)


class UnitTest(unittest.TestCase):
    def test_mapping(self):
        self.assertEqual(mirror.local_path("research/x/a.py"), "research/x/a.py")
        self.assertEqual(mirror.local_path("site/projects.json"), "research/_homepage/projects.json")
        self.assertIsNone(mirror.local_path("site/build.py"))
        self.assertIsNone(mirror.local_path("README.md"))
        self.assertFalse(mirror.is_mapped(".github/workflows/new.yml"))

    def test_run_names_are_unique_and_stable(self):
        text = "\n".join(json.dumps(RUN) for _ in range(3))
        self.assertEqual(sorted(mirror.convert_runs(text)), [
            "2026-10-13-session_abc-2.json", "2026-10-13-session_abc-3.json",
            "2026-10-13-session_abc.json"])

    def test_trailer_style_prompt_version_becomes_integer(self):
        rec = dict(RUN, prompt_version="research/1")
        out = next(iter(mirror.convert_runs(json.dumps(rec)).values()))
        self.assertEqual(out["prompt_version"], 1)
        out = next(iter(mirror.convert_runs(json.dumps(RUN)).values()))
        self.assertEqual(out["prompt_version"], 0)


if __name__ == "__main__":
    unittest.main()
