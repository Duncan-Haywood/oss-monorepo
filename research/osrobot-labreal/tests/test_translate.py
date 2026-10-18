import sys, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "src"), str(HERE.parents[1] / "osrobot-lab" / "src")]
from osrobot_lab.protocols import PROTOCOLS
from osrobot_labreal.translate import script, LOAD_NAME

try:
    import opentrons  # noqa: F401
    from osrobot_labreal.sim import simulate, classify
    HAVE_OT = True
except ImportError:
    HAVE_OT = False


class Translate(unittest.TestCase):
    def test_script_is_valid_python_with_run_function(self):
        for name, f in PROTOCOLS.items():
            src = script(*f())
            compile(src, name, "exec")
            self.assertIn("def run(p):", src)

    def test_one_call_per_command(self):
        d, i, c = PROTOCOLS["replicate_plate"]()
        src = script(d, i, c)
        self.assertEqual(src.count("pip.pick_up_tip("), 8)
        self.assertEqual(src.count("pip.aspirate("), 8)
        self.assertEqual(src.count("pip.dispense("), 8)
        self.assertEqual(src.count("pip.drop_tip()"), 8)

    def test_every_labware_kind_has_a_load_name(self):
        for f in PROTOCOLS.values():
            for lw in f()[0]:
                self.assertIn(lw.kind, LOAD_NAME)

    def test_liquids_declared_only_on_request(self):
        d, i, c = PROTOCOLS["serial_dilution"]()
        self.assertIn("load_liquid", script(d, i, c, True))
        self.assertNotIn("load_liquid", script(d, i, c, False))

    def test_unknown_op_is_refused(self):
        d, i, c = PROTOCOLS["master_mix"]()
        with self.assertRaises(ValueError):
            script(d, i, c + [dict(op="mix")])


@unittest.skipUnless(HAVE_OT, "opentrons==8.0.0 not installed")
class RealSimulator(unittest.TestCase):
    def test_clean_protocols_simulate(self):
        for name, f in PROTOCOLS.items():
            ok, text = simulate(script(*f()))
            self.assertTrue(ok, f"{name}: {text}")

    def test_overdraw_is_rejected(self):
        d, i, c = PROTOCOLS["replicate_plate"]()
        c = [dict(x) for x in c]
        c[1]["vol"] = 5000.0
        ok, text = simulate(script(d, i, c))
        self.assertFalse(ok)
        self.assertEqual(classify(text), "InvalidAspirateVolumeError")


if __name__ == "__main__":
    unittest.main()
