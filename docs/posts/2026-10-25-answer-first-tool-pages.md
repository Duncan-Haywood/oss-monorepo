---
title: "Ten fee pages now open with a sourced, dated answer"
date: 2026-10-25
description: "How the fee and threshold calculators lead with one quotable sentence, and the test that keeps its numbers from drifting."
tags: [seo, tooling]
---

AI answer engines quote pages that state a fact plainly, with its source and a
date. A calculator that only shows numbers after you type gives them nothing to
quote. Ten pages (1099-K threshold, HSA limits, exempt salary threshold, and the
Discogs, Grailed, Facebook Marketplace, Depop, Mercari, Poshmark and Kickstarter
fee calculators) now open with one sentence that gives the rate or threshold,
names the fee page it comes from, and carries an as-of date.

A lead whose number drifts from the calculator would quote a wrong figure, so
`platform/pages/answer-lead.test.mjs` checks every dollar figure in each lead
against what the venture's own `calc.mjs` exports. Sources are the pages named
in each calc header, not live fetches. Reverb was skipped because it has no
single headline fee. Whether any of this earns citations is unmeasured until
the visit counter (P046) is deployed.
