import unittest

from stiction_twin.model import run_loop, twin_stable, tail_amplitude, max_error

KP, KD, KI = 10.0, 1.0, 2.0


class T(unittest.TestCase):
    def test_twin_routh(self):
        self.assertTrue(twin_stable(10, 1, 2))
        self.assertFalse(twin_stable(10, 0.3, 5))

    def test_frictionless_converges(self):
        xs = run_loop(KP, KD, KI, 0.0, 0.0, 1.0, 100000)
        self.assertLess(max_error(xs), 1e-9)

    def test_unstable_twin_diverges(self):
        xs = run_loop(10, 0.3, 5, 0.0, 0.0, 1.0, 100000)
        self.assertGreater(max_error(xs), 1e3)

    def test_stick_holds_inside_band(self):
        xs = run_loop(KP, KD, 0.0, 1.0, 2.0, 0.15, 1000)    # kp x = 1.5 < Fs: never breaks away
        self.assertTrue(all(x == 0.15 for x in xs))

    def test_breakaway_when_above_band(self):
        xs = run_loop(KP, KD, 0.0, 1.0, 2.0, 0.25, 1000)    # kp x = 2.5 > Fs
        self.assertLess(xs[-1], 0.25)

    def test_exact_scaling(self):
        a = run_loop(KP, KD, KI, 1.0, 2.0, 0.7, 20000)
        for s in (2.0 ** -7, 2.0 ** 10):   # powers of two: scaling is bit-exact
            b = run_loop(KP, KD, KI, s, 2 * s, 0.7 * s, 20000)
            self.assertEqual([x * s for x in a], b)

    def test_pure_coulomb_converges_with_damping(self):
        xs = run_loop(KP, 4.0, KI, 1.0, 1.0, 1.0, 100000)
        self.assertLess(max_error(xs), 1e-9)

    def test_stiction_excess_makes_it_hunt(self):
        xs = run_loop(KP, KD, KI, 1.0, 2.0, 1.0, 100000)
        self.assertGreater(tail_amplitude(xs), 0.05)
        self.assertLess(tail_amplitude(xs), 0.12)


if __name__ == "__main__":
    unittest.main()
