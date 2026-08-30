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
import tempfile
import unittest

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


class Registry(unittest.TestCase):
    def test_every_named_check_exists_on_disk(self):
        """A typo here would silently verify one fewer thing than the report claims."""
        for name in bc.CHECKS:
            self.assertTrue(
                os.path.isfile(os.path.join(bc.PAGES, f"{name}.mjs")),
                f"platform/pages/{name}.mjs is missing",
            )

    def test_the_six_documented_checks_are_all_registered(self):
        self.assertEqual(
            set(bc.CHECKS),
            {"journey", "sweep", "contrast", "roundtrip", "presets", "sideways"},
        )

    def test_free_port_is_actually_free(self):
        port = bc.free_port()
        httpd = bc.serve(tempfile.mkdtemp(prefix="bc-port-"), port)
        try:
            self.assertTrue(1024 <= port <= 65535)
        finally:
            httpd.shutdown()
            httpd.server_close()


if __name__ == "__main__":
    unittest.main()
