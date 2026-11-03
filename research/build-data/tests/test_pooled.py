import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
try:
    import pooled
except ImportError:  # needs pandas/lightgbm
    pooled = None


def row(n, diff, hi):
    return dict(n=n, pooled_w1=dict(vs_full=dict(diff=diff, hi=hi)))


@unittest.skipIf(pooled is None, "needs pandas and lightgbm")
class Crossing(unittest.TestCase):
    def test_first_n_at_or_below(self):
        res = dict(rows=[row(0, .5, 1), row(100, .2, .6), row(300, -.1, .3), row(1000, -.2, -.05)])
        c = pooled.crossing(res)["pooled_w1"]
        self.assertEqual(c["first_n_at_or_below_full"], 300)
        self.assertEqual(c["first_n_significantly_below_full"], 1000)

    def test_never(self):
        c = pooled.crossing(dict(rows=[row(0, .5, 1), row(100, .2, .6)]))["pooled_w1"]
        self.assertIsNone(c["first_n_at_or_below_full"])
        self.assertIsNone(c["first_n_significantly_below_full"])


if __name__ == "__main__":
    unittest.main()
