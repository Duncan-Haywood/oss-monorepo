---
kind: polish
topics: [seo]
date: 2026-11-26
---
# Polish 2026-11-26: llms.txt answers for the other bet front doors

Track: polish/0. Picked item 1 of "Still weakest" in
`polish-2026-11-26-llms-answers.md`: opt the other bet front doors into the
generated `## Answers` section of their `llms.txt`.

## What changed

- `id="faq"` on the visible "Common questions" section of 99
  einvoice-preflight guides (bet #3) and the mechanics-lien-deadline-calculator
  (bet #1), plus the two einvoice build scripts that write such a page
  (`build-br-fr-codes-page.mjs`, `build-sdi-codes-page.mjs`). The section had no
  id, so neither the extractor nor a `#faq` link could find it.
- `platform/pages/llms-answers.mjs`: if writing the answers inline would push a
  product's `llms.txt` past 100 KB (`INLINE_LIMIT`), the `llms.txt` gets one line
  per page that lists its questions, and the full answers go to a sibling
  `llms-answers.txt` that the section links. einvoice-preflight inline would
  have been 245 KB; the site index was capped because 539 KB did not fit one
  fetch (backlog P052).
- `llms-answers.test.mjs`: unit test for the split. The ratchet now checks
  `llms-answers.txt` as well, and fails any opted-in `llms.txt` over 150 KB.
- Opted in: mechanics-lien-deadline-calculator (9 answers),
  pay-application-generator (15), lien-waiver-checker (6), einvoice-preflight
  (396 from 99 pages).

## Measured

- Bet front doors with an Answers section: 2 → 6.
- Sizes: einvoice `llms.txt` 50.3 → 80.8 KB, plus `llms-answers.txt` 194.6 KB;
  lien calculator 2.7 → 8.0 KB; pay-app generator 1.9 → 9.1 KB; lien-waiver
  checker 1.7 → 4.1 KB.
- All 426 extracted questions match a question in the page's FAQPage JSON-LD.
  331 answers match it byte for byte. In the other 95 the visible answer has an
  extra sentence (usually "Open the checker…" with a link), and the visible
  text is what we quote.
- Tests: einvoice-preflight 2,206 pass; mechanics-lien 60 pass;
  `product-llms` + `llms-answers` 40 pass.
- No traffic or citation claim; usage is unmeasured.

## Still weakest, next

1. einvoice-preflight's `index.html` FAQ has no `<section>`. Under "When must
   German businesses issue e-invoices?" it lists about 30 countries in separate
   paragraphs, so it would come out as one huge answer. Split it into a
   question per country, or move the country list out of the FAQ, then wrap it
   in `<section id="faq">`. Five other einvoice pages
   (audit-pack-for-accountants, peppol-bis-3-1-0-readiness, …) put their
   questions in `h2`s and are skipped too.
2. Other paid products with visible FAQs and no Answers section: run
   `grep -L '^## Answers' ventures/*/llms.txt` against the
   `transition.json` list.
3. Carried: four pay-app pages with 6 header links; non-bet products on the meta
   description baseline; online-sellers base-type test.
