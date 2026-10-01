import random
import unittest

from rrt import *
from rrt.fp32 import f32
from rrt.train import commit
from rrt.stats import U, sample_drift_pair, hill
from rrt.referee import linf


class TestFP32(unittest.TestCase):
    def test_rounding_idempotent_and_lossy(self):
        x = 0.1
        self.assertNotEqual(f32(x), x)
        self.assertEqual(f32(f32(x)), f32(x))

    def test_canonical_is_deterministic(self):
        r = random.Random(0)
        x = [f32(r.gauss(0, 1)) for _ in range(300)]
        y = [f32(r.gauss(0, 1)) for _ in range(300)]
        self.assertEqual(dot(x, y, "canonical"), dot(x, y, "canonical"))

    def test_orders_disagree_but_within_standard_bound(self):
        r = random.Random(1)
        x = [f32(r.gauss(0, 1)) for _ in range(500)]
        y = [f32(r.gauss(0, 1)) for _ in range(500)]
        vals = {o: dot(x, y, o, r) for o in ORDERS}
        self.assertGreater(len(set(vals.values())), 1)
        bound = 500 * U * sum(abs(a * b) for a, b in zip(x, y)) * 2
        ex = exact_dot(x, y)
        for v in vals.values():
            self.assertLessEqual(abs(v - ex), bound)

    def test_relative_drift_is_heavier_tailed_than_abs_for_zero_mean(self):
        ab, rel = sample_drift_pair("gaussian", 128, "canonical", "shuffled", 800, seed=2)
        self.assertLess(hill(rel, 40), 2.0)   # Cauchy-like ratio tail
        self.assertEqual(max(sample_drift_pair("gaussian", 128, "canonical", "canonical", 50)[0]), 0.0)


class TestMerkle(unittest.TestCase):
    def test_proofs(self):
        vecs = [[float(i), float(i) + .5] for i in range(11)]
        t = MerkleTree(vecs)
        for i in range(11):
            self.assertTrue(verify_proof(t.root, vecs[i], i, t.proof(i)))
        self.assertFalse(verify_proof(t.root, [9.0, 9.0], 3, t.proof(3)))
        self.assertFalse(verify_proof(t.root, vecs[3], 4, t.proof(3)))


class TestReferee(unittest.TestCase):
    def setUp(self):
        self.prob = Problem.synthetic(n=32, d=4, seed=1)
        self.honest = run_trace(self.prob, 12)

    def test_honest_same_order_never_disputed(self):
        tree = commit(self.honest)
        self.assertIsNone(verifier_find_violation(self.prob, self.honest, tree, 0.0))

    def test_bitwise_commitments_break_under_other_hardware(self):
        other = run_trace(self.prob, 12, "shuffled", random.Random(0))
        self.assertNotEqual(other, self.honest)  # exact hashes cannot express tolerance

    def test_tau0_catches_one_ulp_cheat_and_referee_confirms(self):
        s = [list(v) for v in self.honest]
        s[5][0] = f32(s[5][0] + 2 ** -22)
        for k in range(6, 13):
            s[k] = step(self.prob, s[k - 1])
        tree = commit(s)
        cl = verifier_find_violation(self.prob, s, tree, 0.0)
        self.assertEqual(cl.i, 5)
        self.assertTrue(referee_check(self.prob, tree.root, cl, 0.0))

    def test_referee_rejects_forged_claim(self):
        tree = commit(self.honest)
        cl = Claim(3, self.honest[2], [v + 1 for v in self.honest[3]], tree.proof(2), tree.proof(3))
        self.assertFalse(referee_check(self.prob, tree.root, cl, 0.0))

    def test_tolerance_hides_sub_tau_bias_with_bounded_accumulation(self):
        delta, T = 1e-4, 200
        w, s = [0.0] * 4, [[0.0] * 4]
        for _ in range(T):
            w = step(self.prob, w)
            w = [f32(w[0] + delta)] + w[1:]
            s.append(w)
        honest = run_trace(self.prob, T)
        tree = commit(s)
        self.assertIsNone(verifier_find_violation(self.prob, s, tree, 1.5 * delta))
        self.assertIsNotNone(verifier_find_violation(self.prob, s, tree, 0.0))
        dev = linf(s[-1], honest[-1])
        self.assertGreater(dev, 2 * delta)                       # accumulates beyond one step
        self.assertLess(dev, delta / (self.prob.lr * self.prob.mu))  # but contraction-bounded


if __name__ == "__main__":
    unittest.main()
