import itertools, unittest
from robofab_selfparts.model import Model, blocks, pads, search, gripper


class T(unittest.TestCase):
    def test_no_overlaps(self):
        self.assertEqual(Model().overlaps(), [])

    def test_blocks(self):
        a = (0, 0, 0, 1, 1, 1)
        self.assertTrue(blocks(a, (0, 0, 2, 1, 1, 3), (0, 0, 1)))
        self.assertFalse(blocks(a, (0, 0, 2, 1, 1, 3), (0, 0, -1)))
        self.assertFalse(blocks(a, (1, 0, 2, 2, 1, 3), (0, 0, 1)))

    def test_pads(self):
        p = pads([(0, 0, 0, 10, 10, 10)], 0, 4.0, 0.5)
        self.assertEqual(p[0], (-4, 2.5, 2.5, 0, 7.5, 7.5))
        self.assertEqual(p[1], (10, 2.5, 2.5, 14, 7.5, 7.5))

    def test_free_arm_assembles(self):
        r = search(Model("free", jaw_open=40))
        self.assertGreater(r["orders"], 0)
        self.assertEqual(r["stuck"], [])

    def test_wide_jaw_needed(self):
        # cover is 30 mm wide in y and 40 mm in x: no order below 30 mm opening
        self.assertEqual(search(Model("free", jaw_open=25))["orders"], 0)
        self.assertIn("cover", search(Model("free", jaw_open=25))["stuck"])

    def test_search_matches_bruteforce(self):
        for arm, w in (("free", 40), ("side", 40), ("top", 40), ("side", 30)):
            m = Model(arm, jaw_open=w)
            n = 0
            for perm in itertools.permutations(range(1, m.n)):
                s = 1
                ok = True
                for p in perm:
                    if not (m.moves(p, s) and m.stable(s | 1 << p)):
                        ok = False
                        break
                    s |= 1 << p
                n += ok
            self.assertEqual(search(m)["orders"], n, (arm, w))

    def test_more_constrained_arm_not_better(self):
        for w in (30, 40):
            o = [search(Model(a, jaw_open=w))["orders"] for a in ("free", "side", "top")]
            self.assertGreaterEqual(o[0], o[1]); self.assertGreaterEqual(o[1], o[2])

    def test_example_order_valid(self):
        m = Model("side", jaw_open=40)
        o = search(m)["one"]
        s = 1
        for nm in o[1:]:
            p = m.names.index(nm)
            self.assertTrue(m.moves(p, s) and m.stable(s | 1 << p)); s |= 1 << p


if __name__ == "__main__":
    unittest.main()
