---
kind: polish
topics: [seo, design]
date: 2026-11-26
---
# Polish 2026-11-26: einvoice-preflight front page FAQ, JSON-LD and llms.txt answers

Track: polish/0. Picked item 1 of "Still weakest" in
`polish-2026-11-26-llms-answers-bet-front-doors.md`: the einvoice-preflight
(bet #3) front page FAQ had no `<section id="faq">`, so its questions never
reached the generated `## Answers` in `llms.txt`.

## What was weak

- "Common questions" sat bare on the page background below the cards, unlike
  every other block on the page.
- Under "When must German businesses issue e-invoices?" the answer ran on for
  93 more country paragraphs (France, Slovakia, Hungary, ... in the order they
  were added), so a reader or an answer engine got one 20,000-character answer.
- The `FAQPage` JSON-LD listed 2 of the 6 visible questions.

## What changed (`ventures/einvoice-preflight/index.html`)

- The six questions are now `<section id="faq">` (a card, like the rest of the
  page). The German answer is the German answer only; a muted lead line points
  to the country list.
- The 93 country paragraphs moved, text unchanged, into their own card,
  `<section id="by-country">` "E-invoicing rules by country": a two-column
  list (one column on a phone), sorted A to Z, under the existing link to the
  side-by-side mandates table.
- `FAQPage` JSON-LD regenerated from the visible section with
  `extractFaq()` from `platform/pages/llms-answers.mjs`: 6 of 6, text equal.
- `node platform/pages/llms-answers.mjs ventures/einvoice-preflight`: the
  front page joins the Answers list (402 answers, was 396; `llms.txt` +1 line,
  `llms-answers.txt` +6).

## Measured (Playwright, page served from the folder)

| | before | after |
|---|---|---|
| desktop 1280 px page height | 9,635 px | 8,351 px |
| phone 390 px page height | 20,234 px | 21,852 px (before a later phone-only tightening of the list margins) |
| sideways scroll (scrollWidth) | none | none |
| FAQPage entries / visible questions | 2 / 6 | 6 / 6 |
| front page in llms.txt Answers | no | yes |

The phone page is longer because the list is now inside a padded card; the
FAQ itself is shorter and every country is one tap from the lead line.

## Verified

- `python3 platform/ci/run_venture_tests.py einvoice-preflight`: ok, 2,813 tests
  (145 skipped, the usual optional Schematron deps), plus the site page checks.
- `node --test platform/pages/faq-visible.test.mjs platform/pages/faq-duplicate.test.mjs platform/pages/llms-answers.test.mjs`: 25/25.

## Still weakest, next

1. Five other einvoice pages (audit-pack-for-accountants,
   peppol-bis-3-1-0-readiness, ...) put their questions in `h2`s outside any
   `<section id="faq">` and are skipped by the Answers generator.
2. The country list is good for scanning but still long on a phone; a region
   grouping (EU, rest of Europe, Americas, Asia-Pacific, Middle East and Africa)
   with in-page jump links would cut the scroll. Needs a region per country.
3. Other paid products with visible FAQs and no Answers section:
   `grep -L '^## Answers' ventures/*/llms.txt` against `transition.json`.
4. Carried: four pay-app pages with 6 header links; non-bet products on the meta
   description baseline; online-sellers base-type test.
