import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "src"))
from swe_nullrate import LABELS, plain, read_tsv, sample, keyword_flag, discloses, wilson, binary_scores  # noqa: E402


class T(unittest.TestCase):
    def test_plain_strips_html_and_entities(self):
        self.assertEqual(plain("A <em>b</em> &minus; c&nbsp;d"), "A b − c d")

    def test_sample_is_reproducible_and_distinct(self):
        s = [f"p{i}" for i in range(50)]
        a, b = sample(s, 10, 7), sample(list(reversed(s)), 10, 7)
        self.assertEqual(a, b)
        self.assertEqual(len(set(a)), 10)

    def test_labels_are_the_seeded_sample(self):
        rows = read_tsv(HERE / "data" / "summaries.tsv")[1:]
        lab = read_tsv(HERE / "data" / "labels.tsv")[1:]
        self.assertEqual(sorted(r[0] for r in lab), sorted(sample([r[0] for r in rows], 80, 20261019)))
        self.assertTrue(all(r[1] in LABELS for r in lab))

    def test_keyword_rule(self):
        self.assertTrue(keyword_flag("A negative result: it does not help."))
        self.assertFalse(keyword_flag("Closed form matches simulation."))

    def test_discloses(self):
        self.assertTrue(discloses("Stylised."))
        self.assertFalse(discloses("Measured on a board."))

    def test_wilson_known_value(self):
        lo, hi = wilson(0, 10)
        self.assertAlmostEqual(lo, 0.0, places=6)
        self.assertAlmostEqual(hi, 0.2775, places=3)
        self.assertEqual(wilson(0, 0), (0.0, 1.0))

    def test_binary_scores(self):
        s = binary_scores([(True, True), (True, False), (False, True), (False, False), (False, False)])
        self.assertEqual((s["tp"], s["fp"], s["fn"], s["tn"]), (1, 1, 1, 2))
        self.assertAlmostEqual(s["precision"], 0.5)
        self.assertAlmostEqual(s["recall"], 0.5)


if __name__ == "__main__":
    unittest.main()
