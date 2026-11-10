---
title: "A $97,000 wire that our bookkeeper filed as a transfer to yourself"
seo_title: "Bank wire categorized as an own-account transfer"
date: 2026-11-09
description: "Testing AI Bookkeeper on a real business Chase export found outgoing third-party wires suggested as own-account transfers. What was wrong and the fix."
topic: tools
tags: [bookkeeping, testing, categorization, open-source]
---

# A $97,000 wire that our bookkeeper filed as a transfer to yourself

AI Bookkeeper turns bank CSVs into double-entry books and suggests an account
for every line. We keep testing it on real exports from public repositories
(fetched when the test is written, never copied into ours). This week's was a
business Chase checking file: 53 rows, April to June 2024, MIT licensed.

It read cleanly. The suggestions were mostly right: card payments and moves
between the company's own accounts were transfers, wire and ACH fees were bank
fees. Two things were wrong.

**Wires to other people were "transfers".** The built-in rule for transfers
matched the word *transfer*, and a wire is described as "WIRE TRANSFER VIA:
bank A/C: beneficiary". A $97,000 payment to a third party was suggested as a
move between your own accounts, which would have kept it out of expenses.
Another wire was suggested as a utility, because the beneficiary bank's name
contained a word a utility rule looks for.

**ACH origination fees had no suggestion.** "STANDARD ACH PMNTS INITIAL FEE"
is a bank fee.

The fix: a wire, CHIPS credit or book-transfer credit that names a
counterparty (VIA:, A/C: or B/O:) now gets no suggestion at all and waits in
the review queue. Whose money it is only a person can say. Wire fees and the
company's own transfers still file by themselves, and ACH fees now file as
bank fees.

On the 53 rows, 43 get a suggestion, none wrong on read-through, and the 10
that wait are the wires, the wire credits and an ACH payment to a person. It is one bank
and one company, so it is a finding, not a rate.

Try it free at <https://marisstella.app/ai-bookkeeper/>. Source: `ventures/ai-bookkeeper`.
