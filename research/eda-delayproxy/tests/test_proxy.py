import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from eda_delayproxy import proxy as P  # noqa: E402


def netlist(cells, outs):
    """Tiny writer for Yosys-style JSON: cells = [(type, [in bits], out bit)]."""
    cs = {}
    for k, (t, ins, o) in enumerate(cells):
        names = "ABS"[: len(ins)] if t != "$_MUX_" else "ABS"
        con = {n: [b] for n, b in zip(names, ins)}
        con["Y"] = [o]
        cs[f"c{k}"] = {"type": t, "connections": con,
                       "port_directions": {**{n: "input" for n in names}, "Y": "output"}}
    ports = {"out": {"direction": "output", "bits": outs}}
    return json.dumps({"modules": {"accel": {"cells": cs, "ports": ports}}})


class Proxy(unittest.TestCase):
    def test_unit_depth_of_a_chain(self):
        # a and b feed AND (bit 10) -> NOT (11) -> NOT (12) = 3 gates deep
        g, l = P.load(netlist([("$_AND_", [2, 3], 10), ("$_NOT_", [10], 11), ("$_NOT_", [11], 12)], [12]))
        self.assertEqual(P.critical_path(g, l, "unit"), 3)

    def test_logical_effort_inverter_chain(self):
        # inverter: g=1, p=1, so d = h + 1; fan-out 1 each -> 2 per stage
        g, l = P.load(netlist([("$_NOT_", [2], 10), ("$_NOT_", [10], 11)], [11]))
        self.assertAlmostEqual(P.critical_path(g, l, "le"), 4.0)

    def test_nand_textbook_value(self):
        # book: NAND2 driving one load of h=1: d = 4/3 + 2
        g, l = P.load(netlist([("$_NAND_", [2, 3], 10)], [10]))
        self.assertAlmostEqual(P.critical_path(g, l, "le"), 4 / 3 + 2)

    def test_fanout_slows_a_gate(self):
        base = P.load(netlist([("$_NAND_", [2, 3], 10), ("$_NOT_", [10], 11)], [11]))
        heavy = P.load(netlist([("$_NAND_", [2, 3], 10), ("$_NOT_", [10], 11), ("$_NOT_", [10], 12)], [11, 12]))
        self.assertGreater(P.critical_path(*heavy, "le"), P.critical_path(*base, "le"))
        self.assertEqual(P.critical_path(*heavy, "unit"), P.critical_path(*base, "unit"))

    def test_loop_detected(self):
        g, l = P.load(netlist([("$_NOT_", [11], 10), ("$_NOT_", [10], 11)], [10]))
        with self.assertRaises(ValueError):
            P.critical_path(g, l)


if __name__ == "__main__":
    unittest.main()
