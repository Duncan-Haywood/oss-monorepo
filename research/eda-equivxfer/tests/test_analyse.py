import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from eda_equivxfer import analyse as A, netlist

G = {"$_AND_": 3, "$_XOR_": 1}


def row(sig, formal, fs=100.0, ss=5.0):
    return {"sig": sig, "formal": formal, "formal_seconds": fs, "sig_seconds": ss}


class T(unittest.TestCase):
    def test_parse_stat(self):
        txt = "   Number of cells:  4\n     $_AND_                          3\n     $_XOR_                          1\n"
        self.assertEqual(netlist.parse_stat(txt), G)

    def test_delta(self):
        self.assertEqual(netlist.delta(G, {"$_AND_": 5}), 1)
        self.assertIsNone(netlist.delta(None, G))

    def test_confusion(self):
        rows = [row(G, "equivalent"), row(G, "killed"), row({"$_AND_": 2}, "equivalent"), row(None, "undecided")]
        c = A.confusion(rows, G)
        self.assertEqual(c["same"], {"equivalent": 1, "killed": 1, "undecided": 0})
        self.assertEqual(c["differs"], {"equivalent": 1, "killed": 0, "undecided": 1})

    def test_cost(self):
        rows = [row(G, "equivalent", 200, 5), row({"$_AND_": 2}, "killed", 50, 5)]
        c = A.cost(rows, G)
        self.assertEqual(c["formal_saved"], 200)
        self.assertEqual(c["net"], 190)


if __name__ == "__main__":
    unittest.main()
