import json, os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
import class_overlap as co  # noqa: E402


class Overlap(unittest.TestCase):
    def test_identical_and_disjoint(self):
        p = {"a": .5, "b": .5}
        self.assertAlmostEqual(co.overlap(p, p), 1.0)
        self.assertAlmostEqual(co.overlap(p, {"c": 1.0}), 0.0)
        self.assertAlmostEqual(co.overlap({"a": .3, "other": .7}, {"a": .1, "other": .9}), 0.8)
        self.assertAlmostEqual(co.overlap({"a": .3, "other": .7}, {"a": .1, "other": .9}, drop=("other",)), 0.1)

    def test_mix_is_row_weighted(self):
        m = co.mix([{"a": 1.0}, {"b": 1.0}], [3, 1])
        self.assertAlmostEqual(m["a"], .75)
        self.assertAlmostEqual(m["b"], .25)

    def test_load_prefers_4city_and_uses_stored_sources(self):
        with tempfile.TemporaryDirectory() as d:
            def put(name, n, shares, sources):
                json.dump(dict(n_test=n, class_share_test=shares, sources=sources), open(os.path.join(d, name), "w"))
            put("transfer_x_a2i_2024.json", 10, {"a": 1.0}, ["y"])
            put("transfer_y_a2i_2024.json", 10, {"a": .5, "b": .5}, ["x"])
            put("transfer_z_a2i_2024_4city.json", 30, {"b": 1.0}, ["x", "y"])
            put("transfer_z_a2i_2024.json", 99, {"a": 1.0}, ["x", "y"])
            rows = co.load(2024, res=d)
            self.assertEqual(rows["a2i"]["z"][0], 30)
            tab = {r["held_out"]: r for r in co.table(rows)}
            self.assertEqual(tab["x"]["sources"], ["y"])
            self.assertAlmostEqual(tab["x"]["overlap"], .5)
            self.assertAlmostEqual(tab["z"]["overlap"], .25)  # mix of x and y = a .75, b .25
            self.assertIn("| a2i | z |", co.markdown(co.table(rows), 2024))


if __name__ == "__main__":
    unittest.main()
