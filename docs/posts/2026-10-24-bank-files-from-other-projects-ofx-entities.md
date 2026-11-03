---
title: "We read other projects' OFX files with our bookkeeper. It got 13 right and one wrong thing."
seo_title: "We read other projects' OFX files: 13 right, one wrong thing"
date: 2026-10-24
description: "ai-bookkeeper's bank readers checked against sample files from ofxparse and ofxtools: every transaction counted, one character-reference bug fixed."
tags: [bookkeeping, ofx, testing, open-source]
---

Our readers for bank files were tested on files we wrote ourselves, which is a
weak test: we only break what we thought of. So we pulled sample OFX files that
other open-source projects (ofxparse, ofxtools) wrote against real bank layouts
and read them with `ai-bookkeeper`.

**Result.** 13 files, and every bank transaction in each was in the output. A
Fidelity brokerage file booked its dividends, interest and a fee, and said that
10 buys and sells were left for the investment account. Files that held only
trades booked nothing and told the user why instead of showing an empty ledger.

**The one fault.** Banks escape characters in payee names. `AT&amp;T` was
already handled, but `AT&amp;T BILL &#35;99` kept its `&#35;` and a
`&amp;lt;` in a bank-file remittance line was decoded twice. Both readers now
share one decoder that handles named, decimal and hex references in a single
pass. Three tests cover it.

This is still not a fresh download from a customer's bank. If you can share an
export with the account numbers removed, that is the most useful thing you can
send. Details are in the venture README under "Next".
