---
title: "Five more VAT number rules our checker was missing"
seo_title: "VAT number validation: BE, IT, RO, CZ and LV prefix rules"
date: 2026-11-10
tags: [einvoice-preflight, testing]
description: "Random numbers vs python-stdnum found Belgian, Italian, Romanian, Czech and Latvian VAT numbers our checker wrongly passed. Fixed."
---

After the letters bug, the reverse test still showed five countries where we passed numbers python-stdnum rejects. Each was a rule about how a number starts, not its check digit:

- **Belgium:** a 10-digit number must start with 0 or 1.
- **Italy:** digits 8 to 10 are an office code: 001 to 100, 120, 121, 888 or 999. The first seven digits cannot all be zero.
- **Romania:** no leading zero.
- **Czech Republic:** a 9-digit birth-number VAT ID needs a real date and cannot be from after 1953, when 9-digit numbers stopped.
- **Latvia:** we only checked company numbers. Numbers starting 0 to 3 are people: a real ddmmyy date and a century digit, or the newer `32` codes, plus a check digit.

Over 20,000 random strings per country, all five now pass none of stdnum's rejects, and the forward run still finds no new false rejects. The JavaScript and Python ports both changed, with regression tests. Left open: French letter keys and a few Turkish cases. stdnum is the oracle here; no tax authority text was read, and this is a typo check, not a registration lookup.
