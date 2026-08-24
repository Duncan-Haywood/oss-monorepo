#!/usr/bin/env python3
"""Tests for the static WCAG audit and the evidence record it produces.

Standard-library `unittest` rather than pytest: this directory has no
dependencies to install, and a probe whose tests need a package manager is a
probe nobody re-runs.

    python3 -m unittest discover -s portfolio/research/a11y-evidence-record

Two things are pinned harder than the rest, because they are the parts a
customer-facing deliverable depends on:

1. **Undecidable is never reported as a finding.** Every template-expression
   case below asserts an empty `findings` list, not just a non-empty
   `undecidable` list. A false defect claimed against a shop's markup is the
   failure mode the whole positioning exists to avoid.
2. **The record always carries its coverage boundary.** `evidence_record()` is
   asserted to emit `NOT_TESTED` even when nothing was found at all.
"""

import re
import sys
import unittest

import audit


def findings(source, path="t.liquid"):
    return audit.audit_source(source, path)["findings"]


def checks(source, path="t.liquid"):
    return sorted(f["check"] for f in findings(source, path))


# Colour checks that fire (or go undecidable) on almost every fixture that
# has text or a link, and so have to be filtered out of helpers that are
# asserting a *different* check. Each has its own class that reads them
# unfiltered.
_COLOUR_CHECKS = {"text-contrast-fail", "color-only-link"}


def undecidable(source, path="t.liquid"):
    # Colour checks excluded: every text-bearing fixture is undecidable for
    # 1.4.3 by construction (none carries a stylesheet), and an in-prose
    # link can produce a 1.4.1 row the same way. Those would appear in
    # nearly every list below and say nothing about the check the test is
    # actually exercising. The `Contrast` and `UseOfColor` classes assert
    # on them directly, unfiltered.
    return sorted(
        u["check"] for u in audit.audit_source(source, path)["undecidable"]
        if u["check"] not in _COLOUR_CHECKS
    )


def all_undecidable(source, path="t.liquid", stylesheet=None):
    return sorted(
        u["check"]
        for u in audit.audit_source(source, path, stylesheet=stylesheet)["undecidable"]
    )


DOC = "<html lang='en'><head><title>Shop</title></head><body>{}</body></html>"


class Images(unittest.TestCase):
    def test_missing_alt_is_blocking(self):
        result = findings("<img src='a.png'>")
        self.assertEqual([f["check"] for f in result], ["img-alt-missing"])
        self.assertEqual(result[0]["severity"], "blocking")
        self.assertEqual(result[0]["success_criterion"], "1.1.1 Non-text Content")

    def test_empty_alt_is_a_decorative_declaration_not_a_defect(self):
        self.assertEqual(checks("<img src='a.png' alt=''>"), [])

    def test_role_presentation_without_alt_is_accepted(self):
        self.assertEqual(checks("<img src='a.png' role='presentation'>"), [])

    def test_filename_alt_is_reported_but_only_degrading(self):
        result = findings("<img src='a.png' alt='IMG_2231.JPG'>")
        self.assertEqual([f["severity"] for f in result], ["degrading"])

    def test_alt_from_a_liquid_expression_is_undecidable_not_a_defect(self):
        source = "<img src='a.png' alt='{{ image.alt }}'>"
        self.assertEqual(checks(source), [])
        self.assertEqual(undecidable(source), ["img-alt-missing"])

    def test_vue_binding_counts_as_an_alt_attribute(self):
        self.assertEqual(checks('<img src="a.png" :alt="product.title">'), [])

    def test_angular_binding_counts_too(self):
        self.assertEqual(checks('<img src="a.png" [alt]="product.title">'), [])


class LinksAndButtons(unittest.TestCase):
    def test_icon_only_link_has_no_accessible_name(self):
        self.assertEqual(
            checks("<a href='/cart'><svg></svg></a>"), ["link-no-accessible-name"]
        )

    def test_aria_label_names_the_link(self):
        self.assertEqual(checks("<a href='/cart' aria-label='Cart'><svg></svg></a>"), [])

    def test_image_alt_names_the_link(self):
        self.assertEqual(checks("<a href='/'><img src='logo.png' alt='Home'></a>"), [])

    def test_link_text_from_a_template_expression_is_undecidable(self):
        source = "<a href='/p'>{{ product.title }}</a>"
        self.assertEqual(checks(source), [])
        self.assertEqual(undecidable(source), ["link-no-accessible-name"])

    def test_empty_button_is_blocking(self):
        self.assertEqual(checks("<button></button>"), ["button-no-accessible-name"])

    def test_submit_input_is_named_by_its_value(self):
        self.assertEqual(checks("<input type='submit' value='Buy'>"), [])

    def test_submit_input_without_value_is_reported(self):
        self.assertEqual(checks("<input type='submit'>"), ["button-no-accessible-name"])

    def test_aria_hidden_link_is_skipped_by_the_name_check(self):
        # The name check must not fire on an element that is out of the
        # accessibility tree. The element is still reported, by the 4.1.2
        # check below, for being focusable while hidden from it.
        self.assertNotIn(
            "link-no-accessible-name", checks("<a href='/x' aria-hidden='true'></a>"))


class FormControls(unittest.TestCase):
    def test_unlabelled_input_in_a_document_is_blocking(self):
        self.assertEqual(
            checks(DOC.format("<input type='text' name='q'>"), "page.html"),
            ["control-no-label"],
        )

    def test_wrapping_label_is_enough(self):
        self.assertEqual(checks("<label>Email <input type='email'></label>"), [])

    # A wrapping label only names the control if the label has a name. Before
    # 2026-08-21 any `<label>` ancestor counted, and a control inside an empty
    # wrapper read as labelled — a detection gap the sibling engine did not
    # have. See portfolio/research/a11y-generated-sites/.

    def test_wrapping_label_with_no_text_is_not_enough(self):
        self.assertEqual(
            checks(DOC.format("<label><input type='email' name='e'></label>"), "page.html"),
            ["control-no-label"],
        )

    def test_wrapping_label_naming_through_a_nested_element_is_enough(self):
        self.assertEqual(
            checks(DOC.format("<label><span>Email</span><input type='email'></label>"),
                   "page.html"),
            [],
        )

    def test_wrapping_label_with_an_empty_nested_element_is_not_enough(self):
        self.assertEqual(
            checks(DOC.format("<label><span></span><input type='email' name='e'></label>"),
                   "page.html"),
            ["control-no-label"],
        )

    def test_wrapping_label_named_by_its_own_aria_label_is_enough(self):
        self.assertEqual(
            checks(DOC.format("<label aria-label='Email'><input type='email'></label>"),
                   "page.html"),
            [],
        )

    def test_wrapping_label_whose_text_is_an_expression_is_not_a_finding(self):
        """Undecidable is never reported. A template renders the label text at
        build time, so this engine cannot tell whether it is empty."""
        self.assertEqual(
            checks(DOC.format("<label>{{ t('email') }}<input type='email'></label>"),
                   "page.html"),
            [],
        )

    def test_label_for_resolves_across_the_document(self):
        source = DOC.format("<label for='q'>Search</label><input id='q'>")
        self.assertEqual(checks(source, "page.html"), [])

    def test_label_for_pointing_nowhere_is_reported_in_a_document(self):
        source = DOC.format("<label for='ghost'>Search</label><input aria-label='Search'>")
        self.assertEqual(checks(source, "page.html"), ["label-for-broken"])

    def test_hidden_input_needs_no_label(self):
        self.assertEqual(checks("<input type='hidden' name='id'>"), [])

    def test_fragment_defers_a_missing_label_instead_of_claiming_a_defect(self):
        # A partial may be labelled by markup in the page that includes it.
        source = "<input type='text' id='q'>"
        self.assertEqual(checks(source), [])
        self.assertEqual(undecidable(source), ["control-no-label"])

    def test_unlabelled_control_with_no_id_at_all_is_still_a_defect_in_a_fragment(self):
        self.assertEqual(checks("<input type='text'>"), ["control-no-label"])


class DocumentLevel(unittest.TestCase):
    def test_missing_lang(self):
        source = "<html><head><title>x</title></head><body></body></html>"
        self.assertEqual(checks(source, "page.html"), ["html-lang-missing"])

    def test_missing_title(self):
        source = "<html lang='en'><head></head><body></body></html>"
        self.assertEqual(checks(source, "page.html"), ["title-missing"])

    def test_title_from_an_expression_is_present(self):
        source = "<html lang='en'><head><title>{{ page.title }}</title></head><body></body></html>"
        self.assertEqual(checks(source, "page.html"), [])

    def test_fragments_are_not_charged_with_document_level_criteria(self):
        self.assertEqual(checks("<div>partial</div>"), [])

    def test_viewport_blocking_zoom(self):
        source = "<html lang='en'><head><title>t</title><meta name='viewport' content='width=device-width, user-scalable=no'></head><body></body></html>"
        self.assertEqual(checks(source, "page.html"), ["viewport-scaling-blocked"])

    def test_maximum_scale_below_two_blocks_zoom(self):
        source = "<html lang='en'><head><title>t</title><meta name='viewport' content='width=device-width, maximum-scale=1.0'></head><body></body></html>"
        self.assertEqual(checks(source, "page.html"), ["viewport-scaling-blocked"])

    def test_ordinary_viewport_is_fine(self):
        source = "<html lang='en'><head><title>t</title><meta name='viewport' content='width=device-width, initial-scale=1'></head><body></body></html>"
        self.assertEqual(checks(source, "page.html"), [])

    def test_html_lang_engl_is_degrading_not_clean(self):
        # The overclaim the sibling closed on 2026-08-22: existence was
        # checked, validity was not, so lang="engl" read as a pass.
        source = "<html lang='engl'><head><title>t</title></head><body></body></html>"
        result = findings(source, "page.html")
        lang = [f for f in result if f["check"] == "html-lang-invalid"]
        self.assertEqual(len(lang), 1)
        self.assertEqual(lang[0]["success_criterion"], "3.1.1 Language of Page")
        self.assertEqual(lang[0]["severity"], "degrading")

    def test_html_lang_from_an_expression_is_undecidable_not_a_finding(self):
        source = "<html lang='{{ locale }}'><head><title>t</title></head><body></body></html>"
        self.assertEqual(checks(source, "page.html"), [])
        self.assertEqual(undecidable(source, "page.html"), ["html-lang-invalid"])


class TimingAndLanguage(unittest.TestCase):
    """2.2.1, 2.2.2, 3.1.2 -- ported 2026-08-24 from the sibling engine."""

    def test_positive_meta_refresh_is_blocking(self):
        source = (
            "<html lang='en'><head><title>t</title>"
            "<meta http-equiv='refresh' content='5'></head>"
            "<body><p>x</p></body></html>"
        )
        result = findings(source, "page.html")
        refresh = [f for f in result if f["check"] == "meta-refresh"]
        self.assertEqual(len(refresh), 1)
        self.assertEqual(refresh[0]["success_criterion"], "2.2.1 Timing Adjustable")
        self.assertEqual(refresh[0]["severity"], "blocking")

    def test_immediate_redirect_is_not_a_time_limit(self):
        source = (
            "<html lang='en'><head><title>t</title>"
            "<meta http-equiv='refresh' content='0;url=/next'></head>"
            "<body><p>x</p></body></html>"
        )
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "meta-refresh"],
            [],
        )

    def test_refresh_delay_from_an_expression_is_undecidable(self):
        source = (
            "<html lang='en'><head><title>t</title>"
            "<meta http-equiv='refresh' content='{{ n }}'></head>"
            "<body><p>x</p></body></html>"
        )
        self.assertEqual(checks(source, "page.html"), [])
        self.assertEqual(undecidable(source, "page.html"), ["meta-refresh"])

    def test_marquee_and_blink_are_blocking(self):
        source = DOC.format("<marquee>Sale!</marquee><blink>now</blink>")
        result = findings(source, "page.html")
        moving = [f for f in result if f["check"] == "moving-content"]
        self.assertEqual(sorted(f["element"] for f in moving), ["blink", "marquee"])
        self.assertEqual({f["severity"] for f in moving}, {"blocking"})
        self.assertEqual(moving[0]["success_criterion"], "2.2.2 Pause, Stop, Hide")

    def test_part_lang_engl_is_degrading(self):
        source = DOC.format("<p lang='engl'>bonjour</p>")
        result = findings(source, "page.html")
        parts = [f for f in result if f["check"] == "lang-of-parts-invalid"]
        self.assertEqual(len(parts), 1)
        self.assertEqual(parts[0]["success_criterion"], "3.1.2 Language of Parts")
        self.assertEqual(parts[0]["severity"], "degrading")

    def test_valid_part_lang_is_clean(self):
        self.assertEqual(
            [f["check"] for f in findings(DOC.format("<p lang='fr'>bonjour</p>"),
                                          "page.html")
             if f["check"] == "lang-of-parts-invalid"],
            [],
        )

    def test_root_lang_is_not_charged_as_a_part(self):
        # 3.1.2 is about parts; the root element's language is 3.1.1.
        source = "<html lang='engl'><head><title>t</title></head><body></body></html>"
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")],
            ["html-lang-invalid"],
        )

    def test_part_lang_from_an_expression_is_undecidable(self):
        source = DOC.format("<p lang='{{ locale }}'>bonjour</p>")
        self.assertEqual(checks(source, "page.html"), [])
        self.assertEqual(undecidable(source, "page.html"), ["lang-of-parts-invalid"])

    def test_new_criteria_are_checked_not_declared_untested(self):
        untested = {c.split()[0] for c, _ in audit.NOT_TESTED}
        for number, key in (
            ("2.2.1", "meta-refresh"),
            ("2.2.2", "moving-content"),
            ("3.1.2", "lang-of-parts-invalid"),
        ):
            with self.subTest(criterion=number):
                self.assertIn(key, audit.CHECKS)
                self.assertNotIn(number, untested)


# Enough prose that 2.4.1 has something to skip *to*. A nav above an empty
# region is a page that has not finished rendering, not a 2.4.1 failure --
# the sibling learned that on quick-pick-survey's /app prerender.
_BYPASS_CONTENT = (
    "<div><p>" + ("Every survey you answer sharpens the next one. " * 6)
    + "</p></div>"
)
_BYPASS_NAV = "<nav><a href='/a'>a</a><a href='/b'>b</a></nav>"


class BypassAndLabelInName(unittest.TestCase):
    """2.4.1 and 2.5.3 -- ported 2026-08-24 from the sibling engine."""

    def test_nav_with_no_bypass_mechanism_is_blocking(self):
        source = DOC.format(_BYPASS_NAV + _BYPASS_CONTENT)
        result = findings(source, "page.html")
        bypass = [f for f in result if f["check"] == "bypass-blocks"]
        self.assertEqual(len(bypass), 1)
        self.assertEqual(bypass[0]["success_criterion"], "2.4.1 Bypass Blocks")
        self.assertEqual(bypass[0]["severity"], "blocking")

    def test_main_landmark_suppresses_bypass(self):
        source = DOC.format(_BYPASS_NAV + "<main>" + _BYPASS_CONTENT + "</main>")
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "bypass-blocks"],
            [],
        )

    def test_heading_suppresses_bypass(self):
        source = DOC.format(
            _BYPASS_NAV + "<div><h1>T</h1>" + _BYPASS_CONTENT + "</div>")
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "bypass-blocks"],
            [],
        )

    def test_skip_link_suppresses_bypass(self):
        source = DOC.format(
            "<a href='#c'>Skip</a>" + _BYPASS_NAV
            + "<div id='c'>" + _BYPASS_CONTENT + "</div>")
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "bypass-blocks"],
            [],
        )

    def test_role_main_suppresses_bypass(self):
        source = DOC.format(
            _BYPASS_NAV + "<div role='main'>" + _BYPASS_CONTENT + "</div>")
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "bypass-blocks"],
            [],
        )

    def test_role_navigation_counts_as_a_block(self):
        source = DOC.format(
            "<div role='navigation'><a href='/a'>a</a></div>" + _BYPASS_CONTENT)
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "bypass-blocks"],
            ["bypass-blocks"],
        )

    def test_page_with_nothing_to_bypass_is_left_alone(self):
        source = DOC.format(_BYPASS_CONTENT)
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "bypass-blocks"],
            [],
        )

    def test_many_links_count_as_a_block_without_a_nav(self):
        links = "".join(f"<a href='/p{i}'>p{i}</a>" for i in range(12))
        source = DOC.format(f"<div>{links}</div>" + _BYPASS_CONTENT)
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "bypass-blocks"],
            ["bypass-blocks"],
        )

    def test_fragment_without_a_body_is_not_a_page(self):
        # Sibling: no <body> means no page, so no 2.4.1 finding.
        self.assertEqual(
            [f["check"] for f in findings(_BYPASS_NAV + _BYPASS_CONTENT)
             if f["check"] == "bypass-blocks"],
            [],
        )

    def test_unrendered_shell_is_not_a_bypass_failure(self):
        shell = '<div class="flex"><div>Loading&#8230;</div></div>' + _BYPASS_NAV
        source = DOC.format(shell)
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "bypass-blocks"],
            [],
        )

    def test_expression_href_that_could_be_a_skip_link_is_undecidable(self):
        source = DOC.format(
            "<a href='{{ skip }}'>Skip</a>" + _BYPASS_NAV + _BYPASS_CONTENT)
        self.assertEqual(checks(source, "page.html"), [])
        self.assertEqual(undecidable(source, "page.html"), ["bypass-blocks"])

    def test_aria_label_not_containing_visible_text_is_blocking(self):
        source = DOC.format('<button aria-label="Submit order">Buy now</button>')
        result = findings(source, "page.html")
        labels = [f for f in result if f["check"] == "label-in-name"]
        self.assertEqual(len(labels), 1)
        self.assertEqual(labels[0]["success_criterion"], "2.5.3 Label in Name")
        self.assertEqual(labels[0]["severity"], "blocking")
        self.assertIn("Buy now", labels[0]["detail"])
        self.assertIn("Submit order", labels[0]["detail"])

    def test_accessible_name_containing_the_visible_text_passes(self):
        source = DOC.format(
            '<button aria-label="Buy now, adds to cart">Buy now</button>')
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "label-in-name"],
            [],
        )

    def test_match_ignores_case_and_punctuation(self):
        source = DOC.format(
            '<button aria-label="please BUY NOW!">Buy now.</button>')
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "label-in-name"],
            [],
        )

    def test_link_with_mismatched_name_is_flagged(self):
        source = DOC.format('<a href="/x" aria-label="Read more">Shipping</a>')
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "label-in-name"],
            ["label-in-name"],
        )

    def test_link_without_href_is_not_a_widget(self):
        source = DOC.format('<a aria-label="Read more">Shipping</a>')
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "label-in-name"],
            [],
        )

    def test_explicit_role_takes_the_element_out_of_scope(self):
        source = DOC.format(
            '<button role="presentation" aria-label="Submit order">'
            "Buy now</button>")
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "label-in-name"],
            [],
        )

    def test_explicit_widget_role_brings_a_plain_element_into_scope(self):
        source = DOC.format(
            '<div role="button" aria-label="Submit order">Buy now</div>')
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "label-in-name"],
            ["label-in-name"],
        )

    def test_aria_labelledby_is_resolved_not_assumed(self):
        source = DOC.format(
            '<span id="n">Submit order</span>'
            '<button aria-labelledby="n">Buy now</button>')
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "label-in-name"],
            ["label-in-name"],
        )

    def test_unresolvable_aria_labelledby_is_left_alone(self):
        source = DOC.format(
            '<button aria-labelledby="missing">Buy now</button>')
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "label-in-name"],
            [],
        )

    def test_no_override_is_never_a_finding(self):
        source = DOC.format("<button>Buy now</button>")
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "label-in-name"],
            [],
        )

    def test_glyph_only_label_is_not_text_presented_visually(self):
        source = DOC.format('<button aria-label="Close">×</button>')
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "label-in-name"],
            [],
        )

    def test_image_label_is_refused_rather_than_guessed_from_alt(self):
        source = DOC.format(
            '<button aria-label="Submit order">'
            '<img src="b.png" alt="Buy now"></button>')
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "label-in-name"],
            [],
        )

    def test_input_value_is_the_visible_label(self):
        source = DOC.format(
            '<input type="submit" value="Buy now" aria-label="Submit order">')
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "label-in-name"],
            ["label-in-name"],
        )

    def test_text_input_is_out_of_scope(self):
        source = DOC.format(
            '<input type="text" value="Buy now" aria-label="Search products">')
        self.assertEqual(
            [f["check"] for f in findings(source, "page.html")
             if f["check"] == "label-in-name"],
            [],
        )

    def test_aria_label_from_an_expression_is_undecidable(self):
        source = DOC.format(
            '<button aria-label="{{ name }}">Buy now</button>')
        self.assertEqual(checks(source, "page.html"), [])
        self.assertIn("label-in-name", undecidable(source, "page.html"))

    def test_new_criteria_are_checked_not_declared_untested(self):
        untested = {c.split()[0] for c, _ in audit.NOT_TESTED}
        for number, key in (
            ("2.4.1", "bypass-blocks"),
            ("2.5.3", "label-in-name"),
        ):
            with self.subTest(criterion=number):
                self.assertIn(key, audit.CHECKS)
                self.assertNotIn(number, untested)


class ReferencesAndOrder(unittest.TestCase):
    def test_broken_aria_labelledby(self):
        source = DOC.format("<div aria-labelledby='nope'>x</div>")
        self.assertEqual(checks(source, "page.html"), ["aria-reference-broken"])

    def test_duplicate_id_only_matters_when_referenced(self):
        plain = DOC.format("<div id='a'></div><div id='a'></div>")
        self.assertEqual(checks(plain, "page.html"), [])
        referenced = DOC.format(
            "<div id='a'>x</div><div id='a'>y</div><p aria-describedby='a'>z</p>"
        )
        self.assertEqual(checks(referenced, "page.html"), ["duplicate-referenced-id"])

    def test_positive_tabindex(self):
        self.assertEqual(checks("<div tabindex='3'>x</div>"), ["positive-tabindex"])

    def test_tabindex_minus_one_is_fine(self):
        self.assertEqual(checks("<div tabindex='-1'>x</div>"), [])

    def test_heading_skip_is_degrading(self):
        result = findings("<h1>a</h1><h3>b</h3>")
        self.assertEqual([f["check"] for f in result], ["heading-level-skipped"])
        self.assertEqual(result[0]["severity"], "degrading")

    def test_heading_descent_is_fine(self):
        self.assertEqual(checks("<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2>"), [])


class OtherElements(unittest.TestCase):
    def test_untitled_iframe(self):
        self.assertEqual(checks("<iframe src='x'></iframe>"), ["iframe-no-title"])

    def test_titled_iframe(self):
        self.assertEqual(checks("<iframe src='x' title='Map'></iframe>"), [])

    # Both fixtures carry a captions track so that these two tests measure the
    # autoplay rule alone rather than also tripping the 1.2.2 check.
    CAPTIONED = "<track kind='captions' src='c.vtt'>"

    def test_autoplay_video_without_muted(self):
        self.assertEqual(
            checks(f"<video autoplay src='x.mp4'>{self.CAPTIONED}</video>"),
            ["autoplay-unmuted"])

    def test_muted_autoplay_is_accepted(self):
        self.assertEqual(
            checks(f"<video autoplay muted src='x.mp4'>{self.CAPTIONED}</video>"), [])

    def test_data_table_without_headers(self):
        source = "<table><tr><td>a</td></tr><tr><td>b</td></tr></table>"
        self.assertEqual(checks(source), ["data-table-no-header"])

    def test_layout_table_marked_presentation_is_skipped(self):
        source = "<table role='presentation'><tr><td>a</td></tr><tr><td>b</td></tr></table>"
        self.assertEqual(checks(source), [])


class TemplateSyntaxes(unittest.TestCase):
    def test_liquid_statements_do_not_break_parsing(self):
        source = "{% for p in products %}<img src='{{ p.src }}'>{% endfor %}"
        self.assertEqual(checks(source), ["img-alt-missing"])

    def test_php_short_echo(self):
        source = "<img src='<?= $p->src ?>' alt='<?= $p->alt ?>'>"
        self.assertEqual(checks(source), [])
        self.assertEqual(undecidable(source), ["img-alt-missing"])

    def test_erb_and_ejs(self):
        self.assertEqual(checks("<a href='/x'><% title %></a>"), [])

    def test_twig_comment_is_removed(self):
        self.assertEqual(checks("{# a comment #}<img src='a' alt='b'>"), [])


class EvidenceRecord(unittest.TestCase):
    def test_record_carries_its_coverage_boundary_even_with_no_findings(self):
        results = [audit.audit_source("<p>clean</p>", "clean.html")]
        record = audit.evidence_record(results, "Test subject", date="2026-08-20")
        self.assertEqual(record["summary"]["findings"], 0)
        not_tested = [i for i in record["open_items"] if i["item"].startswith("Not tested")]
        self.assertEqual(len(not_tested), 1)
        self.assertEqual(not_tested[0]["count"], len(audit.NOT_TESTED))
        self.assertGreater(not_tested[0]["count"], 0)

    def test_record_makes_no_conformance_claim(self):
        record = audit.evidence_record([], "Test subject", date="2026-08-20")
        text = audit.render_record(record).lower()
        self.assertIn("does not state that the subject conforms", text)
        for forbidden in ("is compliant", "certified", "conformant with"):
            self.assertNotIn(forbidden, text)
        # Same substring guard as before, minus one false positive: WCAG's own
        # criterion name "Bypass Blocks" contains "pass ". Narrowed rather than
        # widened -- "neither passes nor failures", which this record says
        # about its undecidables, is a disclaimer and must stay sayable.
        self.assertIsNone(re.search(r"(?<!by)pass ", text))

    def test_record_separates_blocking_from_degrading(self):
        source = "<img src='a.png'><h1>a</h1><h3>b</h3>"
        record = audit.evidence_record(
            [audit.audit_source(source, "t.liquid")], "Test", date="2026-08-20"
        )
        self.assertEqual(record["summary"]["blocking"], 1)
        self.assertEqual(record["summary"]["degrading"], 1)

    def test_undecidables_are_open_items_not_findings(self):
        source = "<img src='a' alt='{{ x }}'>"
        record = audit.evidence_record(
            [audit.audit_source(source, "t.liquid")], "Test", date="2026-08-20"
        )
        self.assertEqual(record["summary"]["findings"], 0)
        self.assertEqual(record["summary"]["undecidable_statically"], 1)

    def test_every_check_has_a_criterion_and_a_severity(self):
        for check, (criterion, severity) in audit.CHECKS.items():
            self.assertTrue(criterion[0].isdigit(), check)
            self.assertIn(severity, ("blocking", "degrading"), check)


class LabelResolutionPrecision(unittest.TestCase):
    """`<label for>` names a control; aria-controls and aria-labelledby do not."""

    def test_aria_controls_pointing_at_a_control_does_not_label_it(self):
        source = DOC.format(
            "<button aria-controls='q'>Toggle</button><input id='q' type='text'>"
        )
        self.assertEqual(checks(source, "page.html"), ["control-no-label"])

    def test_aria_labelledby_on_another_element_does_not_label_the_control(self):
        source = DOC.format("<p aria-labelledby='q'>x</p><input id='q' type='text'>")
        self.assertEqual(checks(source, "page.html"), ["control-no-label"])


class ExpressionAwareLabelMatching(unittest.TestCase):
    """Finding 3 of ../a11y-theme-resolution/: match `<label for>` on raw
    template text, not on the expression-stripped literal.

    Two named corpus regressions are locked here. Both were measured, and both
    were previously reported as `control-no-label` undecidables:

    * 64 of the 69 supposedly "cross-partial" labels were in the same file all
      along, separated from their control only by an expression the comparison
      threw away.
    * The `fassbender-shopify-theme` newsletter and search fields carry a
      `<label for>` whose target the theme can never render, which a
      literal-only comparison reads as "unknown" instead of "wrong".
    """

    def test_control_and_its_own_label_in_one_file_resolve(self):
        # The 64-of-69 case. Same expression, differing only in inner spacing,
        # which renders identically.
        source = (
            "<form><label for='{{id_prefix}}FirstName'>First name</label>"
            "<input type='text' id='{{ id_prefix }}FirstName'></form>"
        )
        self.assertEqual(checks(source), [])
        self.assertEqual(undecidable(source), [])

    def test_dead_for_reference_is_a_finding_not_an_undecidable(self):
        # fassbender-shopify-theme, theme/sections/newsletter.liquid:69. No
        # rendering of `idPrefix` puts the required `_` in front of `mce-NAME`.
        source = (
            "<form><label for='mce-NAME'>Name</label>"
            "<input type='text' id='{{ idPrefix }}_mce-NAME'></form>"
        )
        self.assertEqual(checks(source), ["label-for-id-mismatch"])
        self.assertEqual(undecidable(source), [])

    def test_different_expressions_are_not_accused(self):
        # Two different expressions could render to the same string, so this
        # stays undecidable. Precision over recall: a false defect claimed
        # against a shop's markup is the failure mode positioning forbids.
        source = (
            "<form><label for='{{ a }}X'>X</label>"
            "<input type='text' id='{{ b }}X'></form>"
        )
        self.assertEqual(checks(source), [])
        self.assertEqual(undecidable(source), ["control-no-label"])

    def test_expression_that_could_render_empty_is_not_accused(self):
        # `{{ p }}` rendering empty makes this a match, so it is not provable.
        source = (
            "<form><label for='X'>X</label>"
            "<input type='text' id='{{ p }}X'></form>"
        )
        self.assertEqual(checks(source), [])
        self.assertEqual(undecidable(source), ["control-no-label"])

    def test_genuinely_absent_label_in_a_fragment_stays_undecidable(self):
        # No label at all in the file, so nothing rules out another partial.
        source = "<form><input type='text' id='orphan'></form>"
        self.assertEqual(checks(source), [])
        self.assertEqual(undecidable(source), ["control-no-label"])

    def test_same_expression_used_for_two_controls_stays_distinct(self):
        # The sentinel encodes the expression, so `{{ a }}` and `{{ b }}` are
        # different ids -- the bug the single opaque sentinel would reintroduce.
        source = (
            "<form><label for='{{ a }}N'>N</label>"
            "<input type='text' id='{{ a }}N'>"
            "<input type='text' id='{{ b }}N'></form>"
        )
        # First control resolves against its own label; the second does not,
        # but could match depending on rendering, so it stays undecidable.
        self.assertEqual(checks(source), [])
        self.assertEqual(undecidable(source), ["control-no-label"])

    def test_expression_only_id_can_resolve_against_the_same_expression(self):
        source = (
            "<form><label for='{{ field.id }}'>Email</label>"
            "<input type='text' id='{{ field.id }}'></form>"
        )
        self.assertEqual(checks(source), [])
        self.assertEqual(undecidable(source), [])


class PackageWideLabelIndex(unittest.TestCase):
    """The remaining half of finding 3: a package-wide ``<label for>`` index.

    ``audit_source`` on one file cannot recover
    ``fassbender-shopify-theme``'s ``theme/templates/search.liquid:22`` --
    that file has no ``<label for>`` at all, so the engine correctly
    reports "the label may live in another partial". Across the package
    it does not. ``../a11y-theme-resolution/`` named this as larger than
    finding 3 and left it unbuilt; the five hand-verified defects that
    pass reported all reduce to "no matching label anywhere in the
    package."
    """

    def _package(self, files):
        return audit.resolve_package_labels([
            audit.audit_source(source, path) for path, source in files
        ])

    def _non_contrast(self, items):
        return [item for item in items if item["check"] not in _COLOUR_CHECKS]

    def test_single_file_is_not_a_package(self):
        # A one-file invocation of a fragment must keep today's semantics:
        # "not in this file" is not "not in the package".
        results = self._package([
            ("search.liquid", "<form><input type='text' id='q'></form>"),
        ])
        self.assertEqual([f["check"] for f in results[0]["findings"]], [])
        self.assertEqual(
            [u["check"] for u in self._non_contrast(results[0]["undecidable"])],
            ["control-no-label"],
        )

    def test_label_in_another_file_clears_the_undecidable(self):
        results = self._package([
            ("search.liquid", "<form><input type='text' id='q'></form>"),
            ("header.liquid", "<label for='q'>Search</label>"),
        ])
        self.assertEqual([f["check"] for f in results[0]["findings"]], [])
        self.assertEqual(self._non_contrast(results[0]["undecidable"]), [])

    def test_same_expression_in_another_file_is_a_certain_match(self):
        results = self._package([
            ("field.liquid", "<input type='text' id='{{ id_prefix }}FirstName'>"),
            ("labels.liquid", "<label for='{{id_prefix}}FirstName'>First name</label>"),
        ])
        self.assertEqual([f["check"] for f in results[0]["findings"]], [])
        self.assertEqual(self._non_contrast(results[0]["undecidable"]), [])

    def test_no_label_anywhere_in_the_package_is_a_finding(self):
        # The search.liquid:22 shape: a control whose id the theme prefixes
        # and no ``<label for>`` anywhere that can name it.
        results = self._package([
            ("search.liquid",
             "<form><input type='search' id='{{ idPrefix }}_q'></form>"),
            ("newsletter.liquid",
             "<form><label for='mce-NAME'>Name</label>"
             "<input type='text' id='{{ idPrefix }}_mce-NAME'></form>"),
        ])
        search = next(r for r in results if r["file"] == "search.liquid")
        self.assertEqual(
            [f["check"] for f in search["findings"]], ["control-no-label"])
        self.assertIn("anywhere in the package", search["findings"][0]["detail"])
        self.assertEqual(self._non_contrast(search["undecidable"]), [])
        # The newsletter file still reports its own same-file mismatch;
        # another file's unlabelled control does not steal that finding.
        newsletter = next(r for r in results if r["file"] == "newsletter.liquid")
        self.assertEqual(
            [f["check"] for f in newsletter["findings"]],
            ["label-for-id-mismatch"],
        )

    def test_possible_cross_file_match_stays_undecidable(self):
        # Two different expressions could render equal. Accusing the shop
        # would be the failure mode the positioning forbids.
        results = self._package([
            ("field.liquid", "<input type='text' id='{{ a }}X'>"),
            ("labels.liquid", "<label for='{{ b }}X'>X</label>"),
        ])
        field = next(r for r in results if r["file"] == "field.liquid")
        self.assertEqual([f["check"] for f in field["findings"]], [])
        undecided = self._non_contrast(field["undecidable"])
        self.assertEqual([u["check"] for u in undecided], ["control-no-label"])
        self.assertIn("other files", undecided[0]["reason"])

    def test_other_files_dead_label_is_not_this_controls_mismatch(self):
        # A dangling ``for="mce-NAME"`` on the newsletter page is not
        # evidence that the search field's missing label is a mismatch.
        results = self._package([
            ("search.liquid", "<form><input type='search' id='q'></form>"),
            ("newsletter.liquid", "<label for='mce-NAME'>Name</label>"),
        ])
        search = next(r for r in results if r["file"] == "search.liquid")
        self.assertEqual(
            [f["check"] for f in search["findings"]], ["control-no-label"])
        self.assertNotIn("mismatch", search["findings"][0]["check"])

    def test_audit_sources_runs_the_package_pass(self):
        results = audit.audit_sources([
            ("search.liquid", "<form><input type='search' id='q'></form>"),
            ("header.liquid", "<label for='q'>Search</label>"),
        ])
        search = next(r for r in results if r["file"] == "search.liquid")
        self.assertEqual([f["check"] for f in search["findings"]], [])
        self.assertEqual(self._non_contrast(search["undecidable"]), [])


class Captions(unittest.TestCase):
    """1.2.2. Added 2026-08-21; see portfolio/research/a11y-engine-agreement/."""

    def test_video_without_a_captions_track_is_blocking(self):
        self.assertEqual(checks("<video src='x.mp4'></video>"), ["media-no-captions"])

    def test_captions_track_satisfies_it(self):
        self.assertEqual(
            checks("<video src='x.mp4'><track kind='captions' src='c.vtt'></video>"), [])

    def test_subtitles_track_is_accepted(self):
        self.assertEqual(
            checks("<video src='x.mp4'><track kind='subtitles' src='c.vtt'></video>"), [])

    def test_a_non_caption_track_does_not_satisfy_it(self):
        self.assertEqual(
            checks("<video src='x.mp4'><track kind='descriptions' src='d.vtt'></video>"),
            ["media-no-captions"])

    def test_audio_only_is_not_claimed(self):
        # 1.2.2 is synchronized media; audio-only is 1.2.1 and needs a
        # transcript this pass cannot see.
        self.assertEqual(checks("<audio src='x.mp3'></audio>"), [])

    def test_expression_track_kind_is_undecidable_not_a_finding(self):
        source = "<video src='x.mp4'><track kind='{{ t.kind }}' src='c.vtt'></video>"
        self.assertEqual(checks(source), [])
        self.assertEqual(undecidable(source), ["media-no-captions"])


class InteractiveAriaHidden(unittest.TestCase):
    """4.1.2. Added 2026-08-21; see portfolio/research/a11y-engine-agreement/."""

    def test_focusable_link_hidden_from_the_tree_is_blocking(self):
        self.assertEqual(
            checks("<a href='/x' aria-hidden='true'>Cart</a>"),
            ["interactive-aria-hidden"])

    def test_button_and_input_are_covered(self):
        self.assertEqual(
            checks("<button aria-hidden='true'>Go</button>"), ["interactive-aria-hidden"])
        self.assertEqual(
            checks("<input type='text' aria-label='q' aria-hidden='true'>"),
            ["interactive-aria-hidden"])

    def test_tabindex_minus_one_removes_it_from_the_tab_order(self):
        self.assertEqual(
            checks("<button aria-hidden='true' tabindex='-1'>Go</button>"), [])

    def test_hidden_attribute_removes_it_too(self):
        self.assertEqual(checks("<button aria-hidden='true' hidden>Go</button>"), [])

    def test_anchor_without_href_is_not_focusable(self):
        self.assertEqual(checks("<a aria-hidden='true'>x</a>"), [])

    def test_decorative_span_inside_a_named_link_is_not_flagged(self):
        # The common, correct icon pattern. A span is not focusable.
        self.assertEqual(
            checks("<a href='/cart'>Cart<span class='i' aria-hidden='true'></span></a>"), [])


class Contrast(unittest.TestCase):
    """1.4.3, ported 2026-08-21 from the sibling engine's resolver
    (`portfolio/pipeline/probes/eaa-wcag-triage/`, PR #523). See
    `contrast_pass.py` for what porting it to *templates* -- rather than the
    rendered HTML/CSS pairs #523 measured -- had to change.
    """

    def test_clear_failure_is_reported(self):
        sheet = audit.merge_stylesheets(
            [".txt { color: #cccccc; } body { background: #ffffff; }"])
        result = audit.audit_source(
            '<body><p class="txt">Hello world</p></body>', "p.html", stylesheet=sheet)
        self.assertEqual([f["check"] for f in result["findings"]], ["text-contrast-fail"])
        self.assertEqual(result["findings"][0]["success_criterion"], "1.4.3 Contrast (Minimum)")
        self.assertEqual(result["undecidable"], [])

    def test_clear_pass_is_neither_a_finding_nor_an_undecidable(self):
        sheet = audit.merge_stylesheets(
            [".txt { color: #000000; } body { background: #ffffff; }"])
        result = audit.audit_source(
            '<body><p class="txt">Hello world</p></body>', "p.html", stylesheet=sheet)
        self.assertEqual(result["findings"], [])
        self.assertEqual(result["undecidable"], [])

    def test_no_stylesheet_at_all_is_an_honest_undecidable_not_a_silent_skip(self):
        # The coverage-boundary rule this whole module follows: a criterion
        # this pass is capable of checking must never come back silent just
        # because this particular call had nothing to check it with.
        self.assertEqual(
            all_undecidable("<p>Hello there friend</p>"), ["text-contrast-fail"])

    def test_element_under_a_dynamically_classed_ancestor_is_undecidable(self):
        # A wrapper's `{{ x }}`-driven class could add a `dark:` or colour
        # override this template does not settle -- see contrast_pass.py.
        sheet = audit.merge_stylesheets(
            [".txt { color: #cccccc; } body { background: #ffffff; }"])
        source = '<body><div class="{{ x }}"><p class="txt">Hello</p></div></body>'
        result = audit.audit_source(source, "p.html", stylesheet=sheet)
        self.assertEqual(result["findings"], [])
        self.assertEqual(
            [(u["check"], u["reason"]) for u in result["undecidable"]],
            [("text-contrast-fail", "class-is-template-expression")])

    def test_dynamically_bound_own_class_is_undecidable_too(self):
        sheet = audit.merge_stylesheets(
            [".txt { color: #cccccc; } body { background: #ffffff; }"])
        source = '<body><p class="txt {{ extra }}">Hello</p></body>'
        result = audit.audit_source(source, "p.html", stylesheet=sheet)
        self.assertEqual(result["findings"], [])
        self.assertEqual(
            [u["reason"] for u in result["undecidable"]], ["class-is-template-expression"])

    def test_dynamic_inline_style_is_undecidable(self):
        source = '<body><p style="color: {{ c }}">Hello there</p></body>'
        result = audit.audit_source(source, "p.html")
        self.assertEqual(result["findings"], [])
        self.assertEqual(
            [u["reason"] for u in result["undecidable"]], ["style-is-template-expression"])

    def test_a_components_own_inline_style_block_is_read_with_no_external_sheet(self):
        # Vue/Svelte single-file components carry their CSS in the same file.
        source = (
            "<html lang='en'><head><title>t</title>"
            "<style>.txt{color:#cccccc} body{background:#ffffff}</style>"
            "</head><body><p class='txt'>Hello there friend</p></body></html>"
        )
        result = audit.audit_source(source, "widget.vue")
        self.assertEqual([f["check"] for f in result["findings"]], ["text-contrast-fail"])

    def test_1_4_3_is_checked_not_declared_untested(self):
        self.assertIn("text-contrast-fail", audit.CHECKS)
        untested_numbers = {c.split()[0] for c, _ in audit.NOT_TESTED}
        self.assertNotIn("1.4.3", untested_numbers)

    def test_evidence_record_counts_contrast_findings(self):
        sheet = audit.merge_stylesheets(
            [".txt { color: #cccccc; } body { background: #ffffff; }"])
        result = audit.audit_source(
            '<body><p class="txt">Hello world</p></body>', "p.html", stylesheet=sheet)
        record = audit.evidence_record([result], "Test", date="2026-08-21")
        self.assertEqual(record["summary"]["by_check"].get("text-contrast-fail"), 1)


class UseOfColor(unittest.TestCase):
    """1.4.1, ported 2026-08-24 from the sibling engine's resolver.

    Same adaptation 1.4.3 needed: refuse any dynamically classed or styled
    ancestor (or surrounding-text owner) before asking the cascade. The
    arithmetic is reused unmodified.
    """

    _PROSE = (
        '<p class="txt">See the <a href="/docs" class="lnk">docs</a> '
        "for a longer explanation of how this shop works.</p>"
    )
    _FAIL_CSS = (
        "p { color: #333333; } "
        "a { color: #333333; text-decoration: none; }"
    )
    _PASS_CSS = (
        "p { color: #333333; } "
        "a { color: #0000ee; text-decoration: underline; }"
    )

    def test_colour_only_in_prose_link_is_blocking(self):
        sheet = audit.merge_stylesheets([self._FAIL_CSS])
        result = audit.audit_source(
            f"<body>{self._PROSE}</body>", "p.html", stylesheet=sheet)
        color = [f for f in result["findings"] if f["check"] == "color-only-link"]
        self.assertEqual(len(color), 1)
        self.assertEqual(color[0]["success_criterion"], "1.4.1 Use of Color")
        self.assertEqual(color[0]["severity"], "blocking")

    def test_underlined_link_is_neither_a_finding_nor_an_undecidable(self):
        sheet = audit.merge_stylesheets([self._PASS_CSS])
        result = audit.audit_source(
            f"<body>{self._PROSE}</body>", "p.html", stylesheet=sheet)
        self.assertEqual(
            [f["check"] for f in result["findings"] if f["check"] == "color-only-link"],
            [],
        )
        self.assertEqual(
            [u["check"] for u in result["undecidable"] if u["check"] == "color-only-link"],
            [],
        )

    def test_bare_link_without_stylesheet_passes_on_the_ua_underline(self):
        # Unlike 1.4.3, this criterion does not go undecidable with no CSS:
        # a bare <a href> is underlined by every UA stylesheet.
        result = audit.audit_source(
            f"<body>{self._PROSE}</body>", "p.html")
        self.assertEqual(
            [f["check"] for f in result["findings"] if f["check"] == "color-only-link"],
            [],
        )
        self.assertEqual(
            [u["check"] for u in result["undecidable"] if u["check"] == "color-only-link"],
            [],
        )

    def test_element_under_a_dynamically_classed_ancestor_is_undecidable(self):
        sheet = audit.merge_stylesheets([self._FAIL_CSS])
        source = f'<body><div class="{{{{ x }}}}">{self._PROSE}</div></body>'
        result = audit.audit_source(source, "p.html", stylesheet=sheet)
        self.assertEqual(
            [f["check"] for f in result["findings"] if f["check"] == "color-only-link"],
            [],
        )
        self.assertEqual(
            [(u["check"], u["reason"])
             for u in result["undecidable"] if u["check"] == "color-only-link"],
            [("color-only-link", "class-is-template-expression")],
        )

    def test_dynamically_classed_surrounding_text_is_undecidable_too(self):
        # A sibling span, not an ancestor: its render-time class can change
        # the prose colour the ratio is measured against.
        sheet = audit.merge_stylesheets([self._FAIL_CSS])
        source = (
            '<body><p class="txt"><span class="{{ c }}">See the </span>'
            '<a href="/docs" class="lnk">docs</a> for a longer explanation '
            "of how this shop works.</p></body>"
        )
        result = audit.audit_source(source, "p.html", stylesheet=sheet)
        self.assertEqual(
            [f["check"] for f in result["findings"] if f["check"] == "color-only-link"],
            [],
        )
        self.assertEqual(
            [u["reason"] for u in result["undecidable"] if u["check"] == "color-only-link"],
            ["class-is-template-expression"],
        )

    def test_1_4_1_is_checked_not_declared_untested(self):
        self.assertIn("color-only-link", audit.CHECKS)
        untested_numbers = {c.split()[0] for c, _ in audit.NOT_TESTED}
        self.assertNotIn("1.4.1", untested_numbers)

    def test_evidence_record_counts_use_of_color_findings(self):
        sheet = audit.merge_stylesheets([self._FAIL_CSS])
        result = audit.audit_source(
            f"<body>{self._PROSE}</body>", "p.html", stylesheet=sheet)
        record = audit.evidence_record([result], "Test", date="2026-08-24")
        self.assertEqual(record["summary"]["by_check"].get("color-only-link"), 1)


class OrientationLock(unittest.TestCase):
    """1.3.4, ported 2026-08-24 from the sibling engine's CSS decision.

    Same adapter 1.4.1 used: reuse the sibling's rotate-under-orientation
    test, refuse a transform value that is a template expression. Absence
    of a lock is a pass, not an undecidable -- the criterion is one
    document-level yes/no.
    """

    _LOCK = (
        "@media (orientation: portrait) { html { transform: rotate(90deg); } }"
    )
    _PAGE = (
        "<html lang='en'><head><title>t</title></head>"
        "<body><p>Some ordinary page content.</p></body></html>"
    )

    def _audit(self, css, html=None):
        sheet = audit.merge_stylesheets([css])
        return audit.audit_source(html or self._PAGE, "p.html", stylesheet=sheet)

    def _locks(self, result):
        return [f for f in result["findings"] if f["check"] == "orientation-lock"]

    def _undecided(self, result):
        return [u for u in result["undecidable"] if u["check"] == "orientation-lock"]

    def test_portrait_lock_rotating_html_is_blocking(self):
        found = self._locks(self._audit(self._LOCK))
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["success_criterion"], "1.3.4 Orientation")
        self.assertEqual(found[0]["severity"], "blocking")
        self.assertEqual(found[0]["element"], "html")
        self.assertIn("rotate(90deg)", found[0]["detail"])
        self.assertIn("portrait", found[0]["detail"])

    def test_landscape_lock_rotating_body_names_its_orientation(self):
        css = (
            "@media (orientation: landscape) { "
            "body { transform: rotate(-90deg); } }"
        )
        found = self._locks(self._audit(css))
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["element"], "body")
        self.assertIn("landscape", found[0]["detail"])

    def test_inline_style_block_is_enough_without_an_external_sheet(self):
        # The fixture a11y-external-coverage-reference runs through both
        # engines: a <style> in the head, no --stylesheet argument.
        source = (
            "<html lang='en'><head><title>t</title>"
            "<style>@media(orientation:portrait)"
            "{html{transform:rotate(90deg)}}</style></head>"
            "<body><p>x</p></body></html>"
        )
        result = audit.audit_source(source, "p.html")
        self.assertEqual(len(self._locks(result)), 1)

    def test_breakpoint_combined_with_orientation_is_left_alone(self):
        css = (
            "@media (orientation: portrait) and (min-width: 40rem) "
            "{ html { transform: rotate(90deg); } }"
        )
        result = self._audit(css)
        self.assertEqual(self._locks(result), [])
        self.assertEqual(self._undecided(result), [])

    def test_rotate_zero_and_full_turns_are_no_ops(self):
        for value in ("rotate(0deg)", "rotate(360deg)", "rotate(-360deg)",
                      "rotate(400grad)"):
            css = (
                f"@media (orientation: portrait) {{ html {{ transform: {value}; }} }}"
            )
            with self.subTest(value=value):
                result = self._audit(css)
                self.assertEqual(self._locks(result), [])
                self.assertEqual(self._undecided(result), [])

    def test_class_selector_lock_is_out_of_scope(self):
        css = (
            "@media (orientation: portrait) { "
            ".rotator { transform: rotate(90deg); } }"
        )
        html = (
            "<html lang='en'><head><title>t</title></head>"
            "<body><div class='rotator'>Some ordinary page content.</div>"
            "</body></html>"
        )
        result = self._audit(css, html)
        self.assertEqual(self._locks(result), [])
        self.assertEqual(self._undecided(result), [])

    def test_unconditional_transform_is_not_an_orientation_lock(self):
        result = self._audit("html { transform: rotate(90deg); }")
        self.assertEqual(self._locks(result), [])
        self.assertEqual(self._undecided(result), [])

    def test_only_one_finding_even_if_both_elements_are_locked(self):
        css = (
            "@media (orientation: portrait) { "
            "html { transform: rotate(90deg); } "
            "body { transform: rotate(90deg); } }"
        )
        self.assertEqual(len(self._locks(self._audit(css))), 1)

    def test_no_stylesheet_is_a_pass_not_an_undecidable(self):
        result = audit.audit_source(self._PAGE, "p.html")
        self.assertEqual(self._locks(result), [])
        self.assertEqual(self._undecided(result), [])

    def test_transform_value_from_an_expression_is_undecidable(self):
        css = (
            "@media (orientation: portrait) { "
            "html { transform: rotate({{ angle }}deg); } }"
        )
        result = self._audit(css)
        self.assertEqual(self._locks(result), [])
        self.assertEqual(
            [u["reason"] for u in self._undecided(result)],
            ["transform-is-template-expression"],
        )

    def test_1_3_4_is_checked_not_declared_untested(self):
        self.assertIn("orientation-lock", audit.CHECKS)
        untested_numbers = {c.split()[0] for c, _ in audit.NOT_TESTED}
        self.assertNotIn("1.3.4", untested_numbers)

    def test_evidence_record_counts_orientation_findings(self):
        result = self._audit(self._LOCK)
        record = audit.evidence_record([result], "Test", date="2026-08-24")
        self.assertEqual(record["summary"]["by_check"].get("orientation-lock"), 1)


class CoverageBoundaryIsComplete(unittest.TestCase):
    """The invariant that would have caught 1.2.2 going missing.

    A record's reader can only distinguish "checked and passed" from "not
    looked at" by the two lists the record carries. So every criterion this
    engine reasons about must appear in exactly one of them: a criterion that
    is in neither is silently absent, which is the defect
    `portfolio/research/a11y-engine-agreement/` measured.
    """

    @staticmethod
    def _number(criterion):
        return criterion.split()[0]

    def test_no_criterion_is_both_checked_and_declared_untested(self):
        checked = {self._number(sc) for sc, _ in audit.CHECKS.values()}
        declared = {self._number(c) for c, _ in audit.NOT_TESTED}
        self.assertEqual(checked & declared, set())

    def test_every_statically_detectable_criterion_is_accounted_for(self):
        checked = {self._number(sc) for sc, _ in audit.CHECKS.values()}
        declared = {self._number(c) for c, _ in audit.NOT_TESTED}
        # Criteria the sibling engine demonstrates are reachable from static
        # markup. Any of these missing from both lists is a silent gap.
        statically_reachable = {
            "1.1.1", "1.2.2", "1.3.1", "1.3.4", "1.4.1", "1.4.2", "1.4.3",
            "1.4.4", "2.2.1", "2.2.2", "2.4.1", "2.4.2", "2.4.3", "2.4.4",
            "2.5.3", "3.1.1", "3.1.2", "3.3.2", "4.1.2",
        }
        self.assertEqual(statically_reachable - checked - declared, set())


class Robustness(unittest.TestCase):
    def test_malformed_markup_does_not_raise(self):
        for source in ("<div><span></div>", "<<>>", "<a href=", "</p></p>", ""):
            audit.audit_source(source, "junk.html")

    def test_script_contents_are_not_read_as_link_text(self):
        source = "<a href='/x'><script>var t = 'Buy'</script></a>"
        self.assertEqual(checks(source), ["link-no-accessible-name"])


# A well-formed page that exercises every removal and every injection.
_CONTROL_PAGE = """<!doctype html>
<html lang="en">
<head>
  <title>Shop</title>
</head>
<body>
  <h1>Welcome</h1>
  <p>Hello.</p>
  <img src="hero.jpg" alt="A loaf of bread">
  <label for="email">Email</label>
  <input id="email" type="email">
  <button type="submit">Buy</button>
  <a href="/about">About</a>
</body>
</html>
"""

_CONTROL_FRAGMENT = "<p>just text</p>"


class PositiveControl(unittest.TestCase):
    """Per-engagement positive control — the product, not the research harness.

    The sibling probe already ships this inside its customer record. These
    tests pin the same contract on this engine: every mutation that bites a
    well-formed page makes its check fire, a no-op is untested rather than
    passed, a page that already fails the check is not counted as a miss,
    and a constructed miss stays a miss.
    """

    def test_every_mutation_that_bites_this_page_is_caught(self):
        result = audit.run_control({"shop.html": _CONTROL_PAGE})
        by_mutation = {row["mutation"]: row for row in result["mutations"]}
        self.assertEqual(len(by_mutation), len(audit.CONTROL_MUTATIONS))
        for check, _criterion, _kind, description, mutate in audit.CONTROL_MUTATIONS:
            row = by_mutation[description]
            if mutate(_CONTROL_PAGE) == _CONTROL_PAGE:
                self.assertEqual(row["verdict"], audit.NOT_EXERCISED, description)
            else:
                self.assertEqual(row["verdict"], audit.CAUGHT, (description, row, check))

    def test_injections_all_bite_a_well_formed_page(self):
        result = audit.run_control({"shop.html": _CONTROL_PAGE})
        injections = [row for row in result["mutations"] if row["kind"] == "injection"]
        self.assertTrue(injections)
        self.assertTrue(all(row["verdict"] == audit.CAUGHT for row in injections))
        self.assertTrue(all(row["pages_changed"] == 1 for row in injections))

    def test_a_fragment_does_not_count_as_a_pass(self):
        result = audit.run_control({"snip.html": _CONTROL_FRAGMENT})
        self.assertEqual(result["counts"][audit.CAUGHT], 0)
        self.assertEqual(result["counts"][audit.MISSED], 0)
        self.assertEqual(result["counts"][audit.NOT_EXERCISED], len(audit.CONTROL_MUTATIONS))

    def test_already_failing_page_is_not_a_miss(self):
        already = audit.audit_source(
            "<html><head><title>x</title></head><body></body></html>", "x.html"
        )
        still = audit.audit_source(
            "<html><head><title>x</title></head><body></body></html>", "x.html"
        )
        self.assertEqual(
            audit.classify_control(already, still, "html-lang-missing"),
            audit.ALREADY_PRESENT,
        )

    def test_a_constructed_miss_stays_a_miss(self):
        original = audit.audit_source(_CONTROL_PAGE, "shop.html")
        self.assertEqual(
            audit.classify_control(original, original, "img-alt-missing"),
            audit.MISSED,
        )

    def test_caught_requires_the_target_check_specifically(self):
        original = audit.audit_source(_CONTROL_PAGE, "shop.html")
        mutated = audit.audit_source(
            _CONTROL_PAGE.replace("<body>", "<body><button></button>", 1),
            "shop.html",
        )
        self.assertIn(
            "button-no-accessible-name",
            {f["check"] for f in mutated["findings"]},
        )
        self.assertEqual(
            audit.classify_control(original, mutated, "button-no-accessible-name"),
            audit.CAUGHT,
        )
        self.assertEqual(
            audit.classify_control(original, mutated, "img-alt-missing"),
            audit.MISSED,
        )

    def test_single_quoted_lang_is_exercised(self):
        """Templates often quote attributes with singles; a double-only
        removal would leave those pages untested and read as a pass."""
        page = _CONTROL_PAGE.replace('lang="en"', "lang='en'")
        result = audit.run_control({"shop.html": page})
        row = next(r for r in result["mutations"] if r["check"] == "html-lang-missing")
        self.assertEqual(row["verdict"], audit.CAUGHT)

    def test_record_omits_the_section_when_the_control_was_not_run(self):
        record = audit.evidence_record(
            [audit.audit_source(_CONTROL_PAGE, "shop.html")],
            "Test",
            date="2026-08-24",
        )
        self.assertIsNone(record["positive_control"])
        md = audit.render_record(record)
        self.assertNotIn("## Positive control", md)
        self.assertNotIn("**Positive control:**", md)

    def test_record_prints_the_control_before_the_findings(self):
        control = audit.run_control({"shop.html": _CONTROL_PAGE})
        record = audit.evidence_record(
            [audit.audit_source(_CONTROL_PAGE, "shop.html")],
            "Test",
            date="2026-08-24",
            control=control,
        )
        md = audit.render_record(record)
        self.assertIs(record["positive_control"], control)
        self.assertIn("## Positive control", md)
        self.assertLess(md.index("## Positive control"), md.index("## What was found"))
        self.assertIn("**Positive control:**", md)
        self.assertIn("caught", md.lower())
        self.assertIn("not a conformance test", md.lower())

    def test_a_miss_is_named_in_the_header(self):
        control = {
            "statement": "test",
            "mutations": [
                {
                    "check": "img-alt-missing",
                    "criterion": "1.1.1",
                    "kind": "removal",
                    "mutation": "drop alt",
                    "verdict": audit.MISSED,
                    "pages_changed": 1,
                    "pages": [],
                }
            ],
            "counts": {
                audit.NOT_EXERCISED: 0,
                audit.CAUGHT: 0,
                audit.MISSED: 1,
                audit.ALREADY_PRESENT: 0,
            },
        }
        md = audit.render_record(
            audit.evidence_record(
                [audit.audit_source(_CONTROL_PAGE, "shop.html")],
                "Test",
                date="2026-08-24",
                control=control,
            )
        )
        header = md[: md.index("## Positive control")]
        self.assertIn("missed", header)
        self.assertIn("would have been wrong", header)

    def test_cli_wires_the_control_into_the_record(self):
        import os
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            page = os.path.join(tmp, "shop.html")
            with open(page, "w", encoding="utf-8") as handle:
                handle.write(_CONTROL_PAGE)
            from io import StringIO
            from contextlib import redirect_stdout

            buf = StringIO()
            argv = ["audit.py", page, "--record", "--scope", "cli-control", "--date", "2026-08-24"]
            old = sys.argv
            try:
                sys.argv = argv
                with redirect_stdout(buf):
                    code = audit.main()
            finally:
                sys.argv = old
            self.assertEqual(code, 0)
            md = buf.getvalue()
            self.assertIn("## Positive control", md)
            self.assertIn("**Positive control:**", md)
            self.assertIn("caught", md)


FASSBENDER_NEWSLETTER = (
    "<form>"
    "<label for='mce-NAME'>Name</label>"
    "<input type='text' id='{{ idPrefix }}_mce-NAME'>"
    "<label for='mce-EMAIL'>Email</label>"
    "<input type='email' id='{{ idPrefix }}_mce-EMAIL'>"
    "</form>"
)


class ForgottenPrefixRepairs(unittest.TestCase):
    """The audit-and-fix half, for the one class that is uniquely determined.

    Finding 2 of ../a11y-theme-resolution/: every unnamed defect that
    pass recovered by hand is a form control whose <label for> does not
    resolve, and the sharp three are a theme that prefixed the control
    id and forgot the label. That pairing is two strings. Inventing alt
    text, a visible name, or a colour is not.
    """

    def test_fassbender_newsletter_yields_two_unique_repairs(self):
        repairs = audit.suggest_fixes([
            ("theme/sections/newsletter.liquid", FASSBENDER_NEWSLETTER),
        ])
        self.assertEqual(
            [(r["replace"], r["with"]) for r in repairs],
            [
                ("mce-NAME", "{{ idPrefix }}_mce-NAME"),
                ("mce-EMAIL", "{{ idPrefix }}_mce-EMAIL"),
            ],
        )
        self.assertTrue(all(r["check"] == "label-for-id-mismatch" for r in repairs))

    def test_applying_the_repairs_clears_the_mismatch(self):
        source = FASSBENDER_NEWSLETTER
        self.assertEqual(checks(source), ["label-for-id-mismatch", "label-for-id-mismatch"])
        for repair in audit.suggest_fixes([("n.liquid", source)]):
            source = audit.apply_repair(source, repair)
        self.assertEqual(checks(source), [])
        self.assertEqual(undecidable(source), [])

    def test_ambiguous_suffix_is_not_a_repair(self):
        # Two controls share the same trailing literal. Accusing either
        # pairing would be a guess.
        source = (
            "<form><label for='NAME'>Name</label>"
            "<input type='text' id='{{ a }}_NAME'>"
            "<input type='text' id='{{ b }}_NAME'></form>"
        )
        self.assertEqual(audit.suggest_fixes([("x.liquid", source)]), [])

    def test_expression_that_could_render_empty_is_not_a_repair(self):
        # `{{ p }}mce-NAME` can render as `mce-NAME`. Not a proven mismatch.
        source = (
            "<form><label for='mce-NAME'>Name</label>"
            "<input type='text' id='{{ p }}mce-NAME'></form>"
        )
        self.assertEqual(checks(source), [])
        self.assertEqual(undecidable(source), ["control-no-label"])
        self.assertEqual(audit.suggest_fixes([("x.liquid", source)]), [])

    def test_does_not_invent_a_label_when_none_exists(self):
        # search.liquid:22 -- no <label for> in the file. The package
        # index can promote this to a finding; it cannot write a name.
        source = "<form><input type='search' id='{{ idPrefix }}_q'></form>"
        self.assertEqual(audit.suggest_fixes([("search.liquid", source)]), [])

    def test_does_not_rewrite_a_label_in_another_file(self):
        repairs = audit.suggest_fixes([
            ("search.liquid", "<form><input type='search' id='{{ idPrefix }}_q'></form>"),
            ("header.liquid", "<label for='q'>Search</label>"),
        ])
        self.assertEqual(repairs, [])

    def test_hidden_input_is_not_paired(self):
        source = (
            "<form><label for='mce-NAME'>Name</label>"
            "<input type='hidden' id='{{ idPrefix }}_mce-NAME'></form>"
        )
        self.assertEqual(audit.suggest_fixes([("x.liquid", source)]), [])

    def test_record_omits_the_section_when_repairs_are_not_supplied(self):
        record = audit.evidence_record(
            [audit.audit_source(FASSBENDER_NEWSLETTER, "n.liquid")],
            "Test", date="2026-08-24",
        )
        md = audit.render_record(record)
        self.assertNotIn("Proposed repairs", md)

    def test_record_states_repairs_are_not_applied(self):
        files = [("n.liquid", FASSBENDER_NEWSLETTER)]
        record = audit.evidence_record(
            audit.audit_sources(files),
            "Test", date="2026-08-24",
            proposed_repairs=audit.suggest_fixes(files),
        )
        md = audit.render_record(record)
        self.assertIn("Proposed repairs (not applied)", md)
        self.assertIn("not applied", md.lower())
        self.assertIn("not a claim", md.lower())
        self.assertIn("for='mce-NAME'", md)
        self.assertIn("{{ idPrefix }}_mce-NAME", md)
        self.assertIn("None have been written", md)

    def test_cli_never_writes_the_source(self):
        import os
        import tempfile
        from io import StringIO
        from contextlib import redirect_stdout

        with tempfile.TemporaryDirectory() as tmp:
            page = os.path.join(tmp, "newsletter.liquid")
            with open(page, "w", encoding="utf-8") as handle:
                handle.write(FASSBENDER_NEWSLETTER)
            with open(page, encoding="utf-8") as handle:
                before = handle.read()
            buf = StringIO()
            old = sys.argv
            try:
                sys.argv = [
                    "audit.py", page, "--record",
                    "--scope", "cli-fix", "--date", "2026-08-24",
                ]
                with redirect_stdout(buf):
                    code = audit.main()
            finally:
                sys.argv = old
            self.assertEqual(code, 0)
            with open(page, encoding="utf-8") as handle:
                self.assertEqual(handle.read(), before)
            md = buf.getvalue()
            self.assertIn("Proposed repairs (not applied)", md)
            self.assertIn("for='mce-NAME'", md)


LOCKED_VIEWPORT = (
    "<html lang='en'><head><title>t</title>"
    "<meta name='viewport' content='width=device-width, initial-scale=1, "
    "user-scalable=no'></head><body></body></html>"
)


class ViewportZoomRepairs(unittest.TestCase):
    """The second uniquely determined class: drop the zoom-lock tokens.

    Finding 3 recorded one `viewport-scaling-blocked` in the 22-package
    corpus (`create-shopify-theme@0.0.5`). The edit is two strings: the
    content that the 1.4.4 check already flagged, minus the token(s)
    that made it fire. Inventing a new descriptor, or dropping an
    expression-bearing `maximum-scale={{ n }}`, is not.
    """

    def test_user_scalable_no_is_dropped(self):
        repairs = audit.suggest_fixes([("layout.liquid", LOCKED_VIEWPORT)])
        self.assertEqual(
            [(r["replace"], r["with"], r["check"]) for r in repairs],
            [(
                "width=device-width, initial-scale=1, user-scalable=no",
                "width=device-width, initial-scale=1",
                "viewport-scaling-blocked",
            )],
        )

    def test_maximum_scale_below_two_is_dropped(self):
        source = (
            "<html lang='en'><head><title>t</title>"
            "<meta name='viewport' content='width=device-width, maximum-scale=1.0'>"
            "</head><body></body></html>"
        )
        repairs = audit.suggest_fixes([("x.html", source)])
        self.assertEqual(
            [(r["replace"], r["with"]) for r in repairs],
            [("width=device-width, maximum-scale=1.0", "width=device-width")],
        )

    def test_both_lock_tokens_are_dropped_together(self):
        source = (
            "<html lang='en'><head><title>t</title>"
            "<meta name='viewport' content='width=device-width, "
            "maximum-scale=1, user-scalable=no'></head><body></body></html>"
        )
        repairs = audit.suggest_fixes([("x.html", source)])
        self.assertEqual(
            [r["with"] for r in repairs],
            ["width=device-width"],
        )

    def test_applying_the_repair_clears_the_finding(self):
        source = LOCKED_VIEWPORT
        self.assertEqual(checks(source, "page.html"), ["viewport-scaling-blocked"])
        for repair in audit.suggest_fixes([("page.html", source)]):
            source = audit.apply_repair(source, repair)
        self.assertEqual(checks(source, "page.html"), [])

    def test_ordinary_viewport_is_not_a_repair(self):
        source = (
            "<html lang='en'><head><title>t</title>"
            "<meta name='viewport' content='width=device-width, initial-scale=1'>"
            "</head><body></body></html>"
        )
        self.assertEqual(checks(source, "page.html"), [])
        self.assertEqual(audit.suggest_fixes([("page.html", source)]), [])

    def test_maximum_scale_of_two_is_not_a_repair(self):
        source = (
            "<html lang='en'><head><title>t</title>"
            "<meta name='viewport' content='width=device-width, maximum-scale=2'>"
            "</head><body></body></html>"
        )
        self.assertEqual(checks(source, "page.html"), [])
        self.assertEqual(audit.suggest_fixes([("page.html", source)]), [])

    def test_expression_bearing_scale_is_not_dropped(self):
        # Might render as 3. Guessing would invent the defect-clearing edit.
        source = (
            "<html lang='en'><head><title>t</title>"
            "<meta name='viewport' content='width=device-width, "
            "maximum-scale={{ settings.max }}'></head><body></body></html>"
        )
        self.assertEqual(audit.suggest_fixes([("x.liquid", source)]), [])

    def test_literal_lock_beside_an_expression_is_still_dropped(self):
        source = (
            "<html lang='en'><head><title>t</title>"
            "<meta name='viewport' content='width={{ w }}, user-scalable=no'>"
            "</head><body></body></html>"
        )
        repairs = audit.suggest_fixes([("x.liquid", source)])
        self.assertEqual(
            [(r["replace"], r["with"]) for r in repairs],
            [("width={{ w }}, user-scalable=no", "width={{ w }}")],
        )

    def test_duplicate_content_string_is_not_a_repair(self):
        source = (
            "<html lang='en'><head><title>t</title>"
            "<meta name='viewport' content='user-scalable=no'>"
            "<meta name='viewport' content='user-scalable=no'>"
            "</head><body></body></html>"
        )
        self.assertEqual(audit.suggest_fixes([("x.html", source)]), [])

    def test_does_not_touch_a_non_viewport_meta(self):
        source = (
            "<html lang='en'><head><title>t</title>"
            "<meta name='description' content='user-scalable=no'>"
            "</head><body></body></html>"
        )
        self.assertEqual(audit.suggest_fixes([("x.html", source)]), [])

    def test_record_lists_the_viewport_edit(self):
        files = [("layout.liquid", LOCKED_VIEWPORT)]
        record = audit.evidence_record(
            audit.audit_sources(files),
            "Test", date="2026-08-24",
            proposed_repairs=audit.suggest_fixes(files),
        )
        md = audit.render_record(record)
        self.assertIn("Proposed repairs (not applied)", md)
        self.assertIn("user-scalable=no", md)
        self.assertIn("width=device-width, initial-scale=1", md)
        self.assertIn("None have been written", md)

    def test_cli_never_writes_the_source(self):
        import os
        import tempfile
        from io import StringIO
        from contextlib import redirect_stdout

        with tempfile.TemporaryDirectory() as tmp:
            page = os.path.join(tmp, "layout.liquid")
            with open(page, "w", encoding="utf-8") as handle:
                handle.write(LOCKED_VIEWPORT)
            with open(page, encoding="utf-8") as handle:
                before = handle.read()
            buf = StringIO()
            old = sys.argv
            try:
                sys.argv = [
                    "audit.py", page, "--record",
                    "--scope", "cli-viewport", "--date", "2026-08-24",
                ]
                with redirect_stdout(buf):
                    code = audit.main()
            finally:
                sys.argv = old
            self.assertEqual(code, 0)
            with open(page, encoding="utf-8") as handle:
                self.assertEqual(handle.read(), before)
            md = buf.getvalue()
            self.assertIn("Proposed repairs (not applied)", md)
            self.assertIn("user-scalable=no", md)


if __name__ == "__main__":
    unittest.main()
