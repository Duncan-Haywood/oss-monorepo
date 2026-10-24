import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import analyze
import gen


class T(unittest.TestCase):
    def test_auroc_separated_and_tied(self):
        self.assertEqual(analyze.auroc([3, 4], [1, 2]), 1.0)
        self.assertEqual(analyze.auroc([1, 1], [1, 1]), 0.5)
        self.assertEqual(analyze.auroc([1, 2], [3, 4]), 0.0)

    def test_trunc_matches_loop(self):
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "mimic-loop"))
        import core
        s = "word " * 200
        self.assertEqual(analyze.trunc(s), core.trunc(s))
        self.assertLessEqual(len(analyze.trunc(s)), analyze.CHARS)

    def test_boot_ci_contains_point(self):
        pos = [0.9, 0.8, 0.7, 0.95, 0.6, 0.85]
        neg = [0.1, 0.2, 0.3, 0.15, 0.4, 0.5]
        lo, hi = analyze.boot_auroc(pos, neg, reps=50)
        self.assertLessEqual(lo, 1.0)
        self.assertGreaterEqual(hi, lo)

    def test_prompts_cover_all_loop_runs(self):
        ps = gen.prompts()
        self.assertEqual(len(ps), 32)                       # 2 families x 4 proposers x 4 rounds
        self.assertEqual({p["round"] for p in ps}, {0, 1, 2, 3})
        self.assertTrue(all(p["imitator"] for p in ps))

    def test_ngram_detector_learns_toy_signal(self):
        t = ["thanks for the great answer " * 3] * 20 + ["lol idk my dog ate it " * 3] * 20
        y = [1] * 20 + [0] * 20
        f = analyze.ngram_fit(t, y)
        self.assertGreater(f(["thanks for the great answer"])[0], f(["lol idk my dog ate it"])[0])


if __name__ == "__main__":
    unittest.main()
