import json, os, random, sys, unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import blackbox  # noqa: E402

W = blackbox.W
H = ["we went home and ate soup", "my cat is old and lazy", "ate soup at home today", "the old cat sat home"] * 6
M = ["moreover this comprehensive tapestry delves deeply", "furthermore the multifaceted landscape is rich", "moreover a comprehensive landscape delves in",
     "furthermore this rich tapestry is multifaceted"] * 6
DET = W.fit(H + M, [0] * len(H) + [1] * len(M))


class BlackboxTests(unittest.TestCase):
    def test_q0_uses_no_queries(self):
        _, used = blackbox.attack(DET, M[0], 0, 2, random.Random(0))
        self.assertEqual(used, 0)

    def test_queries_bounded_by_types(self):
        _, used = blackbox.attack(DET, M[0], 200, 2, random.Random(0))
        self.assertEqual(used, len(blackbox.types(M[0])) + 1)

    def test_attack_lowers_machine_score(self):
        t, _ = blackbox.attack(DET, M[0], 50, 3, random.Random(0))
        self.assertLess(W.score(DET, [t])[0], W.score(DET, [M[0]])[0])

    def test_delete_removes_whole_word_type(self):
        self.assertNotIn("the", blackbox.delete("the cat and The dog", {"the"}).lower().split())

    def test_committed_results(self):
        r = json.load(open(os.path.join(HERE, "results.json")))
        a = {(x["k"], x["q"]): x["auroc"] for x in r["rows"]}
        self.assertLess(a[(20, 200)], a[(20, 0)])
        self.assertEqual(sorted({q for _, q in a}), blackbox.QUERIES)


if __name__ == "__main__":
    unittest.main()
