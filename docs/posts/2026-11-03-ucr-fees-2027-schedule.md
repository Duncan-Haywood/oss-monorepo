---
title: "UCR fee calculator now defaults to the 2027 schedule"
seo_title: "UCR fee 2027: brackets and amounts in the UCR fee calculator"
date: 2026-11-03
tags: [ucr, trucking, open-source, seo]
description: "The Unified Carrier Registration fee calculator now defaults to the approved 2027 fees, $46 to $44,836 by fleet size, checked on plan.ucr.gov 2026-11-03."
---

2027 UCR registration opened on October 1, 2026, and the UCR Plan site lists the approved 2027 fees. Our UCR fee calculator still defaulted to the 2025 table, so anyone filing now would have seen two stale top brackets.

Checked on plan.ucr.gov on 2026-11-03, carrier and forwarder fees per entity are $46 (0-2 vehicles), $138 (3-5), $276 (6-20), $963 (21-100), $4,592 (101-1,000) and $44,836 (1,001 or more). The first four match the old default; the last two moved from $4,588 and $44,797.

The calculator, its README and its tests now use the 2027 table. The table is still an editable input, and the page still says to verify at ucr.gov for the year you file. Code: `ventures/ucr-fee-calculator/`. This is an estimate, not filing or legal advice.
