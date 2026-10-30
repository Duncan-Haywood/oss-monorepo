---
title: "Six bank-statement XML files we didn't write: do the sums tie?"
date: 2026-10-25
description: "ai-bookkeeper's ISO 20022 reader was run on six CAMT samples from another project; each opening balance plus its rows was checked against the closing balance."
tags: [ai-bookkeeper, camt, bank-import, testing]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads bank statements in many
formats. Most of its tests use files we wrote ourselves, which can only prove
the reader agrees with its author.

So we ran it on six CAMT (ISO 20022) sample files from the
ofxstatement-iso20022 project: a Swiss CHF statement with 16 entries, a
Lithuanian EUR one, a German CAMT.052 intraday report, a single-entry CAMT.053,
an oddly shaped one and a deliberately unsupported one.

The check is plain arithmetic, read from each file's own XML: opening balance
plus the imported rows should equal the closing balance.

- Four files tie to the cent.
- One (`gcamp6.xml`) does not: opening 0.00, closing 10,000.00, but its five
  entries sum to 13,010.00. The file contradicts itself; the reader imports the
  rows as written.
- The unsupported file is refused with a message rather than read as empty.

No reader fault turned up this time, and we say so rather than invent one. The
script is `eval/camt-corpus.mjs`; point it at any folder of CAMT files.
