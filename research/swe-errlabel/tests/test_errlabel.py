import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "src"))
from swe_errlabel import LABELS, read_tsv, predict, wilson, confusion, cohen_kappa, per_class  # noqa: E402


def classify_alone(category, text):
    """Whether one swe-errors rule's pattern matches, ignoring the rules ordered before it."""
    import re
    from swe_errors import RULES
    return bool(re.search(dict(RULES)[category], text.lower()))


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

    def test_headline_numbers_and_ci_tooling_keywords(self):
        """Pins the README's headline (40/60, kappa 0.59) and its explanation of the ci-or-tooling miss:
        8 of the 9 hand-labelled ci-or-tooling entries carry no ci-or-tooling keyword (quality audit 2026-11-15)."""
        texts = dict(read_tsv(HERE / "data" / "to_label.tsv"))
        labels = dict(read_tsv(HERE / "data" / "labels.tsv"))
        pairs = [(labels[i], predict(texts[i])) for i in texts]
        self.assertEqual(sum(1 for a, b in pairs if a == b), 40)
        self.assertAlmostEqual(cohen_kappa(pairs), 0.586, places=3)
        pc = per_class(pairs)
        self.assertEqual((pc["own-mistake"]["hand"], pc["own-mistake"]["tp"]), (22, 12))
        ci = [i for i in texts if labels[i] == "ci-or-tooling"]
        self.assertEqual(len(ci), 9)
        with_kw = [i for i in ci if classify_alone("ci-or-tooling", texts[i])]
        self.assertEqual(with_kw, ["957.0"])

    def test_kappa_uses_both_raters_marginals(self):
        # hand shares 3/4 vs 1/4, rule shares 1/4 vs 3/4: pe = 2 * 3/16 = 0.375, po = 0.5
        pairs = [("timeout", "timeout"), ("timeout", "other"), ("timeout", "other"), ("other", "other")]
        self.assertAlmostEqual(cohen_kappa(pairs), (0.5 - 0.375) / (1 - 0.375))


if __name__ == "__main__":
    unittest.main()
