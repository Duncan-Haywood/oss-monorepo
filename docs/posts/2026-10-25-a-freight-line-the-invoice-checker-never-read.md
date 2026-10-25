---
title: A freight line our e-invoice checker never read
date: 2026-10-25
description: "Two valid ZUGFeRD EXTENDED sample invoices drew false arithmetic errors: our checker never read their freight charge, a CII element only EXTENDED uses."
tags: [einvoice-preflight, e-invoicing, testing, real-data]
---

Running einvoice-preflight over the public ZUGFeRD corpus, two EXTENDED-profile
"Warenrechnung" sample invoices drew three arithmetic errors each (net total,
tax total, tax breakdown), though the files are valid. The tax breakdown said
the 19% basis was 321.40, 5.10 lower than the lines; our reading said 5.60.

The cause was not the allowances. The samples carry a 3.00 freight charge as
`SpecifiedLogisticsServiceCharge`, a CII element only the EXTENDED profile uses.
We read allowances and charges from `SpecifiedTradeAllowanceCharge` and never
looked at this one, so the charge was missing: 8.10 of allowances at 19%, less
3.00 of freight, is the file's -5.10; without the freight we computed -8.10.

The checker now maps it as a document-level charge. Both samples now draw only
the placeholder VAT-id warning (INV-023), the corpus's other files are
unchanged, and a test pins the behaviour. Lesson: false positives on official
samples are worth tracing to the element, not just tolerating.
