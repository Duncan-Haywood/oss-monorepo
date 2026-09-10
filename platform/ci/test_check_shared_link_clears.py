"""Tests for check_shared_link_clears.

The two fixtures below are reduced from the real defect measured on
2026-09-10 (`poshmark-fee-calculator`, `wash-and-fold-price-calculator`) --
draft restored first, link applied second, applied bare -- and from the fix
that landed with it. The scope tests matter as much as the catch: this guard
is only worth having if it stays quiet on the two shapes it deliberately does
not judge, or the real finding gets buried.
"""

import unittest

from check_shared_link_clears import check_page

DRAFT = "const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');"
DECODE = "const fromLink = decodeInputs(location.hash || location.search);"


def page(*lines: str) -> str:
    return "<script type='module'>\n" + "\n".join(lines) + "\n</script>"


class SharedLinkClearsTest(unittest.TestCase):
    def test_flags_a_bare_apply_over_a_saved_draft(self):
        problem = check_page(page(DRAFT, DECODE, "writeAllInputs(fromLink);"))
        self.assertIsNotNone(problem)
        self.assertIn("writeAllInputs(fromLink)", problem)
        self.assertIn("formValues(fromLink)", problem)

    def test_flags_each_writer_name_the_fleet_uses(self):
        for writer in ("writeInput", "writeInputs", "writeAllInputs"):
            with self.subTest(writer=writer):
                problem = check_page(page(DRAFT, DECODE, f"{writer}(fromLink);"))
                self.assertIsNotNone(problem, f"{writer} should be flagged")

    def test_accepts_a_wrapped_apply(self):
        self.assertIsNone(check_page(page(DRAFT, DECODE, "writeInputs(formValues(fromLink));")))

    def test_does_not_pin_the_wrapper_name(self):
        # The rule is that *something* stands between the decode and the form,
        # not that it is spelled `formValues` -- a venture is free to name its
        # own helper without this guard going off.
        self.assertIsNone(check_page(page(DRAFT, DECODE, "writeInputs(everyField(fromLink));")))

    def test_ignores_a_page_with_a_link_but_no_saved_draft(self):
        # Nothing else is in the boxes to be mistaken for the sender's numbers.
        self.assertIsNone(check_page(page(DECODE, "writeInputs(fromLink);")))

    def test_ignores_a_page_with_a_draft_but_no_link(self):
        # No second party to disagree with.
        self.assertIsNone(check_page(page(DRAFT, "writeInputs(saved);")))

    def test_ignores_an_ordinary_page(self):
        self.assertIsNone(check_page("<p>no script here</p>"))

    def test_whitespace_does_not_hide_the_defect(self):
        problem = check_page(page(DRAFT, DECODE, "writeInputs( fromLink );"))
        self.assertIsNotNone(problem)

    def test_a_draft_written_but_never_read_is_not_a_restore(self):
        # setItem alone does not put anyone else's numbers in the form; only a
        # getItem before the link can do that.
        saved_only = "localStorage.setItem(DRAFT_KEY, JSON.stringify(readInput()));"
        self.assertIsNone(check_page(page(saved_only, DECODE, "writeInputs(fromLink);")))


if __name__ == "__main__":
    unittest.main()
