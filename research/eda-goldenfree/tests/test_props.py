import os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
for p in ("../src", "../../chip-accel/src", "../../eda-harness/src", "../../eda-verify/src"):
    sys.path.insert(0, os.path.join(HERE, p))
from chip_accel import gen
from eda_harness import harness as H
from eda_goldenfree import props

CAND = {"p": 8, "wb": 4}


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.v = H.Problem().verilog(CAND); cls.lat = gen.cycles(8)

    def test_golden_violates_nothing(self):
        self.assertEqual(props.violated(self.v, 4, self.lat), [])

    def test_latency_mutant_is_caught(self):
        m = self.v.replace("if (k == 7) st <= WBK;", "if (k == 6) st <= WBK;", 1)
        self.assertIn("latency", props.violated(m, 4, self.lat))

    def test_datapath_mutant_is_invisible(self):
        m = self.v.replace("a + $signed", "a - $signed", 1)
        self.assertNotEqual(m, self.v)
        self.assertEqual(props.violated(m, 4, self.lat), [])

    def test_compile_error_raises(self):
        with self.assertRaises(RuntimeError):
            props.violated("module accel(", 4, self.lat)

    def test_vector_schedule(self):
        runs = props.vectors(4, n=32, rep=8)
        self.assertEqual([m for m, _ in runs].count(1), 8)
        self.assertEqual(len(runs), 56)


if __name__ == "__main__":
    unittest.main()
