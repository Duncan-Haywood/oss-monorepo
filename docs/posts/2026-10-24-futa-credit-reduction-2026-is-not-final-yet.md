---
title: "California's 2026 FUTA credit reduction isn't final until November 10"
date: 2026-10-24
description: "Why our bookkeeper warns about a potential 2026 FUTA credit reduction instead of applying it."
tags: [payroll, futa, bookkeeping, ai-bookkeeper]
---

# California's 2026 FUTA credit reduction isn't final until November 10

Employers get a 5.4% credit against the 6.0% federal unemployment (FUTA) tax. A state that still owes the federal government unemployment loans loses part of that credit, and its employers owe extra on Form 940.

For 2026 the Department of Labor's list of potential reductions names California (1.5% base, and up to 3.8% more as a benefit-cost-rate add-on unless waived). The U.S. Virgin Islands paid off its loans in June 2026, so it should drop off. A state that repays by November 10 also drops off. Nothing is final until then.

So the open-source [ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) `form940 --state CA` for 2026 now says "potential, not final" and never applies a rate on its own. Pass the rate once the DOL confirms it. The 2025 rate for California (1.2%) is still built in.

Caveat: this comes from search excerpts of payroll.org and Bloomberg Tax, because the DOL page was unreachable from our sandbox. Check your own notice. Not tax advice.
