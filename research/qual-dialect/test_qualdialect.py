import csv
import tempfile
import unittest
from pathlib import Path

import qualdialect as d


class Tests(unittest.TestCase):
    def test_load_language_keeps_labelled_rows(self):
        p = Path(tempfile.mkdtemp()) / "x.tsv"
        with open(p, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f, delimiter="\t")
            w.writerows([["tweet", "label"], ["a \"quoted\" one", "negative"], ["b", "positive"], ["c", "neutral"], ["d", "weird"]])
        got = d.load_language([p], "pcm")
        self.assertEqual([(g[0], g[2]) for g in got], [("pcm", 1), ("pcm", 0), ("pcm", 0)])

    def test_tokens_drop_mentions_urls_and_keep_diacritics(self):
        self.assertEqual(d.tokens("@user Ọmọ https://t.co/x Bad!"), ["ọmọ", "bad"])

    def test_lexicon_is_english_only(self):
        self.assertEqual((d.lexicon_code("this is terrible"), d.lexicon_code("ina ƙin wannan")), (1, 0))

    def test_nb_threshold_matches_share(self):
        texts = ["mara kyau"] * 10 + ["kyau sosai"] * 30
        y = [1] * 10 + [0] * 30
        nb = d.NB().fit(texts, y).match_rate(texts, y)
        self.assertEqual(sum(nb.code(t) for t in texts), 10)
        self.assertEqual(nb.code("mara"), 1)

    def test_by_language_partitions(self):
        rows = [("hau", "a", 0), ("pcm", "b", 1), ("hau", "c", 1)]
        self.assertEqual(d.by_language(rows)["hau"], {0, 2})



class FastTests(unittest.TestCase):
    def test_ppi_fast_matches_ppi(self):
        llm = [1, 0, 0, 1, 1, 0, 0, 0, 1, 0]
        human = [1, 1, 0, 1, 0, 0, 0, 1, 1, 0]
        gold = [0, 2, 3, 5, 8]
        a = d.ppi_fast(d.Stats(llm), [llm[i] for i in gold], [human[i] for i in gold])
        b = d.q.ppi(llm, [llm[i] for i in gold], [human[i] for i in gold])
        self.assertAlmostEqual(a[0], b[0])
        self.assertAlmostEqual(a[1], b[1])


if __name__ == "__main__":
    unittest.main()
