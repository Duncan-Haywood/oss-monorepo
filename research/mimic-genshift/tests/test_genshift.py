import os, random, sys, unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import genshift  # noqa: E402


def toy(n=80):
    rng = random.Random(1)
    items = []
    words = ["a", "b", "c", "the", "cat", "dog"]
    for fam in ("f1", "f2"):
        for i in range(n):
            items.append({"family": fam, "y": 0, "label": "human", "model": "human", "decoding": "",
                          "source_id": f"h{fam}{i}", "text": " ".join(rng.choice(words) for _ in range(30)) + " lol"})
            m = genshift.GENS[i % 3]
            items.append({"family": fam, "y": 1, "label": "llm", "model": m, "decoding": genshift.DECODINGS[i % 2],
                          "source_id": f"l{fam}{i}", "text": " ".join(rng.choice(words) for _ in range(30)) + " moreover"})
    return items


class GenshiftTests(unittest.TestCase):
    def test_side_is_stable_and_binary(self):
        it = {"source_id": "abc"}
        self.assertEqual(genshift.side(it), genshift.side(dict(it)))
        self.assertIn(genshift.side(it), (0, 1))

    def test_distinct_n(self):
        self.assertEqual(genshift.distinct(["a b a b"], 1), 0.5)
        self.assertEqual(genshift.distinct(["a b c", "a b c"], 2), 0.5)
        self.assertTrue(genshift.distinct(["a"], 2) != genshift.distinct(["a"], 2))  # NaN: no bigrams

    def test_leave_out_never_fits_on_the_held_out_generator(self):
        items = toy()
        r = genshift.run_axis(items, "model", genshift.GENS)
        for g in genshift.GENS:
            self.assertGreater(r[g]["out"]["auroc"], 0.9)  # the marker word transfers across generators
            self.assertGreater(r[g]["n_llm"], 0)

    def test_single_class_family_is_none(self):
        items = [it for it in toy() if not (it["family"] == "f2" and it["y"] == 1)]
        r = genshift.run_axis(items, "model", genshift.GENS)
        self.assertIsNone(r["llama-chat"]["out_by_family"]["f2"])

    def test_batch_auroc_rises_with_k(self):
        rng = random.Random(0)
        sc = [("f", 0, rng.gauss(0, 1)) for _ in range(200)] + [("f", 1, rng.gauss(0.5, 1)) for _ in range(200)]
        r = genshift.batch_auroc(sc, ks=(1, 8), reps=600)
        self.assertGreater(r["8"], r["1"])


if __name__ == "__main__":
    unittest.main()
