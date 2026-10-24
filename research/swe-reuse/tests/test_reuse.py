import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "src"))
from swe_reuse import prefix, mentions, edges, wilson, expected_same_prefix, gini  # noqa: E402


class T(unittest.TestCase):
    def test_prefix(self):
        self.assertEqual(prefix("swe-ledger"), "swe")

    def test_mentions_whole_token_only(self):
        slugs = ["swe-ledger", "swe-ledger2", "chip-a"]
        t = "see [x](../swe-ledger2) and `chip-a`, not chip-ab"
        self.assertEqual(mentions(t, slugs, "me"), {"swe-ledger2", "chip-a"})
        self.assertEqual(mentions(t, slugs, "chip-a"), {"swe-ledger2"})

    def test_edges_backward_only(self):
        created = {"a": 1, "b": 2, "c": 2}
        refs = {"b": {"a", "c"}, "a": {"b"}}
        self.assertEqual(edges(refs, created), [("b", "a")])

    def test_wilson(self):
        lo, hi = wilson(50, 100)
        self.assertAlmostEqual(lo, 0.404, 2)
        self.assertAlmostEqual(hi, 0.596, 2)
        self.assertEqual(wilson(0, 0), (0.0, 1.0))

    def test_expected_same_prefix(self):
        created = {"x-1": 1, "y-1": 2, "x-2": 3}
        # x-2 cites one earlier project; half of the earlier ones share its prefix
        self.assertAlmostEqual(expected_same_prefix([("x-2", "x-1")], created), 1 / 2)

    def test_gini(self):
        self.assertAlmostEqual(gini([1, 1, 1, 1]), 0.0)
        self.assertAlmostEqual(gini([0, 0, 0, 4]), 0.75)

    def test_snapshot_is_consistent(self):
        proj = [l.split("\t") for l in (HERE / "data" / "projects.tsv").read_text().splitlines()[1:]]
        slugs = {r[0] for r in proj}
        refs = [l.split("\t") for l in (HERE / "data" / "refs.tsv").read_text().splitlines()[1:]]
        self.assertTrue(all(a in slugs and b in slugs and a != b for a, b in refs))
        self.assertEqual(len(refs), len(set(map(tuple, refs))))


if __name__ == "__main__":
    unittest.main()
