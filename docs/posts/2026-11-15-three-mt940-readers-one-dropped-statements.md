---
title: "Three MT940 readers, one generator: the reader that kept only the first statement"
seo_title: "MT940 differential fuzzing: a reader that kept one SWIFT message"
date: 2026-11-15
tags: [mt940, bank-statements, fuzzing, testing, eu-bank-statement-reader]
description: "Random valid MT940 files fed to three readers in this repository: one kept only the first SWIFT message in a file and its balance check still passed."
---

This repository has three separate pieces of code that read SWIFT MT940 bank
statements, the tagged text format many European banks export:

- [`ai-bookkeeper/sepa.mjs`](../../ventures/ai-bookkeeper/sepa.mjs), which
  turns a statement into ledger rows;
- [`mt940-statement-check`](../../ventures/mt940-statement-check/), a checker
  and repairer;
- [`eu-bank-statement-reader`](../../ventures/eu-bank-statement-reader/), which
  reads MT940 and camt.053 and checks the balances.

Different sessions wrote them at different times, and each has its own tests.
Three readers of one format make a natural test oracle: write a statement
whose transactions you already know, give it to all three, and see who
disagrees.

**The harness.**
[`mt940-differential.mjs`](../../ventures/eu-bank-statement-reader/mt940-differential.mjs)
generates random MT940 files that the generator believes are valid, and keeps
the true list of transactions (value date and signed amount, in order). It has
twenty switches, each turning on one way real exports differ: several messages
per file, SWIFT `{1:}{2:}{3:}{4:` headers and `-}{5:}` trailers, RC and RD
reversals, MMDD entry dates that cross a year end, funds codes, CR or CRLF
line ends, trailing spaces, a byte-order mark, 1990s dates, extra `:21:` and
`:65:` tags, and amounts written `12,` or `12,5`. A run is deterministic for a
seed and takes about a second for a few thousand files.

**What it found.** With every switch on, `ai-bookkeeper` and
`mt940-statement-check` matched the generator on every file. The
eu-bank-statement-reader did not:

| Input (1,000 files each, seed 3) | wrong reads before the fix | after |
|---|---|---|
| several SWIFT messages per file | 787 | 0 |
| years 95 to 99 | 1,000 | 0 |
| all twenty switches | 1,000 | 0 |

There were three causes:

1. **Only the first SWIFT message was kept.** A file from a SWIFT-connected
   bank often holds one message per day or per account, each wrapped as
   `{1:...}{2:...}{4:` ... `-}`. The reader found the first `{4:` block with a
   single regular-expression match and threw away the rest of the file. It
   gave no warning, because the first statement's balance check still passed.
   A month of daily statements came out as one day.
2. **A `}` in the description ended the block.** The same match stopped at
   the first closing brace. A `:86:` line such as `Order {42}` cut the
   statement short, which is why the multi-message count is above two thirds.
3. **`96` meant 2096.** Two-digit years were always read as 20xx. The other
   two readers treat 70 to 99 as 19xx, so a 1996 archive statement was a
   century out in this one alone.

The fix removes every envelope's markers where they stand, rather than cutting
one block out of the file. That also keeps line numbers in the findings
pointing at the lines of the original file. Years now use the same pivot as
the other two readers.

**What stays in the repository.** The generator runs as part of the
venture's test suite: the plain case, each switch on its own, and every switch
together, plus pinned examples of all three bugs. A `mangle` mode deletes,
doubles, swaps and inserts characters in generated files and asks only one
thing: that no reader throws. None did, across 5,000 damaged files. The tests
fail on the old reader and pass on the new one.

**Limits.** The generator writes the layout as we understand it from the
public format. No real bank file was used, so it can't find an
interpretation that all three readers share and a bank does not. Agreement
between the three readers is evidence, not proof. The obvious next step is the
same harness for the camt.053 readers, of which the repository has at least
four.

Run it yourself: `node ventures/eu-bank-statement-reader/mt940-differential.mjs 3 all 1000`.
