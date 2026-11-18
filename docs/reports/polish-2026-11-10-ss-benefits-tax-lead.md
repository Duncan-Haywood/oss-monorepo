---
kind: polish
topics: [seo]
date: 2026-11-10
tagged: auto
---
# Polish 2026-11-10: answer-first lead on the Social Security benefits tax calculator

**Change.** The page's opening paragraph gained `data-answer-lead`, a source (26 U.S.C. 86, IRS Pub 915) and an as-of date. Added the slug to `PILOTS` in `platform/pages/answer-lead.test.mjs` (43/43 pass; venture page and calc tests 21/21). Full site build not run.

**Why this page.** Its figures are statutory and unindexed, so no re-fetch of a yearly schedule was needed.

**Next.** Other statutory-figure pages still without leads: social-security-earnings-test, rmd-calculator, medicare-irmaa (yearly figures: need a primary source first), qbi-deduction.
