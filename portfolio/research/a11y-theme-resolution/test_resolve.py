#!/usr/bin/env python3
"""Offline tests for resolve.py. Standard library, no network, no install step.

    python3 -m unittest discover

Two of these are regressions against corpus cases that decided the finding, and
they are marked as such: the fassbender newsletter input (a literal `<label for>`
pointing at an id the theme builds from an expression -- a real shipped failure)
and the zalify address fields (id and label both expression-built, so a render
matches them and a literal comparison does not).
"""

from __future__ import annotations

import unittest

import resolve as R


def resources(translations=None, settings=None, label_for=None,
              label_for_raw=None) -> R.Resources:
    res = R.Resources()
    res.translations = dict(translations or {})
    res.settings = dict(settings or {})
    res.label_for = set(label_for or ())
    for path, values in (label_for_raw or {}).items():
        res.label_for_raw[path] = set(values)
    return res


class TestLocaleFlattening(unittest.TestCase):
    def test_nested_keys_become_dotted_paths(self):
        out: dict = {}
        R._flatten({"general": {"search": {"placeholder": "Search"}}}, "", out)
        self.assertEqual(out, {"general.search.placeholder": "Search"})

    def test_non_string_leaves_are_dropped(self):
        out: dict = {}
        R._flatten({"a": 1, "b": True, "c": None, "d": "x"}, "", out)
        self.assertEqual(out, {"d": "x"})

    def test_empty_branch_contributes_nothing(self):
        out: dict = {}
        R._flatten({"general": {}}, "", out)
        self.assertEqual(out, {})


class TestSettingsCollection(unittest.TestCase):
    def test_settings_schema_list_shape(self):
        out: dict = {}
        R._collect_settings(
            [{"name": "Header", "settings": [
                {"type": "text", "id": "heading", "default": "Shop"},
                {"type": "text", "id": "sub", "label": "Subheading"}]}], out)
        self.assertEqual(out, {"heading": "Shop", "sub": None})

    def test_inline_schema_block_with_nested_blocks(self):
        out: dict = {}
        R._collect_settings(
            {"settings": [{"type": "text", "id": "a", "default": "A"}],
             "blocks": [{"settings": [{"type": "text", "id": "b",
                                       "default": "B"}]}]}, out)
        self.assertEqual(out, {"a": "A", "b": "B"})

    def test_dict_with_an_id_but_no_schema_marker_is_ignored(self):
        out: dict = {}
        R._collect_settings({"id": "not-a-setting", "value": 3}, out)
        self.assertEqual(out, {})

    def test_first_definition_wins(self):
        out: dict = {}
        R._collect_settings([{"id": "a", "type": "text", "default": "first"},
                             {"id": "a", "type": "text", "default": "second"}], out)
        self.assertEqual(out, {"a": "first"})


class TestTranslationKey(unittest.TestCase):
    def test_liquid_filter(self):
        self.assertEqual(R.translation_key("'general.search' | t"), "general.search")

    def test_liquid_filter_with_arguments(self):
        self.assertEqual(R.translation_key("'cart.count' | t: count: 3"), "cart.count")

    def test_translate_spelling(self):
        self.assertEqual(R.translation_key('"a.b" | translate'), "a.b")

    def test_vue_i18n(self):
        self.assertEqual(R.translation_key("$t('Filters')"), "Filters")

    def test_ecomplus_dictionary(self):
        self.assertEqual(R.translation_key("_.dictionary('next')"), "next")

    def test_generic_i18n(self):
        self.assertEqual(R.translation_key("i18n('BackToCart')"), "BackToCart")

    def test_dynamic_key_reports_false_not_none(self):
        self.assertIs(R.translation_key("key_variable | t"), False)

    def test_not_a_translation_call(self):
        self.assertIsNone(R.translation_key("product.title"))


class TestLiteralText(unittest.TestCase):
    def test_plain_literal(self):
        self.assertEqual(R.literal_text("'Add to cart'"), "Add to cart")

    def test_literal_with_a_filter(self):
        self.assertEqual(R.literal_text("'Add to cart' | escape"), "Add to cart")

    def test_empty_literal(self):
        self.assertEqual(R.literal_text("''"), "")

    def test_non_literal(self):
        self.assertIsNone(R.literal_text("product.title"))


class TestResolveExpr(unittest.TestCase):
    def test_translation_present_is_named(self):
        res = resources(translations={"a.b": "Search"})
        self.assertEqual(R.resolve_expr("{{ 'a.b' | t }}", res),
                         ("named", "translation"))

    def test_translation_present_but_blank_is_a_defect(self):
        res = resources(translations={"a.b": "   "})
        self.assertEqual(R.resolve_expr("{{ 'a.b' | t }}", res),
                         ("unnamed", "empty_translation"))

    def test_translation_key_absent_is_a_placeholder_not_a_defect(self):
        # Liquid renders "Translation missing: en.a.b"; Vue i18n echoes the key.
        # Non-empty, so the control has a name -- a bad one, but not a barrier.
        res = resources(translations={"other": "x"})
        self.assertEqual(R.resolve_expr("{{ 'a.b' | t }}", res),
                         ("placeholder", "missing_translation_key"))

    def test_no_locale_data_is_unresolved_not_a_defect(self):
        self.assertEqual(R.resolve_expr("{{ 'a.b' | t }}", resources()),
                         ("unresolved", "no_locale_data"))

    def test_dynamic_translation_key_is_unresolved(self):
        res = resources(translations={"a.b": "x"})
        self.assertEqual(R.resolve_expr("{{ some_var | t }}", res),
                         ("unresolved", "dynamic_translation_key"))

    def test_hardcoded_literal_is_named(self):
        self.assertEqual(R.resolve_expr("{{ 'Add to cart' }}", resources()),
                         ("named", "literal"))

    def test_empty_literal_is_a_defect(self):
        self.assertEqual(R.resolve_expr("{{ '' }}", resources()),
                         ("unnamed", "empty_literal"))

    def test_setting_with_a_default_is_named(self):
        res = resources(settings={"heading": "Shop"})
        self.assertEqual(R.resolve_expr("{{ section.settings.heading }}", res),
                         ("named", "setting_default"))

    def test_numeric_setting_default_counts_as_named(self):
        res = resources(settings={"count": 4})
        self.assertEqual(R.resolve_expr("{{ settings.count }}", res),
                         ("named", "setting_default"))

    def test_boolean_setting_default_does_not_count_as_a_name(self):
        res = resources(settings={"flag": True})
        self.assertEqual(R.resolve_expr("{{ settings.flag }}", res)[0],
                         "merchant_deferred")

    def test_setting_without_a_default_defers_to_the_merchant(self):
        res = resources(settings={"heading": None})
        self.assertEqual(R.resolve_expr("{{ section.settings.heading }}", res),
                         ("merchant_deferred", "setting_empty_default"))

    def test_setting_absent_from_the_schema_defers_to_the_merchant(self):
        res = resources(settings={"other": "x"})
        self.assertEqual(R.resolve_expr("{{ block.settings.heading }}", res),
                         ("merchant_deferred", "setting_not_in_schema"))

    def test_no_schema_at_all_is_unresolved(self):
        self.assertEqual(R.resolve_expr("{{ settings.heading }}", resources()),
                         ("unresolved", "no_settings_schema"))

    def test_runtime_theme_object_is_unresolved(self):
        self.assertEqual(R.resolve_expr("{{ shop.name }}", resources()),
                         ("unresolved", "runtime_theme_object"))

    def test_structural_id_used_as_a_name_is_a_placeholder(self):
        self.assertEqual(R.resolve_expr("{{ section.id }}", resources()),
                         ("placeholder", "structural_id_as_name"))

    def test_statement_carries_no_value(self):
        self.assertEqual(R.resolve_expr("{% if cart %}", resources()),
                         ("unresolved", "statement"))

    def test_unmodelled_root(self):
        self.assertEqual(R.resolve_expr("{{ whatever.thing }}", resources()),
                         ("unresolved", "unmodelled_theme_root"))


class TestResolveElement(unittest.TestCase):
    def test_any_named_expression_gives_the_element_a_name(self):
        res = resources(translations={"a": "Search"})
        outcome, _ = R.resolve_element(["{{ 'a' | t }}", "{{ shop.name }}"], res)
        self.assertEqual(outcome, "named")

    def test_unnamed_claimed_only_when_every_expression_resolved_empty(self):
        res = resources(translations={"a": ""})
        self.assertEqual(R.resolve_element(["{{ 'a' | t }}"], res)[0], "unnamed")
        # One unresolved alongside it means the render might still produce a
        # name, so the defect claim is withdrawn.
        self.assertEqual(
            R.resolve_element(["{{ 'a' | t }}", "{{ shop.name }}"], res)[0],
            "unresolved")

    def test_placeholder_outranks_merchant_and_unresolved(self):
        res = resources(translations={"other": "x"}, settings={"h": None})
        outcome, _ = R.resolve_element(
            ["{{ 'a.b' | t }}", "{{ settings.h }}"], res)
        self.assertEqual(outcome, "placeholder")

    def test_no_expressions_is_unresolved(self):
        self.assertEqual(R.resolve_element([], resources()),
                         ("unresolved", ["no_expression"]))


class TestRawValue(unittest.TestCase):
    def test_literal_value_passes_through(self):
        self.assertEqual(R.raw_value("mce-NAME", []), "mce-NAME")

    def test_expression_is_substituted_back(self):
        value = "\x00e0x\x00FirstName"
        self.assertEqual(R.raw_value(value, ["{{ id_prefix }}"]),
                         "{{id_prefix}}FirstName")

    def test_whitespace_spellings_canonicalise_together(self):
        spaced = R.raw_value("\x00e0x\x00X", ["{{ id_prefix }}"])
        tight = R.raw_value("\x00e0x\x00X", ["{{id_prefix}}"])
        self.assertEqual(spaced, tight)

    def test_empty(self):
        self.assertEqual(R.raw_value(None, []), "")


class TestPendingLabelId(unittest.TestCase):
    def test_reads_the_id_out_of_the_audit_reason(self):
        reason = ("no <label for='mce-NAME'> in this file; the label may live "
                  "in another partial of the same page")
        self.assertEqual(R.pending_label_id(reason), "mce-NAME")

    def test_unrecognised_reason(self):
        self.assertIsNone(R.pending_label_id("something else"))


class TestResolveStructural(unittest.TestCase):
    def test_same_file_expression_match(self):
        res = resources(label_for_raw={"a.liquid": {"{{id_prefix}}FirstName"}})
        self.assertEqual(
            R.resolve_structural("{{id_prefix}}FirstName", "a.liquid", res),
            ("named", "label_same_file_expression_match"))

    def test_other_partial_expression_match_is_reported_separately(self):
        res = resources(label_for_raw={"b.liquid": {"{{id_prefix}}FirstName"}})
        self.assertEqual(
            R.resolve_structural("{{id_prefix}}FirstName", "a.liquid", res),
            ("named", "label_other_partial_expression_match"))

    def test_literal_match_in_another_partial(self):
        res = resources(label_for={"Email"})
        self.assertEqual(R.resolve_structural("Email", "a.liquid", res),
                         ("named", "label_in_another_partial"))

    def test_no_label_anywhere_is_a_defect(self):
        self.assertEqual(R.resolve_structural("Email", "a.liquid", resources()),
                         ("unnamed", "no_label_anywhere_in_package"))

    def test_control_without_an_id_is_unresolved(self):
        self.assertEqual(R.resolve_structural("", "a.liquid", resources()),
                         ("unresolved", "control_has_no_id"))

    def test_regression_fassbender_newsletter_literal_label_expression_id(self):
        """The label's `for` is literal; the input's id is built from an
        expression, so the rendered ids never match. A real blocking failure,
        and one a literal-only comparison would call a pass."""
        res = resources(label_for={"mce-NAME"},
                        label_for_raw={"newsletter.liquid": {"mce-NAME"}})
        self.assertEqual(
            R.resolve_structural("{{idPrefix}}_mce-NAME", "newsletter.liquid", res),
            ("unnamed", "no_label_anywhere_in_package"))

    def test_regression_zalify_address_fields_both_expression_built(self):
        """Both sides carry the same prefix expression, so a render matches them.
        `audit` reports the control undecidable because it drops expressions from
        both the id and the `for`; comparing the raw text settles it."""
        res = resources(label_for_raw={
            "address-fields.liquid": {"{{id_prefix}}FirstName"}})
        self.assertEqual(
            R.resolve_structural("{{id_prefix}}FirstName",
                                 "address-fields.liquid", res),
            ("named", "label_same_file_expression_match"))


class TestSummarise(unittest.TestCase):
    def rows(self):
        return [
            {"package": "a", "undecidable": 10, "theme_recoverable": 4,
             "structural_unmatched": 0,
             "outcomes": {"named": 3, "unnamed": 1},
             "by_bucket": {"theme": {"named": 3}, "theme_structural": {"unnamed": 1}},
             "by_check": {"button-no-accessible-name": {"named": 3},
                          "control-no-label": {"unnamed": 1}},
             "reasons": {"translation": 3, "no_label_anywhere_in_package": 1}},
            {"package": "b", "undecidable": 6, "theme_recoverable": 6,
             "structural_unmatched": 1,
             "outcomes": {"named": 1, "unresolved": 4, "placeholder": 1},
             "by_bucket": {"theme": {"named": 1, "unresolved": 4, "placeholder": 1}},
             "by_check": {"button-no-accessible-name": {"named": 1,
                                                        "unresolved": 4,
                                                        "placeholder": 1}},
             "reasons": {"literal": 1, "runtime_theme_object": 4,
                         "missing_translation_key": 1}},
        ]

    def test_totals_and_shares(self):
        summary = R.summarise(self.rows())
        self.assertEqual(summary["packages"], 2)
        self.assertEqual(summary["undecidable"], 16)
        self.assertEqual(summary["theme_recoverable"], 10)
        self.assertEqual(summary["structural_unmatched"], 1)
        self.assertEqual(summary["outcomes"],
                         {"named": 4, "unnamed": 1, "placeholder": 1,
                          "merchant_deferred": 0, "unresolved": 4})
        self.assertEqual(summary["shares_pct"]["named"], 40.0)
        self.assertEqual(summary["defect_pct_of_theme_recoverable"], 10.0)

    def test_settled_excludes_merchant_and_unresolved(self):
        summary = R.summarise(self.rows())
        self.assertEqual(summary["settled_pct"], 60.0)

    def test_shares_sum_to_one_hundred(self):
        summary = R.summarise(self.rows())
        self.assertAlmostEqual(sum(summary["shares_pct"].values()), 100.0, places=1)

    def test_empty_input_does_not_divide_by_zero(self):
        summary = R.summarise([])
        self.assertEqual(summary["theme_recoverable"], 0)
        self.assertEqual(summary["shares_pct"]["named"], 0.0)


class TestPopulationFaithfulness(unittest.TestCase):
    """The committed rows must still describe the sibling pass's population."""

    def test_committed_rows_match_a11y_render_recovery(self):
        import json
        import os
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "results-2026-08-20.json")
        if not os.path.exists(path):
            self.skipTest("no committed results yet")
        with open(path) as handle:
            data = json.load(handle)
        expected = R.recovery_expectation()
        for row in data["packages"]:
            self.assertEqual(row["theme_recoverable"], expected[row["package"]],
                             f"{row['package']} population drifted")
        self.assertEqual(data["summary"]["theme_recoverable"],
                         sum(expected.values()))


if __name__ == "__main__":
    unittest.main()
