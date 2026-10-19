import json, os, random, sys, unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import evade  # noqa: E402


class EvadeTests(unittest.TestCase):
    def test_preamble_and_markdown(self):
        self.assertEqual(evade.e_preamble("Sure! Here is a poem:\nRoses", None), "Roses")
        self.assertEqual(evade.e_nomd("**Hi**\n- item\n1. two", None), "Hi\nitem\ntwo")

    def test_contractions_and_half(self):
        self.assertEqual(evade.e_contract("It is fine, we do not mind", None), "it's fine, we don't mind")
        self.assertEqual(evade.e_half("abcdef", None), "abc")

    def test_typos_seeded_and_rate(self):
        t = "the quick brown fox " * 200
        a = evade.e_typos(t, random.Random(1)); b = evade.e_typos(t, random.Random(1))
        self.assertEqual(a, b)
        self.assertNotEqual(a, t)

    def test_apply_edits_only_machine(self):
        its = [{"label": "human", "text": "ABC"}, {"label": "llm", "text": "ABC"}]
        out = evade.apply(its, evade.e_lower, 0)
        self.assertEqual([o["text"] for o in out], ["ABC", "abc"])

    def test_committed_results(self):
        r = json.load(open(os.path.join(HERE, "results.json")))
        self.assertEqual(set(r["edits"]), set(evade.EDITS))
        self.assertAlmostEqual(r["baseline"]["auroc"], 0.927, places=2)


if __name__ == "__main__":
    unittest.main()
