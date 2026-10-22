import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from accel_sysmodel import system as S


class T(unittest.TestCase):
    def test_per_decision(self):
        self.assertAlmostEqual(S.fe_nj_per_decision(46.768), 584.6, 1)

    def test_saving_zero_when_equal(self):
        self.assertEqual(S.saving(5.0, 5.0, 46.768), 0.0)

    def test_saving_shrinks_with_front_end(self):
        self.assertLess(S.saving(10, 5, 46.768), S.saving(10, 5, 46.768, 0.01))

    def test_saving_tends_to_clf_only_as_fe_vanishes(self):
        self.assertAlmostEqual(S.saving(10, 5, 46.768, 1e-9), 0.5, 6)

    def test_breakeven_consistent(self):
        s = S.breakeven_scale(10, 5, 46.768, 0.3)
        self.assertAlmostEqual(S.saving(10, 5, 46.768, s), 0.3, 9)
        self.assertIsNone(S.breakeven_scale(10, 5, 46.768, 0.6))


if __name__ == '__main__':
    unittest.main()
