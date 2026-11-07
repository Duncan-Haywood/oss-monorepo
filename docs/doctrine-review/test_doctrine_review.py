"""Tests for doctrine_review.py. Run: python3 -m unittest docs/doctrine-review/test_doctrine_review.py"""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import doctrine_review as dr  # noqa: E402


class DoctrineReviewTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.hh, self.sbc = base / "hh", base / "sbc"
        self.hh.mkdir()
        self.sbc.mkdir()
        (self.hh / "lamp.md").write_text("---\nshelf: little-lamps\n---\nShe prayed, and God sent ’rain’.\n")
        (self.hh / "sf.md").write_text("---\nshelf: hearth-and-horizon\n---\nThe welder swept up.\n")
        (self.sbc / "001-ep.md").write_text("---\nnumber: 1\n---\nThe angel Raphael\nwalked with Tobias.\n")
        self.stories = dr.corpus(self.hh, self.sbc)

    def tearDown(self):
        self.tmp.cleanup()

    def review(self, rid, verdict="faithful", findings=None):
        return {"id": rid, "verdict": verdict, "findings": findings or [], "reviewed": "2026-11-07",
                "batch": 1, "sha256": dr.digest(self.stories[rid])}

    def test_corpus_ids_and_shelves(self):
        self.assertEqual(set(self.stories), {"hearth-and-horizon/lamp", "hearth-and-horizon/sf", "saints-by-candlelight/001-ep"})
        self.assertEqual(dr.shelf_of("saints-by-candlelight/001-ep", self.stories["saints-by-candlelight/001-ep"]), "saints-by-candlelight")

    def test_quote_must_match_modulo_whitespace_and_curly_quotes(self):
        ok = self.review("saints-by-candlelight/001-ep", "minor",
                         [{"level": "P", "quote": "angel Raphael walked", "issue": "x", "fix": "y"}])
        self.assertEqual(dr.check([ok], self.stories), [])
        curly = self.review("hearth-and-horizon/lamp", "minor",
                            [{"level": "L", "quote": "God sent 'rain'", "issue": "x", "fix": "y"}])
        self.assertEqual(dr.check([curly], self.stories), [])
        bad = self.review("saints-by-candlelight/001-ep", "minor",
                          [{"level": "P", "quote": "angel Michael", "issue": "x", "fix": "y"}])
        self.assertTrue(any("quote not found" in e for e in dr.check([bad], self.stories)))

    def test_verdict_floor(self):
        r = self.review("hearth-and-horizon/lamp", "faithful",
                        [{"level": "M", "quote": "She prayed", "issue": "x", "fix": "y"}])
        self.assertTrue(any("imply concern" in e for e in dr.check([r], self.stories)))
        r["verdict"] = "error"
        self.assertEqual(dr.check([r], self.stories), [])

    def test_unknown_story_and_duplicate(self):
        r = self.review("hearth-and-horizon/sf")
        errs = dr.check([r, dict(r), {"id": "nope", "verdict": "faithful"}], self.stories)
        self.assertTrue(any("reviewed twice" in e for e in errs))
        self.assertTrue(any("no such story" in e for e in errs))

    def test_stale_and_queue(self):
        r = self.review("hearth-and-horizon/lamp")
        self.assertEqual(dr.stale([r], self.stories), [])
        q = [rid for rid, _, _ in dr.queue([r], self.stories, 10)]
        self.assertEqual(q, ["saints-by-candlelight/001-ep", "hearth-and-horizon/sf"])
        self.stories["hearth-and-horizon/lamp"].write_text("changed")
        self.assertEqual(dr.stale([r], self.stories), ["hearth-and-horizon/lamp"])
        self.assertIn("hearth-and-horizon/lamp", [rid for rid, _, _ in dr.queue([r], self.stories, 10)])

    def test_status_table(self):
        out = dr.status([self.review("hearth-and-horizon/lamp")], self.stories)
        self.assertIn("| little-lamps | 1 | 1 | 1 | 0 | 0 | 0 |", out)
        self.assertIn("| **all** | 3 | 1 |", out)


if __name__ == "__main__":
    unittest.main()
