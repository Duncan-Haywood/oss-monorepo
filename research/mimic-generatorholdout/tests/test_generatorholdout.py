import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import generatorholdout as gh


def toy():
    its = []
    for n in range(120):
        its.append({"source_id": n, "y": 0, "model": "human", "decoding": "", "text": f"we saw the dog run home number {n} lol"})
        g = gh.GENERATORS[n % 3]
        its.append({"source_id": n, "y": 1, "model": g, "decoding": ("greedy", "sampling")[n % 2],
                    "text": f"Certainly! Here is a thoughtful overview of topic {n}."})
    return its


class T(unittest.TestCase):
    def test_folds_keep_source_groups_together(self):
        its = toy()
        for i in its: i["fold"] = gh.fold_of(i)
        by = {}
        for i in its: by.setdefault(i["source_id"], set()).add(i["fold"])
        self.assertTrue(all(len(v) == 1 for v in by.values()))

    def test_held_out_generator_absent_from_training(self):
        trm, tem = gh.conditions(toy())["hold out llama-chat"]
        for i in toy():
            if i["y"]: self.assertNotEqual(trm(i), tem(i))

    def test_run_separates_toy_in_every_condition(self):
        res = gh.run(toy(), sets=["word"])
        for c, r in res.items(): self.assertGreater(r["word"]["mean"], 0.95, c)

    def test_suite_counts(self):
        import featuretransfer as ft
        if not os.path.exists(ft.SUITE): self.skipTest("suite missing")
        c = gh.counts(ft.load()); self.assertEqual(c["human"], 2400); self.assertEqual(sum(c[g] for g in gh.GENERATORS), 2400)

if __name__ == "__main__": unittest.main()
