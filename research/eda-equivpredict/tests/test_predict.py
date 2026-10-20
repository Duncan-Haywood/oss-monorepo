import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from eda_equivpredict import predict as P


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = P.survivors(P.load())

    def test_survivor_count_and_labels(self):
        self.assertEqual(len(self.rows), 27)
        self.assertEqual(sum(P.label(r) for r in self.rows), 16)

    def test_features_parse_id(self):
        f = P.features({"id": "op@140:>>>->>>"})
        self.assertEqual(f, {"kind": "op", "line": 140, "note": ">>>->>>"})

    def test_always_formal_finds_every_proof(self):
        c = P.formal_policy_cost(self.rows, [True] * len(self.rows))
        self.assertEqual(c["equiv_found"], 16)
        self.assertEqual(c["kills_lost"], 0)

    def test_never_formal_costs_nothing(self):
        c = P.formal_policy_cost(self.rows, [False] * len(self.rows))
        self.assertEqual(c["cpu_s"], 0)
        self.assertEqual(c["equiv_found"], 0)

    def test_oracle_is_cheaper_than_always(self):
        a = P.formal_policy_cost(self.rows, [True] * len(self.rows))
        o = P.formal_policy_cost(self.rows, [P.label(r) for r in self.rows])
        self.assertLess(o["cpu_s"], a["cpu_s"])
        self.assertEqual(o["equiv_found"], 16)

    def test_line_split_removes_whole_line(self):
        seen = []
        P.loo_by_line(self.rows, lambda tr, x: seen.append(x["line"] in {P.features(t)["line"] for t in tr}) or True)
        self.assertFalse(any(seen))

    def test_loo_removes_only_self(self):
        sizes = []
        P.loo(self.rows, lambda tr, x: sizes.append(len(tr)) or True)
        self.assertEqual(set(sizes), {len(self.rows) - 1})

    def test_knn_picks_nearest_line(self):
        a = {"i": 1, "id": "lit@10:a", "formal": "equivalent"}
        b = {"i": 2, "id": "lit@100:b", "formal": "undecided"}
        self.assertTrue(P.predict_line_knn([a, b], {"kind": "lit", "line": 20, "note": ""}))
        self.assertFalse(P.predict_line_knn([a, b], {"kind": "lit", "line": 90, "note": ""}))


if __name__ == "__main__":
    unittest.main()
