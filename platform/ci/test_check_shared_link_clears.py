"""Tests for check_shared_link_clears.

The two fixtures below are reduced from the real defect measured on
2026-09-10 (`poshmark-fee-calculator`, `wash-and-fold-price-calculator`) --
draft restored first, link applied second, applied bare -- and from the fix
that landed with it. The scope tests matter as much as the catch: this guard
is only worth having if it stays quiet on the two shapes it deliberately does
not judge, or the real finding gets buried.

The object-spread-merge fixtures further down are reduced from a second,
wider instance measured the same day, after the rollout had already moved on
to four more ventures (`vending-machine-route-margin`,
`dog-walking-route-pricing`, `reverb-fee-calculator`,
`whatnot-seller-payout`): the same defect, applied through
`{ ...saved, ...fromLink }` rather than a bare `write...(fromLink)` call, which
the original BARE_APPLY pattern could not see at all.
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

    def test_flags_apply_prefixed_writers_too(self):
        # Several ventures name this function applyInputs/applyVisitInputs
        # rather than writeInputs. The old pattern only recognised "write".
        problem = check_page(page(DRAFT, DECODE, "applyVisitInputs(fromLink);"))
        self.assertIsNotNone(problem)
        self.assertIn("applyVisitInputs(fromLink)", problem)

    def test_accepts_a_wrapped_apply_prefixed_writer(self):
        self.assertIsNone(check_page(page(DRAFT, DECODE, "applyInputs(formValues(fromLink));")))

    def test_flags_the_object_spread_merge_shape(self):
        # The real defect measured 2026-09-10 in four ventures
        # (vending-machine-route-margin, dog-walking-route-pricing,
        # reverb-fee-calculator, whatnot-seller-payout): fromLink is spread
        # into a plain object alongside the saved draft, then *that* object is
        # applied -- so no write.../apply... call is ever made on fromLink
        # itself, and BARE_APPLY cannot see it.
        problem = check_page(page(
            DRAFT, DECODE,
            "const restored = { ...saved, ...fromLink };",
            "applyVisitInputs(restored);",
        ))
        self.assertIsNotNone(problem)
        self.assertIn("...saved, ...fromLink", problem)

    def test_flags_the_spread_merge_shape_even_with_a_leading_defaults_spread(self):
        # reverb-fee-calculator's exact shape: defaults, then saved, then the
        # link. The link's own keys still win, and an omitted key still falls
        # through to `saved` rather than `REVERB_DEFAULTS`.
        problem = check_page(page(
            DRAFT, DECODE,
            "apply({ ...REVERB_DEFAULTS, ...saved, ...fromLink });",
        ))
        self.assertIsNotNone(problem)

    def test_recognises_a_draft_stored_under_a_key_other_than_draft_key(self):
        # reverb-fee-calculator and whatnot-seller-payout call it INPUTS_KEY
        # and STORAGE_KEY. The scope guard used to require the literal name
        # DRAFT_KEY, so it never even looked at either page.
        other_key_draft = "const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');"
        problem = check_page(page(
            other_key_draft, DECODE,
            "const restored = { ...saved, ...fromLink };",
            "applyInputs(restored);",
        ))
        self.assertIsNotNone(problem)

    def test_spread_merge_is_flagged_even_alongside_a_correct_wrapped_call(self):
        # A page could carry a correct restore path and a leftover buggy one.
        # The spread is unambiguous evidence of the defect either way, so it
        # must not be masked by WRAPPED_APPLY's early accept.
        problem = check_page(page(
            DRAFT, DECODE,
            "writeInputs(formValues(fromLink));",
            "const restored = { ...saved, ...fromLink };",
        ))
        self.assertIsNotNone(problem)

    def test_does_not_flag_a_plain_spread_that_never_mentions_fromlink(self):
        # Scope check: an ordinary object spread unrelated to the shared-link
        # restore must not trip this guard.
        self.assertIsNone(check_page(page(DRAFT, DECODE, "const merged = { ...a, ...b };")))

    def test_does_not_flag_the_if_link_else_draft_shape(self):
        # etsy-profit-calculator, faire-wholesale-calculator and
        # retainage-cashflow-calculator (measured 2026-09-10, the same day the
        # `apply` prefix was added to BARE_APPLY): the draft is read only in
        # the `else`, so it is never in the DOM when the bare apply(fromLink)
        # runs. No merge, no leak, not the defect -- broadening the apply
        # prefix without this exemption would have "fixed" correct code.
        self.assertIsNone(check_page(page(
            DRAFT, DECODE,
            "if (Object.keys(fromLink).length) { applyInputs(fromLink); }",
            "else { const saved = JSON.parse(localStorage.getItem(INPUTS_KEY)); applyInputs(saved); }",
        )))

    def test_does_not_flag_the_one_line_if_link_else_draft_shape(self):
        # retainage-cashflow-calculator's exact (unspaced) spelling.
        self.assertIsNone(check_page(page(
            DRAFT, DECODE,
            "if(Object.keys(fromLink).length)applyInputs(fromLink);",
            "else restoreDraft();",
        )))

    def test_still_flags_a_bare_apply_with_an_unrelated_if_else_nearby(self):
        # The exemption is specific to the if/(bare apply)/else shape around
        # the SAME call -- an unrelated if/else elsewhere in the script must
        # not blanket-exempt a real sequential-restore defect.
        problem = check_page(page(
            DRAFT, DECODE,
            "if (usageAllowed()) { count('x'); } else { count('y'); }",
            "applyInputs(saved);",
            "applyInputs(fromLink);",
        ))
        self.assertIsNotNone(problem)


if __name__ == "__main__":
    unittest.main()
