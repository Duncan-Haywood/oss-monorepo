---
kind: polish
topics: [seo]
date: 2026-11-10
tagged: auto
---
# Polish 2026-11-10: answer-first lead on the Medicare IRMAA cliff calculator

**Change.** `data-answer-lead` paragraph on `ventures/medicare-irmaa-cliff-calculator`: 2026 thresholds ($109,000 single, $218,000 joint, top tier $500,000 / $750,000), standard Part B $202.90, first-tier and top-tier surcharges. New entry in `platform/pages/answer-lead.test.mjs` ties every dollar figure to `tiers()` and `STANDARD_PART_B`. Answer-lead suite 44/44; venture page and calc tests 35/35. Full site build not run.

**Not verified.** medicare.gov and cms.gov returned 403 through the proxy, so the figures were not re-checked against a primary page. The calculator header already says they came from secondary reports; the lead says the same rather than claiming CMS as a checked source.

**Next.** Re-check the figures at medicare.gov from an unblocked network and, if they hold, drop the "not re-checked" wording. Other candidates without a lead: social-security-earnings-test-calculator, senior-deduction-calculator, qbi-deduction-calculator (each needs a primary source first).
