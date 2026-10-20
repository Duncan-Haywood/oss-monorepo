import os, random, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_warmstart.warm import *

SEQS = {"good": [(3, 100.0)] * 40, "bad": [(1, 100.0)] * 40}

class T(unittest.TestCase):
    def test_one_pull_each_then_exploit(self):
        # budget 1000 lines = 10 pulls; one forced pull of 'bad' then all on 'good': 9*3 + 1
        self.assertEqual(run_seq(Greedy1, SEQS, 1000, 0)[0], 28)
    def test_greedy_two_pulls_costs_more(self):
        self.assertEqual(run_seq(Greedy, SEQS, 1000, 0)[0], 26)  # two forced pulls of 'bad'
    def test_shrink_finds_good_arm(self):
        v = run_seq(shrink_greedy(100.0), SEQS, 2000, 0)[0]
        self.assertGreaterEqual(v, 17 * 3 + 3)  # at most a couple of 'bad' pulls
    def test_shrink_name_and_no_forced_pulls(self):
        P = shrink_greedy(500.0); self.assertEqual(P.name, "shrink-500")
        p = P(["a", "b"], random.Random(0)); p.update("a", 3, 100.0)
        self.assertIn(p.choose(2), ("a", "b"))  # pool = a's ratio, so both indices tie
    def test_first_pull_is_random(self):
        firsts = {shrink_greedy(100.0)(["a", "b", "c"], random.Random(k)).choose(1) for k in range(30)}
        self.assertEqual(firsts, {"a", "b", "c"})
    def test_unlucky_first_pull_does_not_lock_out(self):
        # 'a' is truly better (3) but its first project scores 1; the untried arm is still reached
        seqs = {"a": [(1, 100.0)] + [(3, 100.0)] * 30, "b": [(2, 100.0)] * 31}
        p = shrink_greedy(100.0)(["a", "b"], random.Random(0)); seen = set()
        nxt = {"a": 0, "b": 0}
        for t in range(1, 12):
            a = p.choose(t); v, c = seqs[a][nxt[a]]; nxt[a] += 1; p.update(a, v, c); seen.add(a)
        self.assertEqual(seen, {"a", "b"})
    def test_thompson1_runs(self):
        self.assertGreater(run_seq(Thompson1, SEQS, 1000, 0)[0], 20)

if __name__ == "__main__": unittest.main()
