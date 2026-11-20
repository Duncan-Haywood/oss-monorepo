import json, os, sys, unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import whitebox  # noqa: E402

H = ["we went home and ate soup", "my cat is old and lazy", "ate soup at home today", "the old cat sat home"] * 6
M = ["moreover this comprehensive tapestry delves deeply", "furthermore the multifaceted landscape is rich", "moreover a comprehensive landscape delves in",
     "furthermore this rich tapestry is multifaceted"] * 6
DET = whitebox.fit(H + M, [0] * len(H) + [1] * len(M))


class WhiteboxTests(unittest.TestCase):
    def test_k0_is_identity(self):
        self.assertEqual(whitebox.attack(DET, M[0], 0, "delete", "x"), M[0])

    def test_delete_removes_machine_words(self):
        out = whitebox.attack(DET, M[0], 2, "delete", "x")
        self.assertLess(len(out), len(M[0]))

    def test_swap_keeps_word_count(self):
        out = whitebox.attack(DET, M[0], 2, "swap", "home")
        self.assertEqual(len(out.split()), len(M[0].split()))

    def test_attack_lowers_machine_score(self):
        s0 = whitebox.score(DET, [M[0]])[0]
        s1 = whitebox.score(DET, [whitebox.attack(DET, M[0], 3, "delete", "x")])[0]
        self.assertLess(s1, s0)

    def test_committed_results(self):
        r = json.load(open(os.path.join(HERE, "results.json")))
        d = r["modes"]["delete"]
        self.assertEqual([x["k"] for x in d], whitebox.BUDGETS)
        self.assertLess(d[-1]["auroc_fixed"], d[0]["auroc_fixed"])

    def test_committed_numbers_pinned(self):
        r = json.load(open(os.path.join(HERE, "results.json")))
        d = {x["k"]: x["auroc_fixed"] for x in r["modes"]["delete"]}
        self.assertAlmostEqual(d[0], 0.948, 3)
        self.assertAlmostEqual(d[10], 0.738, 3)
        self.assertAlmostEqual(d[20], 0.487, 3)

    def test_human_filler_is_the_most_human_ward_unigram(self):
        vec, clf = DET
        f = whitebox.human_filler(DET)
        w = {t: clf.coef_[0][j] for t, j in vec.vocabulary_.items() if " " not in t}
        self.assertEqual(w[f], min(w.values()))

    def test_ranking_edits_the_most_machine_ward_word_first(self):
        vec, clf = DET
        out = whitebox.attack(DET, M[0], 1, "delete", "x")
        gone = set(M[0].split()) - set(out.split())
        self.assertEqual(len(gone), 1)
        X = vec.transform([M[0]]).toarray()[0]
        contrib = {t: X[vec.vocabulary_[t]] * clf.coef_[0][vec.vocabulary_[t]] for t in M[0].split() if t in vec.vocabulary_}
        self.assertAlmostEqual(contrib[gone.pop()], max(contrib.values()))  # ties allowed; a reversed ranking picks the minimum


if __name__ == "__main__":
    unittest.main()
