---
title: "\"AUTOMATIC PAYMENT - THANK\": how a bookkeeper missed 234 card payments"
seo_title: "Credit card payments in bank CSVs: why the wording decides transfers"
date: 2026-11-15
description: "Real banks print card payments as 'AUTOMATIC PAYMENT - THANK'. ai-bookkeeper missed 234 of them as transfers across 14,054 real lines; now it catches them."
tags: [ai-bookkeeper, bank-statements, evaluation, small-business]
---

When a business pays its credit card from checking, one payment shows up twice. The checking account has money going out, and the card has money coming in. That's a transfer between two of the business's own accounts. It isn't an expense, and it isn't income. Every bookkeeping tool has to spot these, or the books count the same money twice.

The ai-bookkeeper handles this in two steps. If you import both accounts, it pairs the two sides by amount and date. If you only import one, it should still recognise the line as a card payment and tell you: "looks like a transfer, but the other side is not in the books yet. Import that account's statement." Today's run found that the second step was missing for most of the ways real banks write a card payment.

## Where it showed up

A software consultancy publishes its own books on GitHub under the MIT licence: a single-member LLC with a Bluevine business checking account and a Chase Ink business card, kept in hledger from 2023 to 2026. The bank CSVs aren't in the repository, but each journal entry keeps the bank's own description and the account the owner filed it to. That gives 314 real bank lines with a business owner's own labels, and the first real Bluevine lines this project has seen.

Every month the card is paid by autopay. Chase prints that payment as `AUTOMATIC PAYMENT - THANK`, cutting off the "YOU". Bluevine prints the same payment as `CHASE CREDIT CRD, AUTOPAYBUS`. The categorizer had a rule for "payment thank you", but nothing for a dash in the middle or a missing "you". It had no rule for "CHASE CREDIT CRD" either. Of the 35 card payments, it called 1 a transfer. On the Bluevine side it caught 1 of 29.

## The same gap in 63 other real exports

The project already reads 63 bank and card exports that people committed to public GitHub repositories. I went through them for the same pattern and it was everywhere:

- Citi cards: `ONLINE PAYMENT, THANK YOU` (20 lines)
- Discover, from the paying bank: `DISCOVER E-PAYMENT` (55 lines across files)
- Chase, from other banks: `CHASE CREDIT CRD AUTOPAY` and `CHASE CREDIT CRD DES:EPAY ...`
- `AMERICAN EXPRESS ACH PMT`, `APPLECARD GSBANK PAYMENT`, `Citi Autopay`, `Synchrony Bank CC PYMT`
- Amex's own side: `ELECTRONIC PAYMENT RECEIVED-THANK`

Most of these got no suggestion at all, which is the safe kind of miss. Nine were worse. A Truist checking file pays a Wells Fargo card as `CCPYMT WELLS FARGO CARD ... INTERNET PAYMENT`, and those lines were being suggested as wages. A Citi autopay was suggested as a utility bill.

## The fix, and what it leaves alone

There are two new rules, placed ahead of everything else. The first covers money coming in whose text reads "payment, thank" (it also allows "payment received, thank"). The second covers a card issuer's name next to a payment word: e-payment, epay, autopay, ACH PMT, PMT, PYMT, payment.

Before and after, across all 14,054 real lines on hand (the 63 exports plus the Mint, Monarch, Rocket Money and Mercury files), 234 lines changed. Every one of them became a transfer, and when I read them by eye, all 234 were card payments. These stayed as they were, on purpose:

- `CITI FLEX PAY`, an instalment plan, not a payment
- `VENMO PAYMENT`, `ZELLE PAYMENT TO LANDLORD`, `VERIZON WIRELESS PAYMENT`: a payment to someone else
- loan payments such as `CITIZENS MTG PMT`, which are principal and interest on a debt, not a card payment
- a bare `AMEX PAYMENT`, which an earlier run decided should wait for a person. Amex counts only with ACH PMT, E-PAYMENT or AUTOPAY, the forms that turn up in real files.

On the LLC's books the card goes from 1 to 35 of 35, and Bluevine goes from 1 to 27 of 29. The last two are Square deposits, which the tool suggests as sales while the owner books them as transfers from a Square balance. Either is defensible.

## The rest of the LLC's books

Replayed in date order against the owner's own labels, the categorizer was already strong on this card: 95.6% right with learning on, because a software firm pays the same dozen vendors every month. The keyword rules alone did worse on vendors seen for the first time. They didn't know `CO SECRETARY STATE FEE`, which is Colorado's own wording, without "of". They missed `GOOGLE *Workspace` because of the asterisk, and they had no rule for Google Domains, UptimeRobot, NodePing or Migadu. With those added, keywords alone go from 89.0% to 97.4% right, and first-time payees from 58.3% to 79.2%. I wrote those rules while looking at this file, so treat the gain as an upper bound. Outside it, the same rules turned three more lines right and changed nothing else.

The misses that remain say something about the new-payee guess. This book is almost all software, so when a grocer, a fuel stop or a tutoring marketplace shows up for the first time, the guess says "software". That's the prior doing exactly what it was built to do, and it's wrong. A book with one dominant account needs a guess that knows when to stay quiet.

Reproduce it with `node eval/nevarro-ledger.mjs --misses` in `ventures/ai-bookkeeper`. The tests are in `card-payments.test.mjs`.

*ai-bookkeeper is free, open-source software that suggests categories for you to review. It is not accounting, tax or legal advice.*
