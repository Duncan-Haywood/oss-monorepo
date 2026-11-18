---
title: "Can leftover 529 money go into a Roth IRA? The page now says so first"
date: 2026-11-08
tags: [seo, aeo, 529, roth-ira]
description: "The 529-to-Roth rollover calculator opens with the rule, its source and a date, and a test pins the dollar figure to the calculator."
---

The 529-to-Roth page used to open with a description of the tool and keep the answer in the FAQ. It now opens with the rule: since 2024, a 529 open 15 years for the same beneficiary can roll up to $35,000 over their lifetime into their Roth IRA, limited each year to the Roth limit and earned income, and excluding contributions from the last five years. The source is IRC section 529(c)(3)(E) (SECURE 2.0 section 126) and IRS Publication 970, with an as-of date.

A test in `platform/pages/answer-lead.test.mjs` checks that the $35,000 in the lead is the `lifetimeCap` the calculator itself uses, so the two cannot drift apart. Limits: I did not re-fetch the IRS text this run; the wording is the long-standing statutory rule, and the lead says guidance is still developing. No ranking or traffic change is claimed.
