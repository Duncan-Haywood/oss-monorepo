---
title: "A Dutch VAT number with a space in it: what our e-invoice checker let through"
seo_title: "Dutch VAT number format in Peppol: the R056-2 warning"
date: 2026-11-17
tags: [einvoice-preflight, ventures]
description: "Peppol warns on NL 123456782 B01. Our checker passed it, and never read the tax representative's VAT number. We measured both gaps against Peppol's own rule."
---

[E-invoice Preflight](https://marisstella.app/einvoice-preflight/) checks an invoice before it goes onto the Peppol network or to a tax authority. One of its oldest checks reads VAT numbers: does the number have the right shape for its country, and does the check digit add up? This run looked at one country, the Netherlands, and one Peppol rule, and found two gaps.

## The rule

OpenPeppol's BIS Billing 3.0 rules include `PEPPOL-COMMON-R056-2`. It reads every VAT number on the invoice that starts with `NL` and asks for one exact form: `NL`, nine digits, `B`, two digits. `NL123456782B01` passes. `NL 123456782 B01` does not, even though it is the same number. Peppol only *warns* on it: the invoice still goes through, but the warning comes back in the validation report, and it is the kind of thing a sender would rather fix before sending than explain afterwards.

## Gap one: we were too forgiving

Our VAT check first tidied the number. It took out spaces, dots and hyphens and made everything upper case, then checked the shape and the check digit. That is a sensible way to ask "is this a real Dutch VAT number?" It is the wrong way to ask "will Peppol warn about how it is written?" So a valid number written with a space, a dot or a small `b` went through our check with nothing to say, and Peppol warned at the network.

A note in our own backlog said the seller's and buyer's numbers "already fail" on this shape. They didn't. We had not measured it.

## Gap two: one VAT number was never read

Some sellers invoice through a tax representative, usually because they are based outside the country. EN 16931, the European e-invoice standard, gives that representative a VAT number of its own (field BT-63) and requires one. Our readers kept the representative's other identifiers but dropped the VAT number. A mistyped one passed every built-in check.

## How we measured it

We did not guess at the rule. We ran Peppol's own rule, taken from its published rule files, on the same XML our checker reads. A script makes valid Dutch VAT numbers, using both the older elfproef check and the mod 97 check sole traders have used since 2020. It writes them out correctly and in eighteen wrong ways: a digit changed, two digits swapped, a space or dot or hyphen inside, a small `b`, and so on. Each one goes into the seller's, buyer's or tax representative's VAT field of a UBL or CII invoice.

Before the change, on one run of 4,864 files:

- Peppol warned on 3,654 of them.
- Our checker said nothing on **2,823** of those.
- 1,610 of the misses were on the seller or buyer, where we thought we were covered. The other 1,213 were every warning on the tax representative.

After the change, on 4,622 and 4,627 files from two different seeds: **0 disagreements**. Where Peppol warns, we now say something too. Where Peppol is quiet, so are we. The one difference is on purpose: a number that has Peppol's shape but fails the Dutch check digit is a typo, and we still stop on it.

## What changed

- Both readers now keep the tax representative's VAT number, and it gets the same shape and check-digit tests as the seller's.
- A new warning, INV-064, flags a valid Dutch VAT number written with spaces, dots, hyphens or a small `b`, and says how to write it.
- The command-line version reads the same field and runs the same blocking checks.

Still open: a no-break space at the very end of the number (our readers trim it; Peppol keeps it), and VAT numbers on a payee or delivery party, which EN 16931 doesn't define but Peppol's rule still reads. The full numbers are in the [evaluation notes](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/einvoice-preflight/eval/nl-vat-r056-2-differential-2026-11-17.md).

E-invoice Preflight is free and runs in your browser; your invoice never leaves your machine. It is a preflight, not legal or tax advice, and it does not look a number up in any register.
