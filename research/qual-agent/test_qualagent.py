import json
import unittest
from pathlib import Path

import qualagent as a


class Tests(unittest.TestCase):
    def test_wilson_contains_proportion(self):
        lo, hi = a.wilson(30, 100)
        self.assertLess(lo, 0.3)
        self.assertGreater(hi, 0.3)
        self.assertEqual(a.wilson(0, 0), (0.0, 1.0))

    def test_wilson_known_value(self):
        lo, hi = a.wilson(5, 10)  # textbook: about (0.237, 0.763)
        self.assertAlmostEqual(lo, 0.237, places=2)
        self.assertAlmostEqual(hi, 0.763, places=2)

    def test_mcnemar_exact(self):
        self.assertEqual(a.mcnemar_exact(0, 0), 1.0)
        self.assertEqual(a.mcnemar_exact(5, 5), 1.0)
        self.assertAlmostEqual(a.mcnemar_exact(0, 10), 2 / 1024)

    def test_sample_is_seeded_and_sorted(self):
        test = [(str(i), "t", 0, 3) for i in range(1000)]
        s1, s2 = a.sample_corpus(test), a.sample_corpus(test)
        self.assertEqual(s1, s2)
        self.assertEqual(len(s1), a.SAMPLE_N)
        self.assertEqual([e[0] for e in s1], sorted((e[0] for e in s1), key=int))

    def test_codes_file_is_binary_and_complete(self):
        blob = json.loads((Path(__file__).parent / "agent_codes.json").read_text())
        self.assertEqual(len(blob["codes"]), a.SAMPLE_N)
        self.assertLessEqual(set(blob["codes"].values()), {0, 1})

    def test_summarise(self):
        mean, cov, w = a.summarise([(0.2, 0.05), (0.4, 0.05)], 0.3)
        self.assertAlmostEqual(mean, 0.3)
        self.assertEqual(cov, 0.0)
        self.assertAlmostEqual(w, 2 * 1.96 * 0.05, places=3)


if __name__ == "__main__":
    unittest.main()
