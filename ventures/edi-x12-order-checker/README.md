# EDI X12 Order Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/edi-x12-order-checker/>

A free browser tool for small suppliers who sell to large retailers over EDI. Paste an X12 file —
850 purchase order, 810 invoice, 856 advance ship notice, or a 997 the retailer sent back — and get
every structural fault with its segment number, plus the documents as tables and a CSV of the lines.
After using this, you can know in seconds why a retailer rejected an EDI file or what a 997 is
complaining about, which used to mean a ticket to an EDI provider or reading `*` and `~` by eye.

**No data leaves the browser.** The file is read locally; a test asserts no network calls.

## Checks

- Envelope: ISA fixed-width fields; IEA02/GE02/SE02 equal ISA13/GS06/ST02; IEA01, GE01, SE01 counts;
  nesting; GS01 against the set type; test indicator.
- 850 / 810 lines: quantity, unit, price, UPC/EAN/GTIN check digits and lengths, duplicate items,
  CTT01 line count and CTT02 hash.
- 810 total: TDS01 against quantity × price plus charges, allowances and tax; rounding noted, price
  basis other than per-each reported.
- 856: HL ids, parents and level order; SSCC length, check digit and uniqueness; CTT01.
- 997/999: AK2/AK5 status and AK3/AK4/AK9 error codes in plain words.

## Repair

`repair()` rewrites SE01, GE01, IEA01 and CTT01 only. It never edits an item, quantity, price or
total, and refuses a file whose envelope is broken.

## Limits

Written from memory of the public X12 004010 layouts; no retailer implementation guide or
validator was available. Partner-specific rules, other transaction sets and per-segment syntax
are not checked, and the page says so.

## Run

Open `index.html` through any static server. Tests: `node --test`.

**No warranty.** This tool is provided free and as-is, without warranty of any kind. It is not
legal, tax, accounting, trade, compliance, or financial advice, and it does not replace a
qualified professional, your EDI provider, or your trading partner's own validation. You are
responsible for reviewing its output before relying on it. To the maximum extent permitted by law,
the authors accept no liability for any loss or damage arising from its use. Independent of every
retailer, EDI network and standards body.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken,
moved, or taken offline without notice. Do not use this as a system of record.

MIT licensed. Support is optional: https://github.com/sponsors/Duncan-Haywood
