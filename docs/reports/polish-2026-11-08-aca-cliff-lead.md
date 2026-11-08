---
kind: polish
topics: [seo]
date: 2026-11-08
tagged: auto
---
# Polish 2026-11-08: answer-first lead on the ACA subsidy cliff calculator

**Change.** `data-answer-lead` paragraph (400% cliff at $62,600 / $84,600, applicable percentage range, full repayment of excess advance credit, sources, as-of date) on the page. New test in `platform/pages/answer-lead.test.mjs` ties the dollar figures to `fplAmount()` and the 2.10% / 9.96% rates to `BANDS` in `calc.mjs`. Answer-lead suite 33/33; venture suite 26/26. Full site build not run.

**Not verified.** The sources named (IRC 36B, Rev. Proc. 2025-25, 2025 HHS guidelines) were not re-fetched this run; the figures are the ones already in the calculator and its header comment.

**Skipped on purpose.** tiktok-shop-fee-calculator: its own `calc.mjs` says the fee schedule is unconfirmed, so a lead would state an unsourced figure.

**Next.** 401k-plan-fee-calculator (benchmarks are illustrative; needs a primary source before a lead); 390 px sweep of blog posts and flagship pages.
