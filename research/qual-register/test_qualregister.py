import random
import unittest

import qualregister as g


class Tests(unittest.TestCase):
    def test_register(self):
        self.assertEqual(g.register_of("This is fine."), "formal")
        self.assertEqual(g.register_of('He said "no!"'), "formal")
        self.assertEqual(g.register_of("this is fine."), "informal")
        self.assertEqual(g.register_of("This is fine"), "informal")
        self.assertEqual(g.register_of(""), "informal")

    def test_two_prop_z(self):
        self.assertEqual(g.two_prop_z(5, 50, 5, 50), 0.0)
        self.assertEqual(g.two_prop_z(0, 50, 0, 50), 0.0)
        self.assertGreater(g.two_prop_z(30, 100, 10, 100), 3)
        self.assertEqual(g.two_prop_z(1, 0, 1, 5), 0.0)

    def test_error_rate(self):
        self.assertEqual(g.error_rate([1, 0, 1, 0], [1, 1, 0, 0], range(4)), 0.5)

    def test_audit_power_extremes(self):
        n = 2000
        groups = ["formal" if i % 2 else "informal" for i in range(n)]
        human = [i % 3 == 0 for i in range(n)]
        # coder perfect on formal, wrong half the time on informal: easy to detect
        llm = [h if groups[i] == "formal" or i % 4 else (not h) for i, h in enumerate(human)]
        self.assertGreater(g.detection_rate(llm, human, groups, 400, 100, random.Random(1)), 0.95)
        # same error in both groups: detection stays near the 5% false-positive rate
        same = [h if i % 7 else (not h) for i, h in enumerate(human)]
        self.assertLess(g.detection_rate(same, human, groups, 400, 200, random.Random(2)), 0.15)


if __name__ == "__main__":
    unittest.main()
