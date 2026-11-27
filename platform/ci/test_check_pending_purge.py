"""Tests for check_pending_purge.py: a pending purge must check the confirmation link's expiry."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_pending_purge as cpp  # noqa: E402

BAD = '''export async function purgePending(env, now) {
  return env.DB.prepare(
    "DELETE FROM early_access_signups WHERE status = 'pending' AND created_at < ?",
  ).bind(now).run();
}'''
GOOD = '''const sql = `DELETE FROM early_access_signups WHERE status = 'pending' AND created_at < ?
   AND (confirm_token_expires_at IS NULL OR confirm_token_expires_at <= ?)`;'''
UNRELATED = '''db.prepare("DELETE FROM sessions WHERE id = ?");'''


class CheckPendingPurgeTest(unittest.TestCase):
    def run_on(self, text):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "early-access.mjs"
            p.write_text(text)
            return cpp.findings(p)

    def test_purge_by_age_alone_is_a_finding(self):
        self.assertEqual(len(self.run_on(BAD)), 1)

    def test_purge_that_checks_expiry_passes(self):
        self.assertEqual(self.run_on(GOOD), [])

    def test_other_deletes_are_ignored(self):
        self.assertEqual(self.run_on(UNRELATED), [])

    def test_repository_is_clean(self):
        self.assertEqual(cpp.main([]), 0)


if __name__ == "__main__":
    unittest.main()
