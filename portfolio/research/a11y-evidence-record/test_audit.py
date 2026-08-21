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
            "1.1.1", "1.2.2", "1.3.1", "1.4.2", "1.4.4",
            "2.4.2", "2.4.3", "2.4.4", "3.1.1", "3.3.2", "4.1.2",
        }
        self.assertEqual(statically_reachable - checked - declared, set())


class Robustness(unittest.TestCase):
    def test_malformed_markup_does_not_raise(self):
        for source in ("<div><span></div>", "<<>>", "<a href=", "</p></p>", ""):
            audit.audit_source(source, "junk.html")

    def test_script_contents_are_not_read_as_link_text(self):
        source = "<a href='/x'><script>var t = 'Buy'</script></a>"
        self.assertEqual(checks(source), ["link-no-accessible-name"])


if __name__ == "__main__":
    unittest.main()
