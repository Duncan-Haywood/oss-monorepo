import math
import unittest

from buildbot_taskbook import model as M
from house_framing import model as HF


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.q = M.quantities()
        cls.T = M.tasks(cls.q)
        cls.env = M.load_envelope()
        cls.by = {t["id"]: t for t in cls.T}

    def test_quantities_match_the_takeoff(self):
        tk = HF.takeoff()
        self.assertEqual(self.q["pieces"], tk["pieces"])
        self.assertEqual(sum(self.q["counts"].values()), tk["pieces"])
        self.assertEqual(self.by["F2"]["n"], tk["pieces"])

    def test_lumber_mass_matches_payload_figure(self):
        # buildbot-payload: an 8 ft 2x6 is 5.94 kg, a 2x4 stud 3.78 kg
        self.assertAlmostEqual(M.lumber_kg("2x6", 96), 5.94, delta=0.01)
        self.assertAlmostEqual(M.lumber_kg("2x4", 96), 3.78, delta=0.01)

    def test_wall_mass_is_sum_of_member_masses(self):
        # 210 pieces; the average times the count is the total, and the heaviest is a header ply
        self.assertAlmostEqual(self.q["avg_piece_kg"] * self.q["pieces"], self.q["wall_mass_kg"], places=6)
        self.assertGreater(self.q["max_piece_kg"], self.q["avg_piece_kg"])

    def test_sheet_counts_cover_the_area(self):
        self.assertGreaterEqual(self.q["wall_sheets"] * M.SHEET_FT2, self.q["opaque_ft2"])
        self.assertGreaterEqual(self.q["roof_sheets"] * M.SHEET_FT2, self.q["roof_ft2"])
        self.assertGreaterEqual((self.q["drywall_wall_sheets"] + self.q["drywall_ceiling_sheets"]) * M.SHEET_FT2, self.q["drywall_ft2"])
        # roof area of a 30 x 42 ft deck at 4:12 is 1260 / cos(atan(1/3))
        self.assertAlmostEqual(self.q["roof_ft2"], 30 * 42 / math.cos(math.atan(1 / 3)), places=6)

    def test_hours_are_cycles_times_minutes(self):
        t = self.by["S4"]
        self.assertAlmostEqual(M.hours(t), t["n"] * t["minutes"] / 60)
        self.assertEqual(t["n"], self.q["wall_sheets"] * M.SHEATH_NAILS)
        # only framing rows take the framing scale
        self.assertAlmostEqual(M.hours(self.by["F5"], framing_scale=2.0), 2 * M.hours(self.by["F5"]))
        self.assertAlmostEqual(M.hours(self.by["S4"], framing_scale=2.0), M.hours(self.by["S4"]))

    def test_norm_scale_makes_framing_equal_the_norm(self):
        k = M.framing_scale_to_norm(self.T, self.q)
        total = sum(M.hours(t, framing_scale=k) for t in self.T if t["trade"] == "framing")
        self.assertAlmostEqual(total, M.methvin_hours(self.q), places=6)

    def test_capacity_is_conservative(self):
        cells = self.env["h1-palm"]
        # on a grid point the capacity is at most that cell and never above any neighbour
        z, x = 0.6, 0.3
        cap = M.capacity(self.env, "h1-palm", z, x)
        self.assertLessEqual(cap, cells[(z, x)])
        # outside the grid (a roof deck at 3 m) no capacity is claimed
        self.assertIsNone(M.capacity(self.env, "h1-palm", 3.0, 0.3))
        # a cell that is out of reach poisons the interpolation around it
        self.assertIsNone(M.capacity(self.env, "g1-palm", 0.5, 0.55))

    def test_verdicts_agree_with_payload_for_shared_sheets(self):
        # buildbot-payload: the H1 can take one end of an OSB sheet at z 0.6, x 0.3; none of the three robots carry it alone
        solo = dict(self.by["S1"])
        self.assertEqual(M.verdict(solo, self.env)[0], "no")
        shared = dict(solo, share="shared")
        self.assertEqual(M.verdict(shared, self.env)[0], "yes")
        self.assertEqual(M.verdict(self.by["R3"], self.env)[0], "out of reach")
        self.assertEqual(M.verdict(self.by["D3"], self.env)[0], "out of reach")

    def test_sweep_is_deterministic_and_ranks_are_permutations(self):
        a = M.sweep(self.T, self.env, 50, seed=3)
        b = M.sweep(self.T, self.env, 50, seed=3)
        self.assertEqual(a["total"], b["total"])
        for d in range(50):
            self.assertEqual(sorted(a["rank"][i][d] for i in range(len(self.T))), list(range(1, len(self.T) + 1)))
        # hours stay inside [mid/SWEEP, mid*SWEEP]
        for i, t in enumerate(self.T):
            self.assertGreaterEqual(min(a["hours"][i]), M.hours(t) / M.SWEEP - 1e-9)
            self.assertLessEqual(max(a["hours"][i]), M.hours(t) * M.SWEEP + 1e-9)
        for c in a["share"]:
            self.assertTrue(all(0 <= s <= 1 for s in a["share"][c]))

    def test_every_task_has_the_fields_a_scorer_needs(self):
        for t in self.T:
            self.assertGreater(t["n"], 0)
            self.assertGreater(t["minutes"], 0)
            self.assertLessEqual(t["kg"][0], t["kg"][1])
            self.assertIn(t["share"], ("solo", "shared"))
        self.assertEqual(len({t["id"] for t in self.T}), len(self.T))


if __name__ == "__main__":
    unittest.main()
