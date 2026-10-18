import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "src"))
from swe_errlabel import LABELS, read_tsv, predict, wilson, confusion, cohen_kappa, per_class  # noqa: E402


class T(unittest.TestCase):
    def test_labels_cover_sample_once(self):
        texts = dict(read_tsv(HERE / "data" / "to_label.tsv"))
        labels = dict(read_tsv(HERE / "data" / "labels.tsv"))
        self.assertEqual(set(texts), set(labels))
        self.assertEqual(len(texts), 60)
        self.assertTrue(set(labels.values()) <= set(LABELS))

    def test_predict_maps_unclassified_to_other(self):
        self.assertEqual(predict("nothing matches here"), "other")
        self.assertEqual(predict("pip numpy missing"), "environment")

    def test_kappa_perfect_and_chance(self):
        self.assertAlmostEqual(cohen_kappa([(c, c) for c in LABELS] * 3), 1.0)
        # always predicting one class while labels are balanced over two: no agreement beyond chance
        pairs = [("timeout", "timeout"), ("other", "timeout")] * 5
        self.assertAlmostEqual(cohen_kappa(pairs), 0.0)

    def test_confusion_and_per_class(self):
        pairs = [("timeout", "timeout"), ("timeout", "other"), ("other", "other")]
        m = confusion(pairs)
        self.assertEqual(m["timeout"]["other"], 1)
        pc = per_class(pairs)
        self.assertEqual((pc["other"]["assigned"], pc["other"]["hand"], pc["other"]["tp"]), (2, 1, 1))

    def test_wilson_bounds(self):
        lo, hi = wilson(40, 60)
        self.assertTrue(0.54 < lo < 0.55 and 0.77 < hi < 0.78)
        self.assertEqual(wilson(0, 0), (0.0, 1.0))


if __name__ == "__main__":
    unittest.main()
