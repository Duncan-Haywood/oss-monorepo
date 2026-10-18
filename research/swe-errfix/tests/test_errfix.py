import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "src"))
from swe_errfix import RULES, accuracy, add_words, best_order, load_items, predict, split, two_fold  # noqa: E402


class T(unittest.TestCase):
    def test_baseline_matches_swe_errlabel(self):
        items = load_items()
        self.assertEqual(len(items), 60)
        self.assertEqual(accuracy(RULES, [(t, h) for _, t, h in items]), 40)

    def test_split_keeps_runs_together_and_is_disjoint(self):
        items = load_items()
        f0, f1 = split(items, 3)
        self.assertEqual(len(f0) + len(f1), 60)
        self.assertFalse(set(f0) & set(f1))
        ids = {i: i.split(".")[0] for i, _, _ in items}
        run_of = {t: ids[i] for i, t, _ in items}
        self.assertFalse({run_of[t] for t, _ in f0} & {run_of[t] for t, _ in f1})

    def test_best_order_never_worse_on_its_own_data(self):
        dev = [(t, h) for _, t, h in load_items()][:30]
        self.assertGreaterEqual(accuracy(best_order(RULES, dev), dev), accuracy(RULES, dev))

    def test_add_words_needs_min_gain_and_fixes_toy_case(self):
        rules = [("a", "zzzz"), ("b", "yyyy")]
        items = [("widget broke", "a"), ("widget bent", "a"), ("gadget ok", "b"), ("gadget fine", "b")]
        new, added = add_words(rules, items, max_add=4, min_gain=2)
        self.assertEqual(accuracy(new, items), 4)
        self.assertEqual(len(added), 2)
        same, none = add_words(rules, items, max_add=4, min_gain=3)
        self.assertEqual(none, [])

    def test_two_fold_scores_every_entry_once(self):
        base, new, n, fits = two_fold(load_items(), 0)
        self.assertEqual(n, 60)
        self.assertEqual(base, 40)
        self.assertEqual(len(fits), 2)

    def test_predict_other_when_nothing_matches(self):
        self.assertEqual(predict(RULES, "xyzzy"), "other")


if __name__ == "__main__":
    unittest.main()
