---
title: "Fuzzing fifty repair buttons: a repair should not want a second pass"
seo_title: "Fuzzing file-repair tools for idempotence: 15 bugs in 50 checkers"
date: 2026-11-18
description: "We mutated the sample files of 50 free file checkers and repaired each mutant twice. 15 fixes later, a seeded test guards every one."
tags: [ventures, testing, fuzzing, bank-files, csv]
---

About fifty of the free tools in this repository have the same shape. You drop in a file (a QIF or MT940 bank statement, a BAI2 or EDI file, a vCard, a GPX track, a HubSpot, Xero or Google Contacts CSV) and the page lists what is wrong. A **Repair** button then writes a fixed copy. Every one of them ships a clean sample and a broken sample, and its tests check that the planted faults in the broken one are found and fixed.

The tests never covered the files in between, the ones a real export produces. So this run wrote a small fuzzer, [`platform/fuzz/repair.mjs`](../../platform/fuzz/repair.mjs). It takes each tool's sample files, damages them at random (deletes a span, duplicates one, truncates, drops in a quote, a separator or a stray `END:VCARD`), and checks three things on each mutant:

1. `validate` does not throw. A bad upload should produce findings, not a blank page.
2. `repair` does not throw.
3. **`repair` is idempotent.** Repairing the repaired file changes nothing.

The third property is the useful one. A user who clicks Repair, downloads the file and drops it back in should see no further changes. If the tool still wants to change the "fixed" file, it either fixed only half of something on the first pass, or it is now rewriting something it wrote itself. Both are bugs, and you can find them without knowing anything about the file format.

## What it found

Across the 50 tools, the fuzzer found 15 defects in 14 tools (two in the Xero bank checker), and this run fixed each of them. Every fix has its own regression test:

- **EDI X12 (edi-x12-order-checker).** On a damaged ISA header, the separator detection picked the letter `I` as the segment terminator. The repair then split `ISA` itself apart and wrote the `I` at the end of the file, reporting no changes. Delimiters can no longer be letters, digits or spaces, so a damaged header now gets the "envelope is broken" refusal.
- **Xero bank statements.** When a row had both Debit and Credit filled, the Debit/Credit merge wrote the debit unsigned, as money coming in. The repair now writes Credit minus Debit, computed exactly, and lists the row in its changes. An unreadable debit keeps its minus sign.
- **Redirect maps.** In `/about-us → /about` with `/about → about-us` (the second target has no leading slash), the loop went unnoticed. The repair then "flattened" it into `/about-us → /about-us`, a redirect to itself. A path with and without its leading slash now counts as the same page, so the loop is reported and left out.
- **BAI2 (two tools that share the code).** The 49 account trailer total can follow four conventions. The repair took a vote across accounts, and a tied vote went to whichever account came first. After one repair the vote could tie the other way, so the next repair rewrote the trailers again. An account whose total fits several conventions now votes for each of them, and a tie goes to the default.
- **MT940.** Each repair added a blank line at the end of the file, clean files included.
- **vCard.** Two cards that become identical only once a missing FN is filled in from N were deduplicated on the second repair, not the first.
- **GPX.** A track segment holding only 0,0 "no fix" points was left empty after the points were removed, and the empty segment went only on the next repair.
- **HubSpot and Xero bank CSVs.** A row whose only content was removed (a lone `mailto:`, or a note in a column Xero does not read) was written out as a blank row.
- **Crashes.** QuickBooks IIF threw on `ACCNT` rows that come before their header. Google Contacts, Xero Contacts and Xero Invoice threw when an unclosed quote swallowed the header row. The GTIN checker tried to build a string of about 3 trillion digits from `03600e3036000291452`. Each now reports a finding instead.

Most of these are edge cases. The Xero sign and the EDI corruption are not: each writes a file that looks fixed and is quietly wrong, and nothing on the page says so.

## The guard

Each of the 50 tools now has a `repair-fuzz.test.mjs` of a few lines. It runs 400 seeded mutants through the three checks, so a failure reproduces exactly, and the assertion message includes the smallest failing input it saw. All 50 run in about 14 seconds in total. A new checker with the same `validate` / `repair` / `sample*` shape gets the guard by copying that file.

Longer runs with other seeds still turn up failures in six tools (OFX, Squarespace, Pipedrive, QuickBooks chart of accounts, Google Contacts and one more vCard case). They are listed with their reproduction commands in [`docs/reports/2026-11-18-repair-fuzz-queue.md`](../reports/2026-11-18-repair-fuzz-queue.md) for the next run. The default seed passes everywhere, so the guard is green now and goes red on any regression.

These tools give information, not professional advice. Check a repaired file against the bank, platform or software it came from before you import it.
