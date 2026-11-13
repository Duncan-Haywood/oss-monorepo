import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import encounters as E  # noqa: E402


def straight(x0, y0, vx, vy, ts):
    return [(t, x0 + vx * t, y0 + vy * t, vx, vy) for t in ts]


TS = [i * 0.4 for i in range(26)]


class TestEncounters(unittest.TestCase):
    def test_keep_right_pair(self):
        # A walks +y on the right (x = +0.4); B walks -y on its own right (x = -0.4).
        tr = {1: straight(0.4, -5, 0, 1, TS), 2: straight(-0.4, 5, 0, -1, TS)}
        enc = E.encounters(tr)
        self.assertEqual([s for _, s in enc], [1])
        self.assertEqual([s for _, s in E.encounters(tr, hand=-1)], [-1])

    def test_keep_left_pair(self):
        tr = {1: straight(-0.4, -5, 0, 1, TS), 2: straight(0.4, 5, 0, -1, TS)}
        self.assertEqual([s for _, s in E.encounters(tr)], [-1])

    def test_filters(self):
        far = {1: straight(2.5, -5, 0, 1, TS), 2: straight(-0.4, 5, 0, -1, TS)}
        self.assertEqual(E.encounters(far), [])                       # closest 2.9 m
        same = {1: straight(0.4, -5, 0, 1, TS), 2: straight(-0.4, -6, 0, 1, TS)}
        self.assertEqual(E.encounters(same), [])                      # same direction
        tr = {1: straight(0.4, -5, 0, 1, TS), 2: straight(-0.4, 5, 0, -1, TS)}
        self.assertEqual(E.encounters(tr, groups=[[1, 2]]), [])       # a group
        late = {1: straight(0.4, -5, 0, 1, TS), 2: straight(-0.4, 5, 0, -1, TS[:10])}
        self.assertEqual(E.encounters(late), [])                      # never passed

    def test_handedness(self):
        # world (x, y) = (row, col): x points down the image, y right: right-handed from above
        self.assertEqual(E.world_handedness([[1, 0, 0], [0, 1, 0], [0, 0, 1]], 10, 10), 1)
        # world (x, y) = (col, row): the image's own y-down frame, mirrored
        self.assertEqual(E.world_handedness([[0, 1, 0], [1, 0, 0], [0, 0, 1]], 10, 10), -1)

    def test_share_and_blocks(self):
        enc = [(1, 1), (2, 1), (3, -1), (70, 0), (80, 1)]
        self.assertEqual(E.share_right(enc)[:3], (3, 1, 1))
        self.assertEqual(E.blocks(enc, 60), [(2, 3), (1, 1)])
        lo, hi = E.boot_ci([(2, 3), (1, 1)], 200, 1)
        self.assertTrue(0 <= lo <= hi <= 1)


if __name__ == "__main__":
    unittest.main()
