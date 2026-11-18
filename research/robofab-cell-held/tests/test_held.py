import itertools, json, math, pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "src"))
from robofab_cell_held.mva import mva, cell_demands, balanced_bounds
from robofab_cell_held.sim import simulate

T = [dict(weight=1, print=20, load=2, unload=2, inspect=3, q=0.1),
     dict(weight=1, print=60, load=2, unload=2, inspect=3, q=0.2)]


class TestHeld(unittest.TestCase):
    def test_hold_adds_load_unload_to_printer_demand_only(self):
        D, _ = cell_demands(T, 4, 1)
        Dh, _ = cell_demands(T, 4, 1, hold_printer=True)
        self.assertEqual(D[0], Dh[0]); self.assertEqual(D[2], Dh[2])
        self.assertGreater(Dh[1], D[1])

    def test_held_prediction_never_above_plain(self):
        for N in (2, 6, 20):
            D, m = cell_demands(T, 8, 1); Dh, _ = cell_demands(T, 8, 1, hold_printer=True)
            self.assertLessEqual(mva(Dh, m, N)[0], mva(D, m, N)[0] + 1e-12)

    def test_held_bound_below_plain_bound(self):
        D, m = cell_demands(T, 8, 1); Dh, _ = cell_demands(T, 8, 1, hold_printer=True)
        self.assertLessEqual(balanced_bounds(Dh, m, 20), balanced_bounds(D, m, 20))

    def test_single_job_mva_is_one_over_total_demand(self):
        D, m = cell_demands(T, 4, 1)
        self.assertAlmostEqual(mva(D, m, 1)[0], 1 / sum(D), places=12)

    def test_sim_below_held_capacity_at_saturation(self):
        Dh, _ = cell_demands(T, 4, 1, hold_printer=True)
        r = simulate(T, 4, 1, 8, mode="hold", dist="ln", cv=0.3, seed=0)
        self.assertLess(r, 4 / Dh[1] * 1.1)

    def test_held_printer_demand_by_hand(self):
        # Per good part, a printer is held for print + load + unload over 1/(1-q) passes:
        # type 1 (20+2+2)/0.9 = 26.667, type 2 (60+2+2)/0.8 = 80, equal weights -> 53.333 min.
        Dh, _ = cell_demands(T, 4, 1, hold_printer=True)
        self.assertAlmostEqual(Dh[1], (24 / 0.9 + 64 / 0.8) / 2, places=12)
        self.assertAlmostEqual(Dh[0], (4 / 0.9 + 4 / 0.8) / 2, places=12)

    def test_mva_matches_brute_force_product_form(self):
        # Independent check of the multi-server recursion: enumerate every state of the closed
        # product-form network, weight it by prod_i D_i^n_i / prod_{j<=n_i} min(j, m_i), and read
        # throughput as E[min(n_i, m_i)] / D_i at any station.
        def brute(D, m, N):
            G = X = 0.0
            for n in itertools.product(range(N + 1), repeat=len(D)):
                if sum(n) != N:
                    continue
                w = math.prod(D[i] ** n[i] / math.prod(min(j, m[i]) for j in range(1, n[i] + 1))
                              for i in range(len(D)))
                G += w; X += w * min(n[1], m[1]) / D[1]
            return X / G
        for hold in (False, True):
            for P in (2, 4):
                D, m = cell_demands(T, P, 1, hold_printer=hold)
                for N in (2, 3, 6, 9):
                    self.assertAlmostEqual(mva(D, m, N)[0], brute(D, m, N), places=10, msg=(hold, P, N))

    def test_distinct_setting_averages_in_readme(self):
        # Four grid rows repeat another exactly (wip <= P makes P irrelevant); the README quotes
        # averages over the 28 distinct settings. Re-derive them from results.json.
        g = json.loads((pathlib.Path(__file__).parent.parent / "experiments" / "results.json").read_text())["grid"]
        seen, keep = set(), []
        for r in g:
            key = (r["cv"], min(r["P"], r["wip"]), r["wip"])
            if key not in seen:
                seen.add(key); keep.append(r)
        self.assertEqual((len(g), len(keep)), (32, 28))
        mae = lambda rows, k: sum(abs(r["err_pct"][k]) for r in rows) / len(rows)
        other = [r for r in keep if r["wip"] < 2 * r["P"]]
        got = [mae(keep, "plain"), mae(keep, "held"), mae(other, "plain"), mae(other, "held")]
        for a, b in zip(got, [4.9, 5.6, 3.6, 6.7]):
            self.assertAlmostEqual(a, b, delta=0.05)


if __name__ == "__main__":
    unittest.main()
