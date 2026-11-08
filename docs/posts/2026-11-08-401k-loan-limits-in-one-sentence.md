---
title: "How much can you borrow from your 401(k)? The answer now leads the page"
date: 2026-11-08
tags: [seo, aeo, retirement, tools]
description: "The 401(k) loan vs withdrawal calculator now opens with the statutory loan limit, its source and an as-of date, and a test ties the figures to the calculator."
---

People ask an assistant "how much can I borrow from my 401(k)?" and the page that answers should say so first. The 401(k) loan vs withdrawal calculator now opens with one sentence: a plan that allows loans may lend the greater of $10,000 or half the vested balance, capped at $50,000, repayable within five years unless the money buys a main home. It names IRC section 72(p)(2) and the IRS loan FAQ, and carries an as-of date.

The two dollar figures are checked by `platform/pages/answer-lead.test.mjs` against the `LOAN_FLOOR` and `LOAN_CAP` the calculator itself uses, so the page and the tool cannot drift apart. These limits are statutory and not inflation-indexed. We did not re-fetch the IRS page in this run; the as-of date is the date the sentence was written against the statute. Your own plan may set lower limits or allow no loans.
