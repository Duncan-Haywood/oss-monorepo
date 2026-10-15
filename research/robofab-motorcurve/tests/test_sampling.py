import unittest
from robofab_motorcurve import trap
from robofab_motorcurve.model import Arm

ARM = Arm(0.12, 0.12, 0.12, 0.12, 0.2)
QA, QB = (0.3, 0.8), (1.0, 0.2)


class T(unittest.TestCase):
    def test_default_sampling_is_unchanged(self):
        self.assertEqual(trap.sample_points(200, 0.1), [(k + 0.5) / 201 for k in range(201)])

    def test_extra_samples_fall_inside_both_ramps(self):
        f = 0.002
        xs = trap.sample_points(200, f, 10)
        self.assertEqual(len(xs), 201 + 20)
        self.assertEqual(sum(1 for x in xs if x < f), 10)
        self.assertEqual(sum(1 for x in xs if x > 1 - f), 10)

    def test_naive_sampling_misses_a_very_short_ramp(self):
        # no default sample lies in a ramp of 0.2% of the move, so the torque peak there is not checked
        f = 0.002
        self.assertEqual([x for x in trap.sample_points(200, f) if x < f], [])
        naive = trap.move(ARM, QA, QB, 0.4, f)["tau1"]
        resolved = trap.move(ARM, QA, QB, 0.4, f, ramp_samples=40)["tau1"]
        self.assertGreater(resolved, 10 * naive)

    def test_resolved_time_is_never_shorter(self):
        for f in (0.002, 0.05):
            a = trap.min_time_trap(ARM, QA, QB, 5.0, 0.1, 1e9, f, wmax=2.0)
            b = trap.min_time_trap(ARM, QA, QB, 5.0, 0.1, 1e9, f, wmax=2.0, ramp_samples=40)
            self.assertGreaterEqual(b, a - 1e-9)


if __name__ == "__main__":
    unittest.main()
