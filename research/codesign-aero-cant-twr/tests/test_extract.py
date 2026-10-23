import csv, math, os, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
import extract_c as X


class ExtractTests(unittest.TestCase):
    def test_c_from_synthetic_file(self):
        d = tempfile.mkdtemp()
        open(os.path.join(d, "apcsf_10x7_static_x.txt"), "w").write("RPM CT CP\n2000 0.10 0.05\n3000 0.10 0.05\n4000 0.10 0.05\n5000 0.01 0.9\n")
        r = X.rows(d)
        self.assertEqual(len(r), 1)
        self.assertAlmostEqual(r[0]["cp_over_ct"], 0.5)          # the CT < 0.02 row is dropped
        self.assertAlmostEqual(r[0]["c"], round(0.5 / (2 * math.pi), 4))
        self.assertEqual(r[0]["diameter_in"], 10.0)

    def test_q_over_t_identity(self):
        # Q = CP rho n^2 D^5 / (2 pi), T = CT rho n^2 D^4  =>  Q/T = (CP/CT) D / (2 pi) = c D
        rho, n, D, ct, cp = 1.2, 80.0, 0.2, 0.11, 0.06
        Q = cp * rho * n ** 2 * D ** 5 / (2 * math.pi); T = ct * rho * n ** 2 * D ** 4
        self.assertAlmostEqual(Q / T, (cp / ct) / (2 * math.pi) * D, places=12)


class CommittedDataTests(unittest.TestCase):
    def setUp(self):
        self.rows = list(csv.DictReader(open(os.path.join(HERE, "..", "data", "propdata_c.csv"))))

    def test_hand_check_against_a_published_row(self):
        # apcsf_10x7_static_kt0827: first rows CT 0.1409 CP 0.0678 -> CP/CT 0.481 (UIUC file); median over the file stays near it
        r = [x for x in self.rows if x["file"] == "apcsf_10x7_static_kt0827.txt"][0]
        self.assertTrue(0.46 < float(r["cp_over_ct"]) < 0.52)

    def test_in_range_values_are_physical(self):
        c = [float(x["c"]) for x in self.rows if 3.15 <= float(x["diameter_in"]) <= 9.85]
        self.assertGreater(len(c), 50)
        self.assertTrue(all(0.03 < v < 0.3 for v in c))


if __name__ == "__main__":
    unittest.main()
