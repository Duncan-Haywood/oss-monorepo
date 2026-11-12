import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import research_log as rl  # noqa: E402

NEWEST_FIRST = """# Research log: x

Newest first.

## 2026-11-12 · Milestone 6zb: second
- b

## 2026-11-12 · Milestone 6za: first today
- a

## 2026-11-07 · Milestone 6z: older
- z

## 2026-11-03 · Milestone 6y: between
- y

## 2026-11-01 · Milestone 6z: much older, same label
- old
"""

OLDEST_FIRST = """## 2026-10-01 · Session 1: start
- one
## 2026-10-02 · Session 2: next
- two
"""


class Tests(unittest.TestCase):
    def test_newest_first_file(self):
        heads = [e[1] for e in rl.newest(NEWEST_FIRST, 2)]
        self.assertEqual(heads, ["2026-11-12 · Milestone 6zb: second", "2026-11-12 · Milestone 6za: first today"])

    def test_oldest_first_file(self):
        self.assertEqual(rl.newest(OLDEST_FIRST, 1)[0][1], "2026-10-02 · Session 2: next")

    def test_labels(self):
        self.assertEqual(rl.label("2026-11-12 · Milestone 6zp: is it"), ("Milestone", "6zp"))
        self.assertEqual(rl.label("Session 80, 2026-11-12: x"), ("Session", "80"))
        self.assertEqual(rl.label("2026-11-12 · M2 (part): x"), ("M", "2"))
        self.assertIsNone(rl.label("2026-11-12 · Voltage schedule (plan)"))

    def test_bump(self):
        for a, b in [("117", "118"), ("11h", "11i"), ("6zp", "6zq"), ("6z", "6za"), ("7az", "7aza")]:
            self.assertEqual(rl.bump(a), b)

    def test_next_free_skips_used(self):
        self.assertEqual(rl.next_free("11a", {"11a", "11b", "11c"}), "11d")

    def test_report(self):
        out = rl.labels_report(NEWEST_FIRST)
        self.assertIn("newest label: Milestone 6zb (2026-11-12)", out)
        self.assertIn("next free:    Milestone 6zc", out)
        self.assertIn("reused:       6z on 2026-11-01, 2026-11-07", out)

    def test_ref_labels_count(self):
        main = "## 2026-11-12 · Milestone 6zc: landed on main by a sibling\n"
        out = rl.labels_report(NEWEST_FIRST, main)
        self.assertIn("next free:    Milestone 6zd", out)

    def test_milestone_in_parts_not_a_reuse(self):
        t = ("## 2026-11-12 · M2 (part): c\n## 2026-11-07 · M2 (part): b\n"
             "## 2026-11-01 · M2 (part): a\n## 2026-10-20 · M1: start\n")
        self.assertEqual(rl.reuses([e[1] for e in rl.entries(t)]), {})

    def test_plan_and_outcome_not_a_reuse(self):
        t = "## 2026-11-12 · Milestone 5d outcome\n## 2026-11-11 · Milestone 5d plan\n"
        self.assertEqual(rl.reuses([e[1] for e in rl.entries(t)]), {})


if __name__ == "__main__":
    unittest.main()
