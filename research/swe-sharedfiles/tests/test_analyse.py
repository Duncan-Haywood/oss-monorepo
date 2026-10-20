import unittest
from swe_sharedfiles.analyse import shared_times, gaps_minutes, exposure, mean_moves, share, SHARED

R, P = SHARED


class T(unittest.TestCase):
    rows = [(0, "a", {R}), (600, "b", {"research/x/a.py"}), (1200, "c", {P}), (7200, "d", {R, P})]

    def test_shared_times(self):
        self.assertEqual(shared_times(self.rows), [0, 1200, 7200])

    def test_gaps(self):
        self.assertEqual(gaps_minutes([0, 1200, 7200]), [20, 100])

    def test_exposure_windows(self):
        ts = [0, 1200, 7200]
        self.assertEqual(exposure(ts, 10), 0)            # nobody within 10 min before
        self.assertAlmostEqual(exposure(ts, 20), 1 / 3)  # 1200 sees 0 exactly 20 min before
        self.assertAlmostEqual(exposure(ts, 120), 2 / 3)

    def test_window_is_half_open(self):
        self.assertEqual(exposure([0, 0], 5), 0)  # same-second ties are not "before"

    def test_mean_moves(self):
        self.assertAlmostEqual(mean_moves([0, 60, 120], 5), (0 + 1 + 2) / 3)

    def test_share(self):
        self.assertEqual(share(self.rows, R), 0.5)
        self.assertEqual(share(self.rows, P), 0.5)


if __name__ == "__main__":
    unittest.main()


class GitReplay(unittest.TestCase):
    def test_conflict_and_clean(self):
        import subprocess, tempfile, os
        from swe_sharedfiles.analyse import conflicts, replay_conflict_rate
        with tempfile.TemporaryDirectory() as d:
            def g(*a):
                return subprocess.run(["git", "-C", d, "-c", "user.name=t", "-c", "user.email=t@t", *a],
                                      check=True, capture_output=True, text=True).stdout.strip()
            def commit(name, text, msg):
                open(os.path.join(d, name), "w").write(text)
                g("add", "."); g("commit", "-qm", msg); return g("rev-parse", "HEAD")
            g("init", "-q")
            commit("f", "one\ntwo\nthree\n", "base")
            a = commit("f", "ONE\ntwo\nthree\n", "a")       # edits line 1
            b = commit("f", "ONE\ntwo\nTHREE\n", "b")       # edits line 3: clean against a
            c = commit("f", "uno\ntwo\nTHREE\n", "c")       # edits line 1 again: conflicts with a
            self.assertEqual(conflicts(a, b, d), set())
            self.assertEqual(conflicts(a, c, d), {"f"})
            # pairs (a,b) clean, (b,c) clean (c's line-1 edit and b's line-3 edit are apart), (a,c) conflict
            tot, bad, sh = replay_conflict_rate([(1, a), (2, b), (3, c)], 10, d)
            self.assertEqual((tot, bad), (3, 1))
