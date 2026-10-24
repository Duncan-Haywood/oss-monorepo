"""The planner's numbers must describe the robot the CAD builds (cad/ofr_cad/params.py; no build123d needed)."""

import math
import os
import sys
import unittest

from floorbots import variants as V

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "cad"))
from ofr_cad.params import Robot  # noqa: E402

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "firmware", "esp32"))
from floorbots import protocol as _P  # noqa: E402
sys.modules.setdefault("protocol", _P)  # firmware imports it by bare name


class VariantsMatchCadTest(unittest.TestCase):
    def test_platform(self):
        p = Robot()
        self.assertAlmostEqual(V.CHASSIS_RADIUS, p.shell_r / 1000)
        self.assertAlmostEqual(V.TRACK, p.track / 1000)
        self.assertAlmostEqual(V.WHEEL_D, p.wheel_d / 1000)
        self.assertAlmostEqual(V.CLIFF_SENSOR_LEAD, p.cliff_lead / 1000, delta=0.001)

    def test_vacuum_tool(self):
        p = Robot("vacuum")
        _, _, half = p.slot
        self.assertAlmostEqual(V.VACUUM_TOOL.width, 2 * half / 1000, delta=0.001)
        self.assertAlmostEqual(V.VACUUM_TOOL.edge_reach, p.side_brush_reach / 1000, delta=0.001)

    def test_mop_tools(self):
        self.assertAlmostEqual(V.MOP_TOOL.width, 2 * Robot("mop").mop_half_y / 1000)
        self.assertAlmostEqual(V.COMBO_MOP_TOOL.width, 2 * Robot("combo").mop_half_y / 1000)
        self.assertAlmostEqual(V.MOP_TOOL.edge_reach, Robot("mop").mop_half_y / 1000)
        self.assertAlmostEqual(V.COMBO_MOP_TOOL.edge_reach, Robot("combo").mop_half_y / 1000)

    def test_capacities(self):
        for name, v in V.VARIANTS.items():
            p = Robot(name)
            self.assertTrue(math.isclose(v.bin_ml, p.bin_ml(), rel_tol=0.05, abs_tol=1), name)
            self.assertTrue(math.isclose(v.tank_ml, p.tank_ml(), rel_tol=0.05, abs_tol=1), name)

    def test_firmware_speed_cap_is_the_transit_speed(self):
        import controller
        self.assertAlmostEqual(controller.MAX_DRIVE_MM_S / 1000, V.TRANSIT)


if __name__ == "__main__":
    unittest.main()
