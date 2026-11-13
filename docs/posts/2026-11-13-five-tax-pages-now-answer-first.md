---
title: "Five tax and sales-tax pages now answer the question in their first sentence"
seo_title: "Economic nexus thresholds and 2026 deduction limits, sourced"
date: 2026-11-13
tags: [polish, aeo, seo]
description: "The economic nexus tracker and four 2026 deduction tools now open with a sourced, dated answer; a test ties each figure to the calculator code."
---

When someone asks an AI assistant "what is the economic nexus threshold?", the assistant quotes a page that states the answer plainly and says where it came from. Five of our most-searched tools put the answer in the intro, but they named no source and no date. A page like that is harder to quote, and nothing stopped its figures from drifting away from the calculator underneath.

Today they open with an answer-first lead, the same pattern as about fifty earlier pages:

- **[Economic nexus threshold tracker](https://marisstella.app/economic-nexus-threshold-tracker/):** 40 states and DC use $100,000 a year. California, New York and Texas use $500,000, and Alabama and Mississippi $250,000. 18 jurisdictions also count transactions, usually 200 as an either-or test; Connecticut and New York require both. Five states have no state sales tax. Source: *South Dakota v. Wayfair* (2018) and the states' revenue departments, as compiled in two 2026 nexus guides.
- **[No tax on tips and overtime](https://marisstella.app/no-tax-on-tips-overtime-calculator/):** up to $25,000 of tips, and up to $12,500 of overtime premium ($25,000 joint). Both phase out above $150,000 or $300,000. Source: 26 U.S.C. 224 and 225.
- **[Car loan interest deduction](https://marisstella.app/auto-loan-interest-deduction-calculator/):** up to $10,000 a year, phasing out above $100,000 or $200,000. Source: 26 U.S.C. 163(h)(4).
- **[Charitable deduction for non-itemizers](https://marisstella.app/charitable-deduction-calculator/):** $1,000, or $2,000 married filing jointly, plus the new 0.5%-of-AGI floor for itemizers. Source: 26 U.S.C. 170 as amended.
- **[Gambling loss limit](https://marisstella.app/gambling-loss-deduction-calculator/):** win $10,000 and lose $10,000, and $1,000 stays taxable, because losses are capped at 90% of winnings. Source: 26 U.S.C. 165(d) as amended.

Each lead carries the date its figures were last checked against sources. The same paragraph now opens each tool's `llms.txt` under "What it answers", so an assistant that reads the plain-text file gets the same answer as a reader of the page.

The part that keeps this honest is a test. `platform/pages/answer-lead.test.mjs` reads every dollar figure out of each lead and fails if the calculator's own module doesn't export it. For the nexus page it goes further: the state counts, the named states and the AND-test states are all recounted from the 51-row threshold table. If a state changes its threshold and someone updates the table, the test fails until the sentence is updated too.

What this doesn't do: nobody re-fetched the statutes today, because the session's network couldn't reach the code hosts. The dates on the leads are the dates the calculators were verified, not today's date. We haven't measured whether any assistant quotes these pages yet. Usage is unmeasured, not zero.
