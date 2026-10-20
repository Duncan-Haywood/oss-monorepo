import os, random, sys, unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import surface  # noqa: E402


def toy(n=60):
    rng = random.Random(1)
    items = []
    for fam in surface.TRAIN + surface.HELD:
        for i in range(n):
            y = i % 2
            word = "moreover" if y else "lol"
            items.append({"family": fam, "y": y, "label": "llm" if y else "human",
                          "text": " ".join(rng.choice(["a", "b", "c", "the", "cat"]) for _ in range(40)) + " " + word})
    return items


class SurfaceTests(unittest.TestCase):
    def test_views(self):
        self.assertEqual(surface.v_prefix(5)("abcdefgh"), "abcde")
        self.assertEqual(surface.v_lower("AbC"), "abc")
        self.assertEqual(surface.v_nopunct("a, b! c."), "a b c")
        self.assertEqual(surface.v_flat("a \n  b\t c"), "a b c")
        self.assertEqual(surface.v_both("A,  B!"), "a b")

    def test_shuffle_keeps_words_and_is_deterministic(self):
        t = "one two three four five six seven eight"
        a, b = surface.v_shuffle(t), surface.v_shuffle(t)
        self.assertEqual(a, b)
        self.assertEqual(sorted(a.split()), sorted(t.split()))

    def test_evaluate_fits_on_train_only_and_finds_signal(self):
        r = surface.evaluate(toy(), lambda t: t, lambda t: t)
        self.assertGreater(r["auroc"], 0.9)
        self.assertEqual(set(r["by_family"]), set(surface.HELD))

    def test_prefix_too_short_loses_signal(self):
        r = surface.evaluate(toy(), surface.v_prefix(30), surface.v_prefix(30))
        self.assertLess(r["auroc"], 0.8)


if __name__ == "__main__":
    unittest.main()
