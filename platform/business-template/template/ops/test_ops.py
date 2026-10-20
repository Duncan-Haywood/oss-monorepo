"""Tests for the ops scripts: python3 -m unittest discover -s ops"""
from __future__ import annotations

import json
import random
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import books  # noqa: E402
import check  # noqa: E402
import route  # noqa: E402

WEIGHTS = {"product": 0.5, "marketing": 0.5}


class RouteTest(unittest.TestCase):
    def routing(self, stage="build"):
        return {"stage": stage, "review_every": 3, "weights": {"build": WEIGHTS}}

    def test_intake_always_routes_to_intake(self):
        self.assertEqual(route.choose(self.routing("intake"), [], set(), random.Random(1))[0], "intake")

    def test_review_when_due(self):
        runs = [{"function": "product"}] * 3
        self.assertEqual(route.choose(self.routing(), runs, set(), random.Random(1))[0], "review")

    def test_review_resets_the_count(self):
        runs = [{"function": "product"}] * 3 + [{"function": "review"}]
        self.assertNotEqual(route.choose(self.routing(), runs, set(), random.Random(1))[0], "review")

    def test_skip_removes_a_function(self):
        picks = {route.choose(self.routing(), [], {"product"}, random.Random(s))[0] for s in range(20)}
        self.assertEqual(picks, {"marketing"})

    def test_skipping_everything_still_routes(self):
        pick = route.choose(self.routing(), [], {"product", "marketing"}, random.Random(1))[0]
        self.assertIn(pick, WEIGHTS)


class BooksTest(unittest.TestCase):
    def rows(self, *amounts, account="Expenses:Hosting", source="stmt-1"):
        return [
            {"date": "2026-11-02", "txn": "t1", "account": account if i == 0 else "Assets:Bank",
             "amount": a, "currency": "USD", "memo": "", "source": source}
            for i, a in enumerate(amounts)
        ]

    def test_balanced(self):
        self.assertEqual(books.problems(self.rows("12.00", "-12.00")), [])

    def test_unbalanced(self):
        self.assertIn("sum to 0.01", books.problems(self.rows("12.00", "-11.99"))[0])

    def test_bad_account_and_missing_source(self):
        found = books.problems(self.rows("1", "-1", account="Hosting", source=""))
        self.assertTrue(any("must start with" in p for p in found))
        self.assertTrue(any("no source" in p for p in found))

    def test_pnl_signs(self):
        rows = self.rows("10", "-10") + [
            {"date": "2026-11-03", "txn": "t2", "account": "Income:Sales", "amount": "-50",
             "currency": "USD", "memo": "", "source": "inv-1"},
            {"date": "2026-11-03", "txn": "t2", "account": "Assets:Bank", "amount": "50",
             "currency": "USD", "memo": "", "source": "inv-1"},
        ]
        table = books.pnl(rows, "2026-11")["USD"]
        self.assertEqual(sum(table.values()), 40)


class CheckTest(unittest.TestCase):
    def test_this_repository_passes(self):
        self.assertEqual(check.check(), [])

    def test_duplicate_owner_ids_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "biz"
            shutil.copytree(HERE.parent, root, ignore=shutil.ignore_patterns(".git"))
            owner = root / "OWNER.md"
            owner.write_text(owner.read_text() + "\n- [ ] **dupe** a\n- [ ] **dupe** b\n")
            self.assertTrue(any("duplicate" in p for p in check.check(root)))

    def test_bad_weights_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "biz"
            shutil.copytree(HERE.parent, root, ignore=shutil.ignore_patterns(".git"))
            path = root / "ops" / "routing.json"
            routing = json.loads(path.read_text())
            routing["weights"]["build"] = {"product": 0.9}
            path.write_text(json.dumps(routing))
            self.assertTrue(any("sum to 0.900" in p for p in check.check(root)))


if __name__ == "__main__":
    unittest.main()
