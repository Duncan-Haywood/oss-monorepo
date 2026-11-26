---
kind: polish
topics: [seo]
date: 2026-11-26
---
# Polish 2026-11-26: llms.txt "Answers" generated from page FAQs

Track: polish/0. Picked item 2 of "Still weakest" in
`polish-2026-11-25-machine-shop-guides-faqs.md` ("machine-shop-guides `llms.txt`
does not list the questions"), and did it as software so it covers bet #1's
pay-app-guides too and cannot drift.

## What changed

- `platform/pages/llms-answers.mjs`: reads each page's `<section id="faq">`
  (h3 = question, everything to the next h3 = answer, tags stripped, entities
  decoded), writes `## Answers` into the product's `llms.txt` (replaces an
  existing one up to the next `## `; else before "Products in development" or
  "Source"; else last). Links are `<base>/<page>#faq`, base read from the
  llms.txt's own links. `--check` only reports.
- `platform/pages/llms-answers.test.mjs`: unit tests, plus the ratchet: every
  `ventures/*/llms.txt` that has `## Answers` must equal what the script writes.
- `ventures/pay-app-guides/llms.txt`: 75 answers from 24 pages (index first).
- `ventures/machine-shop-guides/llms.txt`: 46 answers from 15 pages.

## Measured

- Before: 0 of 2 bet front-door llms.txt files listed any question.
- After: 121 Q&A lines; all 46 machine-shop answers byte-match `faq.mjs`.
- pay-app llms.txt 12.7 KB → 42.0 KB; machine-shop 8.8 KB → 26.0 KB. Kept the
  full answers rather than first sentences: several answers start "No." or
  "Two." and would misquote on their own.
- No traffic or citation claim; usage is unmeasured.

## Still weakest, next

1. Opt in the other bet front doors with FAQs (`mechanics-lien-deadline-calculator`,
   `pay-application-generator`, `lien-waiver-checker`, the e-invoicing guides):
   `node platform/pages/llms-answers.mjs ventures/<slug>`, then check size.
2. Carried: four pay-app pages with 6 header links; non-bet products on the meta
   description baseline; online-sellers base-type test (industry-base-type report).
