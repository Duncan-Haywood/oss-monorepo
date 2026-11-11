# Measuring the reader on statements it was not written against

Until 2026-11-11 this converter had only been tested on statements generated
by its own fixtures. This folder measures it on statement PDFs made by other
people. None of these files is a real customer's statement, and none is
committed here: the scripts take a folder or a file path, and the hashes
below say which files were used.

## Files

- `bench.mjs <folder>`: runs every PDF in a folder and prints rows found,
  opening and closing balance, and whether the statement was proved. When a
  `statement-info.json` sits next to a PDF (the benchmark's layout), its
  `transactionCount` is used as the true row count.
- `score.mjs <pdf> <truth.csv> [--format icici]`: compares rows with a
  ground-truth CSV on date and signed amount, order-free.
- `dump.mjs <pdf>`: prints the text lines the PDF reader recovers, with x
  positions, for working out why a layout misreads.

## The benchmark (development set)

[bankstatemently/bank-statement-parsing-benchmark](https://github.com/bankstatemently/bank-statement-parsing-benchmark),
MIT, commit `2d8d31d`. Fifteen synthetic statements across 41 named parsing
challenges; five PDFs were published on 2026-11-11 (the other ten said "coming
soon"). The ground truth is held on the benchmark's server, so the score here is
the true row count from each `statement-info.json` plus the statement's own
balance proof. These five were used to find and fix the faults, so they are a
development set, not a test.

```
git clone --depth 1 https://github.com/bankstatemently/bank-statement-parsing-benchmark
node eval/bench.mjs bank-statement-parsing-benchmark/datasets
```

| file | sha256 (first 12) | layout | before (main, 2026-11-11) | after |
|---|---|---|---|---|
| bsb-001 | d3d5071b90a3 | Singapore, debit/credit/balance columns | 12/12 rows, proved | 12/12, proved |
| bsb-002 | 3700a073ac12 | US credit card, post and trans date, decoy 0.00 lines | 0/15 | 15/15, proved, read as a card unprompted |
| bsb-003 | 4945bcda107e | Netherlands, Dutch months, interest date, euro sign | 0/22 | 22/22, proved |
| bsb-004 | 67a5b862696f | Hong Kong, bilingual, two accounts in one PDF | 25/25, balance "breaks" at the second account | 25/25, each account proved by its totals |
| bsb-005 | a5cc2a7d210b | Canada, French, 1 234,56 $ amounts | 0/25 | 25/25, proved |

What each failure was, and the general rule that fixed it:

1. **bsb-002: a later table relabelled every row.** Columns were taken from the
   last heading in the document, and an interest-charges box below the
   transactions has a "Balance" column where the amounts were. Each row now uses
   the heading in force where it sits.
2. **bsb-003: the euro sign.** The amounts end in byte 0x80, which is € in
   WinAnsiEncoding but a control character in Latin-1. The reader now decodes
   0x80-0x9F as Windows-1252 (and accented glyph names such as `eacute`). Also:
   Dutch month names, a dotted interest date as the second date, "Balance as of
   <date>" lines as opening and closing, and a footer printed over a row a point
   lower, now split off by height.
3. **bsb-004: two accounts.** A line naming an account, followed by a running
   balance that restarts, begins a new account. Each account is proved on its
   own by an unbroken running balance and its printed deposit and withdrawal
   totals (both printed on one line, now split). Dated lines above the first
   table heading (a statement date over the address) are no longer rows.
4. **bsb-005: French.** Space-grouped amounts with a trailing `$` inside one PDF
   text run, accented headings (Chèques et débits, Dépôts et crédits, Solde), and
   Solde d'ouverture / Solde de fermeture.

Descriptions also had page furniture appended (a watermark, "Totals
Year-to-Date", "Download date"). A wrapped line must now start under the
description, a line at the margin closes the row, and text printed once per
page at the same place on most pages is never appended: 0 of 99 descriptions
carry any of it after the change.

## Two PDFs from other open-source parsers (held out)

These were run only after the fixes above, as a check that they carry over.

| file | source | sha256 (first 12) | truth |
|---|---|---|---|
| transtractor-test1.pdf | [weberdak/transtractor-lib](https://github.com/weberdak/transtractor-lib) `tests/fixtures/test1.pdf`, MIT, commit `efaad74` | 2398ef7f3e12 | `test1_parsed.csv`, 62 rows |
| icici-sample.pdf | [apurv-korefi/ai-agent-challenge](https://github.com/apurv-korefi/ai-agent-challenge) `data/icici/icici sample.pdf`, no licence file (used to measure only, not copied), commit `96b2a4c` | 8b6714e002f7 | `result.csv`, 100 rows |

First result: **both failed, before and after the fixes above** (16 of 62 and
80 of 100 rows found). They did not carry over. The reasons were two layouts
the benchmark does not have:

- **The date printed once per day** (transtractor): later rows that day have
  no date. A line with no date, a description and a non-zero amount under the
  table's columns is now its own row on the date above. Zero-amount lines stay
  out, which keeps bsb-002's decoy "0.00" lines out.
- **One-decimal amounts** (`1935.3`, ICICI sample). Read as money only on a
  statement where at least two lines carry such numbers; elsewhere `1.5` is
  still not an amount (an existing test).

With those two, so these two files are now development data too:

```
node eval/score.mjs transtractor-test1.pdf test1_parsed.csv
node eval/score.mjs "icici sample.pdf" result.csv --format icici
```

| file | rows found | rows matching a true row on date and signed amount | proved |
|---|---|---|---|
| icici-sample (before) | 80 / 100 | 80 | no (balance "breaks" at line 8) |
| icici-sample (after) | 100 / 100 | **100** | no opening/closing line to prove against |
| transtractor (before) | 16 / 62 | 15 | no |
| transtractor (after) | 62 / 62 | **56** | no: the running balance breaks at line 21, and the page says so |

The six transtractor rows still wrong come from two traps the fixture sets on
purpose: a balance printed without decimals (`90,350 CR`, not read as an
amount, so the row's amount and the next line run together) and a description
on the line above its amount (`Transaction 10` / `Annoying text 600.35`, read
as a wrapped line of the row before). The tool does not claim these add up: the
balance check fails and names the line. Fixing the first would mean reading
integers as money in a balance column, which the benchmark statements never
need; it is left until a real statement needs it.

## What is still not measured

- A real customer's statement from a real bank. The benchmark's own ten
  unpublished statements (scanned PDFs, Buddhist-era dates, nine-column layouts)
  are the next public set.
- Whether the Xero and QuickBooks layouts import cleanly (written from their
  public import help).
