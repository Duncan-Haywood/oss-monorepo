# Peppol BIS 3.1.0 readiness for a batch of sent invoices (2026-11-24)

## Why

Access points apply Peppol BIS Billing 3.1.0 from 2027-02-24. The single-file preview
(2026-11-18) says what 3.1.0 thinks of one file. A sender's question is about all of
them: how many of the invoices I send would bounce in February, and what do I change in
my billing software? That needs a batch answer grouped by rule.

## The dated item: is 3.1.0 tagged yet?

No. `git ls-remote https://github.com/OpenPEPPOL/peppol-bis-invoice-3.git` on
2026-11-24: newest tag `3.0.22` (`38d693d`, also master's head). The release branches:

| Branch | Head | Date |
|---|---|---|
| 2026-Q4-QA2 | 90f078a | 2026-11-06 (what plain/peppol-next-* is built from) |
| 2026-Q4-MR | c427757 | 2026-09-11 (older) |
| selfbilling-2026-Q4-QA2 | 387676d | 2026-11-06 |

So there was nothing to rebuild; the item waits for the tag. docs.peppol.eu did not
answer through this session's proxy. The page and index.html now say "due for
publication on 23 November 2026, not yet tagged on GitHub on 24 November" rather than
"published".

## What shipped

- `peppol-readiness.mjs`: classify each file from its two plain-route runs (3.0.22 and
  `peppolNext`): passes today and rejected under 3.1.0, fails both, fixed by 3.1.0, new
  warnings only, ready, not Peppol, unreadable. Totals, a by-rule table with plain
  advice per rule family, CSV (formula cells quoted) and Markdown.
- `peppol-bis-3-1-0-readiness.html`: drop files or a whole folder, everything runs in the
  browser on the shipped plain rules; downloads CSV and Markdown.
- The page's "What changes in 3.1.0" table is generated (`build-peppol-readiness-page.mjs`)
  from `ruleChanges(plain/peppol-*.json, plain/peppol-next-*.json)`: 147 rows (UBL and CII
  merged). Whitespace-only and wording-only (should to SHOULD) edits are left out.
- `peppol-readiness-cli.mjs <folder> --csv out.csv`, exit 1 when a file is newly rejected.

## A finding from the diff

In the CII set, NO-R-001, SE-R-001 and SE-R-002 test `@schemeID = 'VAT'` in 3.0.22; CII
writes the VAT scheme as `VA`, so those Norwegian and Swedish VAT rules could not fire on
a CII file. 3.1.0 tests `'VA'`. A Norwegian or Swedish sender of CII files meets them for
the first time in February. (The single-file preview already ran 3.1.0, so this was
caught there too, but it was not named.)

## Checked

- OpenPeppol's 3.0.22 examples and national examples (master `38d693d`) plus the 39
  bundled examples through the CLI: 17 Peppol files, 5 newly rejected (all R040,
  19-digit 0088 values), 4 fail both, 8 ready; same as `eval/peppol-next-diff.mjs`
  reported on 2026-11-18.
- `peppol-readiness.test.mjs`: 8 tests (diff counts: 130 UBL rules added, CII adds
  exactly R058/R059/R062/DK-R-017, R054-R057 warning to fatal in both syntaxes, R040
  retested, GR-R-001-5 removed; advice covers every changed rule except P0100/P0112 and
  the GR rules; page table in sync; verdicts on a 19-digit GLN and a 7-digit KVK; CLI).
- Chromium (Playwright), page served over HTTP: the four-file sample gives "2 of 4 Peppol
  files pass 3.0.22 today and would be rejected under 3.1.0", R040 and R054 listed; a
  three-file upload works; no console errors; 390 px wide with no horizontal scroll.

## Open

- A real sender's folder: the measurement that matters.
- Rebuild from the 3.1.0 tag when it appears, then `node build-peppol-readiness-page.mjs`.
