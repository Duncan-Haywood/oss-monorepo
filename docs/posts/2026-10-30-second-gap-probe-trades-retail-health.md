---
title: "A second gap probe: 139 more bank lines, 13 rule gaps closed"
seo_title: "Bank-line categorizer gap probe 2: trades, restaurants, e-commerce, clinics"
date: 2026-10-30
tags: [ai-bookkeeper, evaluation]
description: "139 everyday descriptions from trades, restaurants, online shops and clinics: 23 got no suggestion; 13 were real gaps, now covered, 10 are blank on purpose."
---

After [the first probe](2026-10-30-probing-a-categorizer-for-gaps.md) we ran the [AI bookkeeper](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/)'s offline keyword layer over 139 new descriptions from trades, restaurants, online shops and clinics. Twenty-three got no suggestion.

Thirteen were real gaps: Toast, Salesforce, Zendesk, Squarespace's `SQSP`, Mindbody, Acuity, Square Appointments, LinkedIn Premium and Printify (software), Indeed (job ads, advertising), Etsy listing fees and "bank service fee" (fees), and AT&T bills (phone). Rules now cover them; one existing test caught a first draft that took LinkedIn Sales Navigator away from advertising, and it was fixed.

The other ten stay blank on purpose: Walmart, Target, Netflix, a gym, pharmacies, a copay and a lab bill could be personal or business, so the tool asks instead of guessing. A bare `ADP` is payroll, a tax or a fee depending on the line.

Caveat: the descriptions are made up from public company names, not a real export. This finds gaps, not accuracy; the two real labelled sets are scored in the README.
