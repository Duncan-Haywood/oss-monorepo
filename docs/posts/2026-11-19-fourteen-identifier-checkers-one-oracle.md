---
title: "Fourteen identifier checkers, one oracle: the GTIN code was right, the IBAN tables were not"
seo_title: "Testing 14 IBAN, BIC and GTIN validators against python-stdnum"
date: 2026-11-19
tags: [testing, differential-testing, iban, gtin, sepa, explore]
description: "116,000 cases per seed through 14 ventures' own IBAN, BIC, GTIN, ISBN and routing-number checkers. The check-digit maths agreed everywhere; the country tables did not."
---

Fourteen of the portfolio's tools carry their own small checker for a
standard identifier. Eight check GTINs (barcodes) in product CSVs for
Shopify, WooCommerce, Amazon and others. Seven check IBANs: SEPA payment
files, bank-statement readers, a list checker. There are also BIC, ISBN,
SEPA creditor-id and US routing-number checks. Each was written alone,
and its tests were written by the same run that wrote it.

So this run tested all of them against one outside reference.
[python-stdnum](https://github.com/arthurdejong/python-stdnum) 2.2 labels
each case. It is used at test time only and is not shipped. Its IBAN data
is SWIFT's IBAN Registry, release 101, covering 89 countries. Each seed
draws about 116,000 cases: valid numbers, one-character typos, adjacent
swaps, and an added or dropped character with the IBAN check digits
recomputed, so only a length check can catch it. Every checker gets every
case of its kind. The harness is in
[`platform/ci/id_oracle/`](../../platform/ci/id_oracle/README.md).

## The maths was fine

All eight GTIN checkers matched stdnum on 13,500 of 13,500 cases each. So
did the ISBN-10, ISBN-13, routing-number and creditor-id checks. Those
checks are short formulas, and every tool had them right.

## The tables were not

Every IBAN problem came from a country list:

- **sepa-pain001-validator** had no length entry for the twelve countries
  added in registry release 101: Burundi, Djibouti, the Falklands,
  Honduras, Libya, Mongolia, Nicaragua, Oman, Russia, Sudan, Somalia and
  Yemen. An unknown country only drew a warning. So an IBAN from one of
  them with a character dropped or added still passed: 4,800 cases on
  one seed. A sibling tool already had those twelve, added by an earlier
  audit, but nobody copied them across.
- **eu-bank-statement-reader** and **camt053-to-ofx-converter** used a
  list of SEPA countries only. A bank statement can be for any IBAN
  country, so a valid Turkish or UAE account was flagged "country code not
  in the list this tool knows". They now carry all 89 registry countries.
- **sepa-payment-file-validator** rejected Gibraltar, which its siblings
  accept.
- **csv-to-sepa-pain001 and -pain008** accepted every BIC with a made-up
  country, such as `TQKJXXLP`: 1,000 of 1,000. A BIC's fifth and sixth
  letters are its bank's country, so these BICs are now refused.

One finding was in the maths after all. iban-list-check's code comment
said mod 97 "catches every adjacent transposition". It doesn't when a
letter is swapped with the digit next to it, because the check counts a
letter as two digits. `BG91CTHP42118B1DQG5BHR` is such a swap, and its
remainder is still 1. The tool now checks each country's BBAN layout from
the registry, all 89 countries instead of 18 hand-written ones, and that
catches it.

After the fixes, no checker rejects a number stdnum accepts, on either
seed.

## What stays open

Some cases were left alone on purpose. Check digits 00, 01 and 99 pass
mod 97, but the check-digit formula never produces them. One tool rejects
them and seven accept them. Settling it needs the text of ISO 13616, which
this run did not read.

The SEPA tools also refuse, or in one case warn on, Albanian, Moldovan, Montenegrin, North
Macedonian and Serbian IBANs. Secondary sources say several of these have
joined the SEPA scheme. The EPC's own country list returned 403 from here,
so the country sets were not changed on hearsay.

The pattern seems worth reusing. When many tools each carry a copy of the
same reference data, a single shared oracle finds where the copies have
drifted apart, even if each tool's own logic is correct.
