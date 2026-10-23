import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_allyrecent import simulate, tipped  # noqa: E402

K = dict(n=100, rounds=300)


class Watch(unittest.TestCase):
    def test_seeded_runs_repeat(self):
        self.assertEqual(simulate(seed=3, fade="watch", c=0.05, **K), simulate(seed=3, fade="watch", c=0.05, **K))

    def test_no_fade_keeps_all_allies_and_tips(self):
        for mode in ("const", "watch"):
            r = simulate(rho=0.0, sl=0.4, c=0.0, fade=mode, seed=1, **K)
            self.assertEqual(r["allies_left"], 40)
            self.assertTrue(tipped(r))

    def test_const_matches_allyfade_when_c_zero_no_allies(self):
        r = simulate(rho=0.0, sl=0.0, seed=1, **K)
        self.assertFalse(tipped(r))

    def test_watch_fades_slower_than_const_once_crowd_is_L(self):
        # with robots tipping the crowd early, allies who watch L stay; constant fading removes them
        w = [simulate(rho=0.2, sl=0.2, c=0.05, fade="watch", seed=s, **K)["allies_left"] for s in range(6)]
        k = [simulate(rho=0.2, sl=0.2, c=0.05, fade="const", seed=s, **K)["allies_left"] for s in range(6)]
        self.assertGreater(sum(w), sum(k))

    def test_k_equals_m_matches_allywatch(self):
        # with k = m the look-back is the whole memory: identical streams to society-allywatch
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "society-allywatch" / "src"))
        from society_allywatch import simulate as old
        for s in range(3):
            self.assertEqual(simulate(rho=0.2, sl=0.2, c=0.05, fade="watch", k=9, seed=s, **K),
                             old(rho=0.2, sl=0.2, c=0.05, fade="watch", seed=s, **K))
        a = simulate(rho=0.2, sl=0.2, c=0.05, fade="watch", k=1, seed=4, **K)
        self.assertNotEqual(a, simulate(rho=0.2, sl=0.2, c=0.05, fade="watch", k=9, seed=4, **K))

    def test_zero_c_never_fades_for_any_k(self):
        for k in (1, 3, 9):
            self.assertEqual(simulate(c=0.0, fade="watch", k=k, seed=2, **K)["allies_left"], 19)  # round(0.2 * 95 humans)

    def test_certain_fade_empties_the_bloc(self):
        r = simulate(sl=0.2, c=1.0, fade="const", seed=2, **K)
        self.assertEqual(r["allies_left"], 0)


if __name__ == "__main__":
    unittest.main()
