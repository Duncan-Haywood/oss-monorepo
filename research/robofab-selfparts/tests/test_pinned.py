"""Headline counts pinned to the values an independent brute force reproduced.

The 2026-11-17 quality census (portfolio/quality/audits/2026-11-17-robofab-selfparts.json) recounted all
720 orderings with its own collision and support code, not importing this package, and matched every
number below. Before this file, four seeded bugs in model.py left the suite green, two of them moving the
headline from 384 to 576 and to 204.
"""
import unittest
from robofab_selfparts.model import Model, search


class Pinned(unittest.TestCase):
    def test_arm_by_jaw(self):
        want = {("free", 30): 384, ("free", 40): 384, ("side", 30): 384, ("side", 40): 384,
                ("top", 30): 120, ("top", 40): 120, ("side", 25): 0, ("side", 29.5): 0, ("top", 29.5): 0}
        for (arm, w), n in want.items():
            self.assertEqual(search(Model(arm, jaw_open=w))["orders"], n, (arm, w))

    def test_gravity_off(self):
        got = [search(Model(a, jaw_open=40, gravity=False))["orders"] for a in ("free", "side", "top")]
        self.assertEqual(got, [720, 720, 120])

    def test_cover_is_the_stuck_part(self):
        self.assertEqual(search(Model("side", jaw_open=25))["stuck"], ["cover"])


if __name__ == "__main__":
    unittest.main()
