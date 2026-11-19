"""Tests for paper/cost.py and paper/figures.py (milestone 7j)."""
import importlib.util
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, HERE / "paper" / file)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


c = load("paper_cost", "cost.py")
f = load("paper_figures", "figures.py")


class Cost(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = c.main()

    def test_time_share_identities(self):
        # U50 against itself costs exactly 1; a triage rule flagging everyone costs U50 when continued.
        self.assertAlmostEqual(c.time_share(50, 5.0, uniform=True)["continue"], 1.0)
        t = c.time_share(50, 5.0)
        self.assertAlmostEqual(t["flag_share"], 1.0)
        self.assertAlmostEqual(t["continue"], 1.0)
        # restart with everyone flagged pays the fixed cost and ten cycles twice
        self.assertAlmostEqual(t["restart"], (5 + 10 + 5 + 50) / 55)
        # flag nobody: ten cycles per design either way
        t0 = c.time_share(10, 5.0)
        self.assertAlmostEqual(t0["continue"], t0["restart"])
        self.assertAlmostEqual(t0["flag_share"], 0.0)

    def test_breakeven_is_where_restart_equals_u50(self):
        for fc in (0.0, 2.63, 5.66):
            be = c.breakeven(fc)
            cycles = 10 + 40 * be
            self.assertAlmostEqual(c.time_share(cycles, fc)["restart"], 1.0)
        self.assertAlmostEqual(c.breakeven(0.0), 0.8)

    def test_fixed_cost_measured_on_paired_runs(self):
        fc = self.out["fixed_cost_cycles"]
        self.assertEqual(fc["n"], 192)
        self.assertTrue(4.0 < fc["median"] < 7.0)
        self.assertLess(fc["q25"], fc["median"])
        self.assertLess(fc["median"], fc["q75"])
        fh = self.out["fixed_cost_cycles_horizon"]
        self.assertEqual(fh["n"], 49)
        self.assertTrue(0 < fh["median"] < fc["median"])

    def test_seconds_per_run_counts(self):
        spr = self.out["seconds_per_run"]
        self.assertEqual(set(spr), set(c.SETS))
        self.assertEqual(sum(v["n"] for v in spr.values()), 96)

    def test_continue_saving_below_cycle_saving(self):
        for x in self.out["looks"]:
            if x["rule"] == "U" or x["cycles"] >= 50:
                continue
            self.assertLess(x["time_saved_continue"], x["cycles_saved"])
            self.assertLess(x["time_saved_restart"], x["time_saved_continue"])

    def test_pooled_numbers(self):
        p = self.out["pooled_fresh"]
        self.assertAlmostEqual(p["cycles"], 40.46875)
        self.assertAlmostEqual(p["flag_share"], (40.46875 - 10) / 40)
        self.assertGreater(p["time_saved_continue"], 0.15)
        self.assertLess(p["time_saved_restart"], 0.0)


class Figures(unittest.TestCase):
    def test_figures_render_from_tables(self):
        out = f.main()
        self.assertEqual(set(out), {"fig1_insample.svg", "fig2_outofbatch.svg", "fig3_time.svg"})
        tab = json.loads((HERE / "paper" / "tables.json").read_text())
        self.assertEqual(out["fig2_outofbatch.svg"].count("<circle") - 4, len(tab["out_of_batch"]))
        for text in out.values():
            self.assertTrue(text.startswith("<svg"))
            self.assertIn("prefers-color-scheme: dark", text)


if __name__ == "__main__":
    unittest.main()
