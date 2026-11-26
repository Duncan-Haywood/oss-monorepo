"""Tests for roadmap_claim.py: parsing, and create-only claims against a real local remote."""
import contextlib
import io
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import roadmap_claim as rc  # noqa: E402

ROADMAP = """# App: Roadmap

## Done
- Something shipped

## Next (suite, by promise)

- QuickBooks, part 5: an item per schedule-of-values line
- Backup packets, part 2: PDFs encrypted with an empty user password;
  HEIC and WebP photos
- Notarization block / state-specific forms; GC portal export formats

## Open questions
- not an item
"""

NUMBERED = """## Next

3. **launch** Deploy pipeline (`provision`, D1 migrations on deploy) and a
   `docs/DEPLOY.md`.
4. Billing, part 2: the 10-page cap per RFQ.
"""


def run(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True)


class ParseTest(unittest.TestCase):
    def test_next_items_bullets_joined(self):
        items = rc.next_items(ROADMAP)
        self.assertEqual([n for n, _ in items], [1, 2, 3])
        self.assertIn("HEIC and WebP photos", items[1][1])

    def test_numbered_keeps_roadmap_numbers(self):
        items = rc.next_items(NUMBERED)
        self.assertEqual([n for n, _ in items], [3, 4])
        self.assertEqual(rc.slugify(items[1][1]), "billing-part-2")
        self.assertTrue(rc.slugify(items[0][1]).startswith("launch-deploy-pipeline"))

    def test_default_repo_is_this_clone_except_grants(self):
        # The paid apps moved here on 2026-11-26; grants stays private (client NDA).
        root = str(Path(rc.__file__).resolve().parents[2])
        self.assertEqual(rc.default_repo("payapps"), root)
        self.assertTrue((Path(root) / "apps" / "payapps").is_dir())
        self.assertEqual(rc.default_repo("grants"), rc.PRIVATE_REPO)

    def test_slug_before_colon(self):
        self.assertEqual(rc.slugify("QuickBooks, part 5: an item per line"), "quickbooks-part-5")

    def test_parse_claims_newest_generation(self):
        ls = ("a\trefs/heads/claim/payapps/history-part-3\n"
              "b\trefs/heads/claim/payapps/history-part-3--2\n"
              "c\trefs/heads/claim/other/history-part-3\n")
        self.assertEqual(rc.parse_claims(ls, "payapps"), {"history-part-3": (2, "b")})


class ClaimRaceTest(unittest.TestCase):
    """Two clones of one remote: the second claim of an item loses; a stale one is retaken."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        t = Path(self.tmp.name)
        bare, self.a, self.b = t / "origin.git", t / "a", t / "b"
        run(t, "init", "-q", "--bare", "-b", "main", str(bare))
        run(t, "clone", "-q", str(bare), str(self.a))
        (self.a / "apps" / "payapps").mkdir(parents=True)
        (self.a / "apps" / "payapps" / "ROADMAP.md").write_text(ROADMAP)
        run(self.a, "add", "-A")
        run(self.a, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", "base")
        run(self.a, "push", "-q", "origin", "HEAD:refs/heads/main")
        run(t, "clone", "-q", str(bare), str(self.b))

    def tearDown(self):
        self.tmp.cleanup()

    def main(self, repo, *argv, now=None, run=None, app="payapps"):
        """Each clone stands for one session (run tag = its path) unless `run` says otherwise."""
        buf = io.StringIO()
        patch = mock.patch.object(rc.time, "time", lambda: now) if now else contextlib.nullcontext()
        env = mock.patch.dict(os.environ, {"ROADMAP_CLAIM_RUN": run or str(repo)})
        with patch, env, contextlib.redirect_stdout(buf):
            code = rc.main([app, "--repo", str(repo), *argv])
        return code, buf.getvalue()

    def test_second_claim_loses_and_list_shows_it(self):
        self.assertEqual(self.main(self.a, "--claim", "2")[0], 0)
        code, out = self.main(self.b, "--claim", "2")
        self.assertEqual(code, 4, out)
        self.assertIn("TAKEN", out)
        self.assertEqual(self.main(self.b, "--claim", "1")[0], 0)
        _, listing = self.main(self.b)
        self.assertIn("[CLAIMED", listing)
        self.assertIn("[free] notarization", listing)
        # The claim branch carries no files, so no path-filtered CI runs on it.
        tree = run(self.a, "ls-remote", "origin", "refs/heads/claim/payapps/backup-packets-part-2").stdout
        sha = tree.split()[0]
        run(self.a, "fetch", "-q", "origin", sha)
        self.assertEqual(run(self.a, "ls-tree", sha).stdout, "")

    def test_part_slug_and_stale_retake(self):
        code, out = self.main(self.a, "--claim", "2", "--slug", "Backup packets part 2 HEIC", "--note", "HEIC only")
        self.assertEqual(code, 0, out)
        _, listing = self.main(self.b)
        self.assertIn("backup-packets-part-2-heic", listing)
        self.assertIn("HEIC only", listing)
        code, out = self.main(self.b, "--claim", "2", "--slug", "Backup packets part 2 HEIC",
                              now=rc.time.time() + 7 * 3600)
        self.assertEqual(code, 0, out)
        self.assertIn("backup-packets-part-2-heic--2", out)

    def test_claim_names_fresh_sibling_parts_of_the_same_item(self):
        code, _ = self.main(self.a, "--claim", "2", "--slug", "packets heic", "--note", "HEIC to JPEG")
        self.assertEqual(code, 0)
        code, out = self.main(self.b, "--claim", "2", "--slug", "packets heic convert")
        self.assertEqual(code, 0, out)
        self.assertIn("ALSO CLAIMED on item 2", out)
        self.assertIn("packets-heic (", out)
        self.assertIn("HEIC to JPEG", out)
        # Another item's claim is not a sibling.
        code, out = self.main(self.b, "--claim", "1")
        self.assertEqual(code, 0, out)
        self.assertNotIn("ALSO CLAIMED", out)

    def merge(self, subject, ago=0):
        """A squash merge on origin/main whose subject is the PR title, `ago` seconds old."""
        when = f"@{int(rc.time.time()) - ago} +0000"
        env = {**os.environ, "GIT_COMMITTER_DATE": when, "GIT_AUTHOR_DATE": when}
        run(self.a, "fetch", "-q", "origin", "main")
        run(self.a, "checkout", "-q", "-B", "work", "FETCH_HEAD")
        (self.a / "f.txt").write_text(subject)
        run(self.a, "add", "-A")
        subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q",
                        "-m", subject], cwd=self.a, env=env, check=True, capture_output=True)
        run(self.a, "push", "-q", "origin", "HEAD:refs/heads/main")

    def test_merged_part_is_not_a_sibling_and_lists_as_merged(self):
        self.assertEqual(self.main(self.a, "--claim", "2", "--slug", "packets heic")[0], 0)
        self.assertEqual(self.main(self.a, "--claim", "2", "--slug", "packets heic convert")[0], 0)
        # The longer part merged; its title also contains the shorter slug, which stays open.
        self.merge("payapps: Packets HEIC convert, JPEG output (#12)")
        code, out = self.main(self.b, "--claim", "2", "--slug", "packets webp")
        self.assertEqual(code, 0, out)
        self.assertIn("packets-heic (", out)
        self.assertNotIn("packets-heic-convert", out)
        _, listing = self.main(self.b)
        self.assertIn("MERGED packets-heic-convert", listing)
        self.assertNotIn("MERGED packets-heic (", listing)
        # Claiming a merged slug again says it is done.
        code, out = self.main(self.b, "--claim", "2", "--slug", "packets heic convert")
        self.assertEqual(code, 4, out)
        self.assertIn("DONE", out)

    def test_merged_whole_item_lists_as_merged(self):
        self.assertEqual(self.main(self.a, "--claim", "1")[0], 0)
        self.merge("QuickBooks, part 5: SOV lines")
        _, listing = self.main(self.b)
        self.assertIn("[MERGED] quickbooks-part-5", listing)

    def test_commit_before_the_claim_does_not_mark_it(self):
        self.merge("QuickBooks part 5 groundwork", ago=600)
        self.assertEqual(self.main(self.a, "--claim", "1")[0], 0)
        _, listing = self.main(self.b)
        self.assertNotIn("MERGED", listing)

    def test_rerun_of_own_claim_says_yours_not_taken(self):
        self.assertEqual(self.main(self.a, "--claim", "1")[0], 0)
        code, out = self.main(self.a, "--claim", "1")
        self.assertEqual(code, 0, out)
        self.assertIn("YOURS", out)
        self.assertIn("(yours)", self.main(self.a)[1])
        # The same session in another clone is still the same claimant.
        self.assertIn("YOURS", self.main(self.b, "--claim", "1", run=str(self.a))[1])
        code, out = self.main(self.b, "--claim", "1")
        self.assertEqual(code, 4, out)
        self.assertIn("TAKEN", out)
        self.assertNotIn("(yours)", self.main(self.b)[1])

    def test_app_without_roadmap_takes_slug_claims(self):
        def other(repo, *argv):
            return self.main(repo, *argv, app="seller-books")
        code, out = other(self.a, "--slug", "legal pages", "--note", "terms and privacy")
        self.assertEqual(code, 0, out)
        self.assertIn("CLAIMED claim/seller-books/legal-pages", out)
        self.assertEqual(other(self.b, "--slug", "legal pages")[0], 4)
        code, listing = other(self.b)
        self.assertEqual(code, 0, listing)
        self.assertIn("has no ROADMAP.md", listing)
        self.assertIn("legal-pages", listing)
        self.assertEqual(other(self.b, "--claim", "1")[0], 2)

    def test_release(self):
        self.main(self.a, "--claim", "3")
        slug = rc.slugify(rc.next_items(ROADMAP)[2][1])
        self.assertEqual(self.main(self.a, "--release", slug)[0], 0)
        self.assertEqual(self.main(self.b, "--claim", "3")[0], 0)


if __name__ == "__main__":
    unittest.main()
