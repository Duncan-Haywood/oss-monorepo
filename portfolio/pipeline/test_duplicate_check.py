"""Tests for duplicate_check.py.

The tool's whole job is telling a session "you are about to write up something
that already exists" without either missing a real duplicate (useless) or
crying wolf on every "bid-calculator" sharing generic vocabulary (ignored
within a week). Both failure directions are tested against synthetic corpora
so the pinned threshold cannot silently stop meaning anything as the corpus
this repo scores against keeps growing; the live-repo tests then check the
loaders actually parse what's on disk today.

    python3 -m unittest portfolio.pipeline.test_duplicate_check
    (or, from portfolio/pipeline: python3 -m unittest test_duplicate_check)
"""

from __future__ import annotations

import unittest

import duplicate_check as dc


def item(source: str, label: str, text: str) -> dc.Item:
    return dc.Item(source, label, text)


class Tokenizing(unittest.TestCase):
    def test_lowercases_and_drops_stopwords_and_short_words(self):
        words = dc.tokenize("A Private Browser Calculator for Beekeepers, to price a Job.")
        self.assertNotIn("a", words)
        self.assertNotIn("to", words)
        self.assertNotIn("calculator", words)  # in-domain stopword
        self.assertIn("beekeepers", words)
        self.assertIn("price", words)
        self.assertIn("job", words)

    def test_bigrams_are_adjacent_pairs(self):
        self.assertEqual(
            dc.bigrams(["hive", "loss", "risk"]),
            {("hive", "loss"), ("loss", "risk")},
        )
        self.assertEqual(dc.bigrams(["one"]), set())


class WeightedContainment(unittest.TestCase):
    """A word every item shares must count for almost nothing; a rare word
    almost everything -- that asymmetry is the entire point of using IDF
    weighting instead of plain overlap here."""

    def _corpus(self) -> list[dc.Item]:
        # "job" appears in every item (common); "beekeeper" in exactly one.
        return [
            item("venture", "a", "price a job for a client"),
            item("venture", "b", "price a job for a homeowner"),
            item("venture", "c", "price a job for a landlord"),
            item("venture", "target", "beekeeper hive rental job pricing"),
        ]

    def test_rare_word_match_outweighs_common_word_match(self):
        # Query has one common word ("job", in every item) and one rare word
        # ("beekeeper", in exactly one). Matching only the rare half of the
        # query must score meaningfully higher than matching only the common
        # half, even though each case matches exactly one of the two words --
        # that asymmetry is the whole reason this uses IDF weights instead of
        # plain unweighted overlap.
        corpus = self._corpus()
        df = dc.document_frequency(corpus)
        query = ["job", "beekeeper"]
        common_only = dc.weighted_containment(query, dc.tokenize("price a job for a client"), df, len(corpus))
        rare_only = dc.weighted_containment(query, dc.tokenize("beekeeper hive rental pricing"), df, len(corpus))
        self.assertLess(common_only, 0.5)
        self.assertGreater(rare_only, 0.5)
        self.assertGreater(rare_only, common_only * 1.5)

    def test_empty_query_scores_zero_not_an_error(self):
        df = dc.document_frequency(self._corpus())
        self.assertEqual(dc.weighted_containment([], ["anything"], df, 4), 0.0)

    def test_containment_is_asymmetric_by_design(self):
        """A short query fully covered by a much longer item should score
        near 1 -- this is what makes the tool useful against 60-word venture
        descriptions, unlike plain Jaccard which plain-Jaccard-punishes the
        length gap into irrelevance (measured: 0.16 for an actual duplicate
        pair before this function replaced Jaccard)."""
        long_text = "alpha beta gamma delta epsilon zeta eta theta iota kappa"
        corpus = [item("venture", "long", long_text), item("venture", "other", "unrelated words entirely here")]
        df = dc.document_frequency(corpus)
        score = dc.weighted_containment(["alpha", "beta"], dc.tokenize(long_text), df, len(corpus))
        self.assertGreater(score, 0.95)


class BigramContainment(unittest.TestCase):
    def test_shared_bigram_scores_above_zero(self):
        query = dc.bigrams(["hive", "loss", "risk"])
        item_bigrams = dc.bigrams(["a", "hive", "loss", "claim"])
        self.assertGreater(dc.bigram_containment(query, item_bigrams), 0)

    def test_no_shared_bigram_scores_zero(self):
        query = dc.bigrams(["hive", "loss", "risk"])
        item_bigrams = dc.bigrams(["totally", "different", "words"])
        self.assertEqual(dc.bigram_containment(query, item_bigrams), 0.0)

    def test_empty_query_bigrams_score_zero(self):
        self.assertEqual(dc.bigram_containment(set(), {("a", "b")}), 0.0)


class RankAndReport(unittest.TestCase):
    def _corpus(self) -> list[dc.Item]:
        return [
            item(
                "venture",
                "asphalt-sealcoat-bid-calculator",
                "A private browser calculator for sealcoating contractors that prices a "
                "driveway or parking-lot job from square feet, coats, pavement condition, "
                "oil-spot primer, crack fill, and travel.",
            ),
            item(
                "venture",
                "world-clock-widget",
                "iPhone/iPad/Mac app and home-screen widget showing local time, sunrise, "
                "and sunset for major world cities.",
            ),
        ]

    def test_near_duplicate_of_an_existing_venture_is_flagged(self):
        corpus = self._corpus()
        ranked = dc.rank(
            "A private browser calculator for asphalt sealcoating contractors to price "
            "a driveway job from square feet and coats",
            corpus,
        )
        text, flagged = dc.report("query", ranked)
        self.assertTrue(flagged)
        self.assertIn("asphalt-sealcoat-bid-calculator", text)
        self.assertIn("HIGH OVERLAP", text)

    def test_unrelated_niche_is_not_flagged(self):
        corpus = self._corpus()
        ranked = dc.rank(
            "A checklist tool for beekeepers to plan winter hive feeding and mite treatment",
            corpus,
        )
        _, flagged = dc.report("query", ranked)
        self.assertFalse(flagged)

    def test_report_on_zero_overlap_says_so_without_crashing(self):
        text, flagged = dc.report("query", [(0.0, self._corpus()[0])])
        self.assertFalse(flagged)
        self.assertIn("No lexical overlap", text)


class AgainstTheLiveRepo(unittest.TestCase):
    """Sanity checks against what is actually on disk, so a loader regression
    (a renamed field, a moved file) fails here instead of surfacing as a
    duplicate check that silently always says 'looks clear'."""

    @classmethod
    def setUpClass(cls):
        cls.items = dc.load_all()

    def test_loads_a_realistic_number_of_items(self):
        # 199 ventures alone as of 2026-09-07; this is a floor, not a pin, so
        # the test does not need updating every time a venture graduates.
        self.assertGreater(len(self.items), 150)

    def test_every_source_kind_is_present(self):
        sources = {i.source for i in self.items}
        self.assertIn("venture", sources)
        self.assertIn("screened-out.md row", sources)
        self.assertIn("ai-first-markets idea", sources)
        self.assertIn("pipeline candidate", sources)

    def test_a_ventures_own_description_flags_against_itself(self):
        target = next(i for i in self.items if i.label == "septic-pumping-bid-calculator")
        ranked = dc.rank(target.text, self.items)
        _, flagged = dc.report(target.text, ranked)
        self.assertTrue(flagged, "a venture's own description must match itself")
        self.assertEqual(ranked[0][1].label, "septic-pumping-bid-calculator")

    def test_two_unrelated_live_ventures_do_not_flag_each_other(self):
        clock = next(i for i in self.items if i.label == "world-clock-widget")
        septic = next(i for i in self.items if i.label == "septic-pumping-bid-calculator")
        ranked = dc.rank(clock.text, self.items)
        top_septic = next(score for score, i in ranked if i.label == "septic-pumping-bid-calculator")
        self.assertLess(top_septic, dc.WARN_THRESHOLD)

    def test_not_a_venture_marker_excludes_ai_first_markets_from_venture_items(self):
        venture_labels = {i.label for i in self.items if i.source == "venture"}
        self.assertNotIn("ai-first-markets", venture_labels)


if __name__ == "__main__":
    unittest.main()
