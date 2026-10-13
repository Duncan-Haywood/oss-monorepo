import pathlib, sys, unittest
root = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(root / "src"))
from dataclasses import replace
from robofab_cell_bound import CellConfig, JobType, simulate, bound, replicate

J = JobType("J", 20, load_min=2, unload_min=2, inspect_min=3, fail_prob=0.0)


class CellTests(unittest.TestCase):
    def test_bound_single_printer(self):
        c = CellConfig((J,), printers=1, wip=2)
        b, who, _ = bound(c)
        self.assertEqual(who, "printers")
        self.assertAlmostEqual(60 * b, 60 / 24)       # 20 + 2 + 2 minutes per part

    def test_bound_names_arm_with_many_printers(self):
        c = CellConfig((J,), printers=50, wip=52)
        self.assertEqual(bound(c)[1], "arm")
        self.assertAlmostEqual(60 * bound(c)[0], 15.0)   # 4 arm-minutes per part

    def test_rework_scales_demand(self):
        c = CellConfig((replace(J, fail_prob=0.5),), printers=1)
        self.assertAlmostEqual(60 * bound(c)[0], 60 / 48)

    def test_deterministic_matches_bound_single_printer(self):
        c = CellConfig((J,), printers=1, wip=2, horizon=48 * 60, warmup=60)
        self.assertAlmostEqual(simulate(c, 0)["good_per_hour"], 2.5, delta=0.1)

    def test_never_exceeds_bound(self):
        for p in (2, 6, 14):
            c = CellConfig((J, replace(J, name="K", print_min=50, fail_prob=0.2)), printers=p, wip=p + 2, cv=0.3)
            r = replicate(c, range(5))["good_per_hour"][0]
            self.assertLess(r, 60 * bound(c)[0] * 1.03)

    def test_littles_law(self):
        c = CellConfig((J,), printers=4, wip=6, cv=0.3, horizon=72 * 60, warmup=6 * 60)
        r = simulate(c, 1)
        self.assertAlmostEqual(c.wip, r["good_per_hour"] / 60 * r["mean_flow_min"], delta=0.5)

    def test_seed_reproducible(self):
        c = CellConfig((J,), printers=3, wip=5, cv=0.3)
        self.assertEqual(simulate(c, 7), simulate(c, 7))

    def test_unknown_rule_rejected(self):
        with self.assertRaises(ValueError):
            simulate(CellConfig((J,), arm_rule="nope"))


if __name__ == "__main__":
    unittest.main()
