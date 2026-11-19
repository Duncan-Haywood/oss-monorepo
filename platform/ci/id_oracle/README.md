# Identifier oracle

A cross-venture differential test. Fourteen ventures each carry their own
checker for a standard identifier (IBAN, BIC, SEPA creditor identifier,
GTIN/UPC/EAN, ISBN-10 and -13, US ABA routing number). This sweep draws
labelled cases with [python-stdnum](https://github.com/arthurdejong/python-stdnum)
2.2 as the oracle and feeds every case to every checker of that kind.

```
python3 -m pip install python-stdnum==2.2      # test-time only, never vendored (LGPL-2.1+)
python3 platform/ci/id_oracle/gen_cases.py --seed 7 --per 200 > cases.jsonl
node platform/ci/id_oracle/run.mjs cases.jsonl [--json report.json] [--fail-on-reject]
```

Cases per seed (`--per 200`): about 116,000. For each of the 89 countries in
the SWIFT IBAN Registry (release 101, stdnum's copy): valid IBANs drawn to the
country's BBAN structure, a one-character typo, an adjacent swap, one character
added or dropped with the check digits recomputed (only a length check can
catch those), and check-digit aliases. GTIN-8/12/13/14 valid, typo and swap,
plus wrong lengths; ISBN-13 with 978/979 and other prefixes; ISBN-10; routing
numbers; BICs with real and made-up country codes; creditor identifiers with
the business code changed (it is outside the check).

`run.mjs` scores each checker as **false-reject** (stdnum accepts, the venture
rejects, inside the countries the venture's table claims), **false-accept**,
and **out-of-scope** (a valid IBAN from a country a SEPA-only tool does not
carry, listed, not scored). Two of stdnum's verdicts are overridden: an IBAN
with letters in the check-digit place is invalid (stdnum's mod 97 takes them),
and check digits 00, 01 and 99, which leave remainder 1 like 97, 98 and 02 but
which the algorithm never produces, are tallied apart and not scored, because
the ISO 13616 text on them was not read.

`registry_table.py` regenerates `ventures/iban-list-check/iban-registry.mjs`
(BBAN structure per country) from the same registry copy.

## Results, 2026-11-19 (seeds 7 and 11)

Before the fixes in the same PR (seed 7):

| Venture | Kind | Disagreements |
|---|---|---|
| sepa-pain001-validator | IBAN | 4,800 false accepts: BI, DJ, FK, HN, LY, MN, NI, OM, RU, SD, SO, YE (registry release 101) were missing from its table, so a character added or dropped drew only a warning |
| sepa-pain001-validator | BIC | 75 false warnings, same twelve countries |
| csv-to-sepa-pain001, csv-to-sepa-pain008 | BIC | 1,000 of 1,000 BICs with a made-up country (XX, QQ, ZZ, AA) accepted |
| eu-bank-statement-reader, camt053-to-ofx-converter | IBAN | valid IBANs from 53 non-SEPA registry countries warned "country code not in the list" (a statement can be for any IBAN country) |
| sepa-payment-file-validator | IBAN | Gibraltar (GI) rejected; its sibling tools carry it |
| iban-list-check | IBAN | 10 false accepts: a letter swapped with a neighbouring digit kept the mod-97 remainder at 1 in countries without a BBAN shape, and the code comment claimed mod 97 "catches every adjacent transposition" |

After: **0 false rejects in every checker on both seeds**, iban-list-check
89,005 of 89,005 agree. All GTIN (8 checkers x 13,500 cases), ISBN-10,
ISBN-13, routing-number and creditor-id checkers agreed with stdnum before
any change.

Left as they are:

- Letter-digit swaps that pass mod 97 still pass the checkers without a BBAN
  structure check (6 to 16 per 17,800 drawn swaps per checker). Low rate, and
  in the statement readers the result is a warning, not a payment.
- Check digits 00/01/99: iban-list-check rejects them, the other seven IBAN
  checkers accept them (217 to 574 per seed). Which is right needs ISO 13616's
  text.
- SEPA membership. sepa-payment-file-validator and the csv-to-sepa tools
  reject (and sepa-pain001-validator warns on) AL, MD, ME, MK and RS IBANs.
  The EPC's list (EPC409-09 v8.0, 24 December 2025) has 27 EU, 3 EEA and 11
  non-EEA countries, and secondary sources name Albania, Moldova, Montenegro
  and North Macedonia among the 11; the EPC PDF returned 403 here, so the sets
  were not changed.
