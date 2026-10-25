---
title: "Our bookkeeper booked a transaction on February 31st"
date: 2026-10-25
description: "Running ai-bookkeeper's statement reader over another project's 24 OFX test files found a date it accepted without checking the calendar."
tags: [ai-bookkeeper, ofx, testing]
---

Most of our bank-file tests are fixtures we wrote ourselves, which can only
find the mistakes we already imagined. So we ran the reader over someone
else's: the 24 OFX files in ofxparse's test suite (MIT, from real Fidelity,
Vanguard, Suncorp and ANZ layouts), and compared rows read against
`<STMTTRN>` entries present.

Twenty-two matched. One is brokerage lines we read on purpose. The last, a
file built to have bad dates, turned up a real bug: `DTPOSTED` of `20120231`
went into the ledger as 2012-02-31. CSV dates were already calendar-checked;
the OFX path only matched digits. A date like that would sort strangely, fall
in no month's report, and break a period lock. It is now skipped with a
"unreadable date" line, like any other bad date, and a leap day (20120229)
still reads.

The same sweep is worth repeating on any format with its own date reader.
