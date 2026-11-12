---
title: "UCR fee calculator now defaults to the 2027 schedule"
seo_title: "UCR fee 2027: brackets and amounts in the UCR fee calculator"
date: 2026-11-03
tags: [ucr, trucking, open-source, seo]
description: "Corrected 2026-11-12: the 2027 UCR fees are $55 to $54,165 by fleet size (91 FR 56063), not the 2026 amounts this post first listed."
---

**Correction, 2026-11-12.** The amounts in this post are wrong. They are the 2025 and 2026 fees, not the 2027 fees. FMCSA's final rule (91 FR 56063, FR Doc 2026-17893, published 2026-09-01, effective 2026-10-01) set the 2027-and-later fees at $55, $167, $333, $1,163, $5,548 and $54,165, about 20% higher. The "$4,588 and $44,797" previous top brackets did not match any schedule we could find. The calculator now defaults to the 2027 table, and freight forwarders now pay by vehicle count, as 49 CFR 367.50 says, rather than the lowest bracket. The [quality audit round 52](2026-11-12-quality-audit-round-52.md) found both errors. The original text is kept below.

2027 UCR registration opened on October 1, 2026, and the UCR Plan site lists the approved 2027 fees. Our UCR fee calculator still defaulted to the 2025 table, so anyone filing now would have seen two stale top brackets.

Checked on plan.ucr.gov on 2026-11-03, carrier and forwarder fees per entity are $46 (0-2 vehicles), $138 (3-5), $276 (6-20), $963 (21-100), $4,592 (101-1,000) and $44,836 (1,001 or more). The first four match the old default; the last two moved from $4,588 and $44,797.

The calculator, its README and its tests now use the 2027 table. The table is still an editable input, and the page still says to verify at ucr.gov for the year you file. Code: `ventures/ucr-fee-calculator/`. This is an estimate, not filing or legal advice.
