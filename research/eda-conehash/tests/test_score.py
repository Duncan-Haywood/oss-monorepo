import os
import sys
import unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from eda_conehash import cone, score as S


def mod(cells, ports=None):
    """Tiny yosys-JSON module: cells = {name: (type, {port: [bits]})}; bit 2 is the flop output named q."""
    dirs = {"Y": "output", "Q": "output"}
    return {"cells": {n: {"type": t, "parameters": {}, "connections": c,
                          "port_directions": {p: dirs.get(p, "input") for p in c}} for n, (t, c) in cells.items()},
            "netnames": {"a": {"bits": [3]}, "q": {"bits": [2]}},
            "ports": ports or {}}


class Cone(unittest.TestCase):
    def sinks(self, gate):
        return cone.analyse(mod({"g": (gate, {"A": [3], "B": [3], "Y": [4]}),
                                 "f": ("$_DFF_P_", {"C": [9], "D": [4], "Q": [2]})}))

    def test_same_netlist_has_no_changed_sinks(self):
        f = cone.features(self.sinks("$_AND_"), self.sinks("$_AND_"))
        self.assertEqual((f["n_changed"], f["cone_gates"]), (0, 0))

    def test_changed_gate_is_one_sink_with_its_cone(self):
        f = cone.features(self.sinks("$_AND_"), self.sinks("$_OR_"))
        self.assertEqual((f["n_changed"], f["cone_gates"], f["cone_depth"]), (1, 1, 1))

    def test_flop_type_is_part_of_the_hash(self):
        a = cone.analyse(mod({"f": ("$_SDFF_PP0_", {"D": [3], "Q": [2]})}))
        b = cone.analyse(mod({"f": ("$_SDFF_PP1_", {"D": [3], "Q": [2]})}))
        self.assertEqual(cone.features(a, b)["n_changed"], 1)


class Real(unittest.TestCase):
    def test_table_and_negative_result(self):
        rows = S.load()
        self.assertEqual(len(rows), 27)
        self.assertEqual(sum(r["eq"] for r in rows), 16)
        for f in S.NAMES:  # no cone feature beats the majority class under leave-one-line-out
            self.assertLessEqual(S.loo_line(rows, f), 16)

    def test_single_changed_sink_survivors_are_never_equivalent(self):
        one = [r for r in S.load() if r["n_changed"] == 1]
        self.assertEqual(len(one), 7)
        self.assertFalse(any(r["eq"] for r in one))


if __name__ == "__main__":
    unittest.main()
