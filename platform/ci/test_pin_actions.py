#!/usr/bin/env python3
"""Tests for pin_actions.pin_text (no network: resolve is injected)."""
import io
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

import pin_actions
from pin_actions import pin_text

SHA = "a" * 40


def fake(repo, ref):
    return None if ref == "gone" else SHA


class PinText(unittest.TestCase):
    def test_pins_tag_and_keeps_comment_ref(self):
        out, n, bad = pin_text("      - uses: actions/checkout@v4\n", fake)
        self.assertEqual(out, f"      - uses: actions/checkout@{SHA} # v4\n")
        self.assertEqual((n, bad), (1, set()))

    def test_step_with_name_and_subpath(self):
        out, n, _ = pin_text("        uses: github/codeql-action/init@v3", fake)
        self.assertEqual(out, f"        uses: github/codeql-action/init@{SHA} # v3")
        self.assertEqual(n, 1)

    def test_replaces_existing_trailing_comment(self):
        out, _, _ = pin_text("uses: a/b@v1 # old note", fake)
        self.assertEqual(out, f"uses: a/b@{SHA} # v1")

    def test_leaves_sha_local_and_docker(self):
        text = f"uses: a/b@{'b' * 40} # v1\nuses: ./platform/uitest\nuses: docker://alpine:3\n"
        out, n, bad = pin_text(text, fake)
        self.assertEqual((out, n, bad), (text, 0, set()))

    def test_unresolved_is_reported_and_untouched(self):
        out, n, bad = pin_text("uses: a/b@gone", fake)
        self.assertEqual((out, n, bad), ("uses: a/b@gone", 0, {"a/b@gone"}))


class LsRemote(unittest.TestCase):
    def run_ls(self, out):
        cp = mock.Mock(stdout=out)
        with mock.patch.object(pin_actions.subprocess, "run", return_value=cp) as run:
            return pin_actions.ls_remote("a/b", "v1"), run

    def test_prefers_peeled_tag_and_passes_text_and_timeout(self):
        sha, run = self.run_ls(f"{'1' * 40}\trefs/tags/v1\n{'2' * 40}\trefs/tags/v1^{{}}\n")
        self.assertEqual(sha, "2" * 40)
        kw = run.call_args.kwargs
        self.assertTrue(kw["text"] and kw["capture_output"])
        self.assertEqual(kw["timeout"], 60)

    def test_falls_back_to_branch_then_none(self):
        self.assertEqual(self.run_ls(f"{'3' * 40}\trefs/heads/v1\n")[0], "3" * 40)
        self.assertIsNone(self.run_ls("")[0])


class Paths(unittest.TestCase):
    def test_default_workflows_dir_is_the_repos(self):
        self.assertEqual(pin_actions.ROOT, Path(__file__).resolve().parents[2])
        self.assertTrue((pin_actions.WORKFLOWS / "portfolio-pages.yml").is_file())


class Main(unittest.TestCase):
    def run_main(self, files, argv, resolve=lambda r, ref: None if ref == "gone" else SHA):
        with tempfile.TemporaryDirectory() as d:
            for name, text in files.items():
                (Path(d) / name).write_text(text)
            buf = io.StringIO()
            with mock.patch.object(pin_actions, "ls_remote", resolve), redirect_stdout(buf):
                rc = pin_actions.main(["--dir", d, *argv])
            return rc, buf.getvalue(), {n: (Path(d) / n).read_text() for n in files}

    def test_dry_run_does_not_write_and_counts_files(self):
        files = {"a.yml": "uses: a/b@v1\n", "b.yaml": "uses: a/b@v1\n", "c.yml": "run: x\n"}
        rc, out, after = self.run_main(files, [])
        self.assertEqual((rc, after), (0, files))
        self.assertIn("would pin 2 use(s) in 2 file(s); 0 unresolved", out)

    def test_write_rewrites_changed_files(self):
        rc, out, after = self.run_main({"a.yml": "uses: a/b@v1\n"}, ["--write"])
        self.assertEqual(after["a.yml"], f"uses: a/b@{SHA} # v1\n")
        self.assertIn("pinned 1 use(s) in 1 file(s)", out)

    def test_unresolved_exits_1(self):
        rc, out, _ = self.run_main({"a.yml": "uses: a/b@gone\n"}, [])
        self.assertEqual(rc, 1)
        self.assertIn("a/b@gone -> UNRESOLVED", out)

    def test_help_uses_summary_line(self):
        with redirect_stdout(io.StringIO()) as buf, self.assertRaises(SystemExit):
            pin_actions.main(["--help"])
        self.assertIn("Pin the repository's own", buf.getvalue())


if __name__ == "__main__":
    unittest.main()
