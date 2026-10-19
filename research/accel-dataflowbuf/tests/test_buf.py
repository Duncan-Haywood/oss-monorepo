import os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_dataflowbuf import buf
F = buf.F


class T(unittest.TestCase):
    def test_k0_equals_baseline(self):
        for df in F.DATAFLOWS:
            for O, I, B, P in [(11, 70, 4, 8), (64, 70, 1, 16), (5, 9, 2, 4)]:
                c, _ = F.simulate(df, O, I, B, P)
                self.assertEqual(buf.x_counts(df, O, I, B, P, 0), (c["x_rd"], 0))

    def test_full_buffer_reads_each_activation_once_at_most(self):
        for df in F.DATAFLOWS:
            O, I, B, P = 11, 70, 4, 8
            miss, hit = buf.x_counts(df, O, I, B, P, I * B)
            self.assertLessEqual(miss, I * B)
            c, _ = F.simulate(df, O, I, B, P)
            self.assertEqual(miss + hit, c["x_rd"])

    def test_misses_non_increasing_in_k(self):
        for df in F.DATAFLOWS:
            m = [buf.x_counts(df, 11, 70, 4, 8, K)[0] for K in (0, 8, 32, 128, 280)]
            self.assertEqual(m, sorted(m, reverse=True))

    def test_total_lookups_independent_of_k(self):
        for df in F.DATAFLOWS:
            tot = {sum(buf.x_counts(df, 11, 70, 4, 8, K)) for K in (0, 5, 70, 280)}
            self.assertEqual(len(tot), 1)


if __name__ == "__main__":
    unittest.main()
