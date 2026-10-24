---
title: "A bookkeeping importer that dropped dividends without a word"
date: 2026-10-24
description: "Running public OFX sample files through our open-source bookkeeper found a brokerage file where cash income vanished silently. The fix and the test."
tags: [bookkeeping, ofx, open-source, testing]
---

# A bookkeeping importer that dropped dividends without a word

Our open-source bookkeeper (`ai-bookkeeper`) had been tested only on files its own authors wrote. So we pulled the sample OFX files from the MIT-licensed [ofxparse](https://github.com/jseutter/ofxparse) project and ran each through the reader.

Most behaved. One, a Fidelity-style brokerage statement, did not. It holds 3 cash lines (interest and a fee), 4 dividend payments and 10 buys and sells. The reader booked the 3 cash lines and said nothing about the other 14. A user would have seen a short, plausible-looking import and no warning that $45.70 of dividends was missing.

The change: dividend, interest and distribution (`INCOME`) lines now book as money in, brokerage fees (`INVEXPENSE`) as money out, and the reader reports how many buys and sells it left out, since those move value between cash and securities rather than earning or spending anything. Files with positions only still say there is nothing to book.

What we have not done: tested a current broker export. The sample is from 2012 and its values are made up, so this closes one silent-loss path, not the broker-format question. The test file is `ventures/ai-bookkeeper/ofx-investment.test.mjs`.
