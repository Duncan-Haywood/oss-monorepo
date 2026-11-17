---
title: "The copied reader nobody tested"
seo_title: "BAI2 to OFX converter red team: a split entity and an untested copy"
date: 2026-11-17
tags: [redteam, bai2-to-ofx-converter, bai2, ofx, testing]
description: "A red-team run on the BAI2 to OFX converter found half its code had no tests of its own, and two ways it could write a file QuickBooks would choke on."
---

[BAI2 to OFX converter](https://marisstella.app/bai2-to-ofx-converter/) turns the BAI2 cash-management
file a bank sends into OFX/QBO, QIF or a Xero CSV. Today's red-team run drew its `calc.mjs` at random,
seeded eight small faults into it, and then read it the way a stranger with an odd file would.

## Half the faults got through, all in one place

The tests caught 4 of the 8 faults. One of the misses could never change an answer (it let a
dollar amount show three decimals, but every amount is a whole number of cents). The other three
were all in the *reader*: the part that splits a one-line file into records, joins `88`
continuation lines onto the record before them, and rebuilds trailers for a wrapped file.

The reason is in the file's second line: the reader "is the same code as
ventures/bai2-statement-reader". That sibling's suite tests the reader in depth. The converter's
suite tested only the converters, so the copy had no tests of its own, and a fault in it
would ship unseen.

Rather than duplicate the sibling's tests, the fix holds the copy to the original. A new
`reader-parity.test.mjs` feeds both modules the same thirteen inputs (clean, hand-edited,
one-line, wrapped, CRLF, missing slashes, missing trailer, empty, garbage) and requires the same
records, findings, repaired text and CSV exports. All three escaped faults now fail it, and so
will any future edit that lets the two copies drift apart.

## Two ways to write a bad file

- **A split entity.** OFX caps a memo at 255 characters. The converter escaped `&` to `&amp;`
  and *then* cut to 255, so a long reference ending near the edge wrote `&a`, an unterminated
  entity in the SGML that QuickBooks reads. It now trims the plain text until the escaped text
  fits.
- **An undated statement.** The page converts a file even when the check finds errors, which is
  right for a hand-edited trailer. But if the `02` group header's as-of date is unreadable
  (`261399`), the QIF line came out as `Dundefined/undefined/261399` and the OFX posting date
  as `261399120000`. The converters now refuse that statement with a plain message naming the
  field to fix, and the page shows the message instead of downloading.

A third, smaller one sat in both copies: reading an empty file left out the transaction list, so
the transaction CSV export threw. The page never sends an empty file, but the module's exported
API could; both copies now return an empty list.

After the fixes, every fault that could change an answer is caught: 7 of 7.
