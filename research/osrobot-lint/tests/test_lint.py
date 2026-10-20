import sys, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "src"), str(HERE.parents[1] / "osrobot-lab" / "src"), str(HERE.parents[1] / "osrobot-labreal" / "src")]
from osrobot_lint import lint

HEAD = '''metadata = {"apiLevel": "2.19"}
def run(p):
    tips = p.load_labware("opentrons_96_tiprack_300ul", 1)
    plate = p.load_labware("corning_96_wellplate_360ul_flat", 2)
    res = p.load_labware("nest_12_reservoir_15ml", 3)
    pip = p.load_instrument("p300_single_gen2", "right", tip_racks=[tips])
'''


def codes(body, head=HEAD):
    return sorted({f.code for f in lint(head + body) if f.code != "SKIPPED"})


class Lint(unittest.TestCase):
    def test_idiomatic_loop_is_clean(self):
        body = '''    for i, col in enumerate(range(1, 4)):
        pass
'''
        # enumerate is not supported: skipped, not flagged
        fs = lint(HEAD + body)
        self.assertEqual([f.code for f in fs], ["SKIPPED"])

    def test_loop_over_columns_clean(self):
        body = '''    for c in range(1, 5):
        pip.pick_up_tip()
        pip.aspirate(100, res["A1"])
        pip.dispense(100, plate[f"A{c}"])
        pip.drop_tip()
'''
        self.assertEqual(codes(body), [])

    def test_reused_tip(self):
        body = '''    pip.pick_up_tip(tips["A1"])
    pip.drop_tip()
    pip.pick_up_tip(tips["A1"])
    pip.drop_tip()
'''
        self.assertEqual(codes(body), ["TIP_REUSED"])

    def test_next_tip_is_not_reuse(self):
        body = '''    for i in range(3):
        pip.pick_up_tip()
        pip.drop_tip()
    pip.pick_up_tip(tips.wells()[3])
    pip.drop_tip()
'''
        self.assertEqual(codes(body), [])
        self.assertEqual(codes(body.replace("[3]", "[2]")), ["TIP_REUSED"])

    def test_tip_left_on(self):
        self.assertEqual(codes("    pip.pick_up_tip()\n"), ["TIP_LEFT"])

    def test_sub_minimum_volume(self):
        body = '''    pip.pick_up_tip()
    pip.aspirate(50, res["A1"])
    pip.dispense(5, plate["A1"])
    pip.drop_tip()
'''
        self.assertEqual(codes(body), ["VOLUME_RANGE"])

    def test_declared_volume_overdraw(self):
        head = HEAD + '''    s = p.define_liquid(name="s", description="", display_color="#336699")
    plate["A1"].load_liquid(s, 300)
'''
        body = '''    pip.pick_up_tip()
    pip.aspirate(200, plate["A1"])
    pip.dispense(200, plate["B1"])
    pip.drop_tip()
    pip.pick_up_tip()
    pip.aspirate(200, plate["A1"])
    pip.dispense(200, plate["C1"])
    pip.drop_tip()
'''
        self.assertEqual(codes(body, head), ["SOURCE_EMPTY"])
        self.assertEqual(codes(body), [])      # undeclared: no volume to check

    def test_carry_over_between_liquids(self):
        head = HEAD + '''    a = p.define_liquid(name="a", description="", display_color="#336699")
    b = p.define_liquid(name="b", description="", display_color="#993366")
    plate["A1"].load_liquid(a, 200)
    plate["B1"].load_liquid(b, 200)
'''
        body = '''    pip.pick_up_tip()
    pip.aspirate(50, plate["A1"])
    pip.dispense(50, res["A1"])
    pip.aspirate(50, plate["B1"])
    pip.dispense(50, res["A2"])
    pip.drop_tip()
'''
        self.assertEqual(codes(body, head), ["CARRY_OVER"])

    def test_overflow(self):
        body = '''    for i in range(2):
        pip.pick_up_tip()
        pip.aspirate(300, res["A1"])
        pip.dispense(300, plate["A1"])
        pip.drop_tip()
'''
        self.assertEqual(codes(body), ["OVERFLOW"])

    def test_bad_references(self):
        self.assertEqual(codes('    pip.pick_up_tip()\n    pip.aspirate(50, plate["A13"])\n    pip.drop_tip()\n'), ["BAD_REFERENCE"])

    def test_unsupported_call_is_skipped_and_quiet(self):
        body = '''    pip.transfer(50, res["A1"], plate["A1"])
    pip.pick_up_tip()
    pip.drop_tip()
'''
        fs = lint(HEAD + body)
        self.assertEqual([f.code for f in fs], ["SKIPPED"])

    def test_skipped_pick_up_does_not_cause_false_no_tip(self):
        body = '''    pip.pick_up_tip(some_function())
    pip.aspirate(50, res["A1"])
    pip.drop_tip()
'''
        self.assertEqual(codes(body), [])

    def test_twin_clean_protocols(self):
        from osrobot_lab.protocols import PROTOCOLS
        from osrobot_labreal.translate import script
        for name, f in PROTOCOLS.items():
            deck, init, cmds = f()
            self.assertEqual([x for x in lint(script(deck, init, cmds)) if x.code != "SKIPPED"], [], name)


if __name__ == "__main__":
    unittest.main()
