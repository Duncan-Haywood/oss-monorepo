import sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from chip_ppa_logic import flow, sweep  # noqa: E402

SPACES = {"pop16": (sweep.pop16_config_space, sweep.gen_pop16),
          "clz16": (sweep.clz16_config_space, sweep.gen_clz16),
          "absd8": (sweep.absd8_config_space, sweep.gen_absd8)}


class Tests(unittest.TestCase):
    def test_every_sweep_config_is_equivalent(self):
        tmp = Path(tempfile.mkdtemp())
        for d, (space, gen) in SPACES.items():
            for cfg in space():
                f = tmp / f"{d}.v"
                f.write_text(gen(*cfg))
                self.assertTrue(flow.equivalent(ROOT / "designs" / f"{d}.v", d, f, d), (d, cfg))

    def test_gate_rejects_seeded_faults(self):
        for d, name in (("pop16", "p3_wrong_bug"), ("clz16", "c3_bug_noZero"), ("absd8", "d3_bug_ones_comp")):
            f = ROOT / "proposals" / d / f"{name}.v"
            self.assertFalse(flow.equivalent(ROOT / "designs" / f"{d}.v", d, f, d), name)

    def test_gate_accepts_rom_inferred_table(self):
        # a constant case table becomes a ROM; without memory_map the gate used to reject it
        f = ROOT / "proposals" / "pop16" / "p1_nibble_case.v"
        self.assertTrue(flow.equivalent(ROOT / "designs" / "pop16.v", "pop16", f, "pop16"))

    def test_all_other_proposals_are_equivalent(self):
        bugs = {"p3_wrong_bug", "c3_bug_noZero", "d3_bug_ones_comp"}
        for d in SPACES:
            for f in (ROOT / "proposals" / d).glob("*.v"):
                if f.stem not in bugs:
                    self.assertTrue(flow.equivalent(ROOT / "designs" / f"{d}.v", d, f, d), f.name)

    def test_score_is_deterministic_and_positive(self):
        a = flow.score(ROOT / "designs" / "absd8.v", "absd8")
        self.assertEqual(a, flow.score(ROOT / "designs" / "absd8.v", "absd8"))
        self.assertGreater(a["cells"], 0)


if __name__ == "__main__":
    unittest.main()
