import itertools
import os
import shutil
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from chip_exact4 import exact as E  # noqa: E402

try:
    import pysat  # noqa: F401
    HAVE_SAT = True
except ImportError:
    HAVE_SAT = False


def brute_costs(max_gates):
    """Cost of every function reachable with <= max_gates gates, by exhaustive circuit enumeration."""
    best = {}
    base = list(E.VAR)
    for f in base + [E.FULL ^ v for v in base] + [0, E.FULL]:
        best[f] = 0
    gates = [lambda a, b, k=k: sum(((k >> (2 * ((a >> t) & 1) + ((b >> t) & 1))) & 1) << t for t in range(E.ROWS))
             for k in range(16)]

    def rec(sigs, left):
        for j, k in itertools.combinations(range(len(sigs)), 2):
            for g in gates:
                v = g(sigs[j], sigs[k])
                c = max_gates - left + 1
                for w in (v, E.FULL ^ v):
                    if best.get(w, 99) > c:
                        best[w] = c
                if left > 1:
                    rec(sigs + [v], left - 1)
    rec(base, max_gates)
    return best


class NpnTest(unittest.TestCase):
    def test_222_classes_and_sizes_sum(self):
        rep, classes = E.npn_classes()
        self.assertEqual(len(classes), 222)
        self.assertEqual(sum(classes.values()), 65536)
        self.assertTrue(all(rep[r] == r for r in classes))

    def test_apply_npn_identity_and_complement(self):
        f = 0x1234
        self.assertEqual(E.apply_npn(f, (0, 1, 2, 3), 0, 0), f)
        self.assertEqual(E.apply_npn(f, (0, 1, 2, 3), 0, 1), E.FULL ^ f)


@unittest.skipUnless(HAVE_SAT, "python-sat not installed")
class ExactTest(unittest.TestCase):
    def test_known_costs(self):
        v = E.VAR
        self.assertEqual(E.cost(v[0] & v[1]), 1)
        self.assertEqual(E.cost(v[0] ^ v[1] ^ v[2] ^ v[3]), 3)
        self.assertEqual(E.cost(v[0] & v[1] & v[2] & v[3]), 3)
        self.assertEqual(E.cost((v[0] & v[1]) | (v[0] & v[2]) | (v[1] & v[2])), 4)

    def test_sat_agrees_with_enumeration_up_to_two_gates(self):
        best = brute_costs(2)
        for f in range(0, 65536, 1009):
            want = best.get(f)
            got = E.cost(f)
            if want is not None:
                self.assertEqual(got, want, hex(f))
            else:
                self.assertGreater(got, 2, hex(f))


@unittest.skipUnless(HAVE_SAT and shutil.which("yosys"), "needs python-sat and yosys")
@unittest.skipUnless(HAVE_SAT and shutil.which("yosys"), "needs python-sat and yosys")
class AbcTest(unittest.TestCase):
    def test_abc_never_beats_exact_and_is_correct_on_xor(self):
        from chip_exact4 import abc
        for f in (0x6996, 0xe8e8, 0x8000, 0x1234):
            for variant in ("default", "resyn2_map"):
                self.assertGreaterEqual(abc.count(f, variant)[0], E.cost(f))
        self.assertEqual(abc.count(0x6996, "default")[0], 3)


if __name__ == "__main__":
    unittest.main()
