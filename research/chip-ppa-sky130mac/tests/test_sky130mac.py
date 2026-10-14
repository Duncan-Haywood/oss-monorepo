import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
from chip_ppa_sky130mac import flow, gens

REF = os.path.join(HERE, "..", "designs", "mac4.v")
PROP = os.path.join(HERE, "..", "proposals", "mac4")
PDK = os.path.join(HERE, "..", "pdk")
LIB = os.path.join(PDK, flow.LIB_REL)
need_pdk = unittest.skipUnless(os.path.exists(LIB), "run `sh fetch_pdk.sh pdk` first")


class RtlTest(unittest.TestCase):
    def test_gate_accepts_good_proposals_and_rejects_seeded_fault(self):
        for n in ("p0_csa", "p1_flat_sum", "p2_balanced_tree"):
            self.assertTrue(flow.equivalent(REF, "mac4", f"{PROP}/{n}.v", "mac4"), n)
        self.assertFalse(flow.equivalent(REF, "mac4", f"{PROP}/p3_dropped_carry_bug.v", "mac4"))

    def test_all_sweep_configs_are_rtl_equivalent(self):
        with tempfile.TemporaryDirectory() as d:
            for cfg in gens.mac4_config_space():
                f = os.path.join(d, "m.v")
                open(f, "w").write(gens.gen_mac4(*cfg))
                self.assertTrue(flow.equivalent(REF, "mac4", f, "mac4"), cfg)

    def test_generic_score_counts_post_abc_cells(self):
        # chip-ppa-mac reports 116 cells, depth 17 for the reference under `strash; map`
        self.assertEqual(flow.generic_score(REF, "mac4", "strash_map"), {"cells": 116, "depth": 17})

    def test_spearman_helper(self):
        import run
        self.assertAlmostEqual(run.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1.0)
        self.assertAlmostEqual(run.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1.0)
        self.assertEqual(run.ranks([5, 5, 1]), [2.5, 2.5, 1.0])


@need_pdk
class MapTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = tempfile.mkdtemp()
        cls.lib = os.path.join(cls.d, "f.lib")
        flow.filtered_liberty(LIB, cls.lib)

    def test_filter_drops_dont_use_cells(self):
        text = open(self.lib).read()
        self.assertNotIn("sky130_fd_sc_hd__lpflow_", text)
        self.assertIn("sky130_fd_sc_hd__nand2_1", text)

    def test_mapped_netlist_equivalent_for_every_script(self):
        for s in flow.SCRIPTS:
            r, ok = flow.map_checked(REF, "mac4", REF, "mac4", s, self.lib)
            self.assertTrue(ok, s)
            self.assertGreater(r["area_um2"], 0)
            self.assertGreater(r["delay_ps"], 0)

    def test_mapped_faulty_design_fails_equivalence(self):
        _, ok = flow.map_checked(REF, "mac4", f"{PROP}/p3_dropped_carry_bug.v", "mac4", "dc2_map", self.lib)
        self.assertFalse(ok)

    def test_area_matches_abc_report(self):
        r = flow.map_sky130(REF, "mac4", "dch_map", self.lib)
        self.assertAlmostEqual(r["area_um2"], r["abc_area"], delta=0.05)


if __name__ == "__main__":
    unittest.main()
