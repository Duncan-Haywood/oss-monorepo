# Hungary NAV Online Számla 3.0: the schema gate against xmllint (2026-11-15)

What NAV does: a report that breaks `invoiceData.xsd` comes back from
`queryTransactionStatus` as a technical validation message `SCHEMA_VIOLATION`
(ERROR) and the invoice is ABORTED before any business rule (interface
specification 3.0, 2026.02.12 edition: manageInvoice note 5, "must conform to the
invoiceData.xsd schema"; the error table lists SCHEMA_VIOLATION as ERROR).

## Sources

- `invoiceData.xsd`, `invoiceBase.xsd`: nav-gov-hu/Online-Invoice, cloned `--depth 1`
  on 2026-11-15 (HEAD cc7a775d6dce), MIT, (c) 2019 NAV.
- `common.xsd` (NTCA common 1.0, "v1.0 2020/11/23"): not in NAV's repository. Three
  public mirrors found with GitHub code search, all identical after CRLF to LF:
  B-D-S-C-Kft/navservice `v3.0/original/common.xsd` (commit c59a61f3e12d),
  robser77/e_invoice_check `.../OSA_Schemas_v3/common.xsd`, pzs/nav-online-invoice
  `src/NavOnlineInvoice/xsd/common.xsd`. SHA-256 (LF):
  0860ed0475c9c8c35bc31206c5ed2128542236d32b640f0000a80523ff557005.
  `build-hu-schema.mjs` refuses any other file.

The three files use no construct the builder does not model (no any, group, all,
list, union or ref; `<xs:` tags present: sequence, choice, complexContent and
simpleContent extension, attribute, and the facets length, min/maxLength, pattern,
enumeration, totalDigits, fractionDigits, minInclusive, maxInclusive, minExclusive).
All three set `elementFormDefault="qualified"`, so every element carries the
namespace of the file that declares it; `hu-xsd.mjs` checks that (HU-032).

## The reference

xmllint (libxml2) on the three files, with `schemaLocation` added to the two
`xs:import`s in a temporary copy (NAV's files import by namespace only).

## Results

```
node eval/hu-xsd-diff.mjs <xsd dir> "<clone>/sample/Data sample" --seed 1 --per 52
node eval/hu-xsd-diff.mjs <xsd dir> "<clone>/sample/Data sample" --seed 7 --per 130
```

NAV's 30 InvoiceData samples: xmllint "validates" on 30, hu-xsd.mjs no finding on 30.

Seed 7 (final code):

```
30 seeds; 3973 mutants; agree 3973 (100.0%)
┌────────────┬─────┬───────┬────────────────┬────────┬───────────────┐
│ (index)    │ n   │ agree │ xmllintRejects │ weMiss │ weFlagWrongly │
├────────────┼─────┼───────┼────────────────┼────────┼───────────────┤
│ delete     │ 330 │ 330   │ 239            │ 0      │ 0             │
│ duplicate  │ 330 │ 330   │ 330            │ 0      │ 0             │
│ unknown    │ 330 │ 330   │ 330            │ 0      │ 0             │
│ swap       │ 330 │ 330   │ 330            │ 0      │ 0             │
│ empty      │ 330 │ 330   │ 329            │ 0      │ 0             │
│ long       │ 330 │ 330   │ 330            │ 0      │ 0             │
│ euro       │ 330 │ 330   │ 260            │ 0      │ 0             │
│ text       │ 330 │ 330   │ 274            │ 0      │ 0             │
│ negative   │ 330 │ 330   │ 159            │ 0      │ 0             │
│ bool       │ 330 │ 330   │ 60             │ 0      │ 0             │
│ dropprefix │ 330 │ 330   │ 330            │ 0      │ 0             │
│ addprefix  │ 330 │ 330   │ 330            │ 0      │ 0             │
│ shortdate  │ 13  │ 13    │ 13             │ 0      │ 0             │
└────────────┴─────┴───────┴────────────────┴────────┴───────────────┘
```

Total over both seeds: 5,776 mutants, 5,776 verdicts the same as xmllint's (4,827
rejected by both, 949 accepted by both).

Seed 1: 1,803 mutants, 1,803 agree (bool 150 (29 rejected), delete 150 of which xmllint rejects
106, duplicate/unknown/swap/empty/long 150 each all rejected, euro 150 (123
rejected), text 150 (118), negative 150 (84), dropprefix and addprefix 150 each
(all rejected), short date 3).

During the first runs two disagreements were found and fixed, both on our side:

1. The namespace: the first version matched local names only, so a `base:` prefix
   dropped or added (300 of 1,654 mutants) passed. Added HU-032; 0 misses since.
2. `vatDomesticReverseCharge` and `noVatCharge` are declared `fixed="true"`. XSD gives
   an empty element its fixed (or default) value, so an empty one is valid (xmllint
   accepts) and `false` or `0` is not. The builder had dropped element-level
   `fixed`/`default`; `xsd-check.mjs` now applies both, which also changes FA(3): an
   empty element with a `default` there is now valid, as XSD says.

The fuzzing also crashed the existing business checks (`keyLabel` on a summary row
whose `vatRate` was emptied); fixed, with a test.

## A real fault in NAV's own sample

`sample/API sample/manageInvoice.xml` (three CREATE operations) carries
`privatePersonIndicator` in each `customerInfo`. That element was 2.0's; 3.0 puts
`customerVatStatus` first in `customerInfo`. xmllint on the decoded operations:
"Element privatePersonIndicator: This element is not expected. Expected is
customerVatStatus". hu-xsd.mjs reports HU-027 and HU-029 on each operation, and the
fix text names the 3.0 replacement.

## Not done

A real business's report with NAV's actual SCHEMA_VIOLATION message to compare
the wording and the path NAV gives. xmllint is a reference implementation of XSD
1.0, not NAV's validator.
