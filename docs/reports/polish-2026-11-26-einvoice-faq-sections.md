---
kind: polish
topics: [seo]
date: 2026-11-26
---
# Polish 2026-11-26: the last two einvoice-preflight FAQs join llms.txt Answers

Track: polish/0. Picked item 1 of "Still weakest" in
`polish-2026-11-26-einvoice-front-page-faq.md`: einvoice-preflight (bet #3)
pages that put their questions in bare `h2`s outside `<section id="faq">`, so
`platform/pages/llms-answers.mjs` skipped them.

## Measured first

The note said "five"; measured, it is two. Of 106 HTML pages, 100 have
`<section id="faq">`. Of the six without, only two carry questions or
`FAQPage` JSON-LD: `peppol-bis-3-1-0-readiness.html` (4 visible questions,
3 in JSON-LD) and `audit-pack-for-accountants.html` (3 of 3, but with no
question marks). `create.html`, `sample-audit-pack.html`,
`e-invoicing-deadlines-2027.html` and `which-e-invoice-mandate-applies.html`
have no FAQ to wrap.

## What changed

- Both pages: the questions are now `h3`s in a `<section id="faq">` under
  "Common questions", styled as a white card like the page's other blocks.
- Peppol 3.1.0 readiness (a deadline page: access points apply 3.1.0 on
  24 February 2027): "Thousands of files?" became "Can I check thousands of
  files at once?". `FAQPage` JSON-LD 3 → 4 entries, regenerated from the
  visible section with `extractFaq()`, so the text is equal.
- Audit pack: the three questions gained their question marks; "Who it is
  for" is not a question and stays above the section. JSON-LD regenerated.
- `node platform/pages/llms-answers.mjs ventures/einvoice-preflight`:
  402 → 409 answers (`llms.txt` +2 lines, `llms-answers.txt` +7).

## Verified

- Playwright, pages served from the folder: no sideways scroll at 390 px or
  1280 px on either page (scrollWidth equals the viewport).
- `python3 platform/ci/run_venture_tests.py einvoice-preflight`: ok, 2,828
  tests (145 skipped, optional Schematron deps), plus the site page checks.
- `node --test platform/pages/faq-visible.test.mjs platform/pages/faq-duplicate.test.mjs platform/pages/llms-answers.test.mjs`: 25/25.

## Still weakest, next

1. `e-invoicing-deadlines-2027.html` and `which-e-invoice-mandate-applies.html`
   are question-shaped search pages with no FAQ at all; a short sourced FAQ
   (each answer citing the page's own official sources) would give them
   `FAQPage` data and llms.txt answers. Content work: cite, do not invent.
2. A check: a bet venture page with `FAQPage` JSON-LD but no
   `<section id="faq">` is invisible to llms-answers; a test over the
   `optedIn()` ventures would stop the next one.
3. Carried: four pay-app pages with 6 header links; two-column amount grid for
   pay-application-generator's phone cards; the phone-probe swipes list.
