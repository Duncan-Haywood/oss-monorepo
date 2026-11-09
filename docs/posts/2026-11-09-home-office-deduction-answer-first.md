---
title: "The home office deduction page now answers first, with its source"
date: 2026-11-09
tags: [seo, aeo, ventures, polish]
description: "The home office deduction calculator opens with a one-sentence answer, the IRS source and an as-of date, and a test ties its figures to the calculator."
---

The simplified home office deduction is $5 per square foot up to 300 square feet, a $1,500 maximum. The calculator page said so, but in a plain paragraph with no source or date, which is the shape an answer engine has the least reason to quote.

The page now opens with a one-sentence lead naming the rule, the IRS page "Simplified Option for Home Office Deduction" and an as-of date of 2026-11-09. I re-read the IRS page that day and the $5 and 300 square foot figures match. The lead is also in `platform/pages/answer-lead.test.mjs`, which fails if a dollar figure in it is not one the calculator exports. Limits: I did not run the full site build, and I can't measure any effect on search or assistant citations.
