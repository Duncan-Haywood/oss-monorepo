import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import venue_policy

TABLE = """# x
## Open programmes

| Programme | Question | Builds on | Target venue |
|---|---|---|---|
| [`a`](a/PROPOSAL.md) | q | b | Int. J. Fluid Power / Bath-ASME fluid power symposium |
| [`b`](b/PROPOSAL.md) | q | b | *IEEE RA-L* |
| [`c`](c/PROPOSAL.md) | q | b | ICML / NeurIPS workshop |
| [`d`](d/PROPOSAL.md) | q | b | ASME journal or arXiv |
| [`e`](e/PROPOSAL.md) | q | b | Foo Symposium on Bar |
| [`f`](f/PROPOSAL.md) | q | b | a Springer journal / Taylor & Francis journal |

## Next section
| [`z`](z/PROPOSAL.md) | not a programme row | b | IEEE |
"""


class VenuePolicy(unittest.TestCase):
    def setUp(self):
        self.reg = venue_policy.load_register()

    def test_rows_only_from_open_programmes(self):
        self.assertEqual([s for s, _ in venue_policy.programmes(TABLE)], ["a", "b", "c", "d", "e", "f"])

    def test_verdicts(self):
        got = {r["programme"]: r["verdict"] for r in venue_policy.report(TABLE, self.reg)}
        self.assertEqual(got, {"a": "prohibits", "b": "has-disclose", "c": "has-disclose", "d": "has-disclose",
                               "e": "none", "f": "prohibits"})

    def test_register_entries_are_sourced(self):
        for v in self.reg:
            self.assertIn(v["policy"], venue_policy.ORDER)
            if v["policy"] != "unchecked":
                self.assertTrue(v["sources"], v["id"])
                self.assertRegex(v["checked"], r"^\d{4}-\d{2}-\d{2}$")

    def test_unchecked_entries_say_why(self):
        for v in self.reg:
            if v["policy"] == "unchecked":
                self.assertTrue(v["summary"], v["id"])
                self.assertIsNone(v["checked"], v["id"])

    def test_ids_unique(self):
        ids = [v["id"] for v in self.reg]
        self.assertEqual(len(ids), len(set(ids)))

    def test_venue_flag(self):
        self.assertEqual(venue_policy.main(["--venue", "IEEE Access"]), 0)

    def test_real_programmes_parse(self):
        rows = venue_policy.report((venue_policy.RESEARCH / "PROGRAMMES.md").read_text(), self.reg)
        self.assertGreater(len(rows), 10)
        hh = [r for r in rows if r["programme"] == "heavy-hydraulics"]
        self.assertEqual(hh[0]["verdict"], "prohibits")


if __name__ == "__main__":
    unittest.main()
