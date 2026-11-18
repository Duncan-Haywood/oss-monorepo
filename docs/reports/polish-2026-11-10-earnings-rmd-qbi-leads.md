---
kind: polish
topics: [seo]
date: 2026-11-10
tagged: auto
---
# Polish 2026-11-10: answer-first leads on the earnings test, RMD and QBI calculators, and a stale 2025 QBI threshold

**Change.** Three pages gained a `data-answer-lead` paragraph with a source and an as-of date, and joined `PILOTS` in `platform/pages/answer-lead.test.mjs` (47/47 pass):
- `social-security-earnings-test-calculator`: the existing opening paragraph became the lead (2026 exempt amounts $24,480 / $65,160, confirmed on SSA's exempt-amount table through search; ssa.gov itself 403s from the proxy).
- `rmd-calculator`: new lead with a worked example ($500,000 at 75, factor 24.6, about $20,325), start ages and the excise tax. The test recomputes the example from `rmdFor`.
- `qbi-deduction-calculator`: new lead with the 2026 threshold, range and $400 minimum.

**Bug fixed.** `qbi-deduction-calculator` `THRESHOLDS[2025]` held the 2024 figures (191,950 / 383,900). Corrected to 197,300 / 394,600 (Rev. Proc. 2024-40, confirmed by several firm summaries; irs.gov 403s from the proxy). FAQ text, JSON-LD and unit tests updated. Example impact: single, $220k taxable, $150k QBI, no wages: $13,170 became $16,380. Post: `docs/posts/2026-11-10-qbi-calculator-used-2024-thresholds-for-2025.md`.

**Open.** A secondary source lists the 2026 MFS threshold as $201,775 (the module uses $201,750 = half of joint). Needs the Rev. Proc. 2025-32 section 4.26 text to settle; irs.gov was unreachable.

**Next.** Grep other tax ventures for year-keyed tables whose oldest year row may be the year before (this one was a one-year-stale copy). Remaining statutory pages without leads: search `ventures/*/index.html` for pages citing an IRC section with no `data-answer-lead`.
