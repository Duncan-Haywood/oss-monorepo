import itertools, json, os, unittest
from robofab_sequence.checker import Checker, blocks
from robofab_sequence.planner import (summarise, order_cost, optimal_order, greedy_disassembly,
                                      transitions)

HERE = os.path.dirname(__file__)


def dfs_all(ck):
    """Independent enumeration of every valid order (no memoisation): returns list of orders."""
    full = (1 << ck.n) - 1
    res = []

    def rec(s, order):
        if s == full:
            res.append(list(order)); return
        for p, _ in transitions(ck, s):
            order.append(p); rec(s | 1 << p, order); order.pop()
    rec(1, [])
    return res


class TestBlocks(unittest.TestCase):
    def test_sweep(self):
        a = (0, 0, 0, 1, 1, 1)
        self.assertTrue(blocks(a, (0, 0, 2, 1, 1, 3), (0, 0, 1), 0.0))    # ahead along +z
        self.assertFalse(blocks(a, (0, 0, 2, 1, 1, 3), (0, 0, -1), 0.0))  # behind
        self.assertFalse(blocks(a, (2, 0, 2, 3, 1, 3), (0, 0, 1), 0.0))   # beside, no overlap
        self.assertFalse(blocks(a, (1, 0, 2, 2, 1, 3), (0, 0, 1), 0.0))   # touching sideways: slides
        self.assertFalse(blocks(a, (1.3, 0, 2, 2, 1, 3), (0, 0, 1), 0.2)) # gap 0.3 >= tol
        self.assertTrue(blocks(a, (1.1, 0, 2, 2, 1, 3), (0, 0, 1), 0.2))  # gap 0.1 < tol


class TestGearbox(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ck = Checker()

    def test_finished_product_has_no_overlaps(self):
        self.assertEqual(self.ck.final_overlaps(), [])

    def test_exact_count_matches_enumeration(self):
        allv = dfs_all(self.ck)
        self.assertEqual(len(allv), summarise(self.ck)["valid_orders"])
        self.assertEqual(len(set(map(tuple, allv))), len(allv))

    def test_min_changes_matches_enumeration(self):
        best = min(order_cost(self.ck, ["base"] + [self.ck.names[i] for i in o])[2] for o in dfs_all(self.ck))
        self.assertEqual(best, summarise(self.ck)["min_changes"])
        order, cost, _ = optimal_order(self.ck)
        self.assertEqual(cost, best)
        self.assertEqual(order_cost(self.ck, order)[2], best)

    def test_fixed_orders(self):
        good = ["base", "wall_front", "wall_back", "gear1", "gear2", "shaft1", "shaft2",
                "collar_f1", "collar_f2", "collar_b1", "collar_b2", "lid"]
        self.assertTrue(order_cost(self.ck, good)[0])
        # lid first floats; gear after shaft cannot be inserted; collar before shaft floats
        for bad in (["base", "lid"] + [n for n in good[1:] if n != "lid"],
                    ["base", "wall_front", "wall_back", "shaft1", "gear1"] + [n for n in good[1:] if n not in ("shaft1", "gear1", "wall_front", "wall_back")],
                    ["base", "collar_f1"] + [n for n in good[1:] if n != "collar_f1"]):
            self.assertFalse(order_cost(self.ck, bad)[0])

    def test_collision_only_is_weaker(self):
        l0 = summarise(Checker(stability=False))["valid_orders"]
        self.assertGreater(l0, summarise(self.ck)["valid_orders"])

    def test_tolerance_cliff_at_smallest_clearance(self):
        self.assertGreater(summarise(Checker(tol=0.4))["valid_orders"], 0)
        self.assertEqual(summarise(Checker(tol=0.6))["valid_orders"], 0)

    def test_greedy_is_valid_or_none(self):
        g = greedy_disassembly(self.ck)
        self.assertTrue(g is None or order_cost(self.ck, g)[0])

    def test_session_agent_proposal_is_checked(self):
        with open(os.path.join(HERE, "..", "proposals", "session_agent_1.json")) as f:
            prop = json.load(f)["order"]
        self.assertEqual(sorted(prop), sorted(self.ck.names))
        ok, why, cost = order_cost(self.ck, prop)
        self.assertTrue(ok, why)

    def test_malformed_order_rejected(self):
        self.assertFalse(order_cost(self.ck, ["base", "lid"])[0])


if __name__ == "__main__":
    unittest.main()
