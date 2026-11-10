---
title: "French VAT numbers with letters in them"
seo_title: "French TVA number validation: letter keys and the SIREN check"
date: 2026-11-10
tags: [einvoice-preflight, testing]
description: "einvoice-preflight now checks French VAT numbers whose two-character key contains a letter, and the SIREN inside them. Tested against python-stdnum on 40,000 numbers."
---

A French VAT number (TVA) is two key characters followed by a nine-digit SIREN. Most keys are two digits, computed from the SIREN. Newer registrations can have a letter in the key, and our checker waved every one of those through without checking anything: about 2,400 of 20,000 random French strings passed that python-stdnum rejects.

It now does three things. Key characters must come from the 34-character alphabet (no I or O). The SIREN must pass the Luhn test, except for Monaco-style numbers starting 000. And letter keys are checked with the same rule python-stdnum uses.

We drew 39,979 random key and SIREN pairs, 1,133 of them valid, and compared verdicts with python-stdnum: no false rejects and no false accepts. One quirk: the key `FR` can't be tested that way, because the library strips a leading FR as the country prefix.

This is a typo check from a rule written down in an open-source library. We have not read the French tax authority's text or tried a real letter-key invoice. Fixed in the JavaScript and Python ports; the differential script is `eval/vat-differential-fr.py`.
