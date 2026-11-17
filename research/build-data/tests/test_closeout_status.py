"""Session 92: src/closeout_status.py's summaries (offline; the SoQL queries are not called)."""
import os, sys, unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
import closeout_status as cs  # noqa: E402


class TestCloseoutStatus(unittest.TestCase):
    def test_summarise_merges_case_and_blank(self):
        rows = [dict(status="Expired", n="6"), dict(status="expired", n="2"), dict(n="2")]
        s = cs.summarise(rows, "status")
        self.assertEqual(s["total"], 10)
        self.assertEqual(s["share"], {"expired": 0.8, "(blank)": 0.2})

    def test_by_year(self):
        rows = [dict(y="2020", st="Issued", n="3"), dict(y="2020", st="Expired", n="1"),
                dict(y="2021.0", st="Issued", n="2")]
        b = cs.by_year(rows, "st")
        self.assertEqual(list(b), ["2020", "2021"])
        self.assertEqual(b["2020"]["n"], 4)
        self.assertEqual(b["2020"]["share"]["issued"], 0.75)

    def test_queries_name_each_feeds_fields(self):
        for c, f in cs.FEEDS.items():
            q = cs.queries(f)
            self.assertIn(f["status"], q["by_status_never_completed"]["$select"])
            self.assertIn(f"{f['completed']} IS NULL", q["by_year_status_never"]["$where"])
            self.assertTrue(cs.url(f, q["by_status_completed"]).startswith(f"https://{f['host']}/resource/"))


if __name__ == "__main__":
    unittest.main()
