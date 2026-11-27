# INV-065 on timestamps, and which values count as castable (2026-11-18)

Follow-up to [`nbsp-other-formats-2026-11-17.md`](nbsp-other-formats-2026-11-17.md), whose
integrity notes left `xs:dateTime` values (FA(3) `DataWytworzeniaFa`, NAV timestamps) outside
`CASTABLE`. PR #17033 then added `xs:time` and `xs:dateTime` to `CASTABLE` in `xmlvalues.mjs` for
ZATCA's `IssueTime`, but nothing measured the national readers on them. This run did, and then
asked a wider question: does `CASTABLE` take exactly the values SaxonC-HE can cast?

## Method

1. `eval/nbsp-other-formats.mjs` on the same 36 files as the 2026-11-17 run (FatturaPA: 2 ours
   + 15 from the ZUGFeRD corpus `fatturaPA/official` and `fatturaPA/eigor`; FA(3): 6 ours;
   Facturae: 1 fixture; NAV: 10 published samples; ISDOC: the 2 `isdoc/dsig-demo` files). Rows now
   carry `kind: "time"` for a date-time or time leaf. `eval/nbsp-amounts-saxonc.py` now also asks
   `castable as xs:dateTime` and `xs:time`, and counts the time rows.
2. `--out DIR` also writes `DIR/leaves.jsonl`: every distinct (format, element, value) with
   `CASTABLE`'s verdict. `eval/castable-coverage-saxonc.py DIR` asks SaxonC-HE 13.1 (PyPI
   `saxonche`) whether each casts as `xs:decimal`, `xs:date`, `xs:boolean`, `xs:dateTime` or
   `xs:time`, and lists every disagreement.
3. `eval/castable-sweep.mjs DIR` builds 5,075 lexical edge cases (years 0000, 0001, 1900, 2000,
   2100, -0001, -0004, 12024, 02024, 999; month and day pairs 00-10, 01-32, 02-29, 02-30, 04-31,
   13-01, 06-00; times 24:00:00, 24:00:00.5, 25:00:00, 10:60:00, 10:00:60; zones Z, +14:00,
   +14:01, +15:00, +01:60, -05:30, z, +1:00; number and boolean shapes) for the same script.

```
git clone --depth 1 --filter=blob:none --sparse https://github.com/ZUGFeRD/corpus && (cd corpus && git sparse-checkout set fatturaPA)
node eval/nbsp-other-formats.mjs --out W examples fixtures/facturae fixtures/hungary-nav corpus/fatturaPA isdoc
python3 -I eval/nbsp-amounts-saxonc.py W         # venv with saxonche
python3 -I eval/castable-coverage-saxonc.py W
node eval/castable-sweep.mjs S && python3 -I eval/castable-coverage-saxonc.py S
```

## Results

**Timestamps in the national readers.** The corpus has 16 date-time leaves: FA(3)
`DataWytworzeniaFa` (6 files, `2026-03-02T09:30:00Z`), `DataGodzRozpTransportu` and
`DataGodzZakTransportu` (one file each), and FatturaPA `DataOraConsegna` (8 files,
`2017-01-10T16:46:12.000+02:00`). Five space variants each: 80 mutants.

| | mutants | nothing new said before INV-065 | INV-065 names the leaf | SaxonC agrees |
|---|---|---|---|---|
| FA(3) date-times | 40 | 32 | 40 | 40 |
| FatturaPA `DataOraConsegna` | 40 | 32 | 40 | 40 |
| all leaves, all five readers | 10,085 | 7,491 | 10,085 | 10,085 |

NAV's `InvoiceData` samples hold no date-time leaf: NAV's timestamps live in the request header
(`ManageInvoiceRequest/header/timestamp`), which is not invoice data, so "NAV timestamps" in the
flagship row had nothing to measure. Controls: 1,317 text leaves with a trailing U+00A0, 0 INV-065.

**Corpus values.** On the 1,336 distinct leaf values, `CASTABLE` and Saxon agree on all 1,336
(920 castable: 850 decimal, 55 date, 5 dateTime, 74 boolean, some in two types).

**The sweep found two faults in `CASTABLE`** (before this change, 13 of 46 hand-picked values
disagreed with Saxon):

- *Missed*: an `xs:date` with a timezone (`2024-01-31+01:00`, `2024-01-31Z`), which is what
  Java's JAXB `XMLGregorianCalendar` writes for a date by default, and signed or five-digit
  years. A no-break space after such a date said nothing. FatturaPA's `Data` is a plain
  `xs:date` in the schema, so a timezone there is schema-valid.
- *Over-taken*: a date or time XSD's ranges refuse (`2024-02-30`, `2023-02-29`, month 13,
  `25:00:00`, `10:60:00`, a `+15:00` zone). With a no-break space INV-065 blamed the space for a
  value no processor reads anyway.

`CASTABLE` is now an object with a `test()` method (same call sites: `unreadableValue` and the
plain route's `unreadableValues` for XML-VALUE-01): the plain number and boolean regex, then
`xs:date`, `xs:time` and `xs:dateTime` with an optional zone, a `-` sign and a year of 4 digits or
more (no leading zero past 4), and the ranges checked (proleptic Gregorian leap years with year
0000; `24:00:00` only with zero minutes, seconds and fraction; zones to ±14:00).

After the change, on the 5,075-value sweep: **5,024 agree with Saxon; 51 disagree, all zones past
+14:00 (+14:01) on `xs:date` (45) and `xs:time` (6)**, which SaxonC-HE 13.1 casts and refuses
on `xs:dateTime`. XSD 1.1 Part 2's `timezoneFrag` is `(0\d|1[0-3]):[0-5]\d|14:00`, so this is a
Saxon leniency; `CASTABLE` follows the spec. The corpus rerun is unchanged (10,085 of 10,085;
1,336 of 1,336).

**Every format's leaves.** `node eval/castable-sweep.mjs F --files examples fixtures tests corpus isdoc`
writes every distinct leaf value of 113 XML files (the shipped UBL, CII, Factur-X, PINT, CFDI, NF-e,
NFS-e, ABRASF, Flux 10, VERI*FACTU and the national examples and fixtures, plus the FatturaPA
corpus and ISDOC demo files): **1,695 of 1,695 distinct values agree with SaxonC** (859 castable:
758 decimal, 75 date, 20 dateTime, 4 time, 4 boolean).

A FatturaPA example with `Data` set to `2026-10-01+01:00` + U+00A0 now draws INV-065 at `Data`;
before, the same file drew only the findings the timezone alone draws.

Tests: `xmlvalues.test.mjs` (2 new: the shapes and ranges, and INV-065 on a timezone date but not
on an impossible one). The venture suite: 2,719 tests, 0 failed (with slimdom and fontoxpath
installed so the plain-route tests run).

## Integrity notes

- Mutants are synthetic, as in the earlier runs; no real file with a stray U+00A0 in a timestamp
  was available.
- The oracle is SaxonC-HE's `castable as`, the step a schema-validating receiver fails on. No tax
  authority's validator was run.
- Open: `IT-009` reads a timezone `Data` as "not a YYYY-MM-DD date". The FatturaPA schema allows
  it; whether SdI accepts it is unknown here (no SdI reply is available), so `IT-009` was left as it is.
