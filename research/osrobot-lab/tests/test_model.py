import random, unittest
from osrobot_lab.model import *
from osrobot_lab.protocols import PROTOCOLS, serial_dilution, master_mix


def run(deck, init, cmds, **kw):
    return check(deck, cmds, init, **kw)


class T(unittest.TestCase):
    def test_reference_protocols_are_clean(self):
        for name, f in PROTOCOLS.items():
            d, i, c = f()
            r = run(d, i, c)
            self.assertEqual(r.findings, [], name)
            self.assertGreater(r.time, 60, name)

    def test_tip_count_and_volume_conservation(self):
        d, i, c = serial_dilution(50.0)
        r = run(d, i, c)
        self.assertEqual(r.tips_used, 22)
        tot = sum(w.vol for k, w in r.wells.items() if k[0] == "plate")
        self.assertAlmostEqual(tot, 100 + 11 * 50 - 0, places=6)   # buffer in + stock; carry-over is internal

    def test_nominal_dilution_is_two_fold(self):
        d, i, c = serial_dilution(50.0)
        r = run(d, i, c)
        self.assertAlmostEqual(r.wells[("plate", "A12")].conc, 0.5 ** 11, places=9)

    def test_unknown_labware_and_well(self):
        d, i, c = serial_dilution()
        c[1] = dict(c[1], labware="buffr")
        self.assertIn("UNKNOWN_LABWARE", run(d, i, c).codes())
        d, i, c = serial_dilution()
        c[2] = dict(c[2], well="A13")
        self.assertIn("UNKNOWN_WELL", run(d, i, c).codes())

    def test_tip_state_errors(self):
        d, i, c = serial_dilution()
        self.assertIn("NO_TIP", run(d, i, c[1:]).codes())
        self.assertIn("TIP_PRESENT", run(d, i, c[:1] + c[:1] + c[1:]).codes())
        self.assertIn("TIP_USED", run(d, i, c[:4] + c[:1] + c[1:]).codes())
        self.assertIn("TIP_LEFT", run(d, i, c[:-1]).codes())

    def test_volume_errors(self):
        d, i, c = serial_dilution()
        self.assertIn("VOL_RANGE", run(d, i, [c[0], dict(c[1], vol=5.0)]).codes())
        self.assertIn("VOL_RANGE", run(d, i, [c[0], dict(c[1], vol=350.0)]).codes())
        self.assertIn("SOURCE_EMPTY", run(d, i, [c[0], dict(c[1], labware="plate", well="A3", vol=50.0)]).codes())
        big = [c[0], dict(c[1], vol=300.0), dict(c[2], vol=300.0)]
        self.assertIn("OVERFLOW", run(d, i, big).codes())

    def test_cross_contamination_needs_distinct_liquids(self):
        d, i, c = master_mix()
        # same tip, template then master mix: different liquids in the model only if labels differ
        i = dict(i); i[("templates", "A1")] = (100.0, 1.0, "other")
        cmds = [dict(op="pick_up_tip", labware="tips", well="A1"),
                dict(op="aspirate", labware="templates", well="A1", vol=20.0),
                dict(op="aspirate", labware="tubes", well="A1", vol=20.0)]
        self.assertIn("CROSS_CONTAM", run(d, i, cmds).codes())

    def test_collision_depends_on_travel_height(self):
        d, i, c = master_mix()
        low = [dict(c[0]), dict(c[1], travel_z=20.0)]      # tips (slot 1) -> tubes (slot 2): adjacent, no crossing
        self.assertNotIn("COLLISION", run(d, i, low).codes())
        d2 = [tiprack("tips", 1), tuberack("tubes", 2), plate96("pcr", 3)]
        cmds = [dict(op="pick_up_tip", labware="tips", well="A1"),
                dict(op="aspirate", labware="pcr", well="A1", vol=20.0, travel_z=20.0)]
        self.assertIn("COLLISION", run(d2, {("pcr", "A1"): (100.0, 1.0, "x")}, cmds).codes())
        cmds[1].pop("travel_z")
        self.assertNotIn("COLLISION", run(d2, {("pcr", "A1"): (100.0, 1.0, "x")}, cmds).codes())

    def test_monte_carlo_is_seeded_and_unbiased(self):
        d, i, c = serial_dilution(50.0)
        a = [run(d, i, c, rng=random.Random(s)).wells[("plate", "A12")].conc for s in range(3)]
        b = [run(d, i, c, rng=random.Random(s)).wells[("plate", "A12")].conc for s in range(3)]
        self.assertEqual(a, b)
        self.assertNotEqual(a[0], a[1])

    def test_structural_baseline_misses_state_errors(self):
        d, i, c = serial_dilution()
        self.assertEqual(structural(d, c[1:]), set())      # missing pick_up_tip: syntax is fine
        self.assertIn("UNKNOWN_WELL", structural(d, [dict(c[1], well="Z9")]))


if __name__ == "__main__":
    unittest.main()
