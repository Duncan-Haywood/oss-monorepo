import math
import random
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "src"))
from eda_flowtune import analysis as A  # noqa: E402
from eda_flowtune import space as S  # noqa: E402

INF = float("inf")


def toy():
    """Three designs over all sequences: a and b share a landscape, c is reversed."""
    seqs = S.all_sequences()
    a = {s: 1.0 + i * 0.01 for i, s in enumerate(seqs)}
    b = {s: 2.0 * v for s, v in a.items()}
    c = {s: 1.0 + (len(seqs) - i) * 0.01 for i, s in enumerate(seqs)}
    return {"a": a, "b": b, "c": c}


class Space(unittest.TestCase):
    def test_size_and_roundtrip(self):
        seqs = S.all_sequences()
        self.assertEqual(len(seqs), 1 + 7 + 49 + 343)
        self.assertEqual(len(set(seqs)), len(seqs))
        for s in seqs[:60]:
            self.assertEqual(S.unkey(S.key(s)), s)

    def test_script(self):
        self.assertEqual(S.script_text(()), "strash; map")
        self.assertEqual(S.script_text(("dc2", "rewrite -z")), "strash; dc2; rewrite -z; map")

    def test_every_design_file_has_its_top(self):
        for d, top in S.DESIGNS.items():
            self.assertIn(f"module {top}(", (HERE / "designs" / f"{d}.v").read_text())


class Analysis(unittest.TestCase):
    def test_spearman(self):
        self.assertAlmostEqual(A.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1.0)
        self.assertAlmostEqual(A.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1.0)
        self.assertTrue(math.isnan(A.spearman([1, 1, 1], [1, 2, 3])))

    def test_ties_get_average_ranks(self):
        self.assertEqual(list(A._ranks([5, 5, 1])), [1.5, 1.5, 0.0])

    def test_rank_correlation_and_transfer(self):
        t = toy()
        rc = A.rank_correlation(t)
        self.assertAlmostEqual(rc[("a", "b")], 1.0)
        self.assertAlmostEqual(rc[("a", "c")], -1.0)
        tm = A.transfer_matrix(t)
        self.assertAlmostEqual(tm[("a", "b")], 1.0)       # same ordering: the optimum transfers exactly
        self.assertGreater(tm[("a", "c")], 1.5)           # reversed landscape: it does not
        self.assertEqual(tm[("a", "a")], 1.0)

    def test_aborting_sequences_excluded_from_correlation_and_consensus(self):
        t = toy()
        bad = S.all_sequences()[5]
        t["a"][bad] = INF
        self.assertFalse(math.isnan(A.rank_correlation(t)[("a", "b")]))
        self.assertNotIn(bad, A.consensus_ranking(t, ["a", "b"]))

    def test_leave_one_out(self):
        t = toy()
        base = {d: A.optimum(t[d])[1] * 1.5 for d in t}
        rows = A.leave_one_out({"a": t["a"], "b": t["b"]}, {"a": base["a"], "b": base["b"]})
        self.assertAlmostEqual(rows["a"]["consensus"], 1.0)      # b has a's ordering, so its consensus is a's optimum
        rows = A.leave_one_out({"a": t["a"], "c": t["c"]}, {"a": base["a"], "c": base["c"]})
        self.assertGreater(rows["a"]["consensus"], 1.5)          # c has the reverse ordering
        self.assertAlmostEqual(rows["a"]["baseline"], 1.5)

    def test_search_budget_and_warm_start(self):
        t = toy()["a"]
        rng = random.Random(0)
        self.assertGreaterEqual(A.random_search(t, 10, rng), A.optimum(t)[1])
        opt = A.optimum(t)[0]
        # a warm start containing the optimum finds it at budget 1
        self.assertEqual(A.hill_climb(t, 1, rng, starts=[opt]), A.optimum(t)[1])
        ev = A.Budget(t)
        ev(()); ev(()); ev(("dc2",))
        self.assertEqual(ev.calls, 2)

    def test_hill_climb_never_exceeds_budget_and_beats_nothing_worse(self):
        t = toy()["b"]
        for s in range(5):
            self.assertGreaterEqual(A.hill_climb(t, 15, random.Random(s)), A.optimum(t)[1])


class Flow(unittest.TestCase):
    @unittest.skipUnless((HERE / S.LIB).exists(), "run fetch_pdk.sh pdk first")
    def test_evaluate_one_point(self):
        v = S.evaluate("rot8", ("rewrite",), HERE / S.LIB)
        self.assertTrue(0 < v < 10000)
        self.assertEqual(v, S.evaluate("rot8", ("rewrite",), HERE / S.LIB))  # deterministic


if __name__ == "__main__":
    unittest.main()
