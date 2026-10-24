import gzip, json, os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import build_threads as bt

try:
    import evaluate as ev
except ImportError:          # scikit-learn missing
    ev = None


def msg(role, text, replies=()):
    return {"role": role, "text": text, "lang": "en", "deleted": False, "synthetic": False,
            "review_result": True, "replies": list(replies)}


def chain(texts):
    node = None
    for role, t in reversed(list(zip(bt.ROLES, texts))):
        node = msg(role, t, [node] if node else [])
    return node


class BuildThreads(unittest.TestCase):
    def write(self, trees):
        f = tempfile.NamedTemporaryFile(suffix=".gz", delete=False)
        with gzip.open(f.name, "wt") as g:
            for i, t in enumerate(trees):
                g.write(json.dumps({"message_tree_id": f"id{i:06d}xx", "prompt": t}) + "\n")
        return f.name

    def test_keeps_full_english_threads(self):
        p = self.write([chain(["a" * 30] * 5)])
        rows = bt.build(p, 10)
        self.assertEqual(len(rows), 1)
        self.assertEqual(len(rows[0]["turns"]), 5)

    def test_drops_short_threads_and_other_languages(self):
        short = chain(["a" * 30] * 5)
        short["replies"][0]["replies"] = []
        french = chain(["a" * 30] * 5)
        french["lang"] = "fr"
        self.assertEqual(bt.build(self.write([short, french]), 10), [])

    def test_one_thread_per_tree_and_no_user_ids(self):
        root = chain(["b" * 30] * 5)
        extra = chain(["c" * 30] * 5)["replies"][0]
        root["replies"].append(extra)
        rows = bt.build(self.write([root]), 10)
        self.assertEqual(len(rows), 1)
        self.assertEqual(set(rows[0]), {"tree", "turns"})

    def test_truncates_messages(self):
        rows = bt.build(self.write([chain(["z" * 900] * 5)]), 10)
        self.assertTrue(all(len(t) == bt.MAXC for t in rows[0]["turns"]))


@unittest.skipIf(ev is None, "scikit-learn not installed")
class Evaluate(unittest.TestCase):
    def rows(self, n=40):
        out = []
        for i in range(n):
            for turn in (2, 3):
                for label in (0, 1):
                    text = ("Sure, here is **a list** of steps" if label else "idk lol, how do i fix my %d thing" % i)
                    out.append({"tree": f"t{i}", "turn": turn, "label": label, "text": text + " " * 0,
                                "prev_a": "answer words here", "prev_p": "question words"})
        return out

    def test_words_and_features(self):
        self.assertEqual(ev.words("Hello, hello World's"), {"hello", "world's"})
        f = ev.context_features({"text": "Sure, here is it.", "prev_a": "here is it", "prev_p": "x"})
        self.assertEqual(len(f), 8)
        self.assertEqual(f[6], 1.0)

    def test_separable_toy_data_is_detected(self):
        rows = self.rows()
        score = ev.fold_scores(rows, "context")
        import numpy as np
        m = ev.metrics(rows, score, sorted({r["tree"] for r in rows}), np.random.default_rng(0), boot=5)
        self.assertGreater(m["thread_auroc"][0], 0.95)
        self.assertEqual(m["thread_paired"][0], 1.0)

    def test_groups_never_cross_folds(self):
        from sklearn.model_selection import GroupKFold
        rows = self.rows()
        g = [r["tree"] for r in rows]
        for tr, te in GroupKFold(5).split(rows, groups=g):
            self.assertFalse({g[i] for i in tr} & {g[i] for i in te})


if __name__ == "__main__":
    unittest.main()
