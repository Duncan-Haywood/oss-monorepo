import unittest

from robofab_cell import CellParams, Batch, draw_batch, simulate, lower_bound
from robofab_cell.cell import mean_batch


def fixed(times):
    return Batch(list(times), [[1.0] * 40 for _ in times])


class TestCell(unittest.TestCase):
    def test_single_job_is_sum_of_stages(self):
        p = CellParams(n_printers=1, load=2, unload=3, inspect=5)
        r = simulate(p, fixed([40.0]))
        self.assertAlmostEqual(r["makespan"], 2 + 40 + 3 + 5)

    def test_one_printer_serial(self):
        # printer is held load..unload, so jobs run back to back; last one is then inspected
        p = CellParams(n_printers=1, load=1, unload=1, inspect=4)
        r = simulate(p, fixed([10.0] * 5))
        self.assertAlmostEqual(r["makespan"], 5 * (1 + 10 + 1) + 4)

    def test_many_printers_parallel_arm_bound(self):
        # print so short the arm (load+unload per job) is the bottleneck with one arm
        p = CellParams(n_printers=20, load=2, unload=2, inspect=0.1, q_fail=0.0)
        r = simulate(p, fixed([1.0] * 10))
        self.assertGreaterEqual(r["makespan"], 10 * 4 - 1e-9)
        self.assertGreater(r["util"]["arm"], 0.85)

    def test_rework_adds_work(self):
        p = CellParams(n_printers=1, load=1, unload=1, inspect=2, q_fail=0.5)
        b = Batch([10.0], [[0.1, 0.9] + [1.0] * 38])   # reject once, then pass
        r = simulate(p, b)
        self.assertEqual(r["reworks"], 1)
        self.assertAlmostEqual(r["makespan"], 2 * (1 + 10 + 1 + 2))

    def test_bounds_and_utilisation(self):
        p = CellParams()
        for seed in range(20):
            b = draw_batch(p, 30, seed)
            b0 = Batch(b.print_times, [[1.0] * 40 for _ in b.print_times])   # no rework
            for rule in ("unload_first", "load_first"):
                for order in ("fifo", "spt", "lpt"):
                    r = simulate(p, b0, rule, order)
                    self.assertGreaterEqual(r["makespan"] + 1e-9, lower_bound(p, b0))
                    for u in r["util"].values():
                        self.assertLessEqual(u, 1.0 + 1e-9)

    def test_deterministic(self):
        p = CellParams()
        b = draw_batch(p, 30, 3)
        self.assertEqual(simulate(p, b), simulate(p, b))
        self.assertEqual(draw_batch(p, 30, 3).print_times, draw_batch(p, 30, 3).print_times)

    def test_print_time_distribution(self):
        p = CellParams(print_mean=45.0, print_cv=0.5)
        xs = draw_batch(p, 20000, 1).print_times
        m = sum(xs) / len(xs)
        sd = (sum((x - m) ** 2 for x in xs) / len(xs)) ** 0.5
        self.assertAlmostEqual(m, 45.0, delta=1.0)
        self.assertAlmostEqual(sd / m, 0.5, delta=0.03)

    def test_more_printers_never_slower_without_rework(self):
        b = fixed([30.0] * 12)
        ms = [simulate(CellParams(n_printers=k, q_fail=0), b)["makespan"] for k in (1, 2, 3, 4)]
        self.assertEqual(ms, sorted(ms, reverse=True))

    def test_mean_batch_has_no_rework(self):
        p = CellParams()
        self.assertEqual(simulate(p, mean_batch(p, 10))["reworks"], 0)


if __name__ == "__main__":
    unittest.main()
