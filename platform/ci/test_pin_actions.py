#!/usr/bin/env python3
"""Tests for pin_actions.pin_text (no network: resolve is injected)."""
import unittest

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


if __name__ == "__main__":
    unittest.main()
