import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import anyprompt as a


def fake(n_cand=3, fams=("a", "b", "c", "d", "e", "f", "g", "h")):
    """Candidate 2 separates classes perfectly everywhere; candidates 0 and 1 are inverted/uninformative."""
    cache = {}
    for c in range(n_cand):
        for f in fams:
            for sp in ("opt", "test"):
                hum = [1.0, 2.0, 3.0] if c == 2 else [0.0, 0.0, 0.0] if c == 1 else [-3.0, -2.0, -1.0]
                llm = [-3.0, -2.0, -1.0] if c == 2 else [0.0, 0.0, 0.0] if c == 1 else [1.0, 2.0, 3.0]
                cache[f"{c}|{f}|{sp}|human"], cache[f"{c}|{f}|{sp}|llm"] = hum, llm
    return a.nest(cache)


class T(unittest.TestCase):
    def test_nest(self):
        s = fake()
        self.assertEqual(s[2]["a"]["test"]["human"], [1.0, 2.0, 3.0])

    def test_pick_finds_separating_prompt(self):
        s = fake()
        self.assertEqual(a.pick(s, 3, ["a", "b"]), 2)

    def test_ties_go_to_plain(self):
        s = fake(1)
        self.assertEqual(a.pick(s, 1, ["a"]), 0)

    def test_regimes_cover_every_family_once_held_out(self):
        s = fake()
        fams = sorted(s[0])
        rows = a.regimes(s, fams, 3)
        held = sorted(r["family"] for r in rows if "universal_heldout" in r)
        self.assertEqual(held, fams)
        for r in rows:
            if "universal_heldout" in r:
                self.assertEqual(r["universal_heldout"], 1.0)
                self.assertEqual(r["plain"], 0.0)
                self.assertEqual(r["oracle"], 1.0)

    def test_held_out_family_never_selects_the_prompt(self):
        s = fake()
        fams = sorted(s[0])
        for held in [fams[i::a.FOLDS] for i in range(a.FOLDS)]:
            seen = [f for f in fams if f not in held]
            self.assertFalse(set(seen) & set(held))

    def test_candidates_distinct_and_plain_first(self):
        cs = a.candidates()
        self.assertEqual(len(cs), a.N_CAND)
        self.assertEqual(cs[0]["text"], a.BASE)
        self.assertEqual(len({c["text"] for c in cs}), a.N_CAND)

    @unittest.skipUnless(os.path.exists(a.SUITE), "suite not present")
    def test_split_sizes_and_disjoint(self):
        d = a.load()
        self.assertEqual(len(d), 8)
        for fam, v in d.items():
            for lab in ("human", "llm"):
                o, t = v[lab]["opt"], v[lab]["test"]
                self.assertEqual((len(o), len(t)), (a.N_OPT, a.N_TEST))
                self.assertFalse(set(o) & set(t))


if __name__ == "__main__":
    unittest.main()
