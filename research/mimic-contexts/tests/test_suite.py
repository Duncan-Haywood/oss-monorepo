import collections, gzip, json, os, random, sys, unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
os.chdir(HERE)
import artifacts, build_suite, evaluate  # noqa: E402


def suite():
    return [json.loads(l) for l in gzip.open("data/suite.jsonl.gz", "rt", encoding="utf8")]


class SuiteTests(unittest.TestCase):
    def test_shape(self):
        c = collections.Counter((it["family"], it["label"]) for it in suite())
        self.assertEqual(sorted({f for f, _ in c}), sorted(build_suite.DOMAINS))
        self.assertEqual(set(c.values()), {build_suite.PER})
        self.assertEqual(len(c), 16)

    def test_labels_consistent_and_unique(self):
        its = suite()
        for it in its:
            self.assertEqual(it["generated"], it["label"] == "llm")
            self.assertEqual(it["label"] == "human", it["model"] == "human")
            self.assertGreaterEqual(len(it["text"]), 200)
            self.assertLessEqual(len(it["text"]), build_suite.MAXCH)
        self.assertEqual(len({it["id"] for it in its}), len(its))

    def test_llm_rows_are_plain_prompt_chat_models(self):
        models = {it["model"] for it in suite() if it["label"] == "llm"}
        self.assertTrue(models <= build_suite.CHAT)

    def test_split_is_by_family(self):
        self.assertFalse(set(evaluate.TRAIN) & set(evaluate.HELD))
        self.assertEqual(sorted(evaluate.TRAIN + evaluate.HELD), sorted(build_suite.DOMAINS))


class ParserTests(unittest.TestCase):
    ROW = "{i},{i},{i},{m},greedy,no,none,{d},T,P,{g}\n"

    def test_domain_regex(self):
        i = "0" * 8 + "-0000-0000-0000-" + "0" * 12
        txt = "partial,row\n" + self.ROW.format(i=i, m="human", d="books", g="x")
        m = build_suite.ROW.search(txt)
        self.assertEqual((m.group(1), m.group(4)), ("human", "books"))

    def test_rows_drops_partial_first_and_last(self):
        i = "a" * 8 + "-0000-0000-0000-" + "0" * 12
        body = "junk,partial\n" + "".join(self.ROW.format(i=i, m="human", d="wiki", g=f"g{n}") for n in range(3))
        got = build_suite.rows(body)
        self.assertEqual([r["generation"] for r in got], ["g0", "g1"])


class MetricTests(unittest.TestCase):
    def test_paired_accuracy_perfect_and_chance(self):
        rng = random.Random(0)
        fam = ["a"] * 20
        y = [0] * 10 + [1] * 10
        self.assertEqual(evaluate.paired_acc([0.0] * 10 + [1.0] * 10, y, fam, rng), 1.0)
        self.assertEqual(evaluate.paired_acc([0.5] * 20, y, fam, rng), 0.5)

    def test_bootstrap_interval_orders(self):
        rng = random.Random(0)
        y = [0, 1] * 50
        lo, hi = evaluate.boot_auc(y, [yy + 0.1 * (i % 3) for i, yy in enumerate(y)], rng, B=50)
        self.assertLessEqual(lo, hi)
        self.assertGreater(lo, 0.9)

    def test_preamble_strip(self):
        self.assertEqual(artifacts.strip_pre("Sure! Here is a recipe:\nMix flour."), "Mix flour.")
        self.assertEqual(artifacts.strip_pre("Mix flour.\nBake."), "Mix flour.\nBake.")
        self.assertEqual(artifacts.strip_pre("Sure!"), "Sure!")

    def test_results_file_matches_json(self):
        r = json.load(open("results.json"))
        self.assertAlmostEqual(r["detectors"]["ngram"]["held_out_families"]["auroc"], 0.927, places=3)
        self.assertIn("0.927", open("results.txt").read())


if __name__ == "__main__":
    unittest.main()
