import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import qualgapneg as qg  # noqa: E402


def full_audit(human, group, llm):
    idx = range(len(human))
    neg = [i for i in idx if not llm[i]]
    pos = [i for i in idx if llm[i]]
    return qg.cells_from_audit(human, group, neg, pos, neg, pos)


class GapTests(unittest.TestCase):
    def setUp(self):
        rng = random.Random(3)
        self.group = ["A" if rng.random() < 0.4 else "B" for _ in range(2000)]
        self.human = [int(rng.random() < (0.45 if g == "A" else 0.2)) for g in self.group]
        self.llm = [h if rng.random() < 0.85 else 1 - h for h in self.human]

    def test_full_audit_gives_exact_gap(self):
        cells = full_audit(self.human, self.group, self.llm)
        truth = qg.true_gap(self.human, self.group)
        self.assertAlmostEqual(qg.wald(cells)[2], truth, places=9)

    def test_empty_cell_is_defined_for_bayes_and_plus_two(self):
        cells = {("A", "neg"): (100, 0, 0), ("B", "neg"): (300, 2, 4), ("A", "pos"): (150, 60, 90), ("B", "pos"): (250, 50, 100)}
        lo, hi, _ = qg.plus_two(cells)
        self.assertLess(lo, hi)
        lo, hi, _ = qg.jeffreys(cells, random.Random(1))
        self.assertLess(lo, hi)
        lo, hi, _ = qg.pooled(cells, random.Random(1))
        self.assertLess(lo, hi)

    def test_empty_cell_makes_wald_too_narrow(self):
        full = {("A", "neg"): (100, 1, 2), ("B", "neg"): (300, 2, 4), ("A", "pos"): (150, 60, 90), ("B", "pos"): (250, 50, 100)}
        empty = {**full, ("A", "neg"): (100, 0, 0)}
        wf, we = qg.wald(full), qg.wald(empty)
        self.assertLess(we[1] - we[0], wf[1] - wf[0])

    def test_jeffreys_agrees_with_wald_when_cells_are_large(self):
        cells = {("A", "neg"): (500, 60, 400), ("B", "neg"): (800, 40, 400), ("A", "pos"): (300, 200, 400), ("B", "pos"): (400, 150, 400)}
        w, j = qg.wald(cells), qg.jeffreys(cells, random.Random(2), draws=4000)
        self.assertAlmostEqual(w[0], j[0], delta=0.01)
        self.assertAlmostEqual(w[1], j[1], delta=0.01)


if __name__ == "__main__":
    unittest.main()
