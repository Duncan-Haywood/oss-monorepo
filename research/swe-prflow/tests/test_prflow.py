import os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_prflow import prflow as p


def mk(lines):
    f = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False)
    f.write("# c\n" + "\n".join(lines) + "\n")
    f.close()
    return p.parse(f.name)


class T(unittest.TestCase):
    def test_parse(self):
        r = mk(["10-01T00:00:00 10-01T00:01:00", "10-01T01:00:00 -"])
        self.assertEqual([x["n"] for x in r], [1, 2])
        self.assertIsNone(r[1]["merged"])
        self.assertEqual(p.latencies_min(r), [1.0])

    def test_wilson(self):
        lo, hi = p.wilson(0, 10)
        self.assertAlmostEqual(lo, 0.0, places=9)
        self.assertLess(hi, 0.35)
        lo, hi = p.wilson(50, 100)
        self.assertAlmostEqual((lo + hi) / 2, 0.5, places=2)
        self.assertEqual(p.wilson(0, 0), (0.0, 0.0))

    def test_quantile(self):
        self.assertEqual(p.quantile([1, 2, 3, 4], 0.5), 2.5)
        self.assertIsNone(p.quantile([], 0.5))

    def test_batch(self):
        r = mk(["10-01T00:00:00 10-01T05:00:00"] * 3 + ["10-01T00:00:00 10-01T01:00:00"])
        b = p.batch_merges(r)
        self.assertEqual(len(b), 1)
        self.assertEqual(len(b[0][1]), 3)

    def test_bursts(self):
        r = mk(["10-01T00:00:00 -", "10-01T00:00:05 -", "10-01T00:10:00 -", "10-01T00:20:00 -", "10-01T00:20:09 -"])
        self.assertEqual([len(x) for x in p.bursts(r)], [2, 2])
        self.assertEqual(p.burst_membership(r), {1, 2, 4, 5})

    def test_era_and_rate(self):
        r = mk(["10-01T00:00:00 10-01T00:00:01", "10-13T00:00:00 -", "10-13T00:00:10 10-13T00:00:11"])
        g = p.merge_rate_by(r, p.era)
        self.assertEqual(g["bulk (09-28..10-01)"], [1, 1])
        self.assertEqual(g["tracked (10-05..)"], [1, 2])


if __name__ == "__main__":
    unittest.main()
