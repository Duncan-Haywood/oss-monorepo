---
kind: polish
topics: [seo]
date: 2026-11-08
tagged: auto
---
# Polish 2026-11-08: answer-first lead on the inherited IRA 10-year planner

**Change.** `data-answer-lead` paragraph on `ventures/inherited-ira-10-year-withdrawal-planner/index.html`: the 10th-year deadline, the yearly minimum when the owner had started RMDs, and the 25% (10% if corrected in two years) excise tax. Source line cites IRC 401(a)(9)(H) and 4974 via IRS Publication 590-B; as of 2026-11-08. The statutes and publication were not re-fetched this run: the wording restates what the page's own FAQ and `calc.mjs` findings already said.

**Test.** New case in `platform/pages/answer-lead.test.mjs`: no dollar figures, planner caps the window at 10 years, the lead and the page FAQ state the same excise rates. Answer-lead suite 30/30; planner suites 26/26. Full site build not run.

**Next.** Pages still without leads: 401k-plan-fee, nanny-tax, child-tax-credit, estimated-tax-penalty (each needs its figures checked against a primary source first); 390 px sweep of blog posts.
