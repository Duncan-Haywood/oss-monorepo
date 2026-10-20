import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_repairpay.model import Params, simulate, summarise

P = dict(work_h=50, vit_cost=170, budget=40, life_h=2000)


class RepairPay(unittest.TestCase):
    def test_join_is_default_and_deterministic(self):
        self.assertEqual(Params(**P).pay_at, "join")
        p = Params(**P, benches=1, pay_at="service")
        self.assertEqual(simulate(p, 1, 4000, 2), simulate(p, 1, 4000, 2))

    def test_unlimited_labour_modes_agree_closely(self):
        # with no queue, paying at breakdown and at service start are the same instant
        a = summarise(Params(**P, pay_at="join"), 1, 6000, 8)[0]
        b = summarise(Params(**P, pay_at="service"), 1, 6000, 8)[0]
        self.assertAlmostEqual(a, b, delta=0.02 * max(a, b))

    def test_queue_cap_zero_ignores_pay_rule(self):
        for mode in ("join", "service"):
            _, d = simulate(Params(**P, benches=1, queue_cap=0, pay_at=mode), 1, 6000, 1)
            self.assertEqual(max(d), 0)

    def test_queue_never_exceeds_cap_plus_benches(self):
        _, d = simulate(Params(**P, benches=1, queue_cap=3, pay_at="service"), 1, 8000, 4)
        self.assertLessEqual(max(d), 4)

    def test_service_mode_retires_unaffordable_at_the_bench(self):
        # no import stream after the start: every breakdown joins the queue, none can pay at its turn, so none is repaired
        p = Params(work_h=50, vit_cost=170, budget=0.0, life_h=500, benches=1, pay_at="service")
        w, d = simulate(p, 3, 4000, 1)
        self.assertEqual((w[-1], d[-1]), (0, 0))


if __name__ == "__main__":
    unittest.main()
