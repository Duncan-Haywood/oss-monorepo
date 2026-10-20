import math, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import benford as b


class T(unittest.TestCase):
    def test_first_digit(self):
        self.assertEqual([b.first_digit(x) for x in (1, 9, 10, 987, 4096)], [1, 9, 1, 9, 4])

    def test_benford_sums_to_one(self):
        self.assertAlmostEqual(sum(b.BENFORD), 1.0)

    def test_powers_of_two_conform(self):
        s = b.summarise([2 ** k for k in range(1, 2000)])
        self.assertEqual(s["band"], "close")

    def test_uniform_digits_rejected(self):
        s = b.summarise([d for d in range(1, 10) for _ in range(100)])
        self.assertTrue(s["chi2_reject_5pct"])
        self.assertEqual(s["band"], "nonconforming")

    def test_zero_ignored(self):
        self.assertEqual(b.digit_freqs([0, 0, 5])[1], 1)


if __name__ == "__main__":
    unittest.main()
