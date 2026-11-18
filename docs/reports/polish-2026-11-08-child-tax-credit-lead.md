---
kind: polish
topics: [seo]
date: 2026-11-08
tagged: auto
---
# Polish 2026-11-08: answer-first lead on the child tax credit calculator

**Change.** The page's intro paragraph is now a `data-answer-lead` with the 2026 figures ($2,200 CTC, $500 other dependent, $1,700 refundable cap, $200,000/$400,000 phase-out), a source (26 U.S.C. section 24, Schedule 8812 instructions) and an as-of date. `platform/pages/answer-lead.test.mjs` ties every dollar figure to `calc.mjs` exports (31/31 pass; venture page and calc tests 40/40). Figures are the ones the calc module already carried; I did not re-fetch IRS pages. Full site build not run (stopped to save time).

**Next.** Other venture pages without leads: backdoor-roth-pro-rata, estimated-tax-penalty, espp-tax, 401k-plan-fee; 390 px sweep of blog posts.
