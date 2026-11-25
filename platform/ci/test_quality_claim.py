"""Tests for quality_claim.py: a create-only subject claim against a real local remote, and queue's use of it."""
import argparse
import contextlib
import io
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import quality_claim as qc  # noqa: E402
import quality_metrics as m  # noqa: E402


def run(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True)


class ClaimRaceTest(unittest.TestCase):
    """Two clones of one remote, as two parallel fix sessions: the second claim of a subject loses."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        t = Path(self.tmp.name)
        bare, self.a, self.b = t / "origin.git", t / "a", t / "b"
        run(t, "init", "-q", "--bare", "-b", "main", str(bare))
        run(t, "clone", "-q", str(bare), str(self.a))
        (self.a / "README.md").write_text("x\n")
        run(self.a, "add", "-A")
        run(self.a, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", "base")
        run(self.a, "push", "-q", "origin", "HEAD:refs/heads/main")
        run(t, "clone", "-q", str(bare), str(self.b))

    def tearDown(self):
        self.tmp.cleanup()

    def claim(self, repo, subject, **kw):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = qc.claim(subject, repo=str(repo), **kw)
        return code, buf.getvalue()

    def test_second_claim_loses_and_changes_no_path(self):
        code, out = self.claim(self.a, "research/energy-store-hx", note="defect 0")
        self.assertEqual(code, 0, out)
        code, out = self.claim(self.b, "research/energy-store-hx")
        self.assertEqual(code, 4, out)
        self.assertIn("TAKEN", out)
        self.assertEqual(self.claim(self.b, "research/swe-orgs")[0], 0)
        live = qc.live_claims(str(self.b))
        self.assertEqual(sorted(live), ["research-energy-store-hx", "research-swe-orgs"])
        self.assertIn("defect 0", live["research-energy-store-hx"][1])
        # The claim commit is a child of main with main's tree, so no path-filtered workflow sees a change.
        sha = run(self.a, "ls-remote", "origin", "refs/heads/claim/quality-fix/research-energy-store-hx").stdout.split()[0]
        run(self.a, "fetch", "-q", "origin", sha)
        self.assertEqual(run(self.a, "rev-parse", f"{sha}^{{tree}}").stdout, run(self.a, "rev-parse", "origin/main^{tree}").stdout)
        self.assertEqual(run(self.a, "rev-parse", f"{sha}^").stdout, run(self.a, "rev-parse", "origin/main").stdout)

    def test_stale_claim_is_free_and_retaken(self):
        self.claim(self.a, "platform/agents")
        later = time.time() + (qc.STALE_HOURS + 1) * 3600
        self.assertEqual(qc.live_claims(str(self.b), now=later), {})
        code, out = self.claim(self.b, "platform/agents", now=later)
        self.assertEqual(code, 0, out)
        self.assertIn("platform-agents--2", out)

    def test_release(self):
        self.claim(self.a, "platform/agents")
        self.assertEqual(self.claim(self.a, "platform/agents", release=True)[0], 0)
        self.assertEqual(self.claim(self.b, "platform/agents")[0], 0)

    def test_unreadable_origin_is_none(self):
        self.assertIsNone(qc.live_claims(self.tmp.name + "/nowhere"))


class QueueMarksClaimsTest(unittest.TestCase):
    def test_claimed_row_goes_last_and_is_marked(self):
        # ventures, not research: the queue skips paused research since P080 (#19010)
        def audit(subject, f):
            return {"subject": subject, "date": "2026-11-20", "_file": f,
                    "defects": [{"severity": "high", "what": f"bug in {subject}", "where": "x"}]}
        audits = [audit("ventures/aaa", "2026-11-20-aaa.json"), audit("ventures/bbb", "2026-11-20-bbb.json")]
        args = argparse.Namespace(cmd="queue", severity="high", seed=None, limit=10, no_git=True,
                                  no_prs=False, no_fetch=True)
        buf = io.StringIO()
        with mock.patch.object(m, "open_pr_titles", lambda: []), \
                mock.patch.object(qc, "live_claims", lambda: {"ventures-aaa": (int(time.time()) - 120, "claim x")}), \
                contextlib.redirect_stdout(buf):
            m.main_metrics(args, audits, {}, None, None)
        out = buf.getvalue()
        self.assertLess(out.index("ventures/bbb"), out.index("[high] ventures/aaa"))
        self.assertIn("claimed 2 min ago by another session", out)
        self.assertIn("quality_audit.py claim <subject>", out)


if __name__ == "__main__":
    unittest.main()
