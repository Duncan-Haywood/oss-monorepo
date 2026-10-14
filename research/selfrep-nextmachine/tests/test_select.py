import pathlib, random, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_nextmachine.select import MACHINES, exhaustive, greedy, printer_value, random_instance


class T(unittest.TestCase):
    def test_zero_budget_buys_nothing(self):
        v = printer_value("lm8uu", "lines")
        self.assertEqual(exhaustive(MACHINES, 0, v), [])
        self.assertEqual(greedy(MACHINES, 0, v), [])

    def test_unlimited_budget_buys_useful_machines(self):
        v = printer_value("brass", "lines")
        self.assertGreater(v({"fdm", "cnc", "cast"}), v({"fdm", "cnc"}))

    def test_exhaustive_respects_budget(self):
        v = printer_value("brass", "cost")
        for b in (0, 300, 800, 1100, 1700):
            self.assertLessEqual(sum(MACHINES[n][1] for n in exhaustive(MACHINES, b, v)), b)

    def test_greedy_never_beats_exhaustive(self):
        rng = random.Random(1)
        for _ in range(30):
            ms, v = random_instance(rng, n_machines=6)
            for b in (500, 1500, 3000):
                g = greedy(ms, b, v); e = exhaustive(ms, b, v)
                self.assertLessEqual(v({"fdm"} | {ms[n][0] for n in g}), v({"fdm"} | {ms[n][0] for n in e}) + 1e-12)

    def test_brass_casting_alone_has_zero_gain(self):
        v = printer_value("brass", "lines")
        self.assertEqual(v({"fdm", "cast"}), v({"fdm"}))

    def test_greedy_misses_complement_pair(self):
        # cast pays only together with cnc; at a budget of exactly cnc+cast greedy takes cnc then cast
        v = printer_value("brass", "lines")
        self.assertEqual(sorted(greedy(MACHINES, 1100, v)), ["casting setup", "cnc router"])


if __name__ == "__main__":
    unittest.main()
