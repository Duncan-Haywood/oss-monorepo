import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import summarise_neural as s


class T(unittest.TestCase):
    def test_rel_hand_count(self):
        self.assertAlmostEqual(s.rel(1.03, 1.0), 3.0)
        self.assertAlmostEqual(s.rel(0.9, 1.0), -10.0)

    def test_committed_results(self):
        cells = s.collect()
        self.assertEqual(len(cells), 15)
        xs = [x for _, _, _, r in cells for x in r]
        self.assertEqual(len(xs), 45)
        self.assertEqual(sum(abs(x) <= 3 for x in xs), 43)  # LOG session 38


if __name__ == "__main__":
    unittest.main()
