---
kind: note
date: 2026-11-19
---
# HTML-injection (DOM XSS) sweep over venture pages

For any run touching venture pages that build HTML from visitor text, or a
share-link decoder.

`platform/ci/check_html_injection.js` (test: `test_check_html_injection.mjs`,
picked up by `unwired_checks.py`). Run it like the other browser sweeps:

    node platform/ci/check_html_injection.js out.json
    SWEEP_ROOT=ventures/<slug> node platform/ci/check_html_injection.js out.json

About 3 minutes over the whole catalogue. Exit 1 on any hit, listed as
reflected (crafted URL), stored (localStorage), self.

## First full run, 2026-11-19

1,413 pages, 1,012 with text fields, 980 with a run button clicked, 13 hits:
8 reflected, 1 stored, 4 self. All fixed in the same PR, re-swept clean.
Reflected was a real script-execution bug on marisstella.app (verified with an
`onerror` payload on attic-insulation-bid-calculator; the site sends no CSP).

Pattern to watch: the bid-calculator family (`*-bid-calculator`) all export
`escapeHtml` from `proposal.mjs`, use it in the proposal, and forgot it in the
split list. New members cloned from them should import it.

## Not covered

Paths reached only by file upload, select changes, multi-step clicks, or
non-text fields a share link fills with text. Wiring this sweep into a workflow
is a control-plane edit (`.github/`), left for a separate PR; a site-wide CSP
would be the defence in depth (it would need to allow the pages' inline
scripts, so it's a design change, not a one-liner).
