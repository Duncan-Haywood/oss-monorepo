import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "osrobot-mjfeed" / "src"))
import osrobot_mjfeed.model as mj

K_FACE = 75000.0


class T(unittest.TestCase):
    def blocked(self, k, b, v=0.10):
        return mj.run_trial(mj.Design(sense="none", v_app=v), 0.0, 0, offset=0.03, m=mj.build(k, b))

    def test_steady_push_independent_of_stiffness(self):
        for k in (800.0, K_FACE):
            self.assertAlmostEqual(self.blocked(k, 100)["f_tail"], mj.KP * mj.LEAD * 0.10, delta=0.05)

    def test_stiffer_face_raises_impact_peak(self):
        self.assertGreater(self.blocked(K_FACE, 4)["peak"], 1.5 * self.blocked(800.0, 4)["peak"])

    def test_peak_scales_with_speed(self):
        a, b = self.blocked(K_FACE, 100, 0.05)["peak"], self.blocked(K_FACE, 100, 0.20)["peak"]
        self.assertAlmostEqual(b / a, 4.0, delta=0.8)

    def test_deterministic(self):
        d = mj.Design(sense="camera", v_app=0.10)
        m = mj.build(K_FACE, 100)
        self.assertEqual(mj.run_trial(d, 0.03, 3, m=m), mj.run_trial(d, 0.03, 3, m=m))


if __name__ == "__main__":
    unittest.main()
