import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_settle.settle import Checker, grounded_stable, mjcf, settle  # noqa: E402

CK = Checker()


def st(*names):
    return 1 | sum(1 << CK.names.index(n) for n in names)


class SettleTests(unittest.TestCase):
    def test_base_only_holds(self):
        self.assertEqual(settle(CK, 1)[0], True)

    def test_part_on_boss_holds_in_both(self):
        s = st("gear1")
        self.assertTrue(CK.stable(s))
        self.assertTrue(settle(CK, s)[0])

    def test_floating_lid_falls(self):
        s = st("lid")
        self.assertFalse(CK.stable(s))
        holds, disp, _ = settle(CK, s)
        self.assertFalse(holds)
        self.assertGreater(disp, 10.0)

    def test_circular_support_state(self):
        # shaft and front collar support each other in the original rule; MuJoCo topples it
        s = st("wall_back", "shaft1", "collar_f1")
        self.assertTrue(CK.stable(s))
        self.assertFalse(grounded_stable(CK, s))
        self.assertFalse(settle(CK, s)[0])

    def test_bore_captures_shaft(self):
        # the rectangle rule rejects it, but the gear bore keeps the shaft from tipping
        s = st("gear1", "shaft1", "collar_f1")
        self.assertFalse(CK.stable(s))
        self.assertTrue(settle(CK, s)[0])

    def test_full_assembly_holds(self):
        full = (1 << CK.n) - 1
        self.assertTrue(CK.stable(full) and grounded_stable(CK, full) and settle(CK, full)[0])

    def test_mjcf_has_one_fixed_base(self):
        x = mjcf(CK, (1 << CK.n) - 1, 0.5)
        self.assertEqual(x.count("<freejoint/>"), CK.n - 1)


if __name__ == "__main__":
    unittest.main()
