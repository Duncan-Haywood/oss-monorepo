import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hanger_avoidpaired.paired import CellParams, PickParams, paired_stats, per_load, replace  # noqa: E402

CP, PP = CellParams(), PickParams()


class T(unittest.TestCase):
    def test_constant_shift_has_zero_spread(self):
        w = [float(i) for i in range(50)]
        s = paired_stats(w, [x + 2.0 for x in w])
        self.assertAlmostEqual(s["mean"], 2.0)
        self.assertAlmostEqual(s["lo"], 2.0)
        self.assertAlmostEqual(s["hi"], 2.0)
        self.assertEqual(s["better"], 1.0)
        self.assertGreater(s["se_unpaired"], 10 * s["se_paired"] + 1e-9)

    def test_independent_noise_pairing_no_better(self):
        w = [1.0, 5.0, 2.0, 8.0, 3.0, 9.0]
        s = paired_stats(w, list(reversed(w)))
        self.assertAlmostEqual(s["mean"], 0.0)

    def test_bootstrap_deterministic_and_ordered(self):
        w, a = [1, 2, 3, 4, 5, 6], [2, 2, 5, 4, 7, 6]
        s = paired_stats(w, a)
        self.assertEqual(s, paired_stats(w, a))
        self.assertLessEqual(s["lo"], s["mean"])
        self.assertLessEqual(s["mean"], s["hi"])

    def test_same_seeds_when_avoid_has_nothing_to_do(self):
        # sep 0 never clashes, so avoid on/off must give identical loads: the pairing is by seed
        cp = replace(CP, arms=2)
        self.assertEqual(per_load(cp, "see", PP, 4, 0.0, False), per_load(cp, "see", PP, 4, 0.0, True))

    def test_per_load_length(self):
        self.assertEqual(len(per_load(replace(CP, arms=2), "pinch", PP, 3, 0.3, True)), 3)


if __name__ == "__main__":
    unittest.main()
