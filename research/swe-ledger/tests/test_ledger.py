import unittest
from swe_ledger.ledger import *


def run(projects, **kw):
    r = {"projects": projects, "errors": [], "integrity_issues": [], "ci_failures_before_green": None,
         "tests_added": 0, "model": "m", "task": "new-project"}
    r.update(kw)
    return r


class T(unittest.TestCase):
    def test_track_of(self):
        self.assertEqual(track_of("garment-nesting"), "garment")
        self.assertEqual(track_of("alias-twin"), "other")

    def test_wilson_known_value_and_bounds(self):
        lo, hi = wilson(5, 10)
        self.assertAlmostEqual(lo, 0.2366, places=3); self.assertAlmostEqual(hi, 0.7634, places=3)
        self.assertEqual(wilson(0, 0), (0.0, 1.0))
        lo, hi = wilson(10, 10)
        self.assertEqual(hi, 1.0); self.assertGreater(lo, 0.69)

    def test_coverage_counts_non_null(self):
        c = coverage([{"pr": "x", "cost_usd": None}, {"pr": None}])
        self.assertEqual(c["pr"], 0.5); self.assertEqual(c["cost_usd"], 0.0)

    def test_parse_minutes(self):
        self.assertEqual(parse_minutes({"started": "2026-10-14T00:05:00Z", "ended": "2026-10-14T00:30:00Z"}), 25)
        self.assertIsNone(parse_minutes({"started": "2026-10-14T00:05:00Z", "ended": None}))
        self.assertIsNone(parse_minutes({"started": "2026-10-14T01:00:00Z", "ended": "2026-10-14T00:30:00Z"}))

    def test_collision_detected(self):
        s = summarise([run(["chip-a"]), run(["chip-a", "eda-b"])])
        self.assertEqual(s["slugs_in_more_than_one_run"], ["chip-a"])
        self.assertEqual(s["distinct_projects"], 2)

    def test_per_track_tests_only_from_single_track_runs(self):
        p = per_track([run(["chip-a"], tests_added=4), run(["chip-b", "eda-c"], tests_added=9)])
        self.assertEqual(p["chip"]["projects"], 2); self.assertEqual(p["chip"]["tests_added_single_track_runs"], 4)
        self.assertEqual(p["eda"]["tests_added_single_track_runs"], 0)

    def test_families(self):
        f = family_concentration(["garment-twonodea", "garment-twonodeb", "garment-twonodec", "garment-pattern"])
        self.assertEqual(f, {"garment-twon": {"garment-twonodea", "garment-twonodeb", "garment-twonodec"}})
        g = family_concentration(["alias-twin", "beam-twin", "chirp-twin", "chip-x"])
        self.assertEqual(g, {"*-twin": {"alias-twin", "beam-twin", "chirp-twin"}})

    def test_ci_rate_ignores_unknown(self):
        s = summarise([run([], ci_failures_before_green=0), run([], ci_failures_before_green=2), run([])])
        self.assertEqual(s["ci_clean_first_time"]["n"], 2); self.assertEqual(s["ci_clean_first_time"]["k"], 1)


if __name__ == "__main__":
    unittest.main()
