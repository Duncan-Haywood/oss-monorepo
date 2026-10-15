import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import anyctx


def toy():
    its = []
    for f in ("a", "b"):
        for i in range(60):
            its.append({"family": f, "y": 0, "label": "human", "model": "human", "id": f"h{f}{i}", "text": f"we saw the dog run home number {i} quickly lol"})
            its.append({"family": f, "y": 1, "label": "llm", "model": "m", "id": f"m{f}{i}", "text": f"Certainly! Here is a thoughtful overview of topic {i}."})
    return its


class T(unittest.TestCase):
    def test_fit_separates(self):
        its = toy()
        anyctx.prepare(its)
        s = anyctx.fit(its, [i["y"] for i in its])
        self.assertGreater(anyctx.auc([i["y"] for i in its], s(its)), 0.99)

    def test_auc_single_class_is_nan(self):
        self.assertNotEqual(anyctx.auc([0, 0], [0.1, 0.2]), anyctx.auc([0, 0], [0.1, 0.2]))

    def test_split_half_disjoint(self):
        a, b = anyctx.split_half(list(range(10)), 0)
        self.assertEqual(sorted(a + b), list(range(10)))

    def test_cross_family_transfer_on_toy(self):
        its = toy(); anyctx.prepare(its)
        tr = [i for i in its if i["family"] == "a"]; te = [i for i in its if i["family"] == "b"]
        s = anyctx.fit(tr, [i["y"] for i in tr])
        self.assertGreater(anyctx.auc([i["y"] for i in te], s(te)), 0.99)

    def test_suite_has_all_families(self):
        if not os.path.exists(anyctx.SUITE): self.skipTest("suite missing")
        self.assertEqual({i["family"] for i in anyctx.load()}, set(anyctx.FAMILIES))


if __name__ == "__main__":
    unittest.main()
