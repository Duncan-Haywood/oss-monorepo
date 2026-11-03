import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_site_fresh as m  # noqa: E402

NOW = datetime(2026, 11, 3, 21, 0, tzinfo=timezone.utc)


class Verdict(unittest.TestCase):
    def test_recent_build_is_fresh(self):
        code, msg = m.verdict({"sha": "abc", "built_at": "2026-11-03T19:00:00Z"}, NOW)
        self.assertEqual(code, 0)
        self.assertIn("2.0 h", msg)

    def test_old_build_is_stale_and_names_the_runbook(self):
        code, msg = m.verdict({"sha": "abc", "built_at": "2026-11-03T12:00:00Z"}, NOW)
        self.assertEqual(code, 1)
        self.assertIn("STALE", msg)
        self.assertIn("When the site stops updating", msg)

    def test_threshold_is_configurable(self):
        code, _ = m.verdict({"built_at": "2026-11-03T19:00:00Z"}, NOW, max_hours=1)
        self.assertEqual(code, 1)

    def test_unreadable_build_time_fails(self):
        self.assertEqual(m.verdict({"sha": "abc"}, NOW)[0], 1)
        self.assertEqual(m.verdict({"built_at": "yesterday"}, NOW)[0], 1)

    def test_unreachable_site_is_unknown_not_a_failure(self):
        original = m.fetch_version
        m.fetch_version = lambda url: (None, "site unreachable from here (test)")
        try:
            self.assertEqual(m.main(["--url", "https://example.invalid/"]), 0)
        finally:
            m.fetch_version = original


if __name__ == "__main__":
    unittest.main()
