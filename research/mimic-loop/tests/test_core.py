import os, random, sys, unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import core  # noqa: E402


def toy_space():
    return core.Space("base.", ["a", "b", "c", "d"], max_shots=2, pool=3)


def counting(fn):
    calls = []
    def ev(c):
        calls.append(core.key(c))
        return fn(c)
    return ev, calls


class MetricTests(unittest.TestCase):
    def test_auroc(self):
        self.assertEqual(core.auroc([3, 4], [1, 2]), 1.0)
        self.assertEqual(core.auroc([1, 2], [3, 4]), 0.0)
        self.assertEqual(core.auroc([1], [1]), 0.5)

    def test_trunc_word_boundary(self):
        t = core.trunc("word " * 200)
        self.assertLessEqual(len(t), core.CHARS)
        self.assertTrue(t.endswith("word"))

    def test_copy_rate(self):
        ref = core.ngrams("the quick brown fox jumps over the lazy dog")
        self.assertEqual(core.copy_rate("the quick brown fox jumps", ref), 1.0)
        self.assertEqual(core.copy_rate("nothing alike here at all friend", ref), 0.0)

    def test_pair_fitness_range_and_order(self):
        self.assertGreater(core.pair_fitness([2, 2, 2]), core.pair_fitness([0.1, 0.1, 0.1]))
        self.assertLess(core.pair_fitness([-3, -3]), 0.1)
        self.assertGreater(core.pair_fitness([0.5, -0.5]), 0.3)

    def test_boot_ci_contains_mean(self):
        xs = [1, 0] * 20
        lo, hi = core.boot_ci(xs)
        self.assertLess(lo, 0.5); self.assertGreater(hi, 0.5)

    def test_distinct(self):
        self.assertEqual(core.distinct_n(["a b c", "a b c"]), 0.5)


class ProposerTests(unittest.TestCase):
    def test_every_proposer_spends_exactly_the_budget(self):
        sp = toy_space()
        inc = core.make(sp.base, sp.bank, (0, 0, 0, 0))
        for name, run in core.PROPOSERS.items():
            for budget in (1, 4, 7):
                ev, calls = counting(lambda c: sum(c["bits"] or ()) if c["bits"] else 0.5)
                (b, f), hist = run(sp, ev, inc, 0.0, budget, random.Random(1), write=lambda mp: "some new instruction text here",
                                   role="r", failures=["x"])
                self.assertEqual(len(calls), budget, (name, budget))
                self.assertEqual(len(hist), budget + 1)

    def test_best_never_worse_than_incumbent(self):
        sp = toy_space()
        inc = core.make(sp.base, sp.bank, (1, 1, 1, 1))
        for name, run in core.PROPOSERS.items():
            (b, f), _ = run(sp, lambda c: 0.0, inc, 5.0, 3, random.Random(2), write=lambda mp: "x" * 40)
            self.assertEqual(f, 5.0, name)

    def test_search_finds_optimum_on_toy_problem(self):
        sp = toy_space()
        inc = core.make(sp.base, sp.bank, (0, 0, 0, 0))
        target = (1, 0, 1, 1)
        ev = lambda c: -sum(x != y for x, y in zip(c["bits"], target))
        (b, f), _ = core.run_grips(sp, ev, inc, ev(inc), 40, random.Random(3))
        self.assertEqual(f, 0)

    def test_grips_edits_one_fragment(self):
        sp = toy_space()
        inc = core.make(sp.base, sp.bank, (1, 0, 0, 0))
        seen = []
        def ev(c):
            seen.append(c["bits"]); return 0.0
        core.run_grips(sp, ev, inc, 1.0, 5, random.Random(4))
        for bits in seen:
            self.assertLessEqual(sum(x != y for x, y in zip(bits, (1, 0, 0, 0))), 2)

    def test_llm_falls_back_when_model_writes_nothing(self):
        sp = toy_space()
        inc = core.make(sp.base, sp.bank, (1, 0, 0, 0))
        seen = []
        core.run_llm(sp, lambda c: seen.append(c["text"]) or 0.0, inc, 0.0, 2, random.Random(0), write=lambda mp: "")
        self.assertEqual(seen, [inc["text"]] * 2)

    def test_meta_prompt_shows_scores_and_failures(self):
        inc = core.free("be human please, really")
        mp = core.meta_prompt("do a thing", [(inc, 0.75)], ["a failing text"])
        self.assertIn("0.75", mp); self.assertIn("a failing text", mp); self.assertIn("be human", mp)


class ContextTests(unittest.TestCase):
    def test_splits_disjoint_and_length_controlled(self):
        for fam in core.FAMILIES:
            c = core.load_contexts(fam)
            ids = [x["id"] for k in ("opt", "test", "pool") for x in c[k]]
            self.assertEqual(len(ids), len(set(ids)))
            self.assertTrue(all(len(x["text"]) <= core.CHARS for x in c["refs"]))
            self.assertTrue(all(len(x["text"]) >= 300 for x in c["refs"]))

    def test_rendering_includes_selected_fragments_only(self):
        sp = toy_space()
        c = sp.with_bits(core.make(sp.base, sp.bank, (0,) * 4), (1, 0, 1, 0))
        self.assertEqual(c["text"], "base. a c")


class StubLM:
    """Detector that prefers the longer text; imitator echoes its system prompt: enough to drive game.py."""
    calls = {"generate": 0, "score": 0}
    def generate(self, systems, users, **kw):
        return [("short" if "short" in s else "a longer imitation text " * 20) for s in systems]
    def logit_diff(self, systems, users, pos, neg, **kw):
        out = []
        for u in users:
            a, b = u.split("Text B:")[0], u.split("Text B:")[1]
            out.append(1.0 if len(a) > len(b) else -1.0)
        return out


class GameTests(unittest.TestCase):
    def test_margins_cancel_position_bias(self):
        import game
        class Biased(StubLM):
            def logit_diff(self, systems, users, pos, neg, **kw):
                return [5.0] * len(users)  # always says "A": pure position bias
        ctx = core.load_contexts("reddit")
        g = game.Game(Biased(), "reddit", ctx)
        det = core.free("d")
        m = g.margins(det, ctx["opt"][:4], ["x"] * 4)
        self.assertEqual(m, [0.0] * 4)

    def test_margins_sign_follows_detector(self):
        import game
        ctx = core.load_contexts("reddit")
        g = game.Game(StubLM(), "reddit", ctx)
        items = ctx["opt"][:3]
        self.assertTrue(all(m > 0 for m in g.margins(core.free("d"), items, ["tiny"] * 3)))
        self.assertTrue(all(m < 0 for m in g.margins(core.free("d"), items, ["z" * 3000] * 3)))

    def test_valid_rejects_copying_and_emptiness(self):
        import game
        ctx = core.load_contexts("reddit")
        g = game.Game(StubLM(), "reddit", ctx)
        human = [x["text"] for x in ctx["refs"] if x not in ctx["test"]][:4]
        self.assertFalse(g.valid(human)[0])          # verbatim copies
        self.assertFalse(g.valid(["ok"] * 4)[0])     # says almost nothing
        fresh = ["completely different words about something unrelated " * 7] * 4
        self.assertTrue(g.valid([core.trunc(t) for t in fresh])[0])


if __name__ == "__main__":
    unittest.main()
