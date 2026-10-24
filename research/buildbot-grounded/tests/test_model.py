import unittest

from buildbot_grounded import model as M


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.carry, cls.fasten = M.load(M.CARRY), M.load(M.FASTEN)

    def test_slowdown_is_labourer_rate_over_robot_rate(self):
        cell = self.carry["rates"]["h1"]["T=0.4"]["5|20"]
        want = cell["labourer"]["1.1|4"] / cell["robot"]
        self.assertIn(want, M.carry_slowdowns(self.carry, "h1")["4"])
        self.assertAlmostEqual(want, 8.25 / 4.0)

    def test_bundle_labourer_is_always_harder_to_match(self):
        for robot in ("h1", "g1"):
            sd = M.carry_slowdowns(self.carry, robot)
            self.assertGreater(sd["4"][0], sd["1"][0])
            self.assertGreater(sd["4"][-1], sd["1"][-1])

    def test_nail_share_matches_fasten_readme(self):
        self.assertAlmostEqual(M.nail_share(self.fasten, "G1"), 18 / 62)
        self.assertAlmostEqual(M.nail_share(self.fasten, "H1"), 36 / 62)

    def test_break_even_is_where_a_house_saving_is_zero(self):
        rate = M.C.robot_rate(M.C.PRICE_USD["H1"], 6000, 0.10, 1000)
        w = 37.86
        s = M.C.breakeven_slowdown(w, rate, 0.3)
        self.assertAlmostEqual(M.net_per_house(1.4, 0.58, s, w, rate, 0.3), 0.0, places=9)
        self.assertGreater(M.net_per_house(1.4, 0.58, s * 0.5, w, rate, 0.3), 0)

    def test_free_robot_saves_the_wage_on_its_share(self):
        self.assertAlmostEqual(M.net_per_house(2.0, 0.5, 0.0, 40.0, 0.0, 0.0), 40.0)

    def test_quantile_bounds(self):
        self.assertEqual(M.quantile([1, 2, 3], 0.0), 1)
        self.assertEqual(M.quantile([1, 2, 3], 1.0), 3)


if __name__ == "__main__":
    unittest.main()
