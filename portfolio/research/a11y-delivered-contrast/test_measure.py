"""Tests for the delivered-product contrast measurement.

The ones that matter here are the ones that would have caught the bug this
directory is about: a check that reports nothing because it was never given
what it needs to check, while the harness reads the silence as a pass.
"""

import json
import pathlib
import unittest

import measure

HERE = pathlib.Path(__file__).resolve().parent
RESULTS = HERE / "results-2026-08-21.json"
BUILT = measure.css_path() is not None
needs_build = unittest.skipUnless(
    BUILT, "no local-site-studio build — run `npm ci && npm run build` in that venture"
)


class Corpus(unittest.TestCase):
    def test_the_corpus_is_the_delivered_one(self):
        pages = measure.corpus_pages()
        self.assertEqual(len(pages), 16)
        # Delivered pages, not build output: the preview route emits no file.
        self.assertTrue(all(html.lstrip().startswith("<!DOCTYPE html>") for _n, html in pages))

    def test_the_corpus_links_no_stylesheet_of_its_own(self):
        """Why a stylesheet has to be supplied rather than read from the page.

        `renderToStaticMarkup` emits the component tree and nothing else. If
        this ever stops being true, the supplied sheet could double-count
        against a linked one and this test should be the thing that says so.
        """
        for name, html in measure.corpus_pages():
            self.assertNotIn("<link rel=\"stylesheet\"", html, name)
            self.assertNotIn("<style", html, name)


class WithoutStylesheet(unittest.TestCase):
    """The state the merged `a11y-generated-sites/` measurement is still in."""

    def test_no_element_is_decided_and_the_engine_says_so(self):
        pages = measure.corpus_pages()
        tally = measure.contrast_tally(pages, None)
        self.assertEqual(tally["elements"], tally["undecidable"])
        self.assertEqual(tally["pass"], 0)
        self.assertEqual(tally["fail"], 0)
        self.assertEqual(tally["decidable_share"], 0.0)

    def test_a_findings_only_reading_cannot_tell_this_from_clean(self):
        """The exact reason the zero was published as 'clean'.

        With no stylesheet the engine emits no 1.4.3 finding — identical, in
        the findings list alone, to a page that was checked and passed. Only
        the tally distinguishes them, and it is what the merged harness never
        read.
        """
        pages = measure.corpus_pages()
        criteria = measure.criteria_found(pages, None)
        self.assertNotIn("1.4.3", criteria["probe"])
        self.assertNotIn("1.4.3", criteria["audit_py"])


@needs_build
class WithStylesheet(unittest.TestCase):
    def test_the_built_sheet_covers_the_preview_components(self):
        """The sheet is the app's, so it must carry the delivered classes.

        Asserted rather than assumed: Tailwind generates by scanning source,
        and a change to that scan could quietly leave the preview route's
        classes out, which would look exactly like a clean page again.
        """
        css = measure.css_text()
        for class_name in ("text-zinc-500", "text-amber-800", "bg-zinc-900"):
            self.assertIn(class_name, css)

    def test_every_element_is_decided_or_declined_for_a_named_reason(self):
        tally = measure.contrast_tally(measure.corpus_pages(), measure.stylesheet())
        self.assertEqual(
            tally["undecidable"],
            sum(tally["reasons"].values()),
            "an undecidable element with no reason is exactly what may not be shipped",
        )

    def test_the_delivered_pages_pass(self):
        tally = measure.contrast_tally(measure.corpus_pages(), measure.stylesheet())
        self.assertEqual(tally["fail"], 0)
        self.assertGreater(tally["pass"], 0)

    def test_the_gradient_background_is_actually_read(self):
        """Regression guard for the CSS reader fix this pass made.

        The delivered pages set their background with a Tailwind arbitrary
        value whose class name contains escaped commas. While the selector
        splitter split on those, the rule was dropped and every element over
        that gradient was scored against a background the page does not have —
        and reported as *decided*. The tell is that some element is now
        undecidable for a gradient reason: that answer is only reachable if
        the gradient was read.
        """
        tally = measure.contrast_tally(measure.corpus_pages(), measure.stylesheet())
        self.assertIn("gradient-straddles-threshold", tally["reasons"])


@needs_build
class PositiveControls(unittest.TestCase):
    def test_each_control_fails_exactly_the_elements_that_carry_the_class(self):
        for row in measure.run_controls(measure.corpus_pages()):
            self.assertGreater(row["elements_carrying_class"], 0, row["class"])
            self.assertEqual(row["failures"], row["elements_carrying_class"], row["class"])


class SavedResults(unittest.TestCase):
    @unittest.skipUnless(RESULTS.is_file(), "no committed results file")
    def test_the_report_renders_from_the_saved_run(self):
        results = json.loads(RESULTS.read_text())
        text = measure.report(results)
        self.assertIn("Contrast (SC 1.4.3)", text)
        self.assertIn("axe-core", text)

    @unittest.skipUnless(RESULTS.is_file(), "no committed results file")
    def test_the_saved_run_records_axe_declining_most_of_the_corpus(self):
        """Pins the finding that a 0 from axe here is not corroboration.

        axe reports zero contrast violations on these pages *and* declines
        about three quarters of the checks. A future run that quietly stopped
        recording `incomplete` would show the same zero with nothing to
        qualify it, which is the mistake this directory exists to name.
        """
        results = json.loads(RESULTS.read_text())
        contrast = results["axe_baseline"]["color_contrast"]
        self.assertEqual(contrast["violations"], 0)
        self.assertGreater(contrast["declined_share"], 0.5)


if __name__ == "__main__":
    unittest.main()
