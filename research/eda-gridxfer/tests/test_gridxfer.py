import os
import random
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from eda_gridxfer import bench  # noqa: E402


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sp = {f: bench.load(f) for f in bench.AXES}

    def test_sizes(self):
        self.assertEqual(len(self.sp["mac"].all()), 36)
        self.assertEqual(len(self.sp["fir"].all()), 36)
        self.assertEqual(self.sp["fir"].sizes, [4, 3, 3])

    def test_objectives_scaled_to_unit_range(self):
        for s in self.sp.values():
            for i in range(2):
                v = [y[i] for y in s.t.values()]
                self.assertEqual((min(v), max(v)), (0.0, 1.0))

    def test_full_walk_reaches_true_front(self):
        for s in self.sp.values():
            for name, (fn, stoch) in bench.ORDERS.items():
                c = bench.curve(s, fn(s.all(), s.sizes, random.Random(3) if stoch else None))
                self.assertEqual(len(c), 36, name)
                self.assertAlmostEqual(c[-1], 1.0, msg=name)
                self.assertTrue(all(a <= b + 1e-12 for a, b in zip(c, c[1:])), name)

    def test_mac_front_is_single_width(self):
        # cycles do not depend on word width, so only the narrowest width can be on the front
        s = self.sp["mac"]
        idx = {y: x for x, y in s.t.items()}
        self.assertEqual({idx[y][1] for y in bench.true_front(s)}, {0})

    def test_curve_known_value(self):
        s = bench.Space([{"params": {"a": i}, "cells": c, "cycles": y} for i, (c, y) in enumerate([(0, 10), (10, 0), (10, 10)])], ("a",))
        # scaled points (0,1),(1,0),(1,1); hypervolume to (1.1,1.1): one front point 0.11, both 0.21
        c = bench.curve(s, [(0,), (1,), (2,)])
        self.assertAlmostEqual(c[0], 0.11 / 0.21)
        self.assertAlmostEqual(c[1], 1.0)


if __name__ == "__main__":
    unittest.main()
