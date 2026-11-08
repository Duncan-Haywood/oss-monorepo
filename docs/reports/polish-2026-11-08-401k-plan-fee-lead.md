---
kind: polish
topics: [seo, aeo]
date: 2026-11-08
tagged: auto
---
# Polish 2026-11-08: answer-first lead on the 401(k) plan fee calculator

**Change.** `data-answer-lead` paragraph on `ventures/401k-plan-fee-calculator/index.html`: ERISA 408(b)(2) requires service providers to disclose compensation so the all-in fee can be judged; no federal safe-harbor percentage exists. Source: 29 CFR 2550.408b-2(c), as of 2026-11-08. No dollar figures, so a separate test in `platform/pages/answer-lead.test.mjs` checks source, date, the "no safe-harbor percentage" claim and that the calculator's benchmark table is labelled illustrative. Answer-lead suite 28/28; venture suites 16/16. Full site build not run. The regulation text was not re-fetched this run; the citation is from the calc module's own header comment and general knowledge.

**Next.** Remaining venture pages without leads (tiktok-shop fee calculator and others; their figures need a primary source first); 390 px sweep of blog posts and flagship pages.
