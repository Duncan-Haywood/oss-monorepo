"""portfolio/smb/suites.yaml: every row is well formed and names real ventures.

    python3 -m pytest portfolio/smb/test_suites.py
"""

from __future__ import annotations

import unittest
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
VENTURES = HERE.parent.parent / "ventures"
FIELDS = {"suite", "tier", "serves", "home", "builds_on", "next"}


def load() -> list[dict]:
    return yaml.safe_load((HERE / "suites.yaml").read_text())["suites"]


class SuitesTest(unittest.TestCase):
    def test_rows_have_the_fields_and_values(self):
        rows = load()
        self.assertTrue(rows)
        ids = [r["suite"] for r in rows]
        self.assertEqual(len(ids), len(set(ids)), "duplicate suite ids")
        for r in rows:
            self.assertEqual(set(r), FIELDS, r.get("suite"))
            self.assertIn(r["tier"], {"revenue", "cost"}, r["suite"])
            self.assertIn(r["serves"], {"business", "nonprofit", "parish"}, r["suite"])
            self.assertTrue(str(r["next"]).strip(), r["suite"])

    def test_revenue_suites_come_before_cost_suites(self):
        # The owner, 2026-11-21: revenue first, "then secondarily for cost reducing things".
        tiers = [r["tier"] for r in load()]
        self.assertEqual(tiers, sorted(tiers, key=["revenue", "cost"].index))

    def test_named_ventures_exist(self):
        for r in load():
            for v in ([r["home"]] if r["home"] else []) + list(r["builds_on"]):
                self.assertTrue((VENTURES / v).is_dir(), f"{r['suite']}: ventures/{v} missing")


if __name__ == "__main__":
    unittest.main()
