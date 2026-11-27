"""Tests for relicense_arr.py. Run: python3 -m unittest portfolio/monetization/test_relicense_arr.py"""
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import relicense_arr as ra  # noqa: E402
from relicense_fsl import FSL_TEXT  # noqa: E402


class LicenceFile(unittest.TestCase):
    def test_our_fsl_file_becomes_the_notice_keeping_year_and_holder(self):
        out = ra.relicense_file(FSL_TEXT.format(year=2025, holder="Duncan Haywood"))
        self.assertTrue(out.startswith("Copyright (c) 2025 Duncan Haywood. All rights reserved.\n"))
        self.assertIn("Publishing it\ngrants no licence.", out)
        self.assertEqual(out.count("All rights reserved."), 1)

    def test_someone_elses_fsl_file_and_other_licences_are_untouched(self):
        self.assertIsNone(ra.relicense_file(FSL_TEXT.format(year=2024, holder="Functional Software, Inc.")))
        self.assertIsNone(ra.relicense_file("MIT License\n\nCopyright (c) 2026 Duncan Haywood\n"))

    def test_the_notice_passes_the_risk_review_licence_check(self):
        sys.path.insert(0, str(HERE.parents[1] / "platform" / "security"))
        import risk_review
        out = ra.relicense_file(FSL_TEXT.format(year=2026, holder="Duncan Haywood"))
        self.assertEqual(risk_review.licence_name(out), "LicenseRef-AllRightsReserved")


class Phrases(unittest.TestCase):
    def rw(self, text, rel="ventures/x/index.html"):
        return ra.rewrite_text(text, rel)

    def test_footer_and_faq_phrasings(self):
        self.assertEqual(self.rw("Free to use and source available (FSL-1.1-MIT)."),
                         "Free to use and source visible (all rights reserved).")
        self.assertEqual(self.rw('the <a href="LICENSE" rel="noopener">FSL-1.1-MIT licence</a>'),
                         'an <a href="LICENSE" rel="noopener">all-rights-reserved notice</a>')
        self.assertEqual(self.rw("Our code is FSL-1.1-MIT-licensed."), "Our code is under an all-rights-reserved notice.")
        self.assertEqual(self.rw("it. FSL-1.1-MIT licensed (see)"), "it. All rights reserved (see)")
        self.assertEqual(self.rw("Open source under the FSL-1.1-MIT licence."),
                         "Source visible under an all-rights-reserved notice.")

    def test_tests_and_package_fields(self):
        self.assertEqual(self.rw("assert.match(t, /Functional Source License/)", "ventures/x/a.test.mjs"),
                         "assert.match(t, /All rights reserved/)")
        self.assertEqual(self.rw('{\n  "license": "FSL-1.1-MIT"\n}', "ventures/x/package.json"),
                         '{\n  "license": "LicenseRef-AllRightsReserved"\n}')

    def test_licence_heading_spanning_lines(self):
        self.assertEqual(self.rw("## Licence\n\nFSL-1.1-MIT, see LICENSE.", "ventures/x/README.md"),
                         "## Licence\n\nAll rights reserved, see LICENSE.")

    def test_a_line_about_someone_elses_project_keeps_its_words(self):
        line = "six OFX files from the FSL-1.1-MIT-licensed ofxparse project's tests"
        self.assertEqual(self.rw(line, "ventures/x/HISTORY.md"), line)
        line = "a public FSL-1.1-MIT-licensed GitHub file (Delta-Compute/DeltaCFOAgent)"
        self.assertEqual(self.rw(line, "ventures/x/README.md"), line)

    def test_our_support_the_project_footer_is_still_ours(self):
        self.assertEqual(self.rw('<a href="x">Support the project</a> · FSL-1.1-MIT licence.'),
                         '<a href="x">Support the project</a> · all-rights-reserved notice.')

    def test_rewriting_twice_changes_nothing(self):
        once = self.rw("Free to use and source available under the FSL-1.1-MIT licence.")
        self.assertEqual(self.rw(once), once)


class Scope(unittest.TestCase):
    def test_only_proprietary_products(self):
        prods = ra.products()
        self.assertIn("wall-framing-takeoff", prods)
        self.assertNotIn("ebay-fee-calculator", prods)
        self.assertEqual(ra.main(["--check", "ebay-fee-calculator"]), 2)


if __name__ == "__main__":
    unittest.main()
