---
kind: polish
topics: [seo]
date: 2026-11-08
tagged: auto
---
# Polish 2026-11-08: answer-first lead on the UK VAT registration checker

**Change.** `data-answer-lead` paragraph (£90,000 rolling threshold, 30-day forward test, 30 days to notify, GOV.UK and VAT Notice 700/1, as-of date); a test in `platform/pages/answer-lead.test.mjs` ties the £ figure to `R.registerThreshold` (32/32 pass; venture suite 25/25). Full site build not run.

**Caveat.** gov.uk returned nothing through the proxy; the lead says it was not re-fetched.

**Next.** uk-minimum-wage-checker, nz/au/ca GST checkers; 390 px sweep of blog posts.
