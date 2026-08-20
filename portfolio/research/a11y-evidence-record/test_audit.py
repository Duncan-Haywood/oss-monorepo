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

import unittest

import audit


def findings(source, path="t.liquid"):
    return audit.audit_source(source, path)["findings"]


def checks(source, path="t.liquid"):
    return sorted(f["check"] for f in findings(source, path))


def undecidable(source, path="t.liquid"):
    return sorted(u["check"] for u in audit.audit_source(source, path)["undecidable"])


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

    def test_aria_hidden_link_is_skipped(self):
        self.assertEqual(checks("<a href='/x' aria-hidden='true'></a>"), [])


class FormControls(unittest.TestCase):
    def test_unlabelled_input_in_a_document_is_blocking(self):
        self.assertEqual(
            checks(DOC.format("<input type='text' name='q'>"), "page.html"),
            ["control-no-label"],
        )

    def test_wrapping_label_is_enough(self):
        self.assertEqual(checks("<label>Email <input type='email'></label>"), [])

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

    def test_autoplay_video_without_muted(self):
        self.assertEqual(checks("<video autoplay src='x.mp4'></video>"), ["autoplay-unmuted"])

    def test_muted_autoplay_is_accepted(self):
        self.assertEqual(checks("<video autoplay muted src='x.mp4'></video>"), [])

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
        for forbidden in ("is compliant", "certified", "conformant with", "pass "):
            self.assertNotIn(forbidden, text)

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


class Robustness(unittest.TestCase):
    def test_malformed_markup_does_not_raise(self):
        for source in ("<div><span></div>", "<<>>", "<a href=", "</p></p>", ""):
            audit.audit_source(source, "junk.html")

    def test_script_contents_are_not_read_as_link_text(self):
        source = "<a href='/x'><script>var t = 'Buy'</script></a>"
        self.assertEqual(checks(source), ["link-no-accessible-name"])


if __name__ == "__main__":
    unittest.main()
