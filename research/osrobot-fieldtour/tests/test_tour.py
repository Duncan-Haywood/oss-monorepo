import random, unittest
from osrobot_fieldtour import model as M


def pts(n, seed=0):
    r = random.Random(seed)
    return [(r.uniform(0, 60), r.uniform(0, 30), k) for k in range(n)]


class T(unittest.TestCase):
    def test_tours_are_permutations(self):
        t = pts(40)
        for rule in ("nn", "nn2opt", "lane", "random"):
            o = M.plan_tour(t, (60.0, 0.0), rule)
            self.assertEqual(sorted(o), sorted(t))

    def test_two_opt_never_longer_than_nn(self):
        for s in range(10):
            t = pts(60, s); st = (60.0, 0.0)
            nn = M.nearest_neighbour(t, st)
            self.assertLessEqual(M.tour_length(st, M.two_opt(nn, st)), M.tour_length(st, nn) + 1e-9)

    def test_two_opt_fixes_a_crossing(self):
        st = (0.0, 0.0); a, b, c, d = (1.0, 0.0, 0), (3.0, 1.0, 1), (2.0, 1.0, 2), (4.0, 0.0, 3)
        bad = [a, b, c, d]
        self.assertLess(M.tour_length(st, M.two_opt(bad, st)), M.tour_length(st, bad))

    def test_empty_and_single(self):
        self.assertEqual(M.plan_tour([], (0, 0), "nn2opt"), [])
        self.assertEqual(M.plan_tour([(1, 1, 0)], (0, 0), "nn2opt"), [(1, 1, 0)])

    def test_scout_tour_choice_keeps_kill_distribution_close(self):
        # same detections and rng stream before the tour, so treatment count is identical
        a = M.run_scout(M.Field(2), random.Random(5), tour="nn")
        b = M.run_scout(M.Field(2), random.Random(5), tour="nn2opt")
        self.assertEqual(a["treatments"], b["treatments"])

    def test_bad_rule_raises(self):
        with self.assertRaises(ValueError):
            M.plan_tour([(1, 1, 0)], (0, 0), "x")


if __name__ == "__main__":
    unittest.main()
