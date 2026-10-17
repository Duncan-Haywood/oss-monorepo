import math, unittest
from osrobot_lipsweep import model as m


def peak_max(v=0.2, **over):
    base = dict(K_LIP=m.K_LIP, KP=m.KP, KD=m.KD, LEAD=m.LEAD)
    try:
        for k, x in over.items(): setattr(m, k, x)
        return m.summarise(m.Design("camera", v), 0.03, range(60))["peak_max"]
    finally:
        for k, x in base.items(): setattr(m, k, x)


class T(unittest.TestCase):
    def test_constants_restored(self):
        before = (m.K_LIP, m.KP, m.LEAD)
        peak_max(K_LIP=100)
        self.assertEqual(before, (m.K_LIP, m.KP, m.LEAD))

    def test_softer_lips_lower_peak(self):
        self.assertLess(peak_max(K_LIP=100), peak_max(K_LIP=6400))

    def test_shorter_lead_lower_peak(self):
        self.assertLess(peak_max(LEAD=0.01), peak_max(LEAD=0.05))

    def test_peak_never_far_above_stall_push_with_base_lips(self):
        self.assertLessEqual(peak_max(), m.KP * m.LEAD * 0.2 + 0.5)

    def test_deterministic(self):
        d = m.Design("camera", 0.2)
        self.assertEqual(m.run_trial(d, 0.03, 3), m.run_trial(d, 0.03, 3))


if __name__ == "__main__":
    unittest.main()
