---
title: "What your SAFE is worth if the company sells before the next round"
seo_title: "SAFE payout if the startup is acquired before a priced round"
date: 2026-11-02
tags: [startups, safe, cap-table, exit-waterfall]
description: "A post-money SAFE gets the greater of its money back or its cap percentage of the sale. The free exit waterfall now models SAFEs and notes."
---

Most exit-waterfall tools assume every investor holds preferred stock. A lot of early companies are sold while their money is still in SAFEs or convertible notes, and then the question "what do I actually get?" has no tidy answer in a spreadsheet template. The free [startup exit waterfall calculator](../../ventures/startup-exit-waterfall-calculator/) now handles both.

## The rule it applies

In a sale before a priced round, each instrument is paid the greater of two things: its money back, or the shares it would convert into at its cap.

**Post-money SAFE.** The cap is a valuation of the company that already includes every SAFE. A $1M SAFE at a $10M post-money cap therefore converts into 10% of the company, itself included. With F other shares outstanding and SAFEs owning a combined fraction f, a SAFE of amount a at cap c holds `(a/c) * F / (1 - f)` shares. For 1,000,000 founder shares that is 111,111 shares, and 111,111 / 1,111,111 is exactly 10%.

- Sale at $20M: 10% is $2M, more than the $1M back, so it converts and takes $2M.
- Sale at $5M: 10% is $0.5M, less than the $1M back, so it takes its $1M and the founders get $4M.

**Convertible note.** Principal plus simple interest is the claim ($500k at 8% for two years is $580k). A pre-money cap sets a price of cap divided by shares outstanding before the notes, so a $5M cap on 1,000,000 shares is $5.00 a share and the note converts into 116,000 shares.

## What it leaves out, said plainly

Discounts and most-favoured-nation clauses are not modelled, because a sale has no round price to discount from. A SAFE with no cap gets its money back only. Seniority is whatever you type (the standard SAFE is pari passu with preferred). Read the actual instrument; the documents control, and this is arithmetic on the terms you enter, not legal or financial advice. It has been checked against hand calculations in the test suite, not against a real company's SAFE.

## Why this matters

Payouts add up to net proceeds at every sale price in the tests, with SAFEs, notes and several preferred series together. Nothing is uploaded; it runs in the browser.
