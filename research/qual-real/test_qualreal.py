import csv
import tempfile
import unittest
from pathlib import Path

import qualreal as r

EMO = ["example_very_unclear", "joy", "neutral"] + list(r.NEGATIVE)


def write(rows):
    p = Path(tempfile.mkdtemp()) / "t.csv"
    with open(p, "w", newline="") as f:
        w = csv.DictWriter(f, ["text", "id"] + EMO)
        w.writeheader()
        for text, i, unclear, anger, joy, sad in rows:
            row = {k: 0 for k in EMO}
            row.update({"text": text, "id": i, "example_very_unclear": unclear, "anger": anger, "joy": joy, "sadness": sad})
            w.writerow(row)
    return p


class Tests(unittest.TestCase):
    def test_majority_vote_and_filters(self):
        p = write([("so angry", "a", "False", 1, 0, 0), ("so angry", "a", "False", 1, 0, 0), ("so angry", "a", "False", 0, 1, 0),
                   ("fine", "b", "False", 0, 1, 0), ("fine", "b", "False", 0, 1, 0), ("fine", "b", "False", 0, 0, 1),
                   ("two raters", "c", "False", 1, 0, 0), ("two raters", "c", "False", 1, 0, 0),
                   ("unclear", "d", "True", 1, 0, 0), ("unclear", "d", "False", 1, 0, 0), ("unclear", "d", "False", 1, 0, 0)])
        got = {e[0]: e[2] for e in r.load_examples(p)}
        self.assertEqual(got, {"a": 1, "b": 0})  # c has too few raters, d is unclear

    def test_lexicon_and_group(self):
        self.assertEqual(r.lexicon_code("I hate this"), 1)
        self.assertEqual(r.lexicon_code("lovely day"), 0)
        self.assertEqual(r.group_of(10), "short")
        self.assertEqual(r.group_of(11), "long")

    def test_naive_bayes_learns_a_word(self):
        texts = ["awful thing", "awful day", "awful time"] * 5 + ["lovely thing", "lovely day", "lovely time"] * 5
        nb = r.NaiveBayes().fit(texts, [1] * 15 + [0] * 15)
        self.assertEqual((nb.code("awful"), nb.code("lovely")), (1, 0))

    def test_confusion(self):
        c = r.confusion([1, 1, 0, 0], [1, 0, 1, 0])
        self.assertEqual((c["sens"], c["spec"], c["acc"]), (0.5, 0.5, 0.5))

    def test_ppi_is_exact_when_coder_is_perfect_and_gold_is_all(self):
        human = [1, 0, 1, 1, 0, 0, 1, 0]
        est = r.estimates(human, human, list(range(8)), set(range(8)))
        self.assertAlmostEqual(est["ppi"][0], 0.5)
        self.assertAlmostEqual(est["human"][0], 0.5)

    def test_ppi_corrects_a_biased_coder(self):
        human = [1] * 40 + [0] * 60
        llm = [0] * 20 + [1] * 20 + [0] * 60  # misses half the positives
        est = r.estimates(llm, human, list(range(0, 100, 2)), set(range(100)))
        self.assertAlmostEqual(est["naive"][0], 0.2)
        self.assertAlmostEqual(est["ppi"][0], 0.4)


if __name__ == "__main__":
    unittest.main()
