import os, sys, unittest
from datetime import datetime, timedelta
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_pickmix import analysis as a

T0 = datetime(2026, 10, 14, 12, 0)


def unit(t, s, e):
    return (t, T0 + timedelta(minutes=s), T0 + timedelta(minutes=e), (s, e, t))


class T(unittest.TestCase):
    def test_track(self):
        self.assertEqual(a.track("swe-audit"), "swe")
        self.assertIsNone(a.track("blur-twin"))
        self.assertIsNone(a.track("free-thing"))

    def test_wilson_contains_p(self):
        lo, hi = a.wilson(5, 20)
        self.assertLess(lo, 0.25)
        self.assertGreater(hi, 0.25)
        self.assertEqual(a.wilson(0, 0), (0.0, 0.0))

    def test_overlap_pairs(self):
        sp = [unit("swe", 0, 10), unit("chip", 5, 20), unit("swe", 30, 40), unit("eda", 35, 50)]
        self.assertEqual(sorted(a.overlap_pairs(sp)), [(0, 1), (2, 3)])

    def test_same_track_share(self):
        sp = [unit("swe", 0, 10), unit("swe", 5, 20), unit("chip", 8, 9)]
        pairs = a.overlap_pairs(sp)
        self.assertEqual(len(pairs), 3)
        self.assertAlmostEqual(a.same_track_share(sp, pairs), 1 / 3)

    def test_expected_same(self):
        sp = [unit("swe", 0, 1), unit("swe", 2, 3), unit("chip", 4, 5), unit("chip", 6, 7)]
        p_emp, p_uni = a.expected_same(sp)
        self.assertAlmostEqual(p_emp, 4 / 12)  # 2 swe ordered pairs + 2 chip over 4*3
        self.assertAlmostEqual(p_uni, 1 / 11)

    def test_permutation_detects_herding_and_not_noise(self):
        herd = [unit("swe" if i < 20 else "chip", i, i + 1.5) for i in range(40)]  # neighbours overlap, share a track
        _, p = a.permutation_p(herd, a.overlap_pairs(herd), reps=2000)
        self.assertLess(p, 0.01)
        import random
        rng = random.Random(5)
        noise = [unit(rng.choice(a.TRACKS), i, i + 3) for i in range(60)]
        _, p2 = a.permutation_p(noise, a.overlap_pairs(noise), reps=2000)
        self.assertGreater(p2, 0.05)

    def test_block_permutation_ignores_drift(self):
        # early half is all swe, late half all chip; neighbours overlap. Unblocked looks like herding, blocked does not.
        drift = [unit("swe" if i < 30 else "chip", i, i + 1.5) for i in range(60)]
        pairs = a.overlap_pairs(drift)
        _, p_plain = a.permutation_p(drift, pairs, reps=1000)
        _, p_block = a.permutation_p(drift, pairs, reps=1000, block=lambda u: 0 if u[1] < T0 + timedelta(minutes=30) else 1)
        self.assertLess(p_plain, 0.01)
        self.assertGreater(p_block, 0.5)

    def test_chi2_uniform_counts_not_rejected_skew_rejected(self):
        u = [1 / 4] * 4
        self.assertGreater(a.chi2_mc_p([25, 25, 25, 25], u, reps=2000), 0.9)
        self.assertLess(a.chi2_mc_p([70, 10, 10, 10], u, reps=2000), 0.01)

    def test_spans_skip_untracked_and_dedupe_prs(self):
        mk = lambda s, f, m: {"slug": s, "merged": datetime.fromisoformat(m), "first": datetime.fromisoformat(f) if f else None, "commits": 1}
        rows = [mk("swe-a", "2026-10-14T10:00:00", "2026-10-14T11:00:00"), mk("swe-b", "2026-10-14T10:00:00", "2026-10-14T11:00:00"),
                mk("blur-twin", "2026-10-14T10:00:00", "2026-10-14T11:00:00"), mk("chip-a", None, "2026-10-14T11:00:00"),
                mk("chip-old", "2026-10-01T10:00:00", "2026-10-01T11:00:00")]
        self.assertEqual(len(a.spans(rows)), 1)

    def test_load_real_data(self):
        rows = a.load(os.path.join(os.path.dirname(__file__), "..", "data", "projects.tsv"))
        self.assertGreater(len(rows), 400)
        self.assertEqual(len({r["slug"] for r in rows}), len(rows))


if __name__ == "__main__":
    unittest.main()
