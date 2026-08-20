"""Tests for `classify.py`.

Two things need pinning: the expression classifier itself, and its faithfulness
to `audit.py` (every undecidable that audit reports must be matched back to an
element by this pass, or the shares are computed against an incomplete
denominator). No network access; the second class re-runs against the committed
per-package rows in `results-2026-08-20.json` via `--recompute-from`.
"""

import json
import os
import unittest

import classify

CORPUS = os.path.join(os.path.dirname(__file__), "results-2026-08-20.json")


class ExpressionClassifier(unittest.TestCase):
    """Each verdict corresponds to a data-owner distinction the README rests on.

    Over-calling `theme` moves undecidables into the "recoverable at build-time"
    share, which is the optimistic direction; under-calling merchant hides the
    per-store residual. Both would misrepresent the finding, so the split is
    tested with named cases, not spot-checked."""

    def _classify(self, expr):
        return classify.classify_expr(expr)

    # theme -- rendered same for every store that installs the theme --------
    def test_liquid_translate_filter_is_theme(self):
        self.assertEqual(self._classify("{{ 'products.add_to_bag' | t }}"), "theme")

    def test_vue_i18n_helper_is_theme(self):
        self.assertEqual(self._classify("{{ $t('Cancel') }}"), "theme")

    def test_ecomplus_dictionary_helper_is_theme(self):
        self.assertEqual(self._classify("<%= _.dictionary('previous') %>"), "theme")

    def test_hardcoded_literal_is_theme(self):
        self.assertEqual(self._classify("{{ 'Continue shopping' }}"), "theme")

    def test_settings_object_is_theme(self):
        self.assertEqual(self._classify("{{ section.settings.title }}"), "theme")

    def test_structural_id_root_is_theme(self):
        # Blocks static <label for> matching, but renders to a theme-fixed id.
        self.assertEqual(self._classify("{{ product_form_id }}"), "theme")
        self.assertEqual(self._classify("{{ idPrefix }}"), "theme")
        self.assertEqual(self._classify("{{ section_id }}"), "theme")

    def test_theme_root_words_stay_theme(self):
        for root in ("routes", "shop", "locale", "linklists", "menu"):
            self.assertEqual(self._classify("{{ %s.title }}" % root), "theme",
                             "%s should classify as theme" % root)

    # merchant -- rendered against a specific store's content --------------
    def test_product_root_is_merchant(self):
        self.assertEqual(self._classify("{{ product.title }}"), "merchant")

    def test_image_alt_is_merchant(self):
        self.assertEqual(self._classify("{{ image.alt }}"), "merchant")

    def test_collection_and_variant_are_merchant(self):
        self.assertEqual(self._classify("{{ collection.title }}"), "merchant")
        self.assertEqual(self._classify("{{ current_variant.id }}"), "merchant")

    # context -- template alone cannot say whose data this is --------------
    def test_bare_local_is_context(self):
        # `title` / `slug` / `child.url` may be a loop variable, a controller
        # binding, a Vue prop -- the template does not know, and treating any of
        # them as theme would overstate the recoverable share.
        for expr in ("<%= title %>", "<%= slug %>", "{{ child.url }}",
                     "<%= subcategory.name %>"):
            self.assertEqual(self._classify(expr), "context",
                             "%s should classify as context" % expr)

    def test_statement_syntax_is_context(self):
        # `{% if %}` / `<% } else { %>` change presence, not data; not a value
        # source, so its owner cannot be identified.
        for expr in ("{% if x %}", "{%- for p in c -%}", "<% } else { %>",
                     "<?php echo $x; ?>"):
            self.assertEqual(self._classify(expr), "context",
                             "%s should classify as context" % expr)


class ElementProvenance(unittest.TestCase):
    """The element-level verdict is *not* a majority vote over the expressions
    inside it: if any name-giving expression is merchant data, the rendered
    name is per-store regardless of what else is present. This is deliberate
    and worth pinning, because it is what makes the merchant share a lower
    bound rather than an average."""

    def test_merchant_wins_over_theme(self):
        self.assertEqual(
            classify.element_provenance(["{{ 'buy' | t }}", "{{ product.title }}"]),
            "merchant")

    def test_all_theme_is_theme(self):
        self.assertEqual(
            classify.element_provenance(["{{ 'buy' | t }}", "{{ section.id }}"]),
            "theme")

    def test_any_context_downgrades_from_theme(self):
        self.assertEqual(
            classify.element_provenance(["{{ 'buy' | t }}", "<%= slug %>"]),
            "context")

    def test_empty_is_context(self):
        # No name-giving expression: the reason the element is undecidable is
        # itself context-dependent (e.g. a framework binding whose target was
        # a template statement).
        self.assertEqual(classify.element_provenance([]), "context")


class CorpusRoundTrip(unittest.TestCase):
    """The committed results file re-derives its own summary offline, so a
    change to the classifier is measurable without a re-fetch. This is the
    same pattern `measure_themes.py` uses and the reason the raw per-package
    rows are committed."""

    def setUp(self):
        with open(CORPUS) as handle:
            self.data = json.load(handle)

    def test_recompute_matches_stored(self):
        recomputed = classify.summarise(self.data["packages"])
        self.assertEqual(recomputed, self.data["summary"])

    def test_all_undecidables_matched(self):
        # The whole finding rests on `matched == undecidable` -- an unmatched
        # undecidable would be missing from the provenance denominator and
        # would silently inflate whichever share captured the rest.
        summary = self.data["summary"]
        self.assertEqual(summary["matched"], summary["undecidable"])
        self.assertEqual(summary["match_rate_pct"], 100.0)

    def test_denominator_is_the_evidence_records_491(self):
        # The 491 undecidables `a11y-evidence-record` measured are the ones
        # classified here. A different total would mean this pass is measuring
        # a different population and the finding could not be composed with
        # that directory's.
        self.assertEqual(self.data["summary"]["undecidable"], 491)

    def test_provenance_partition_is_exhaustive(self):
        summary = self.data["summary"]
        total = sum(summary["provenance"].values())
        self.assertEqual(total, summary["undecidable"])

    def test_shares_sum_to_one(self):
        shares = self.data["summary"]["shares_pct"]
        self.assertAlmostEqual(
            shares["theme_recoverable"]
            + shares["merchant_per_store"]
            + shares["context_dependent"],
            100.0, places=0)

    def test_by_check_totals_match_provenance_totals(self):
        summary = self.data["summary"]
        prov_from_checks = {}
        for check_counts in summary["by_check"].values():
            for verdict, n in check_counts.items():
                prov_from_checks[verdict] = prov_from_checks.get(verdict, 0) + n
        self.assertEqual(prov_from_checks,
                         {k: v for k, v in summary["provenance"].items() if v})


if __name__ == "__main__":
    unittest.main()
