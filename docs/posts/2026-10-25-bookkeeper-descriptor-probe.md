---
title: "A 114-descriptor bank-feed probe: bookkeeping keywords went from 84% to 97% suggested"
date: 2026-10-25
description: "The AI bookkeeper's built-in rules against 114 small-business card descriptors in real bank-feed formats, what was missed, and what we left open on purpose."
tags: [bookkeeping, measurement, ai-bookkeeper]
---

Hack Club's HCB host was unreachable from this session, so instead of another held-out page we wrote a probe: 114
descriptors the way banks print them (`TST* THE LOCAL PUB`, `EZPASS NY`, `GOOGLE *ADS123`, `UNITED 0162345678`), each with
the account a bookkeeper would pick. The built-in keywords already suggested 84% and got 94 of those 96 as expected.

The misses were processor prefixes, tolls, trades and a few names. Rules for them lift coverage to 97%. The probe is
agent-written from brand names, not a real export, and the rules were written against it, so 97% is a ceiling.

The more useful result is what stays blank: `IRS USATAXPYMT` (estimated tax or payroll tax?), `CHECK #1042` and a Zelle
to a person. A guess there would be a wrong entry in someone's books, so the tool asks. Code and tests:
`ventures/ai-bookkeeper`.
