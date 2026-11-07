"""Tests for ideas.py: reading dictated ideas and moving one to Picked up."""

from __future__ import annotations

import unittest

import ideas

INBOX = """# Ideas inbox

intro

## New

<!-- Write below this line. -->

a tool for roofers that
prices the dumpster

- second idea, as a bullet

## Picked up

<!-- log -->
"""


class IdeasTest(unittest.TestCase):
    def test_pending_joins_lines_and_drops_markers(self):
        self.assertEqual(ideas.pending(INBOX),
                         ["a tool for roofers that prices the dumpster", "second idea, as a bullet"])

    def test_empty_inbox(self):
        self.assertEqual(ideas.pending(ideas.INBOX.read_text()), [])
        self.assertEqual(ideas.pending("## New\n<!-- x -->\n\n## Picked up\n"), [])

    def test_take_moves_idea_with_link(self):
        out, idea = ideas.take(INBOX, 1, "https://example.test/pr/1", "2026-10-30")
        self.assertEqual(idea, "a tool for roofers that prices the dumpster")
        self.assertEqual(ideas.pending(out), ["second idea, as a bullet"])
        self.assertIn("<!-- Write below this line. -->", out)
        self.assertTrue(out.endswith("- 2026-10-30: a tool for roofers that prices the dumpster "
                                     "(https://example.test/pr/1)\n"))
        out2, _ = ideas.take(out, 1, "u2", "2026-10-31")
        self.assertEqual(ideas.pending(out2), [])
        self.assertEqual(out2.count("- 2026-10-3"), 2)

    def test_inbox_is_at_the_repository_root(self):
        self.assertEqual(ideas.INBOX, ideas.ROOT / "IDEAS.md")
        self.assertTrue(ideas.INBOX.exists())

    def test_site_ideas_keeps_recent_ideas_only(self):
        records = [
            {"id": 1, "day": "2026-09-01", "type": "idea", "message": "old"},
            {"id": 2, "day": "2026-10-20", "type": "problem", "message": "a bug"},
            {"id": 3, "day": "2026-10-21", "type": "idea", "tool": "x", "message": "new"},
        ]
        self.assertEqual([r["id"] for r in ideas.site_ideas(records, "2026-10-01")], [3])

    def test_untriaged_skips_ideas_a_request_covers(self):
        site = [{"id": 3, "type": "idea"}, {"id": 4, "type": "idea"}]
        reqs = [{"id": "R-0004", "source": "form", "feedback_id": 3}]
        self.assertEqual([r["id"] for r in ideas.untriaged(site, reqs)], [4])

    def test_open_requests_orders_building_then_accepted_then_received(self):
        reqs = [
            {"id": "R-1", "source": "issue", "status": "received", "received": "2026-10-01"},
            {"id": "R-2", "source": "form", "status": "accepted", "received": "2026-10-05"},
            {"id": "R-3", "source": "issue", "status": "building", "received": "2026-10-09"},
            {"id": "R-4", "source": "owner", "status": "building", "received": "2026-09-01"},
            {"id": "R-5", "source": "issue", "status": "shipped", "received": "2026-09-01"},
            {"id": "R-6", "source": "issue", "status": "accepted", "received": "2026-10-02"},
        ]
        self.assertEqual([r["id"] for r in ideas.open_requests(reqs)], ["R-3", "R-6", "R-2", "R-1"])

    def test_requests_file_reads(self):
        self.assertIsInstance(ideas._requests(ideas.REQUESTS), list)
        self.assertEqual(ideas._requests(ideas.ROOT / "no-such-file.json"), [])

    def test_missing_site_feedback_file_is_empty(self):
        self.assertEqual(ideas._site_records(ideas.ROOT / "no-such-file.json"), [])

    def test_search_issues_none_without_gh(self):
        from unittest import mock
        with mock.patch.object(ideas.shutil, "which", return_value=None):
            self.assertIsNone(ideas.search_issues("x"))

    def test_search_issues_empty_and_failed(self):
        from unittest import mock
        ok = mock.Mock(returncode=0, stdout="")
        bad = mock.Mock(returncode=1, stdout="")
        with mock.patch.object(ideas.shutil, "which", return_value="/bin/gh"):
            with mock.patch.object(ideas.subprocess, "run", return_value=ok):
                self.assertEqual(ideas.search_issues("x"), [])
            with mock.patch.object(ideas.subprocess, "run", return_value=bad):
                self.assertIsNone(ideas.search_issues("x"))

    def test_take_out_of_range(self):
        with self.assertRaises(ValueError):
            ideas.take(INBOX, 3, "u", "2026-10-30")


if __name__ == "__main__":
    unittest.main()
