import json, pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "src"))
from robofab_cell_fesc.ctmc import throughput
from robofab_cell_fesc.fesc import subsystem_rate, fesc_rate
from robofab_cell_fesc.mva import mva


class TestFesc(unittest.TestCase):
    def test_single_job_subsystem_rate(self):
        h, _ = subsystem_rate(1, 2, 3, 20, 2, 2)
        self.assertAlmostEqual(h, 1 / 24, places=9)

    def test_subsystem_rate_saturates_at_arm_capacity(self):
        h, _ = subsystem_rate(12, 4, 1, 1, 2, 2)           # tiny print time: the arm (4 min/part) limits
        self.assertAlmostEqual(h, 0.25, delta=0.01)

    def test_one_job_matches_exact_chain(self):
        r, _ = fesc_rate(1, 2, 3, 20, 2, 2, 3, q=0.25)
        self.assertAlmostEqual(r, throughput(1, 2, 3, 20, 2, 2, 3, 0.25)[0], places=9)

    def test_close_but_not_exact_for_one_printer(self):
        # Load, print and unload in series is not product form, so the decomposition is only close.
        for N in (2, 3, 5):
            exact = throughput(N, 1, 1, 20, 2, 2, 3)[0]
            err = abs(fesc_rate(N, 1, 1, 20, 2, 2, 3)[0] - exact) / exact
            self.assertLess(err, 0.02)

    def test_beats_plain_mva_where_printers_queue(self):
        N, P = 8, 4
        exact = throughput(N, P, 1, 20, 2, 2, 3)[0]
        plain = mva([4.0, 20.0, 3.0], [1, P, 1], N)[0]
        self.assertLess(abs(fesc_rate(N, P, 1, 20, 2, 2, 3)[0] - exact), abs(plain - exact))

    def test_birth_death_step_matches_hand_solution(self):
        # Two jobs: the birth-death chain on m = jobs at inspection has states 0, 1, 2 with
        # p1 = p0 H(2)/mu and p2 = p1 H(1)/mu; inspection completes at mu (1 - p0). Solved by hand
        # here from the subsystem rates, so an index slip in fesc_rate's aggregation step fails.
        P, k, tp, tl, tu, ti, q = 2, 1, 20, 2, 2, 3, 0.15
        h1 = subsystem_rate(1, P, k, tp, tl, tu)[0]
        h2 = subsystem_rate(2, P, k, tp, tl, tu)[0]
        mu = 1 / ti
        p0 = 1 / (1 + h2 / mu + h2 * h1 / mu ** 2)
        self.assertAlmostEqual(fesc_rate(2, P, k, tp, tl, tu, ti, q)[0], (1 - q) * mu * (1 - p0), places=12)

    def test_pins_published_accuracy_rows(self):
        # The README's headline rests on experiments/results.json; re-derive six of its rows
        # (including the worst, -1.57%, and the -1.40% the 2026-11-07 audit checked by simulation).
        rows = json.loads((pathlib.Path(__file__).parent.parent / "experiments" / "results.json").read_text())["rows"]
        want = {(20, 6, 8, 4), (20, 6, 8, 1), (20, 4, 6, 9), (20, 2, 4, 1), (60, 2, 4, 1), (20, 4, 8, 4)}
        seen = 0
        for r in rows:
            key = (r["print"], r["P"], r["N"], r["k"])
            if key not in want:
                continue
            seen += 1
            tp, P, N, k = key
            ex = 60 * throughput(N, P, k, tp, 2.0, 2.0, 3.0, 0.15)[0]
            fe = 60 * fesc_rate(N, P, k, tp, 2.0, 2.0, 3.0, 0.15)[0]
            self.assertAlmostEqual(ex, r["exact"], places=6, msg=key)
            self.assertAlmostEqual(100 * (fe - ex) / ex, r["fesc"], delta=0.005, msg=key)
        self.assertEqual(seen, len(want))
        worst = min(r["fesc"] for r in rows)
        self.assertAlmostEqual(worst, -1.57, delta=0.005)


if __name__ == "__main__":
    unittest.main()
