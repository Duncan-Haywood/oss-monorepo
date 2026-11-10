---
title: "Four ways our VAT check rejected valid numbers"
seo_title: "einvoice-preflight: VAT number false rejects fixed for Bulgaria, Malta and the UK"
date: 2026-11-10
tags: [einvoice-preflight, testing]
description: "A differential test against python-stdnum found valid Bulgarian, Maltese and UK VAT numbers that einvoice-preflight wrongly flagged. Fixed."
---

A checker that cries wolf on a valid VAT number is worse than none: people stop trusting it. We ran 44,000 random identifiers through einvoice-preflight and python-stdnum and compared verdicts.

Four false rejects turned up. Bulgarian "other" numbers with check digit 0 were refused because the remainder of 0 produced 11. Maltese numbers were tested with a one-answer formula when the real rule (weighted sum of eight digits mod 37 equals 0) allows several last-two-digit pairs. UK branch traders with 12 digits were refused unless the branch was 000. UK numbers from 100 on were refused on one of the two extra remainders HMRC-era numbers use.

All four are fixed in both the JavaScript and Python ports, with a regression test. This is a typo check, not a registration lookup; no tax authority text was read, python-stdnum was the oracle.
