import random
import statistics
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "qual-lowrate"))
import qualrate as qr  # noqa: E402

qa = qr.qa


def high_recall_corpus(n=4000, prev=0.25, fp=0.5, seed=4):
    """Coder with recall 1 and a false-positive rate fp: the negative stratum holds no positives."""
    rng = random.Random(seed)
    human = [int(rng.random() < prev) for _ in range(n)]
    llm = [1 if h or rng.random() < fp else 0 for h in human]
    return llm, human


class HighRecallTests(unittest.TestCase):
    def test_clean_negative_stratum_makes_a_low_rate_narrower(self):
        llm, human = high_recall_corpus()
        neg, pos = qa.strata(llm)
        widths = {}
        for share in (0.02, 0.5):
            rng = random.Random(7)
            w = []
            for _ in range(200):
                gn, gp = qr.draw(200, share, neg, pos, rng)
                _, se = qa.stratified(human, neg, pos, gn, gp)
                w.append(se)
            widths[share] = statistics.fmean(w)
        self.assertLess(widths[0.02], widths[0.5])

    def test_results_recall_rises_with_cutoff_and_baseline_matches_formula(self):
        rows = {}
        text = (HERE / "experiments" / "results.txt").read_text().split("\n\n")
        sec1 = [ln.split() for ln in text[1].splitlines()[2:]]
        recalls = [float(r[3]) for r in sec1]
        self.assertEqual(recalls, sorted(recalls))
        truth = float(text[0].split("= ")[-1].rstrip("."))
        base = [ln.split() for ln in text[-1].splitlines()[2:]]
        for n, w in base:
            self.assertAlmostEqual(float(w), 3.92 * (truth * (1 - truth) / int(n)) ** 0.5, delta=0.002)


if __name__ == "__main__":
    unittest.main()
