---
kind: polish
topics: [seo]
date: 2026-11-09
tagged: auto
---
# Polish 2026-11-09: answer-first lead on the estimated tax penalty calculator

**Change.** `data-answer-lead` paragraph stating the safe harbor (90% of this year's tax or 100% of last year's, 110% above $150,000 AGI, no penalty under $1,000 owed), sourced to IRS Topic 306 (irs.gov/taxtopics/tc306, fetched 2026-11-09; page confirms the 90%/100% and $1,000 rules). New test in `answer-lead.test.mjs` (39/39) ties the two dollar figures to `HIGH_INCOME_AGI` and `DE_MINIMIS` in `calc.mjs`; venture tests 20/20. Full site build not run (started, stopped).

**Next.** Leads for charitable-deduction, economic-nexus-threshold-tracker, ifta-quarterly-fuel-tax-calculator. No ranking claim made; usage is unmeasured.
