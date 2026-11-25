---
kind: polish
topics: [seo]
date: 2026-11-25
---
# Polish 2026-11-25: machine-shop-guides FAQs (bet #2 and #4 front door)

Picked item 2 of "Still weakest" in `polish-2026-11-25-pay-app-guides-faqs.md`:
"Bet #2's front door (`machine-shop-guides`) has not been measured the same way."

## Measured before

All 15 pages: titles 53 to 69 characters, meta descriptions 140 to 159 (fine);
one `h1` each; every page's footer already links every sibling (index.html
missed `drawing-review.html`). **FAQ: 0 of 15 pages** had a question-shaped
heading or `FAQPage` JSON-LD; `faq-coverage.mjs machine-shop-guides` listed the
entry page as missing.

## What changed

- `ventures/machine-shop-guides/faq.mjs`: one source for each page's
  "Common questions" (3 Q&A per page, 4 on the index). It writes the visible
  `<section id="faq">` just before `</main>` and, on the 14 secondary pages,
  a `FAQPage` JSON-LD block in `<head>`. index.html gets the visible section
  only, because the site build derives FAQPage for entry pages (a hand block
  would duplicate it). Answers restate only what each page already says.
- index.html footer now links drawing-review.
- `page.test.mjs`: every page has an FAQ entry (>= 3 questions), the
  generated block is current, sits inside `<main>`, and the JSON-LD count is
  right; the index footer links every page.
- Post: extended `docs/posts/2026-11-24-one-page-for-machine-shops.md`.
- Screenshot (390 px, SPRS page FAQ): `img/polish-2026-11-25-msg-faq-sprs-score-calculator-390.png`.

## Verified

- `run_venture_tests.py machine-shop-guides`: 224 tests ok, plus faq-visible,
  secondary-schema, css-lint.
- `faq-visible.test.mjs`, `faq-duplicate.test.mjs`: 18/18.
- `faq-coverage.mjs machine-shop-guides`: 1 of 1 entry page ships derived schema (was 0).
- `faq-duplicate.mjs`: 4,518 pages, no duplicates.
- Playwright 390 px: scrollWidth 390 on index and SPRS (no sideways scroll).

## Still weakest, next

1. `mechanics-lien-deadline-calculator` and `pay-application-generator` (bet #1's
   other front doors) have not had the FAQ pass; check with the same count.
2. machine-shop-guides `llms.txt` does not list the questions; an "Answers"
   section pointing at each page's `#faq` would help assistants.
3. Carried: four pay-app pages with 6 header links; non-bet products on the meta
   description baseline; saints-by-candlelight og:descriptions.
