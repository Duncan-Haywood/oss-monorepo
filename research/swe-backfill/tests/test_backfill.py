import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_backfill.backfill import *


def C(h, t, subj, **slugs):
    return {"hash": h, "time": t, "subject": subj,
            "slugs": {s: {"A": a, "M": m, "D": 0, "tests_A": ta} for s, (a, m, ta) in slugs.items()}}


COMMITS = [
    C("a1", "2026-10-01T10:00:00Z", "alpha", **{"garment-a": (3, 0, 1)}),
    C("a2", "2026-10-02T10:00:00Z", "garment-a: fix wrong number", **{"garment-a": (0, 2, 0)}),
    C("b1", "2026-10-01T12:00:00Z", "beta", **{"chip-b": (2, 0, 1)}),
    C("c1", "2026-10-30T10:00:00Z", "late project", **{"swe-c": (2, 0, 2)}),
    C("d1", "2026-10-01T09:00:00Z", "edit only", **{"foo-twin": (0, 1, 0)}),
]


class T(unittest.TestCase):
    def test_wilson(self):
        lo, hi = wilson(50, 100)
        self.assertAlmostEqual(lo, 0.4038, 3); self.assertAlmostEqual(hi, 0.5962, 3)
        self.assertEqual(wilson(0, 0), (0.0, 1.0))
        lo, hi = wilson(0, 10); self.assertEqual(lo, 0.0); self.assertGreater(hi, 0.25)

    def test_track(self):
        self.assertEqual(track_of("garment-x"), "garment")
        self.assertEqual(track_of("sim-twin"), "other")

    def test_projects_created_and_tests(self):
        p = projects(COMMITS)
        self.assertEqual(p["garment-a"]["created"]["hash"], "a1")
        self.assertEqual(p["garment-a"]["tests"], 1)
        self.assertEqual(len(p["garment-a"]["commits"]), 2)
        self.assertEqual(p["foo-twin"]["created"]["hash"], "d1")  # fallback: first touch

    def test_per_day_and_track(self):
        p = projects(COMMITS)
        self.assertEqual(per_day(p)["2026-10-01"], 3)
        self.assertEqual(per_track(p)["garment"]["commits"], 2)

    def test_fix_regex(self):
        self.assertTrue(FIX_RE.search("Fix numbers")); self.assertFalse(FIX_RE.search("prefix suffix"))
        self.assertTrue(FIX_RE.search("garment: corrected the interval"))

    def test_later_touches_and_censoring(self):
        rows = later_touches(projects(COMMITS))
        self.assertEqual(rows["garment-a"]["later"], 1); self.assertEqual(rows["garment-a"]["fixes"], 1)
        self.assertFalse(rows["garment-a"]["censored"])
        self.assertTrue(rows["swe-c"]["censored"])
        r = correction_rate(rows)
        self.assertEqual((r["k"], r["n"]), (1, 3))  # swe-c censored out
        self.assertEqual(correction_rate(rows, observed_only=False)["n"], 4)

    def test_window_excludes_late_touch(self):
        cs = COMMITS + [C("a3", "2026-10-25T10:00:00Z", "fix again", **{"garment-a": (0, 1, 0)})]
        rows = later_touches(projects(cs))
        self.assertEqual(rows["garment-a"]["later"], 1)  # a3 is 24 days after creation

    def test_families_and_close_pairs(self):
        cs = [C(f"x{i}", f"2026-10-01T1{i}:00:00Z", "n", **{f"garment-twonode{n}": (1, 0, 0)})
              for i, n in enumerate(["a", "b", "c"])]
        p = projects(cs)
        fams = followup_families(p)
        self.assertIn("garment-twon", fams)
        self.assertEqual(len(fams["garment-twon"]), 3)
        self.assertEqual(len(same_stem_close(p, fams, 90)), 2)
        self.assertEqual(len(same_stem_close(p, fams, 30)), 0)

    def test_log_gap_and_gaps(self):
        p = projects(COMMITS)
        g = log_gap(p, ["chip-b", "zzz"])
        self.assertEqual(g["in_log_not_git"], ["zzz"]); self.assertEqual(g["both"], 1)
        self.assertEqual(median([3, 1, 2]), 2); self.assertEqual(median([1, 2]), 1.5)
        self.assertEqual(len(creation_gaps(p)), 3)


if __name__ == "__main__":
    unittest.main()
