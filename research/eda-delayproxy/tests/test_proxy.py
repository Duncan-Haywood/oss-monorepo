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

    def test_arrival_is_the_latest_input(self):
        # NOT(2)->10, NOT(10)->11, NAND(10, 11)->12: the NAND waits for its later input (11), so depth 3, not 2
        g, l = P.load(netlist([("$_NOT_", [2], 10), ("$_NOT_", [10], 11), ("$_NAND_", [10, 11], 12)], [12]))
        self.assertEqual(P.critical_path(g, l, "unit"), 3)

    def test_and_is_nand_plus_inverter(self):
        # AND driving 3 inverters: NAND stage into the internal inverter (4/3*1 + 2) + inverter driving h=3 (3 + 1),
        # then a fan-out-1 inverter (1 + 1)
        g, l = P.load(netlist([("$_AND_", [2, 3], 10), ("$_NOT_", [10], 11), ("$_NOT_", [10], 12),
                               ("$_NOT_", [10], 13)], [11, 12, 13]))
        self.assertAlmostEqual(P.critical_path(g, l, "le"), 4 / 3 + 2 + 3 + 1 + 2)
        self.assertAlmostEqual(P.critical_path(g, l, "type"), 4 / 3 + 2 + 1 + 1 + 2)

    def test_xor_textbook_value(self):
        # 2-input XOR: g = 4, p = 4 (Sutherland, Sproull and Harris, Tables 1.1 and 1.2), h = 1
        g, l = P.load(netlist([("$_XOR_", [2, 3], 10)], [10]))
        self.assertAlmostEqual(P.critical_path(g, l, "le"), 8.0)

    def test_fanout_model(self):
        # NAND with three readers costs 1 + 0.5 * 2, each inverter 1
        g, l = P.load(netlist([("$_NAND_", [2, 3], 10), ("$_NOT_", [10], 11), ("$_NOT_", [10], 12),
                               ("$_NOT_", [10], 13)], [11, 12, 13]))
        self.assertAlmostEqual(P.critical_path(g, l, "fanout"), 3.0)

    def test_flip_flop_is_cut_and_its_d_pin_is_a_load(self):
        # NAND(2, 3)->10 drives a flip-flop D pin and an output port (h = 2); the flip-flop's Q (20) starts a new path
        doc = json.loads(netlist([("$_NAND_", [2, 3], 10), ("$_NOT_", [20], 21)], [10, 21]))
        doc["modules"]["accel"]["cells"]["ff"] = {"type": "$_DFF_P_", "connections": {"C": [1], "D": [10], "Q": [20]},
                                                  "port_directions": {"C": "input", "D": "input", "Q": "output"}}
        g, l = P.load(json.dumps(doc))
        self.assertEqual(len(g), 2)
        self.assertEqual(l[10], 2)
        self.assertAlmostEqual(P.critical_path(g, l, "le"), 4 / 3 * 2 + 2)
        self.assertEqual(P.critical_path(g, l, "unit"), 1)

    def test_loop_detected(self):
        g, l = P.load(netlist([("$_NOT_", [11], 10), ("$_NOT_", [10], 11)], [10]))
        with self.assertRaises(ValueError):
            P.critical_path(g, l)


if __name__ == "__main__":
    unittest.main()
